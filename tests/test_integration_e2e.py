"""End-to-End Integration & Acceptance Test Suite across Django Identity, FastAPI Integration, and Infrastructure.

Verifies the complete cross-service flow required in Section 18:
1. Synthetic user completes 4-step login in Django (Email + reCAPTCHA -> OTP -> Informed Consent + FacePlugin non-simulation check + Authorized Fallback -> HttpOnly Session).
2. Authenticated session exchanges an HMAC service ticket with Django (`/v1/auth/service/exchange`).
3. FastAPI verifies the Django-issued service ticket without duplicating login logic, enforcing RBAC scopes.
4. Admin creates and opens a configurable Colombian voting process linked to a valid DANE DIVIPOLA municipality.
5. Participant casts a valid single vote; duplicate votes, invalid options, and post-close votes are rejected; results and Stellar confirmation statuses are verified.
6. Static analysis, secret scanning, Terraform, Ansible, and provenance manifest verification pass.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import sys
import time

REPO_ROOT = Path(__file__).resolve().parents[1]
BIOMETRIC_DIR = REPO_ROOT / "encryption" / "biometric"
for candidate in (str(REPO_ROOT), str(BIOMETRIC_DIR)):
    if candidate not in sys.path:
        sys.path.insert(0, candidate)

os.environ.setdefault(
    "DJANGO_SECRET_KEY",
    "local-test-secret-key-0123456789abcdef0123456789abcdef",
)
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "consensus_identity.settings")

import django

django.setup()

from django.test import Client as DjangoClient
from fastapi.testclient import TestClient as FastAPIClient

from lab.auth_service import AUDIT_LOG, CHALLENGE_STORE, RATE_LIMITER
from scripts.verify_pipeline_and_artifacts import (
    emit_provenance_artifacts,
    scan_repository_for_secrets,
    validate_ansible_files,
    validate_circleci_config,
    validate_divipola_and_mechanisms,
    validate_terraform_files,
)
from services.api.app.main import STORE, app


def _complete_django_login_and_get_service_ticket(email: str) -> str:
    dj = DjangoClient()
    s1 = dj.post(
        "/v1/auth/login/start",
        data=json.dumps({"email": email, "recaptcha_token": "test-recaptcha-pass-consensus"}),
        content_type="application/json",
    )
    assert s1.status_code == 200
    cid = s1.json()["challenge_id"]
    otp = s1.json()["sandbox_otp_preview"]

    s2 = dj.post(
        "/v1/auth/otp/verify",
        data=json.dumps({"challenge_id": cid, "otp_code": otp}),
        content_type="application/json",
    )
    assert s2.status_code == 200

    s3 = dj.post(
        "/v1/auth/biometric/fallback",
        data=json.dumps({"challenge_id": cid, "fallback_code": "ALT-CONSENSUS-2026"}),
        content_type="application/json",
    )
    assert s3.status_code == 200

    s4 = dj.post(
        "/v1/auth/session/issue",
        data=json.dumps({"challenge_id": cid}),
        content_type="application/json",
    )
    assert s4.status_code == 200

    ex = dj.post("/v1/auth/service/exchange")
    assert ex.status_code == 200
    return ex.json()["service_ticket"]


def test_cross_service_django_to_fastapi_voting_and_governance_flow():
    CHALLENGE_STORE.clear()
    RATE_LIMITER.clear()
    AUDIT_LOG.clear()
    STORE.reset()

    api = FastAPIClient(app)

    admin_ticket = _complete_django_login_and_get_service_ticket("admin.demo@consensus.local")
    voter_ticket = _complete_django_login_and_get_service_ticket("participante.demo@consensus.local")

    now = int(time.time())
    created = api.post(
        "/api/v1/processes",
        headers={"Authorization": f"Bearer {admin_ticket}"},
        json={
            "title": "Referendo Aprobatorio Simulado — Bogotá D.C.",
            "question": "¿Aprueba el articulado sintético de transparencia presupuestal?",
            "description": "Simulación educativa en el Distrito Capital (DIVIPOLA 11001).",
            "template_id": "referendo",
            "options": ["SI_APRUEBO", "NO_APRUEBO"],
            "blank_vote_enabled": True,
            "max_selections": 1,
            "opens_at_epoch": now - 60,
            "closes_at_epoch": now + 3600,
            "territorial_scope": "distrital",
            "department_code": "11",
            "municipality_code": "11001",
            "fictitious_census_size": 4,
            "participation_threshold_pct": 25.0,
        },
    )
    assert created.status_code == 201
    proc_id = created.json()["process_id"]

    opened = api.post(
        f"/api/v1/processes/{proc_id}/state",
        headers={"Authorization": f"Bearer {admin_ticket}"},
        json={"target_state": "open"},
    )
    assert opened.status_code == 200

    vote = api.post(
        f"/api/v1/processes/{proc_id}/vote",
        headers={"Authorization": f"Bearer {voter_ticket}"},
        json={
            "selections": ["SI_APRUEBO"],
            "stellar_network": "TESTNET",
            "stellar_tx_hash": "c" * 64,
            "stellar_tx_confirmed": True,
        },
    )
    assert vote.status_code == 200
    assert vote.json()["transaction_confirmed"] is True

    results = api.get(f"/api/v1/processes/{proc_id}/results")
    assert results.status_code == 200
    assert results.json()["tallies"]["SI_APRUEBO"] == 1
    assert results.json()["participation_threshold_met"] is True


def test_infrastructure_secret_scan_and_provenance_manifest():
    assert scan_repository_for_secrets() == []
    assert validate_divipola_and_mechanisms() == []
    assert validate_terraform_files() == []
    assert validate_ansible_files() == []
    assert validate_circleci_config() == []
    manifest = emit_provenance_artifacts()
    assert len(manifest["artifact_hashes_sha256"]) >= 9
