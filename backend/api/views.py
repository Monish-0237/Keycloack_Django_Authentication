from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods, require_GET
from django.db import transaction
from .auth import token_required, roles_required
from .models import Profile


# Create your views here.
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
        # handle both spellings just in case
        'preferred_username': claims.get('preferred_username'),
        'email': claims.get('email'),
        'name': claims.get('name'),
        'given_name': claims.get('given_name'),
        'family_name': claims.get('family_name'),
        'scope': claims.get('scope'),
        'raw': claims,  # helpful for debugging
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
        # 'raw_claims': claims,   <-- remove this line
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