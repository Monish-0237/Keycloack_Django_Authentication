import functools 
import time
import requests
import jwt
from functools import wraps
from django.http import JsonResponse
from django.conf import settings
from jwt.algorithms import RSAAlgorithm


# simple in-memory JWKS cache (good for dev)
_JWKS_CACHE = {"exp": 0, "keys": {}}

def _get_jwks():
    now = int(time.time())
    if now < _JWKS_CACHE["exp"]:
        return _JWKS_CACHE["keys"]

    # Discover JWKS URL from the issuer
    oidc_cfg = requests.get(
        f"{settings.KEYCLOAK_ISSUER}/.well-known/openid-configuration",
        timeout=5
    ).json()
    jwks_uri = oidc_cfg["jwks_uri"]
    jwks = requests.get(jwks_uri, timeout=5).json()

    _JWKS_CACHE["keys"] = jwks
    _JWKS_CACHE["exp"] = now + 600  # cache 10 minutes
    return jwks

def _get_public_key(kid: str):
    for key in _get_jwks().get("keys", []):
        if key.get("kid") == kid:
            return RSAAlgorithm.from_jwk(key)
    return None

def token_required(view_func):
    """Decorator to enforce a valid Keycloak JWT (RS256) on a view."""
    @functools.wraps(view_func)
    def _wrapped(request, *args, **kwargs):
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return JsonResponse({"detail": "Missing bearer token."}, status=401)

        token = auth.split(" ", 1)[1].strip()
        try:
            header = jwt.get_unverified_header(token)
            pubkey = _get_public_key(header.get("kid"))
            if not pubkey:
                return JsonResponse({"detail": "Unknown token key."}, status=401)

            payload = jwt.decode(
                token,
                key=pubkey,
                algorithms=["RS256"],
                audience=settings.KEYCLOAK_AUDIENCE,
                issuer=settings.KEYCLOAK_ISSUER,
                options={"verify_exp": True, "verify_aud": True},
            )
            # make claims available to the view
            request.user_claims = payload
        except jwt.ExpiredSignatureError:
            return JsonResponse({"detail": "Token expired."}, status=401)
        except jwt.InvalidTokenError as e:
            return JsonResponse({"detail": f"Invalid token: {e}"}, status=401)

        return view_func(request, *args, **kwargs)
    return _wrapped

def roles_required(*need_roles, client_id=None):
    '''
    If client_id is None, checks realm roles.
    If client_id is set, checks client roles for that client.
    '''
    def deco(view):
        @wraps(view)
        def _wrapped(request, *args, **kwargs):
            claims = getattr(request, 'user_claims', {}) or {}
            if client_id:
                roles = claims.get('resource_access', {}).get(client_id, {}).get('roles', [])
            else:
                roles = claims.get('realm_access', {}).get('roles', [])
            if not all(r in roles for r in need_roles):
                return JsonResponse(
                    {
                        'detail': 'forbidden: missing roles',
                        'required': list(need_roles),
                        'have': roles,
                    },
                    status=403,
                )
            return view(request, *args, **kwargs)
        return _wrapped
    return deco
