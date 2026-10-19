"""Multi-factor authentication, OTP, reCAPTCHA, session, RBAC, and security audit service.

Implements the 4-step Consensus Colombia MVP login flow:
  Step 1: Email normalization + server-side Google reCAPTCHA verification + rate limiting.
  Step 2: Cryptographically secure one-time password (OTP) via configurable email provider,
          with short expiration, attempt limits, resend cooldown, and single-use invalidation.
  Step 3: Informed biometric consent (Ley 1581 de 2012), decoupled FaceRecognitionProvider
          (1:1 vs 1:N separation, no fake biometric matches), and authorized fallback method.
  Step 4: HttpOnly/SameSite/Secure cookie session issuance, RBAC (participante, administrador,
          auditor), session invalidation on logout, and secret-free security audit logging.
"""

from __future__ import annotations

import base64
import dataclasses
import hashlib
import hmac
import json
import re
import secrets
import time
import urllib.parse
import urllib.request
from typing import Dict, List, Optional, Tuple

from django.conf import settings
from django.core.mail import send_mail

EMAIL_REGEX = re.compile(r"^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,63}$")
_CSPRNG = secrets.SystemRandom()


def mask_email(email: str) -> str:
    """Masks an email address so logs never expose full personal identifiers."""
    if "@" not in email:
        return "***"
    local, domain = email.split("@", 1)
    masked_local = (local[0] + "***") if local else "***"
    domain_parts = domain.split(".")
    masked_domain = (
        (domain_parts[0][0] + "***." + ".".join(domain_parts[1:]))
        if len(domain_parts) > 1 and domain_parts[0]
        else "***"
    )
    return f"{masked_local}@{masked_domain}"


def normalize_and_validate_email(raw_email: str) -> Optional[str]:
    if not isinstance(raw_email, str):
        return None
    normalized = raw_email.strip().lower()
    if len(normalized) > 254 or not EMAIL_REGEX.match(normalized):
        return None
    return normalized


def _hmac_digest(value: str) -> str:
    key = settings.SECRET_KEY.encode("utf-8")
    return hmac.new(key, value.encode("utf-8"), hashlib.sha256).hexdigest()


@dataclasses.dataclass
class LoginChallenge:
    challenge_id: str
    email: str
    masked_email: str
    otp_hmac: str
    created_at: float
    otp_expires_at: float
    resend_available_at: float
    otp_attempts: int = 0
    otp_verified: bool = False
    otp_invalidated: bool = False
    consent_accepted: bool = False
    consent_timestamp: Optional[float] = None
    consent_version: str = ""
    biometric_verified: bool = False
    verification_method: str = ""
    session_issued: bool = False


class SecurityAuditLog:
    """In-memory ring buffer of sanitized security and administrative audit events."""

    def __init__(self, max_events: int = 500) -> None:
        self._max_events = max_events
        self._events: List[Dict[str, object]] = []

    def record(
        self,
        event_type: str,
        actor: str,
        outcome: str,
        details: Optional[Dict[str, object]] = None,
    ) -> Dict[str, object]:
        safe_details: Dict[str, object] = {}
        for k, v in (details or {}).items():
            lowered = k.lower()
            if any(secret_word in lowered for secret_word in ("otp", "token", "secret", "password", "key", "embedding", "image")):
                continue
            safe_details[k] = v

        entry: Dict[str, object] = {
            "event_id": secrets.token_hex(8),
            "timestamp": round(time.time(), 3),
            "event_type": event_type,
            "actor": mask_email(actor) if "@" in actor else actor,
            "outcome": outcome,
            "details": safe_details,
        }
        self._events.append(entry)
        if len(self._events) > self._max_events:
            self._events.pop(0)
        return entry

    def list_events(self, limit: int = 100) -> List[Dict[str, object]]:
        return list(reversed(self._events[-limit:]))

    def clear(self) -> None:
        self._events.clear()


class RateLimiter:
    """Sliding-window rate limiter for login and OTP verification attempts."""

    def __init__(self) -> None:
        self._buckets: Dict[str, List[float]] = {}

    def check_and_record(self, key: str, max_attempts: int, window_seconds: int) -> bool:
        now = time.time()
        cutoff = now - window_seconds
        timestamps = [ts for ts in self._buckets.get(key, []) if ts > cutoff]
        if len(timestamps) >= max_attempts:
            self._buckets[key] = timestamps
            return False
        timestamps.append(now)
        self._buckets[key] = timestamps
        return True

    def clear(self) -> None:
        self._buckets.clear()


class ChallengeStore:
    """Manages active multi-step login challenges and sandbox OTP delivery metadata."""

    def __init__(self) -> None:
        self._challenges: Dict[str, LoginChallenge] = {}
        self._sandbox_outbox: Dict[str, str] = {}
        self._revoked_sessions: set[str] = set()

    def create_challenge(self, email: str) -> Tuple[LoginChallenge, str]:
        otp_code = f"{_CSPRNG.randint(0, 999999):06d}"
        now = time.time()
        challenge_id = secrets.token_urlsafe(24)
        challenge = LoginChallenge(
            challenge_id=challenge_id,
            email=email,
            masked_email=mask_email(email),
            otp_hmac=_hmac_digest(f"{challenge_id}:{otp_code}"),
            created_at=now,
            otp_expires_at=now + settings.OTP_EXPIRY_SECONDS,
            resend_available_at=now + settings.OTP_RESEND_COOLDOWN_SECONDS,
        )
        self._challenges[challenge_id] = challenge
        if settings.EMAIL_PROVIDER_MODE == "sandbox":
            self._sandbox_outbox[challenge_id] = otp_code
        return challenge, otp_code

    def rotate_otp(self, challenge: LoginChallenge) -> str:
        otp_code = f"{_CSPRNG.randint(0, 999999):06d}"
        now = time.time()
        challenge.otp_hmac = _hmac_digest(f"{challenge.challenge_id}:{otp_code}")
        challenge.otp_expires_at = now + settings.OTP_EXPIRY_SECONDS
        challenge.resend_available_at = now + settings.OTP_RESEND_COOLDOWN_SECONDS
        challenge.otp_attempts = 0
        challenge.otp_invalidated = False
        if settings.EMAIL_PROVIDER_MODE == "sandbox":
            self._sandbox_outbox[challenge.challenge_id] = otp_code
        return otp_code

    def get(self, challenge_id: str) -> Optional[LoginChallenge]:
        return self._challenges.get(challenge_id)

    def pop_sandbox_otp(self, challenge_id: str) -> Optional[str]:
        return self._sandbox_outbox.get(challenge_id)

    def clear_sandbox_otp(self, challenge_id: str) -> None:
        self._sandbox_outbox.pop(challenge_id, None)

    def revoke_session(self, session_id: str) -> None:
        if session_id:
            self._revoked_sessions.add(session_id)

    def is_session_revoked(self, session_id: str) -> bool:
        return bool(session_id and session_id in self._revoked_sessions)

    def clear(self) -> None:
        self._challenges.clear()
        self._sandbox_outbox.clear()
        self._revoked_sessions.clear()


AUDIT_LOG = SecurityAuditLog()
RATE_LIMITER = RateLimiter()
CHALLENGE_STORE = ChallengeStore()


def verify_recaptcha_server_side(token: str, remote_ip: str = "") -> Tuple[bool, str]:
    """Verifies a Google reCAPTCHA token on the server.

    - Always rejects empty, malformed, or explicitly invalid tokens.
    - When `RECAPTCHA_SECRET_KEY` is configured, calls Google's `siteverify` API.
    - When `RECAPTCHA_SECRET_KEY` is not set and `RECAPTCHA_DEV_TEST_MODE` is True,
      accepts only the explicit local test token `test-recaptcha-pass-consensus`
      (or Google's official test token), never arbitrary strings.
    """
    if not isinstance(token, str) or not token.strip():
        return False, "missing_recaptcha_token"
    cleaned = token.strip()
    if len(cleaned) < 12 or cleaned.lower().startswith(("invalid", "fail", "fake", "bot")):
        return False, "invalid_recaptcha_token"

    secret = getattr(settings, "RECAPTCHA_SECRET_KEY", "").strip()
    if secret:
        payload = urllib.parse.urlencode(
            {"secret": secret, "response": cleaned, "remoteip": remote_ip}
        ).encode("utf-8")
        req = urllib.request.Request(
            settings.RECAPTCHA_VERIFY_URL,
            data=payload,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                body = json.loads(resp.read().decode("utf-8"))
            if body.get("success") is True:
                return True, "google_siteverify_ok"
            return False, "google_siteverify_rejected"
        except Exception:
            return False, "google_siteverify_unreachable"

    if getattr(settings, "RECAPTCHA_DEV_TEST_MODE", False):
        allowed_test_tokens = {
            "test-recaptcha-pass-consensus",
            "6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe",
        }
        if cleaned in allowed_test_tokens:
            return True, "dev_test_token_verified"
        return False, "invalid_recaptcha_token"

    return False, "recaptcha_not_configured"


def deliver_otp_email(email: str, otp_code: str) -> str:
    """Sends the one-time code using the configured Django email backend."""
    subject = "Consensus Colombia Lab — Código de verificación de un solo uso (OTP)"
    body = (
        "Laboratorio Educativo Consensus Colombia\n\n"
        f"Tu código de verificación de un solo uso es: {otp_code}\n"
        f"Este código expira en {settings.OTP_EXPIRY_SECONDS // 60} minutos y solo puede utilizarse una vez.\n"
        "Aviso: Este entorno es exclusivamente educativo y sintético."
    )
    send_mail(
        subject=subject,
        message=body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[email],
        fail_silently=True,
    )
    return "smtp" if settings.EMAIL_HOST else settings.EMAIL_PROVIDER_MODE


def issue_service_ticket(session_data: Dict[str, object], ttl_seconds: int = 300) -> str:
    """Creates a short-lived HMAC-signed service ticket for FastAPI/Rust inter-service auth.

    Contains only role, pseudonymous subject_id, territory scope, and expiration — never PII.
    """
    now = int(time.time())
    payload = {
        "sub": session_data.get("subject_id"),
        "role": session_data.get("role", "participante"),
        "scopes": _scopes_for_role(str(session_data.get("role", "participante"))),
        "department_code": session_data.get("department_code", "05"),
        "territory_code": session_data.get("territory_code", "05001"),
        "iat": now,
        "exp": now + ttl_seconds,
        "jti": secrets.token_hex(8),
    }
    raw_json = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    b64_payload = base64.urlsafe_b64encode(raw_json).decode("ascii").rstrip("=")
    secret = settings.INTERNAL_SERVICE_SECRET.encode("utf-8")
    sig = hmac.new(secret, b64_payload.encode("ascii"), hashlib.sha256).hexdigest()
    return f"{b64_payload}.{sig}"


def verify_service_ticket(ticket: str) -> Optional[Dict[str, object]]:
    """Verifies an inter-service HMAC ticket."""
    if not ticket or "." not in ticket:
        return None
    b64_payload, supplied_sig = ticket.rsplit(".", 1)
    secret = settings.INTERNAL_SERVICE_SECRET.encode("utf-8")
    expected_sig = hmac.new(secret, b64_payload.encode("ascii"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(supplied_sig, expected_sig):
        return None
    padding = "=" * (-len(b64_payload) % 4)
    try:
        payload = json.loads(base64.urlsafe_b64decode(b64_payload + padding).decode("utf-8"))
    except Exception:
        return None
    if int(payload.get("exp", 0)) < int(time.time()):
        return None
    return payload


def _scopes_for_role(role: str) -> List[str]:
    if role == "administrador":
        return [
            "elections:read",
            "elections:write",
            "territories:read",
            "artifacts:read",
            "artifacts:write",
            "audit:read",
        ]
    if role == "auditor":
        return [
            "elections:read",
            "territories:read",
            "artifacts:read",
            "audit:read",
        ]
    return [
        "elections:read",
        "votes:cast",
        "territories:read",
    ]
