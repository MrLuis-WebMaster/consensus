import os
import tempfile

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "")
if len(SECRET_KEY) < 32:
    raise RuntimeError("Set DJANGO_SECRET_KEY (at least 32 characters) in an ignored .env file")

DEBUG = os.environ.get("DJANGO_DEBUG", "false").lower() == "true"
ALLOWED_HOSTS = [
    host.strip()
    for host in os.environ.get(
        "DJANGO_ALLOWED_HOSTS",
        "localhost,127.0.0.1,testserver,waf,python-lb,python-a,python-b,identity-a,identity-b",
    ).split(",")
    if host.strip()
]
ROOT_URLCONF = "consensus_identity.urls"
WSGI_APPLICATION = "consensus_identity.wsgi.application"
INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "corsheaders",
    "lab",
]
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": os.environ.get(
            "DJANGO_DB_PATH",
            os.path.join(tempfile.gettempdir(), "consensus.sqlite3"),
        ),
    }
}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
USE_TZ = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"

# Session & Cookie Security (Step 4 of Login Flow)
SESSION_ENGINE = "django.contrib.sessions.backends.signed_cookies"
SESSION_COOKIE_NAME = "consensus_session"
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SECURE = os.environ.get("DJANGO_SECURE_COOKIES", "false").lower() == "true"
SESSION_COOKIE_SAMESITE = os.environ.get("DJANGO_SESSION_SAMESITE", "Lax")
SESSION_COOKIE_AGE = int(os.environ.get("DJANGO_SESSION_AGE_SECONDS", "1800"))
SESSION_SAVE_EVERY_REQUEST = True

CSRF_COOKIE_NAME = "consensus_csrf"
CSRF_COOKIE_HTTPONLY = False
CSRF_COOKIE_SECURE = SESSION_COOKIE_SECURE
CSRF_COOKIE_SAMESITE = "Lax"

# Existing laboratory settings (preserved for full backward compatibility)
ADMIN_API_TOKEN = os.environ.get("ADMIN_API_TOKEN", "")
TOTP_SECRET = os.environ.get("TOTP_SECRET", "")
SYNTHETIC_REFERENCE = [0.25, 0.5, 0.75, 1.0]
SYNTHETIC_DISTANCE_THRESHOLD = 0.15

# Step 1: Google reCAPTCHA Server-Side Verification
RECAPTCHA_SITE_KEY = os.environ.get("RECAPTCHA_SITE_KEY", "")
RECAPTCHA_SECRET_KEY = os.environ.get("RECAPTCHA_SECRET_KEY", "")
RECAPTCHA_VERIFY_URL = os.environ.get(
    "RECAPTCHA_VERIFY_URL", "https://www.google.com/recaptcha/api/siteverify"
)
# Only in local/test mode is the explicit test token "test-recaptcha-pass-consensus" accepted
# when RECAPTCHA_SECRET_KEY is not configured; invalid tokens are ALWAYS rejected on the server.
RECAPTCHA_DEV_TEST_MODE = os.environ.get("RECAPTCHA_DEV_TEST_MODE", "true").lower() == "true"
LOGIN_RATE_LIMIT_MAX_ATTEMPTS = int(os.environ.get("LOGIN_RATE_LIMIT_MAX_ATTEMPTS", "5"))
LOGIN_RATE_LIMIT_WINDOW_SECONDS = int(os.environ.get("LOGIN_RATE_LIMIT_WINDOW_SECONDS", "300"))

# Step 2: Email OTP Settings
OTP_EXPIRY_SECONDS = int(os.environ.get("OTP_EXPIRY_SECONDS", "300"))
OTP_MAX_ATTEMPTS = int(os.environ.get("OTP_MAX_ATTEMPTS", "3"))
OTP_RESEND_COOLDOWN_SECONDS = int(os.environ.get("OTP_RESEND_COOLDOWN_SECONDS", "60"))
EMAIL_PROVIDER_MODE = os.environ.get("EMAIL_PROVIDER_MODE", "sandbox")  # "smtp" or "sandbox"
EMAIL_BACKEND = os.environ.get(
    "DJANGO_EMAIL_BACKEND", "django.core.mail.backends.locmem.EmailBackend"
)
EMAIL_HOST = os.environ.get("SMTP_HOST", "")
EMAIL_PORT = int(os.environ.get("SMTP_PORT", "587"))
EMAIL_HOST_USER = os.environ.get("SMTP_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
EMAIL_USE_TLS = os.environ.get("SMTP_USE_TLS", "true").lower() == "true"
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "no-reply@consensus-lab.local")

# Step 3: FacePlugin Biometric Verification & Fallback Settings
FACEPLUGIN_SDK_PATH = os.environ.get("FACEPLUGIN_SDK_PATH", "")
FACEPLUGIN_LICENSE_REVIEWED = (
    os.environ.get("FACEPLUGIN_LICENSE_REVIEWED", "false").lower() == "true"
)
FACE_MATCH_THRESHOLD = float(os.environ.get("FACE_MATCH_THRESHOLD", "0.72"))
BIOMETRIC_FALLBACK_CODE = os.environ.get("BIOMETRIC_FALLBACK_CODE", "ALT-CONSENSUS-2026")

# Inter-service authentication (Django <-> FastAPI / Rust Backend)
INTERNAL_SERVICE_SECRET = os.environ.get("INTERNAL_SERVICE_SECRET", SECRET_KEY[:32])

# Synthetic accounts for educational MVP (never real citizens)
SYNTHETIC_ACCOUNTS = {
    "participante.demo@consensus.local": {
        "role": "participante",
        "display_name": "Participante Sintético 01",
        "territory_code": "05001",
        "department_code": "05",
        "eligible": True,
    },
    "admin.demo@consensus.local": {
        "role": "administrador",
        "display_name": "Coordinación Electoral Sintética (Perfil 01/08)",
        "territory_code": "05001",
        "department_code": "05",
        "eligible": True,
    },
    "auditor.demo@consensus.local": {
        "role": "auditor",
        "display_name": "Auditoría Independiente Sintética (Perfil 06/08)",
        "territory_code": "11001",
        "department_code": "11",
        "eligible": False,
    },
}

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get(
        "IDENTITY_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",")
    if origin.strip()
]
CSRF_TRUSTED_ORIGINS = CORS_ALLOWED_ORIGINS
