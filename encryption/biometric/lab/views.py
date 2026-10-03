import hashlib
import hmac
import json
import math

import pyotp
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST


@require_GET
def health(_request):
    return JsonResponse({"status": "ok", "mode": "synthetic-only", "instance": __import__("os").environ.get("HOSTNAME", "local")})


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
        return JsonResponse({"error": "expected_four_synthetic_numbers_between_0_and_1"}, status=400)

    distance = math.sqrt(sum((left - right) ** 2 for left, right in zip(vector, settings.SYNTHETIC_REFERENCE)))
    score = max(0.0, 1.0 - distance / 2.0)
    digest = hashlib.sha256(",".join(f"{value:.6f}" for value in vector).encode()).hexdigest()[:16]
    return JsonResponse({
        "eligible": distance <= settings.SYNTHETIC_DISTANCE_THRESHOLD,
        "score": round(score, 4),
        "synthetic_reference": True,
        "request_id": digest,
    })


@csrf_exempt
@require_POST
def verify_admin_totp(request):
    """A demo second-factor check. Requires independent API token + configured TOTP."""
    supplied = request.headers.get("X-Admin-Token", "")
    if not settings.ADMIN_API_TOKEN or not settings.TOTP_SECRET:
        return JsonResponse({"error": "totp_not_configured"}, status=503)
    if not hmac.compare_digest(supplied, settings.ADMIN_API_TOKEN):
        return JsonResponse({"error": "unauthorized"}, status=401)
    try:
        code = str(json.loads(request.body)["code"])
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        return JsonResponse({"error": "invalid_code"}, status=400)
    if not pyotp.TOTP(settings.TOTP_SECRET).verify(code, valid_window=1):
        return JsonResponse({"error": "invalid_code"}, status=401)
    return JsonResponse({"verified": True, "expires_in_seconds": 30, "synthetic_admin_only": True})
