# api/views.py
import os
import re
import requests
from urllib.parse import quote

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.db import transaction

from .auth import token_required, roles_required
from .models import Profile

# ----- Wikipedia config -----
WIKI_API = "https://en.wikipedia.org/w/api.php"
WIKI_REST_SUMMARY = "https://en.wikipedia.org/api/rest_v1/page/summary/"
WIKI_HEADERS = {
    # Wikipedia requires a descriptive UA. Change contact to yours.
    "User-Agent": "TripPlanner/1.0 (contact: dev@example.com)",
    "Accept": "application/json",
}
# GeoSearch limits
WIKI_MAX_RADIUS = 10000  # meters (MediaWiki GeoSearch cap)

def _safe_json(resp):
    try:
        return resp.json()
    except Exception:
        return {"_nonjson": True, "_status": resp.status_code, "_text": (resp.text or "")[:300]}

def _shorten(text: str, max_sentences: int = 2, max_chars: int = 320) -> str:
    """Return the first couple of sentences, trimmed to ~max_chars."""
    if not text:
        return ""
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    snippet = " ".join(parts[:max_sentences]).strip()
    if len(snippet) > max_chars:
        snippet = snippet[: max_chars - 1].rstrip() + "…"
    return snippet

# ----- Existing endpoints (unchanged) -----

@token_required
def hello_protected(request):
    claims = getattr(request, 'user_claims', {}) or {}
    user = claims.get('preferred_username') or claims.get('sub')
    return JsonResponse({'message': f'Welcome {user}, your token is valid!'})

@token_required
def me(request):
    claims = getattr(request, 'user_claims', {}) or {}
    return JsonResponse({
        'sub': claims.get('sub'),
        'preferred_username': claims.get('preferred_username'),
        'email': claims.get('email'),
        'name': claims.get('name'),
        'given_name': claims.get('given_name'),
        'family_name': claims.get('family_name'),
        'scope': claims.get('scope'),
        'raw': claims,
    })

@token_required
@roles_required('app_admin')
def admin_only(request):
    claims = getattr(request, 'user_claims', {}) or {}
    user = claims.get('preferred_username') or claims.get('sub')
    return JsonResponse({'message': f'hello admin {user}!'})

@token_required
@require_http_methods(['GET', 'POST'])
@transaction.atomic
def profile_sync(request):
    claims = getattr(request, 'user_claims', {}) or {}
    sub = claims.get('sub')
    if not sub:
        return JsonResponse({'detail': 'missing sub in token'}, status=400)

    defaults = {
        'username': claims.get('preferred_username') or '',
        'email': claims.get('email') or '',
        'first_name': claims.get('given_name') or '',
        'last_name': claims.get('family_name') or '',
    }
    profile, created = Profile.objects.update_or_create(sub=sub, defaults=defaults)
    return JsonResponse({'ok': True, 'created': created, 'sub': profile.sub})

@token_required
def profile_me(request):
    claims = getattr(request, 'user_claims', {}) or {}
    sub = claims.get('sub')
    if not sub:
        return JsonResponse({'detail': 'missing sub in token'}, status=400)

    try:
        p = Profile.objects.get(sub=sub)
        return JsonResponse({
            'sub': p.sub,
            'username': p.username,
            'email': p.email,
            'first_name': p.first_name,
            'last_name': p.last_name,
        })
    except Profile.DoesNotExist:
        return JsonResponse({'detail': 'profile not found, call /api/profile/sync/ first'}, status=404)

@token_required
@roles_required('report_viewer', client_id='my_django_client')
def reports(request):
    return JsonResponse({'message': 'you have report_viewer at my_django_client'})

# ----- Trip-planner: Wikipedia description + nearby landmarks -----

@token_required
def describe(request):
    """
    Short city blurb via Wikipedia.
    GET /api/describe/?query=New%20York%20City
    -> { query, title, extract }
    """
    query = (request.GET.get("query") or "").strip()
    if not query:
        return JsonResponse({"detail": "Missing query"}, status=400)

    try:
        # 1) Search best page
        sr_resp = requests.get(
            WIKI_API,
            headers=WIKI_HEADERS,
            params={"action": "query", "format": "json", "list": "search", "srsearch": query, "srlimit": 1, "srprop": ""},
            timeout=8,
        )
        sr = _safe_json(sr_resp)
        if not sr_resp.ok or not sr.get("query", {}).get("search"):
            return JsonResponse({"query": query, "title": query, "extract": ""}, status=200)

        page_title = sr["query"]["search"][0]["title"]

        # 2) REST summary (lead)
        sum_resp = requests.get(WIKI_REST_SUMMARY + quote(page_title), headers=WIKI_HEADERS, timeout=8)
        summ = _safe_json(sum_resp)
        if not sum_resp.ok or summ.get("_nonjson"):
            return JsonResponse({"query": query, "title": page_title, "extract": ""}, status=200)

        title = summ.get("title", page_title)
        extract = _shorten(summ.get("extract") or "")

        return JsonResponse({"query": query, "title": title, "extract": extract}, status=200)

    except Exception:
        return JsonResponse({"query": query, "title": query, "extract": ""}, status=200)


@token_required
def nearby(request):
    """
    Landmark-ish places near a point via Wikipedia GeoSearch.
    GET /api/nearby/?lat=40.7128&lng=-74.0060&radius=25000&limit=20
    -> { query: {lat,lng}, places: [{name, full_name, lat, lng, url?, thumb?}, ...] }
    """
    lat = request.GET.get("lat")
    lng = request.GET.get("lng")

    # Clamp to API limits (10km max). Use a sensible default if none supplied.
    try:
        requested_radius = int(request.GET.get("radius") or 8000)
    except Exception:
        requested_radius = 8000
    radius = max(100, min(requested_radius, WIKI_MAX_RADIUS))

    try:
        limit = int(request.GET.get("limit") or 20)
    except Exception:
        limit = 20

    if not lat or not lng:
        return JsonResponse({"detail": "Missing lat/lng"}, status=400)

    try:
        lat = float(lat)
        lng = float(lng)

        # 1) GeoSearch (over-fetch, within safe bounds)
        gslimit = min(max(limit * 5, 60), 100)  # safe upper bound for users
        geo_resp = requests.get(
            WIKI_API,
            headers=WIKI_HEADERS,
            params={
                "action": "query",
                "format": "json",
                "list": "geosearch",
                "gscoord": f"{lat}|{lng}",  # lat|lon
                "gsradius": radius,         # <= 10000
                "gslimit": gslimit,
            },
            timeout=8,
        )
        geo = _safe_json(geo_resp)

        if not geo_resp.ok or "error" in geo:
            # Graceful degrade — still return shape
            return JsonResponse({"query": {"lat": lat, "lng": lng}, "places": []}, status=200)

        geolist = geo.get("query", {}).get("geosearch", [])

        # 2) Prefer touristy names, but never return empty
        attraction_keywords = [
            "museum", "park", "square", "garden", "tower", "bridge", "cathedral",
            "church", "temple", "monument", "memorial", "palace", "castle",
            "zoo", "aquarium", "theatre", "theater", "observatory", "plaza",
            "library", "market", "hall", "center", "centre", "gallery",
            "landmark", "island", "beach", "bay", "harbor", "harbour",
            "terminal", "station", "stadium", "arena", "campus", "monastery",
            "opera", "concert", "fort", "basilica", "boulevard",
        ]
        def looks_touristy(title: str) -> bool:
            t = (title or "").lower()
            return any(k in t for k in attraction_keywords)

        touristy = [g for g in geolist if looks_touristy(g.get("title", ""))]
        others = [g for g in geolist if g not in touristy]
        ordered = (touristy + others)[: max(limit, 30)]

        # 3) Batch details (extract, thumb, url)
        page_ids = [str(g["pageid"]) for g in ordered]
        if not page_ids:
            return JsonResponse({"query": {"lat": lat, "lng": lng}, "places": []}, status=200)

        det_resp = requests.get(
            WIKI_API,
            headers=WIKI_HEADERS,
            params={
                "action": "query",
                "format": "json",
                "prop": "extracts|pageimages|info",
                "exintro": 1,
                "explaintext": 1,
                "inprop": "url",
                "pithumbsize": 120,
                "pageids": "|".join(page_ids),
            },
            timeout=8,
        )
        details = _safe_json(det_resp)
        pages = details.get("query", {}).get("pages", {}) if det_resp.ok else {}

        # 4) Build response
        places = []
        used = set()
        for pid in page_ids:
            if pid in used:
                continue
            p = pages.get(pid)
            src = next((g for g in ordered if g["pageid"] == int(pid)), None)
            if not p or not src:
                continue
            used.add(pid)
            places.append({
                "name": p.get("title"),
                "full_name": p.get("extract") or p.get("title"),
                "lat": src.get("lat"),
                "lng": src.get("lon"),
                "url": p.get("fullurl"),
                "thumb": (p.get("thumbnail") or {}).get("source"),
            })
            if len(places) >= limit:
                break

        return JsonResponse({"query": {"lat": lat, "lng": lng}, "places": places}, status=200)

    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)
