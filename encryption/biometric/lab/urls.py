from django.urls import path

from .views import health, synthetic_recognition, verify_admin_totp

urlpatterns = [
    path("health", health),
    path("v1/recognition", synthetic_recognition),
    path("v1/admin/totp/verify", verify_admin_totp),
]
