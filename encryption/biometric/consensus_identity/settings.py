import os

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "")
if len(SECRET_KEY) < 32:
    raise RuntimeError("Set DJANGO_SECRET_KEY (at least 32 characters) in an ignored .env file")

DEBUG = False
ALLOWED_HOSTS = [
    "localhost",
    "127.0.0.1",
    "waf",
    "python-lb",
    "python-a",
    "python-b",
]
ROOT_URLCONF = "consensus_identity.urls"
WSGI_APPLICATION = "consensus_identity.wsgi.application"
INSTALLED_APPS = ["django.contrib.contenttypes", "corsheaders", "lab"]
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]
DATABASES = {
    "default": {"ENGINE": "django.db.backends.sqlite3", "NAME": "/tmp/consensus.sqlite3"}
}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
USE_TZ = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"
ADMIN_API_TOKEN = os.environ.get("ADMIN_API_TOKEN", "")
TOTP_SECRET = os.environ.get("TOTP_SECRET", "")
SYNTHETIC_REFERENCE = [0.25, 0.5, 0.75, 1.0]
SYNTHETIC_DISTANCE_THRESHOLD = 0.15
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
CORS_ALLOWED_ORIGINS = os.environ.get(
    "IDENTITY_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
).split(",")
