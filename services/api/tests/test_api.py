import base64
import hashlib
import time

from fastapi.testclient import TestClient

from services.api.app.main import (
    STORE,
    app,
    create_service_ticket_for_tests,
)

client = TestClient(app)


def setup_function():
    STORE.reset()


def test_health_readiness_and_request_id_tracing():
    resp = client.get("/api/v1/health", headers={"X-Request-Id": "req_custom_123"})
    assert resp.status_code == 200
    assert resp.headers["X-Request-Id"] == "req_custom_123"
    assert resp.json()["status"] == "ok"

    ready = client.get("/api/v1/ready")
    assert ready.status_code == 200
    data = ready.json()
    assert data["divipola_departments"] == 32
    assert data["divipola_bogota_dc"] == 1
    assert data["divipola_municipalities"] == 1122
    assert data["voting_templates_loaded"] == 12


def test_divipola_catalog_integrity_and_dependent_selectors():
    depts_resp = client.get("/api/v1/territories/departments")
    assert depts_resp.status_code == 200
    depts = depts_resp.json()["departments"]
    assert len(depts) == 33  # 32 departments + Bogotá D.C.

    # Check Bogotá D.C. special regime
    bogota = next(d for d in depts if d["department_code"] == "11")
    assert bogota["territorial_type"] == "distrito_capital"

    # Check Antioquia (05) has 125 municipalities including Medellín (05001)
    ant_resp = client.get("/api/v1/territories/departments/05/municipalities")
    assert ant_resp.status_code == 200
    ant_data = ant_resp.json()
    assert ant_data["municipality_count"] == 125
    assert any(m["municipality_code"] == "05001" and m["official_name"] == "MEDELLÍN" for m in ant_data["municipalities"])

    # Accent-insensitive search
    search_resp = client.get("/api/v1/territories/search?q=medellin")
    assert search_resp.status_code == 200
    assert any(r["municipality_code"] == "05001" for r in search_resp.json()["results"])


def test_colombian_voting_mechanisms_and_deliberative_cabildo():
    tpl_resp = client.get("/api/v1/mechanisms/templates")
    assert tpl_resp.status_code == 200
    templates = {t["template_id"]: t for t in tpl_resp.json()["templates"]}
    expected_ids = {
        "unipersonal",
        "corporacion_lista_abierta",
        "corporacion_lista_cerrada",
        "interna_organizacion",
        "simulada_representantes",
        "plebiscito",
        "referendo",
        "consulta_popular",
        "cabildo_abierto",
        "iniciativa_ciudadana",
        "revocatoria_mandato",
        "consulta_no_vinculante",
    }
    assert expected_ids.issubset(set(templates.keys()))
    assert templates["cabildo_abierto"]["deliberation_flow_required"] is True
    assert templates["iniciativa_ciudadana"]["deliberation_flow_required"] is True

    # Create a Cabildo Abierto process as admin and submit a deliberative proposal
    admin_ticket = create_service_ticket_for_tests(role="administrador")
    now = int(time.time())
    create_resp = client.post(
        "/api/v1/processes",
        headers={"X-Service-Ticket": admin_ticket},
        json={
            "title": "Cabildo Abierto Simulado — Movilidad Comuna 10",
            "question": "¿Qué ponencias ciudadanas se inscriben y priorizan en la sesión?",
            "description": "Flujo deliberativo con inscripción de ponencias y respuesta motivada.",
            "template_id": "cabildo_abierto",
            "options": ["PONENCIA_PEATONALIZACION", "PONENCIA_CICLORRUTA_SEGURA"],
            "blank_vote_enabled": False,
            "max_selections": 1,
            "opens_at_epoch": now - 60,
            "closes_at_epoch": now + 3600,
            "territorial_scope": "municipal",
            "department_code": "05",
            "municipality_code": "05001",
        },
    )
    assert create_resp.status_code == 201
    proc_id = create_resp.json()["process_id"]

    voter_ticket = create_service_ticket_for_tests(subject_id="sub_voter_cabildo", role="participante")
    prop_resp = client.post(
        f"/api/v1/processes/{proc_id}/proposals",
        headers={"X-Service-Ticket": voter_ticket},
        json={
            "title": "Ponencia 01: Corredor Verde La Playa",
            "summary": "Propuesta comunitaria para ampliar andenes y arborización urbana.",
            "proposer_alias": "Junta Cívica Sintética",
        },
    )
    assert prop_resp.status_code == 201
    assert prop_resp.json()["title"].startswith("Ponencia 01")


def test_election_lifecycle_single_vote_rules_and_stellar_confirmation():
    admin_ticket = create_service_ticket_for_tests(subject_id="sub_admin_1", role="administrador")
    voter1_ticket = create_service_ticket_for_tests(subject_id="sub_voter_1", role="participante")
    voter2_ticket = create_service_ticket_for_tests(subject_id="sub_voter_2", role="participante")

    # Unauthenticated or participant cannot create an election
    assert client.post("/api/v1/processes", json={}).status_code == 401
    now = int(time.time())
    contract_id = "C" + ("A" * 55)
    payload = {
        "title": "Elección Unipersonal Simulada — Alcaldía Pedagógica",
        "question": "¿Por cuál candidatura sintética vota usted?",
        "description": "Proceso educativo con validación de red Stellar Testnet.",
        "template_id": "unipersonal",
        "options": ["CANDIDATURA_SINTETICA_A", "CANDIDATURA_SINTETICA_B"],
        "blank_vote_enabled": True,
        "max_selections": 1,
        "opens_at_epoch": now - 120,
        "closes_at_epoch": now + 3600,
        "territorial_scope": "municipal",
        "department_code": "05",
        "municipality_code": "05001",
        "fictitious_census_size": 10,
        "participation_threshold_pct": 20.0,
        "stellar_network": "TESTNET",
        "stellar_contract_id": contract_id,
    }
    forbidden = client.post(
        "/api/v1/processes",
        headers={"X-Service-Ticket": voter1_ticket},
        json=payload,
    )
    assert forbidden.status_code == 403

    created = client.post(
        "/api/v1/processes",
        headers={"X-Service-Ticket": admin_ticket},
        json=payload,
    )
    assert created.status_code == 201
    proc_id = created.json()["process_id"]
    assert "VOTO_EN_BLANCO" in created.json()["options"]

    # Voting while still in draft state is rejected
    draft_vote = client.post(
        f"/api/v1/processes/{proc_id}/vote",
        headers={"X-Service-Ticket": voter1_ticket},
        json={"selections": ["CANDIDATURA_SINTETICA_A"]},
    )
    assert draft_vote.status_code == 400
    assert draft_vote.json()["error"] == "process_not_open"

    # Open the election as admin
    opened = client.post(
        f"/api/v1/processes/{proc_id}/state",
        headers={"X-Service-Ticket": admin_ticket},
        json={"target_state": "open"},
    )
    assert opened.status_code == 200
    assert opened.json()["state"] == "open"

    # Invalid option is rejected
    bad_opt = client.post(
        f"/api/v1/processes/{proc_id}/vote",
        headers={"X-Service-Ticket": voter1_ticket},
        json={"selections": ["OPCION_INEXISTENTE"]},
    )
    assert bad_opt.status_code == 400
    assert bad_opt.json()["error"] == "invalid_option_selected"

    # Wrong Stellar network is rejected
    bad_net = client.post(
        f"/api/v1/processes/{proc_id}/vote",
        headers={"X-Service-Ticket": voter1_ticket},
        json={"selections": ["CANDIDATURA_SINTETICA_A"], "stellar_network": "PUBLIC"},
    )
    assert bad_net.status_code == 400

    # Valid vote from voter 1 with confirmed Stellar tx hash
    tx_hash_1 = "a" * 64
    vote1 = client.post(
        f"/api/v1/processes/{proc_id}/vote",
        headers={"X-Service-Ticket": voter1_ticket},
        json={
            "selections": ["CANDIDATURA_SINTETICA_A"],
            "stellar_network": "TESTNET",
            "stellar_contract_id": contract_id,
            "stellar_tx_hash": tx_hash_1,
            "stellar_tx_confirmed": True,
        },
    )
    assert vote1.status_code == 200
    assert vote1.json()["transaction_confirmed"] is True

    # Second vote from voter 1 is rejected (409)
    dup_vote = client.post(
        f"/api/v1/processes/{proc_id}/vote",
        headers={"X-Service-Ticket": voter1_ticket},
        json={"selections": ["CANDIDATURA_SINTETICA_B"]},
    )
    assert dup_vote.status_code == 409
    assert dup_vote.json()["error"] == "duplicate_vote_rejected"

    # Voter 2 casts a blank vote with an unconfirmed tx hash
    tx_hash_2 = "b" * 64
    vote2 = client.post(
        f"/api/v1/processes/{proc_id}/vote",
        headers={"X-Service-Ticket": voter2_ticket},
        json={
            "selections": ["VOTO_EN_BLANCO"],
            "stellar_network": "TESTNET",
            "stellar_contract_id": contract_id,
            "stellar_tx_hash": tx_hash_2,
            "stellar_tx_confirmed": False,
        },
    )
    assert vote2.status_code == 200
    assert vote2.json()["transaction_confirmed"] is False
    assert vote2.json()["transaction_status"] == "pending_verification"

    # Close the election
    closed = client.post(
        f"/api/v1/processes/{proc_id}/state",
        headers={"X-Service-Ticket": admin_ticket},
        json={"target_state": "closed"},
    )
    assert closed.status_code == 200

    # Vote after closing is rejected
    voter3_ticket = create_service_ticket_for_tests(subject_id="sub_voter_3", role="participante")
    late_vote = client.post(
        f"/api/v1/processes/{proc_id}/vote",
        headers={"X-Service-Ticket": voter3_ticket},
        json={"selections": ["CANDIDATURA_SINTETICA_A"]},
    )
    assert late_vote.status_code == 400
    assert late_vote.json()["error"] == "process_not_open"

    # Verify results calculation and confirmed vs pending transactions
    results = client.get(f"/api/v1/processes/{proc_id}/results")
    assert results.status_code == 200
    res_data = results.json()
    assert res_data["participants_count"] == 2
    assert res_data["tallies"]["CANDIDATURA_SINTETICA_A"] == 1
    assert res_data["tallies"]["CANDIDATURA_SINTETICA_B"] == 0
    assert res_data["tallies"]["VOTO_EN_BLANCO"] == 1
    assert res_data["participation_pct"] == 20.0
    assert res_data["participation_threshold_met"] is True
    assert len(res_data["confirmed_stellar_transactions"]) == 1
    assert len(res_data["pending_stellar_transactions"]) == 1

    # Verify anonymous ballots do NOT store subject_id
    for ballot in STORE.anonymous_ballots[proc_id]:
        assert "sub_voter_1" not in str(ballot)
        assert "subject_id" not in ballot


def test_s3_artifact_upload_rejects_sensitive_files_and_verifies_sha256():
    admin_ticket = create_service_ticket_for_tests(role="administrador")
    content = b"wasm-contract-artifact-binary-placeholder"
    sha256 = hashlib.sha256(content).hexdigest()
    b64 = base64.b64encode(content).decode("ascii")

    # Sensitive filename rejected
    bad_name = client.post(
        "/api/v1/integrations/s3/artifacts",
        headers={"X-Service-Ticket": admin_ticket},
        json={
            "artifact_name": "user_biometric_embedding.json",
            "artifact_type": "audit_summary",
            "content_b64": b64,
            "sha256_digest": sha256,
            "git_commit_sha": "1234567890abcdef",
            "signer_id": "circleci-release-signer",
        },
    )
    assert bad_name.status_code == 400
    assert bad_name.json()["error"] == "prohibited_sensitive_artifact_rejected"

    # Wrong SHA-256 rejected
    bad_hash = client.post(
        "/api/v1/integrations/s3/artifacts",
        headers={"X-Service-Ticket": admin_ticket},
        json={
            "artifact_name": "voting.wasm",
            "artifact_type": "wasm_contract",
            "content_b64": b64,
            "sha256_digest": "0" * 64,
            "git_commit_sha": "1234567890abcdef",
            "signer_id": "circleci-release-signer",
        },
    )
    assert bad_hash.status_code == 400
    assert bad_hash.json()["error"] == "artifact_sha256_mismatch"

    # Valid WASM artifact accepted
    ok_art = client.post(
        "/api/v1/integrations/s3/artifacts",
        headers={"X-Service-Ticket": admin_ticket},
        json={
            "artifact_name": "voting.wasm",
            "artifact_type": "wasm_contract",
            "content_b64": b64,
            "sha256_digest": sha256,
            "git_commit_sha": "1234567890abcdef",
            "signer_id": "circleci-release-signer",
        },
    )
    assert ok_art.status_code == 201
    assert ok_art.json()["sha256"] == sha256
