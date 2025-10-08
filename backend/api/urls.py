from django.urls import path
from . import views

urlpatterns = [
    # Existing endpoints
    path("hello/", views.hello_protected, name="hello_protected"),
    path("me/", views.me, name="me"),
    path("admin-only/", views.admin_only, name="admin_only"),
    path("profile/sync/", views.profile_sync, name="profile_sync"),
    path("profile/me/", views.profile_me, name="profile_me"),
    path("reports/", views.reports, name="reports"),

    # Trip-planner features
    path("describe/", views.describe, name="describe"),   # returns description of a place
    path("nearby/", views.nearby, name="nearby"),         # returns nearby places from Wikipedia GeoSearch
]
