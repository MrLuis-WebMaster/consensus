from django.urls import path

from .views import (
    admin_overview,
    audit_events_view,
    auth_biometric_consent,
    auth_biometric_fallback,
    auth_biometric_revoke,
    auth_biometric_verify,
    auth_login_start,
    auth_otp_resend,
    auth_otp_verify,
    auth_service_exchange,
    auth_session_issue,
    auth_session_logout,
    auth_session_me,
    biometric_provider_status,
    health,
    synthetic_recognition,
    verify_admin_totp,
)

urlpatterns = [
    path("health", health),
    path("v1/recognition", synthetic_recognition),
    path("v1/admin/totp/verify", verify_admin_totp),
    # Step 1: Email + reCAPTCHA + Rate Limit
    path("v1/auth/login/start", auth_login_start),
    # Step 2: Email OTP Verification & Cooldown Resend
    path("v1/auth/otp/verify", auth_otp_verify),
    path("v1/auth/otp/resend", auth_otp_resend),
    # Step 3: Informed Biometric Consent, FacePlugin 1:1 & Authorized Fallback
    path("v1/auth/biometric/status", biometric_provider_status),
    path("v1/auth/biometric/consent", auth_biometric_consent),
    path("v1/auth/biometric/revoke", auth_biometric_revoke),
    path("v1/auth/biometric/verify", auth_biometric_verify),
    path("v1/auth/biometric/fallback", auth_biometric_fallback),
    # Step 4: HttpOnly Session Issuance, RBAC, Service Ticket & Security Audit
    path("v1/auth/session/issue", auth_session_issue),
    path("v1/auth/session/me", auth_session_me),
    path("v1/auth/session/logout", auth_session_logout),
    path("v1/auth/service/exchange", auth_service_exchange),
    path("v1/admin/overview", admin_overview),
    path("v1/audit/events", audit_events_view),
]
