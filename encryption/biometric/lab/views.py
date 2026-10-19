import base64
import functools
import hashlib
import hmac
import json
import math
import os
import secrets
import time

import pyotp
from django.conf import settings
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST

from .auth_service import (
    AUDIT_LOG,
    CHALLENGE_STORE,
    RATE_LIMITER,
    _hmac_digest,
    deliver_otp_email,
    issue_service_ticket,
    mask_email,
    normalize_and_validate_email,
    verify_recaptcha_server_side,
)
from .face_provider import get_face_recognition_provider


def _client_ip(request) -> str:
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "127.0.0.1")


def _parse_json(request, max_bytes: int = 65536):
    if len(request.body) > max_bytes:
        return None, JsonResponse({"error": "payload_too_large"}, status=413)
    try:
        data = json.loads(request.body.decode("utf-8"))
        if not isinstance(data, dict):
            return None, JsonResponse({"error": "invalid_json_object"}, status=400)
        return data, None
    except Exception:
        return None, JsonResponse({"error": "invalid_json"}, status=400)


def require_authenticated_roles(*allowed_roles: str):
    """Decorator enforcing session validity and RBAC role permissions."""

    def decorator(view_func):
        @functools.wraps(view_func)
        def _wrapped(request, *args, **kwargs):
            session_data = request.session.get("consensus_auth")
            if not isinstance(session_data, dict):
                AUDIT_LOG.record("access_denied", _client_ip(request), "unauthenticated")
                return JsonResponse({"error": "authentication_required"}, status=401)
            session_id = str(session_data.get("session_id", ""))
            if CHALLENGE_STORE.is_session_revoked(session_id):
                request.session.flush()
                return JsonResponse({"error": "session_revoked"}, status=401)
            expires_at = float(session_data.get("expires_at", 0))
            if time.time() > expires_at:
                request.session.flush()
                return JsonResponse({"error": "session_expired"}, status=401)
            role = str(session_data.get("role", ""))
            if allowed_roles and role not in allowed_roles:
                AUDIT_LOG.record(
                    "authorization_denied",
                    str(session_data.get("masked_email", "session")),
                    "insufficient_role",
                    {"role": role, "required_roles": list(allowed_roles)},
                )
                return JsonResponse(
                    {"error": "forbidden_role", "required_roles": list(allowed_roles)},
                    status=403,
                )
            return view_func(request, *args, **kwargs)

        return _wrapped

    return decorator


@require_GET
def health(_request):
    provider = get_face_recognition_provider()
    return JsonResponse(
        {
            "status": "ok",
            "mode": "synthetic-only",
            "instance": os.environ.get("HOSTNAME", "local"),
            "face_engine_enabled": provider.engine_enabled,
            "face_provider": provider.provider_id,
        }
    )


@csrf_exempt
@require_POST
def synthetic_recognition(request):
    """Numerical matching spike. Accepts no images, embeddings, or personal identifiers."""
    if len(request.body) > 4096:
        return JsonResponse({"error": "payload_too_large"}, status=413)
    try:
        payload = json.loads(request.body)
        values = payload["values"]
        if not isinstance(values, list) or len(values) != len(settings.SYNTHETIC_REFERENCE):
            raise ValueError("wrong vector size")
        vector = [float(value) for value in values]
        if any(not math.isfinite(value) or not 0 <= value <= 1 for value in vector):
            raise ValueError("values must be finite numbers between 0 and 1")
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        return JsonResponse(
            {"error": "expected_four_synthetic_numbers_between_0_and_1"}, status=400
        )

    distance = math.sqrt(
        sum((left - right) ** 2 for left, right in zip(vector, settings.SYNTHETIC_REFERENCE))
    )
    score = max(0.0, 1.0 - distance / 2.0)
    digest = hashlib.sha256(",".join(f"{value:.6f}" for value in vector).encode()).hexdigest()[:16]
    return JsonResponse(
        {
            "eligible": distance <= settings.SYNTHETIC_DISTANCE_THRESHOLD,
            "score": round(score, 4),
            "synthetic_reference": True,
            "request_id": digest,
        }
    )


@csrf_exempt
@require_POST
def verify_admin_totp(request):
    """A demo second-factor check. Requires independent API token + configured TOTP."""
    supplied = request.headers.get("X-Admin-Token", "")
    if not settings.ADMIN_API_TOKEN or not settings.TOTP_SECRET:
        return JsonResponse({"error": "totp_not_configured"}, status=503)
    if not hmac.compare_digest(supplied, settings.ADMIN_API_TOKEN):
        AUDIT_LOG.record("admin_totp_failed", _client_ip(request), "invalid_admin_token")
        return JsonResponse({"error": "unauthorized"}, status=401)
    try:
        code = str(json.loads(request.body)["code"])
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        return JsonResponse({"error": "invalid_code"}, status=400)
    if not pyotp.TOTP(settings.TOTP_SECRET).verify(code, valid_window=1):
        AUDIT_LOG.record("admin_totp_failed", _client_ip(request), "invalid_totp_code")
        return JsonResponse({"error": "invalid_code"}, status=401)
    AUDIT_LOG.record("admin_totp_verified", _client_ip(request), "ok")
    return JsonResponse({"verified": True, "expires_in_seconds": 30, "synthetic_admin_only": True})


# ============================================================================
# STEP 1: Email + Server-Side Google reCAPTCHA + Rate Limiting
# ============================================================================


@csrf_exempt
@require_POST
def auth_login_start(request):
    payload, err = _parse_json(request, max_bytes=4096)
    if err:
        return err

    email = normalize_and_validate_email(payload.get("email", ""))
    if not email:
        return JsonResponse({"error": "invalid_email_format"}, status=400)

    ip = _client_ip(request)
    rate_key = f"login:{ip}:{mask_email(email)}"
    if not RATE_LIMITER.check_and_record(
        rate_key,
        settings.LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
        settings.LOGIN_RATE_LIMIT_WINDOW_SECONDS,
    ):
        AUDIT_LOG.record("login_rate_limited", email, "blocked", {"ip": ip})
        return JsonResponse({"error": "rate_limit_exceeded"}, status=429)

    recaptcha_token = str(payload.get("recaptcha_token", ""))
    recaptcha_ok, recaptcha_reason = verify_recaptcha_server_side(recaptcha_token, remote_ip=ip)
    if not recaptcha_ok:
        AUDIT_LOG.record(
            "login_recaptcha_rejected",
            email,
            "rejected",
            {"reason": recaptcha_reason},
        )
        return JsonResponse(
            {"error": "recaptcha_verification_failed", "reason": recaptcha_reason},
            status=400,
        )

    challenge, otp_code = CHALLENGE_STORE.create_challenge(email)
    delivery_mode = deliver_otp_email(email, otp_code)
    AUDIT_LOG.record(
        "login_step1_completed",
        email,
        "otp_dispatched",
        {"delivery_mode": delivery_mode, "recaptcha": recaptcha_reason},
    )

    response_data = {
        "challenge_id": challenge.challenge_id,
        "masked_email": challenge.masked_email,
        "step": "otp_pending",
        "otp_expires_in_seconds": settings.OTP_EXPIRY_SECONDS,
        "resend_cooldown_seconds": settings.OTP_RESEND_COOLDOWN_SECONDS,
        "message": "Si la cuenta está autorizada en el laboratorio, recibirás un código OTP de un solo uso.",
    }
    if settings.EMAIL_PROVIDER_MODE == "sandbox":
        response_data["sandbox_notice"] = (
            "Modo sandbox activo para laboratorio local. Consulta la bandeja local o el código de prueba."
        )
        response_data["sandbox_otp_preview"] = otp_code
    return JsonResponse(response_data)


# ============================================================================
# STEP 2: Email OTP Verification & Cooldown Resend
# ============================================================================


@csrf_exempt
@require_POST
def auth_otp_verify(request):
    payload, err = _parse_json(request, max_bytes=4096)
    if err:
        return err

    challenge_id = str(payload.get("challenge_id", "")).strip()
    otp_code = str(payload.get("otp_code", "")).strip()
    challenge = CHALLENGE_STORE.get(challenge_id)
    if not challenge:
        return JsonResponse({"error": "invalid_or_expired_challenge"}, status=400)

    if challenge.otp_invalidated or challenge.otp_verified:
        return JsonResponse({"error": "otp_already_used_or_invalidated"}, status=401)

    now = time.time()
    if now > challenge.otp_expires_at:
        challenge.otp_invalidated = True
        CHALLENGE_STORE.clear_sandbox_otp(challenge_id)
        AUDIT_LOG.record("login_otp_expired", challenge.email, "expired")
        return JsonResponse({"error": "otp_expired"}, status=401)

    if challenge.otp_attempts >= settings.OTP_MAX_ATTEMPTS:
        challenge.otp_invalidated = True
        CHALLENGE_STORE.clear_sandbox_otp(challenge_id)
        AUDIT_LOG.record("login_otp_locked", challenge.email, "max_attempts_exceeded")
        return JsonResponse({"error": "otp_max_attempts_exceeded"}, status=429)

    challenge.otp_attempts += 1
    if not otp_code.isdigit() or len(otp_code) != 6:
        return JsonResponse(
            {
                "error": "invalid_otp_code",
                "remaining_attempts": max(0, settings.OTP_MAX_ATTEMPTS - challenge.otp_attempts),
            },
            status=401,
        )

    supplied_hmac = _hmac_digest(f"{challenge.challenge_id}:{otp_code}")
    if not hmac.compare_digest(supplied_hmac, challenge.otp_hmac):
        remaining = max(0, settings.OTP_MAX_ATTEMPTS - challenge.otp_attempts)
        if remaining == 0:
            challenge.otp_invalidated = True
            CHALLENGE_STORE.clear_sandbox_otp(challenge_id)
        AUDIT_LOG.record(
            "login_otp_failed",
            challenge.email,
            "mismatch",
            {"remaining_attempts": remaining},
        )
        return JsonResponse(
            {"error": "invalid_otp_code", "remaining_attempts": remaining},
            status=401,
        )

    # Single-use invalidation immediately upon verification
    challenge.otp_verified = True
    challenge.otp_invalidated = True
    challenge.otp_hmac = ""
    CHALLENGE_STORE.clear_sandbox_otp(challenge_id)
    AUDIT_LOG.record("login_step2_completed", challenge.email, "otp_verified")
    return JsonResponse(
        {
            "challenge_id": challenge.challenge_id,
            "step": "otp_verified",
            "next_step": "biometric_consent_and_verification",
        }
    )


@csrf_exempt
@require_POST
def auth_otp_resend(request):
    payload, err = _parse_json(request, max_bytes=4096)
    if err:
        return err

    challenge_id = str(payload.get("challenge_id", "")).strip()
    challenge = CHALLENGE_STORE.get(challenge_id)
    if not challenge or challenge.otp_verified:
        return JsonResponse({"error": "invalid_challenge"}, status=400)

    now = time.time()
    if now < challenge.resend_available_at:
        wait_seconds = int(math.ceil(challenge.resend_available_at - now))
        return JsonResponse(
            {"error": "otp_resend_cooldown", "retry_after_seconds": wait_seconds},
            status=429,
        )

    otp_code = CHALLENGE_STORE.rotate_otp(challenge)
    deliver_otp_email(challenge.email, otp_code)
    AUDIT_LOG.record("login_otp_resent", challenge.email, "resent")
    resp = {
        "challenge_id": challenge.challenge_id,
        "otp_expires_in_seconds": settings.OTP_EXPIRY_SECONDS,
        "resend_cooldown_seconds": settings.OTP_RESEND_COOLDOWN_SECONDS,
    }
    if settings.EMAIL_PROVIDER_MODE == "sandbox":
        resp["sandbox_otp_preview"] = otp_code
    return JsonResponse(resp)


# ============================================================================
# STEP 3: Informed Biometric Consent, FacePlugin 1:1 Verification & Fallback
# ============================================================================


@require_GET
def biometric_provider_status(_request):
    provider = get_face_recognition_provider()
    return JsonResponse(provider.status_metadata())


@csrf_exempt
@require_POST
def auth_biometric_consent(request):
    payload, err = _parse_json(request, max_bytes=4096)
    if err:
        return err

    challenge_id = str(payload.get("challenge_id", "")).strip()
    accepted = payload.get("accepted") is True
    challenge = CHALLENGE_STORE.get(challenge_id)
    if not challenge or not challenge.otp_verified:
        return JsonResponse({"error": "otp_verification_required_first"}, status=403)

    if not accepted:
        challenge.consent_accepted = False
        return JsonResponse(
            {
                "consent_accepted": False,
                "message": "Sin consentimiento biométrico puedes usar el método alternativo autorizado.",
            },
            status=400,
        )

    challenge.consent_accepted = True
    challenge.consent_timestamp = time.time()
    challenge.consent_version = "Ley1581-2012-v1"
    AUDIT_LOG.record(
        "biometric_consent_granted",
        challenge.email,
        "accepted",
        {"policy_version": challenge.consent_version},
    )
    return JsonResponse(
        {
            "challenge_id": challenge.challenge_id,
            "consent_accepted": True,
            "policy_version": challenge.consent_version,
            "purpose": "Comparación facial efímera 1:1 en memoria para laboratorio educativo.",
            "retention": "0 segundos (procesamiento efímero; nunca se guarda en disco, S3, Stellar ni logs).",
            "revocation_endpoint": "/v1/auth/biometric/revoke",
        }
    )


@csrf_exempt
@require_POST
def auth_biometric_revoke(request):
    payload, err = _parse_json(request, max_bytes=4096)
    if err:
        return err

    challenge_id = str(payload.get("challenge_id", "")).strip()
    challenge = CHALLENGE_STORE.get(challenge_id)
    if challenge:
        challenge.consent_accepted = False
        challenge.biometric_verified = False
        challenge.verification_method = ""
        AUDIT_LOG.record("biometric_consent_revoked", challenge.email, "revoked")
    return JsonResponse({"revoked": True, "ephemeral_state_cleared": True})


@csrf_exempt
@require_POST
def auth_biometric_verify(request):
    """Performs 1:1 facial verification via FaceRecognitionProvider.

    - Requires prior OTP verification and explicit informed consent.
    - Rejects 1:N identification requests.
    - Never fakes a real biometric match when the FacePlugin engine is not installed.
    """
    payload, err = _parse_json(request, max_bytes=262144)
    if err:
        return err

    challenge_id = str(payload.get("challenge_id", "")).strip()
    operation_mode = str(payload.get("operation_mode", "1:1")).strip()
    challenge = CHALLENGE_STORE.get(challenge_id)
    if not challenge or not challenge.otp_verified:
        return JsonResponse({"error": "otp_verification_required_first"}, status=403)

    if not challenge.consent_accepted:
        return JsonResponse({"error": "biometric_consent_required"}, status=403)

    provider = get_face_recognition_provider()
    if operation_mode == "1:N":
        result_1ton = provider.identify_1toN(b"")
        return JsonResponse(
            {
                "error": "1toN_identification_prohibited",
                "operation_mode": result_1ton.operation_mode,
                "reason": result_1ton.reason,
            },
            status=403,
        )

    probe_b64 = str(payload.get("probe_image_b64", "")).strip()
    reference_b64 = str(payload.get("reference_image_b64", "")).strip()
    try:
        probe_bytes = base64.b64decode(probe_b64) if probe_b64 else b"probe-empty"
        ref_bytes = base64.b64decode(reference_b64) if reference_b64 else b"ref-empty"
    except Exception:
        return JsonResponse({"error": "invalid_base64_image"}, status=400)

    comparison = provider.compare_1to1(
        probe_bytes,
        ref_bytes,
        threshold=settings.FACE_MATCH_THRESHOLD,
    )
    del probe_bytes, ref_bytes

    if not comparison.engine_enabled:
        AUDIT_LOG.record(
            "biometric_verify_engine_disabled",
            challenge.email,
            "engine_not_installed",
            {"provider": comparison.provider_name},
        )
        return JsonResponse(
            {
                "verified": False,
                "matched": False,
                "simulated": False,
                "engine_enabled": False,
                "provider": comparison.provider_name,
                "operation_mode": comparison.operation_mode,
                "liveness_supported": comparison.liveness.supported,
                "error": "real_face_engine_disabled",
                "reason": comparison.reason,
                "fallback_available": True,
                "message": (
                    "El motor de reconocimiento facial real (FacePlugin SDK) está deshabilitado "
                    "en este entorno de pruebas. Nunca se simula una coincidencia real; "
                    "utiliza el método alternativo autorizado (/v1/auth/biometric/fallback)."
                ),
            },
            status=503,
        )

    if not comparison.matched:
        AUDIT_LOG.record(
            "biometric_verify_mismatch",
            challenge.email,
            "rejected",
            {"provider": comparison.provider_name},
        )
        return JsonResponse(
            {
                "verified": False,
                "matched": False,
                "simulated": False,
                "engine_enabled": True,
                "similarity": comparison.similarity,
                "threshold": comparison.threshold,
                "error": "face_mismatch_or_not_detected",
                "reason": comparison.reason,
            },
            status=401,
        )

    challenge.biometric_verified = True
    challenge.verification_method = "faceplugin_1to1"
    AUDIT_LOG.record("login_step3_completed", challenge.email, "faceplugin_1to1_verified")
    return JsonResponse(
        {
            "verified": True,
            "matched": True,
            "simulated": False,
            "engine_enabled": True,
            "similarity": comparison.similarity,
            "threshold": comparison.threshold,
            "operation_mode": comparison.operation_mode,
            "liveness_supported": comparison.liveness.supported,
            "legal_disclaimer": (
                "Coincidencia 1:1 en entorno controlado. No constituye verificación legal "
                "de ciudadanía ni inscripción en el censo electoral."
            ),
        }
    )


@csrf_exempt
@require_POST
def auth_biometric_fallback(request):
    """Authorized alternative verification when camera fails or FacePlugin is disabled."""
    payload, err = _parse_json(request, max_bytes=4096)
    if err:
        return err

    challenge_id = str(payload.get("challenge_id", "")).strip()
    fallback_code = str(payload.get("fallback_code", "")).strip()
    reason = str(payload.get("reason", "camera_or_engine_unavailable")).strip()[:120]

    challenge = CHALLENGE_STORE.get(challenge_id)
    if not challenge or not challenge.otp_verified:
        return JsonResponse({"error": "otp_verification_required_first"}, status=403)

    if not fallback_code:
        return JsonResponse({"error": "fallback_code_required"}, status=400)

    valid_contingency = hmac.compare_digest(fallback_code, settings.BIOMETRIC_FALLBACK_CODE)
    valid_totp = bool(
        settings.TOTP_SECRET
        and fallback_code.isdigit()
        and len(fallback_code) == 6
        and pyotp.TOTP(settings.TOTP_SECRET).verify(fallback_code, valid_window=1)
    )
    if not (valid_contingency or valid_totp):
        AUDIT_LOG.record(
            "biometric_fallback_failed",
            challenge.email,
            "invalid_fallback_code",
        )
        return JsonResponse({"error": "invalid_fallback_code"}, status=401)

    challenge.biometric_verified = True
    challenge.verification_method = "authorized_fallback"
    AUDIT_LOG.record(
        "login_step3_completed",
        challenge.email,
        "authorized_fallback_verified",
        {"fallback_reason": reason},
    )
    return JsonResponse(
        {
            "verified": True,
            "verification_method": "authorized_fallback",
            "simulated_biometrics": False,
            "next_step": "issue_session",
        }
    )


# ============================================================================
# STEP 4: Session Issuance, RBAC, Logout & Audit Endpoints
# ============================================================================


@csrf_exempt
@require_POST
def auth_session_issue(request):
    payload, err = _parse_json(request, max_bytes=4096)
    if err:
        return err

    challenge_id = str(payload.get("challenge_id", "")).strip()
    challenge = CHALLENGE_STORE.get(challenge_id)
    if not challenge:
        return JsonResponse({"error": "invalid_challenge"}, status=400)

    if challenge.session_issued:
        return JsonResponse({"error": "session_already_issued_for_challenge"}, status=401)

    if not (challenge.otp_verified and challenge.biometric_verified):
        return JsonResponse(
            {
                "error": "authentication_steps_incomplete",
                "otp_verified": challenge.otp_verified,
                "biometric_or_fallback_verified": challenge.biometric_verified,
            },
            status=403,
        )

    challenge.session_issued = True
    account_profile = settings.SYNTHETIC_ACCOUNTS.get(
        challenge.email,
        {
            "role": "participante",
            "display_name": "Participante Sintético de Prueba",
            "territory_code": "05001",
            "department_code": "05",
            "eligible": True,
        },
    )
    # One-way pseudonymous subject ID so identity cannot be trivially joined to vote content
    subject_id = "sub_" + _hmac_digest(f"subject:{challenge.email}")[:20]
    session_id = secrets.token_urlsafe(24)
    now = time.time()
    expires_at = now + settings.SESSION_COOKIE_AGE

    session_data = {
        "session_id": session_id,
        "subject_id": subject_id,
        "masked_email": challenge.masked_email,
        "display_name": account_profile["display_name"],
        "role": account_profile["role"],
        "territory_code": account_profile["territory_code"],
        "department_code": account_profile["department_code"],
        "eligible": account_profile["eligible"],
        "verification_method": challenge.verification_method,
        "issued_at": round(now, 3),
        "expires_at": round(expires_at, 3),
    }
    request.session["consensus_auth"] = session_data
    request.session.modified = True
    csrf_token = get_token(request)

    AUDIT_LOG.record(
        "session_issued",
        challenge.email,
        "authenticated",
        {
            "role": account_profile["role"],
            "verification_method": challenge.verification_method,
        },
    )
    return JsonResponse(
        {
            "authenticated": True,
            "session": {
                "subject_id": subject_id,
                "masked_email": challenge.masked_email,
                "display_name": account_profile["display_name"],
                "role": account_profile["role"],
                "territory_code": account_profile["territory_code"],
                "department_code": account_profile["department_code"],
                "eligible": account_profile["eligible"],
                "verification_method": challenge.verification_method,
                "expires_in_seconds": settings.SESSION_COOKIE_AGE,
            },
            "csrf_token": csrf_token,
            "cookie_policy": {
                "http_only": True,
                "secure": settings.SESSION_COOKIE_SECURE,
                "same_site": settings.SESSION_COOKIE_SAMESITE,
                "local_storage_prohibited": True,
            },
        }
    )


@require_GET
@require_authenticated_roles("participante", "administrador", "auditor")
def auth_session_me(request):
    session_data = request.session["consensus_auth"]
    return JsonResponse(
        {
            "authenticated": True,
            "session": session_data,
            "csrf_token": get_token(request),
        }
    )


@csrf_exempt
@require_POST
def auth_session_logout(request):
    session_data = request.session.get("consensus_auth")
    if isinstance(session_data, dict):
        CHALLENGE_STORE.revoke_session(str(session_data.get("session_id", "")))
        AUDIT_LOG.record(
            "session_logout",
            str(session_data.get("masked_email", "session")),
            "logged_out",
        )
    request.session.flush()
    response = JsonResponse({"authenticated": False, "logged_out": True})
    response.delete_cookie(settings.SESSION_COOKIE_NAME)
    return response


@csrf_exempt
@require_POST
@require_authenticated_roles("participante", "administrador", "auditor")
def auth_service_exchange(request):
    """Issues a short-lived signed service ticket for FastAPI / Rust API integration."""
    session_data = request.session["consensus_auth"]
    ticket = issue_service_ticket(session_data, ttl_seconds=300)
    return JsonResponse(
        {
            "service_ticket": ticket,
            "expires_in_seconds": 300,
            "role": session_data["role"],
        }
    )


@require_GET
@require_authenticated_roles("administrador")
def admin_overview(request):
    session_data = request.session["consensus_auth"]
    return JsonResponse(
        {
            "admin_authorized": True,
            "role": session_data["role"],
            "governance_model": "8 perfiles de aplicación con umbral objetivo 5-de-8 (no son nodos validadores Stellar)",
            "active_territory": session_data["territory_code"],
        }
    )


@require_GET
@require_authenticated_roles("administrador", "auditor")
def audit_events_view(_request):
    return JsonResponse(
        {
            "events": AUDIT_LOG.list_events(limit=100),
            "pii_redacted": True,
            "secrets_redacted": True,
        }
    )
