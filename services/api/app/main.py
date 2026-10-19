"""FastAPI Integration Service for Consensus Colombia MVP (/api/v1/).

Responsibilities (strictly separated from Django identity management):
- Serves and validates the official DANE DIVIPOLA territorial catalog (32 departments + Bogotá D.C. + 1,122 municipalities).
- Serves and validates Colombian electoral process templates and citizen participation mechanisms (Ley 134/1994 & Ley 1757/2015).
- Manages configurable voting processes with strict separation between:
    1) Fictitious eligibility & participation registry (one-way hashed voter marker)
    2) Ballot selections & aggregated tallies (no identity link)
    3) Stellar Testnet transaction evidence & contract verification
    4) Administrative audit log
- Provides AWS S3 + IAM least-privilege artifact adapter (rejecting any PII, votes, OTP, secrets, or biometrics).
- Queries pinned GitHub repository metadata via REST API without executing remote code.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import time
import urllib.request
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator

REPO_ROOT = Path(__file__).resolve().parents[3]
DIVIPOLA_PATH = Path(
    os.environ.get(
        "CONSENSUS_DIVIPOLA_PATH",
        str(REPO_ROOT / "data" / "territories" / "colombia_divipola.json"),
    )
)
MECHANISMS_PATH = Path(
    os.environ.get(
        "CONSENSUS_MECHANISMS_PATH",
        str(REPO_ROOT / "data" / "territories" / "voting_mechanisms_colombia.json"),
    )
)
MAX_REQUEST_BYTES = int(os.environ.get("FASTAPI_MAX_REQUEST_BYTES", "131072"))
INTERNAL_SERVICE_SECRET = os.environ.get(
    "INTERNAL_SERVICE_SECRET",
    os.environ.get("DJANGO_SECRET_KEY", "local-test-secret-key-0123456789abcdef0123456789abcdef")[:32],
)

STELLAR_CONTRACT_REGEX = re.compile(r"^C[A-Z2-7]{55}$")
STELLAR_ADDRESS_REGEX = re.compile(r"^G[A-Z2-7]{55}$")
STELLAR_TX_HASH_REGEX = re.compile(r"^[0-9a-fA-F]{64}$")
ALLOWED_ARTIFACT_EXTENSIONS = {".wasm", ".json", ".md", ".txt", ".sha256", ".sig"}
PROHIBITED_S3_KEYWORDS = {
    "otp",
    "secret",
    "private_key",
    "seed",
    "embedding",
    "biometric",
    "face_template",
    "ballot_identity",
    "cedula",
}


def _load_divipola() -> Dict[str, Any]:
    if not DIVIPOLA_PATH.exists():
        raise RuntimeError(f"DIVIPOLA catalog missing at {DIVIPOLA_PATH}")
    return json.loads(DIVIPOLA_PATH.read_text(encoding="utf-8"))


def _load_mechanisms() -> Dict[str, Any]:
    if not MECHANISMS_PATH.exists():
        raise RuntimeError(f"Voting mechanisms catalog missing at {MECHANISMS_PATH}")
    return json.loads(MECHANISMS_PATH.read_text(encoding="utf-8"))


DIVIPOLA_CATALOG = _load_divipola()
MECHANISMS_CATALOG = _load_mechanisms()

DEPARTMENTS_BY_CODE: Dict[str, Dict[str, Any]] = {
    d["department_code"]: d for d in DIVIPOLA_CATALOG["departments"]
}
MUNICIPALITIES_BY_CODE: Dict[str, Dict[str, Any]] = {
    m["municipality_code"]: m for m in DIVIPOLA_CATALOG["municipalities"]
}
TEMPLATES_BY_ID: Dict[str, Dict[str, Any]] = {
    t["template_id"]: t for t in MECHANISMS_CATALOG["templates"]
}

app = FastAPI(
    title="Consensus Colombia Integration API",
    version="1.0.0",
    docs_url="/api/v1/docs",
    openapi_url="/api/v1/openapi.json",
    description=(
        "Capa de integración independiente para catálogo territorial DIVIPOLA, configuración de "
        "mecanismos de participación, verificación Stellar Testnet y artefactos S3/IAM."
    ),
)

cors_origins = [
    origin.strip()
    for origin in os.environ.get(
        "FASTAPI_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_tracing_and_size_limit(request: Request, call_next: Callable):
    request_id = request.headers.get("X-Request-Id") or f"req_{secrets.token_hex(8)}"
    request.state.request_id = request_id

    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > MAX_REQUEST_BYTES:
        return JSONResponse(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            content={
                "error": "payload_too_large",
                "max_bytes": MAX_REQUEST_BYTES,
                "request_id": request_id,
            },
            headers={"X-Request-Id": request_id},
        )

    body = await request.body()
    if len(body) > MAX_REQUEST_BYTES:
        return JSONResponse(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            content={
                "error": "payload_too_large",
                "max_bytes": MAX_REQUEST_BYTES,
                "request_id": request_id,
            },
            headers={"X-Request-Id": request_id},
        )

    response = await call_next(request)
    response.headers["X-Request-Id"] = request_id
    return response


@app.exception_handler(HTTPException)
async def uniform_http_exception_handler(request: Request, exc: HTTPException):
    request_id = getattr(request.state, "request_id", f"req_{secrets.token_hex(8)}")
    detail = exc.detail if isinstance(exc.detail, dict) else {"error": str(exc.detail)}
    return JSONResponse(
        status_code=exc.status_code,
        content={**detail, "request_id": request_id},
        headers={"X-Request-Id": request_id},
    )


@app.exception_handler(RequestValidationError)
async def uniform_validation_exception_handler(request: Request, exc: RequestValidationError):
    request_id = getattr(request.state, "request_id", f"req_{secrets.token_hex(8)}")
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": "validation_error",
            "details": exc.errors(),
            "request_id": request_id,
        },
        headers={"X-Request-Id": request_id},
    )


# ============================================================================
# Service Authentication & Scope Authorization (Issued by Django Identity Service)
# ============================================================================


def verify_service_ticket_token(ticket: str) -> Optional[Dict[str, Any]]:
    if not ticket or "." not in ticket:
        return None
    b64_payload, supplied_sig = ticket.rsplit(".", 1)
    expected_sig = hmac.new(
        INTERNAL_SERVICE_SECRET.encode("utf-8"),
        b64_payload.encode("ascii"),
        hashlib.sha256,
    ).hexdigest()
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


def create_service_ticket_for_tests(
    subject_id: str = "sub_demo_01",
    role: str = "participante",
    scopes: Optional[List[str]] = None,
    ttl_seconds: int = 300,
) -> str:
    default_scopes = {
        "administrador": [
            "elections:read",
            "elections:write",
            "territories:read",
            "artifacts:read",
            "artifacts:write",
            "audit:read",
        ],
        "auditor": ["elections:read", "territories:read", "artifacts:read", "audit:read"],
        "participante": ["elections:read", "votes:cast", "territories:read"],
    }
    now = int(time.time())
    payload = {
        "sub": subject_id,
        "role": role,
        "scopes": scopes if scopes is not None else default_scopes.get(role, ["elections:read"]),
        "iat": now,
        "exp": now + ttl_seconds,
        "jti": secrets.token_hex(8),
    }
    raw_json = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    b64_payload = base64.urlsafe_b64encode(raw_json).decode("ascii").rstrip("=")
    sig = hmac.new(
        INTERNAL_SERVICE_SECRET.encode("utf-8"),
        b64_payload.encode("ascii"),
        hashlib.sha256,
    ).hexdigest()
    return f"{b64_payload}.{sig}"


def require_scope(required_scope: str):
    def _dep(
        x_service_ticket: Optional[str] = Header(default=None, alias="X-Service-Ticket"),
        authorization: Optional[str] = Header(default=None, alias="Authorization"),
    ) -> Dict[str, Any]:
        raw_ticket = x_service_ticket
        if not raw_ticket and authorization and authorization.startswith("Bearer "):
            raw_ticket = authorization[len("Bearer ") :].strip()
        if not raw_ticket:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"error": "missing_service_ticket"},
            )
        claims = verify_service_ticket_token(raw_ticket)
        if not claims:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"error": "invalid_or_expired_service_ticket"},
            )
        scopes = claims.get("scopes", [])
        if required_scope not in scopes:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error": "insufficient_scope",
                    "required_scope": required_scope,
                    "role": claims.get("role"),
                },
            )
        return claims

    return _dep


# ============================================================================
# Typed Domain Models (Pydantic v2)
# ============================================================================


class ProcessConfigurationCreate(BaseModel):
    title: str = Field(..., min_length=4, max_length=160)
    question: str = Field(..., min_length=6, max_length=400)
    description: str = Field(..., min_length=10, max_length=1200)
    template_id: str = Field(..., description="ID de plantilla del catálogo de mecanismos")
    options: List[str] = Field(..., min_length=2, max_length=12)
    blank_vote_enabled: bool = True
    allow_unmarked_vote: bool = False
    allow_null_vote_simulation: bool = False
    max_selections: int = Field(default=1, ge=1, le=5)
    opens_at_epoch: int = Field(..., gt=0)
    closes_at_epoch: int = Field(..., gt=0)
    territorial_scope: str = Field(
        default="municipal",
        pattern="^(nacional|departamental|distrital|municipal|organizacion)$",
    )
    department_code: Optional[str] = Field(default="05")
    municipality_code: Optional[str] = Field(default="05001")
    fictitious_census_size: int = Field(default=100, ge=1, le=50_000_000)
    participation_threshold_pct: float = Field(default=0.0, ge=0.0, le=100.0)
    required_majority_rule: str = Field(default="mayoria_simple", max_length=80)
    tie_breaker_rule: str = Field(default="sorteo_auditado_en_acta", max_length=120)
    tally_rule: str = Field(default="conteo_directo_unipersonal", max_length=80)
    results_publication_mode: str = Field(default="al_cierre_verificado", max_length=80)
    cancellation_grounds: List[str] = Field(default_factory=list, max_length=10)
    stellar_network: str = Field(default="TESTNET", pattern="^TESTNET$")
    stellar_contract_id: Optional[str] = None

    @field_validator("options")
    @classmethod
    def validate_unique_clean_options(cls, v: List[str]) -> List[str]:
        cleaned = [opt.strip() for opt in v if opt and opt.strip()]
        if len(cleaned) < 2:
            raise ValueError("At least two non-empty options are required")
        if len(set(cleaned)) != len(cleaned):
            raise ValueError("Options must not contain duplicates")
        return cleaned

    @field_validator("stellar_contract_id")
    @classmethod
    def validate_contract_id(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v == "":
            return None
        if not STELLAR_CONTRACT_REGEX.match(v):
            raise ValueError("Stellar contract ID must be a valid 56-character C... address")
        return v


class ProcessStateTransitionRequest(BaseModel):
    target_state: str = Field(..., pattern="^(open|closed|cancelled)$")
    reason: Optional[str] = Field(default=None, max_length=300)


class DeliberativeProposalCreate(BaseModel):
    title: str = Field(..., min_length=4, max_length=160)
    summary: str = Field(..., min_length=10, max_length=1000)
    proposer_alias: str = Field(default="Comité Promotor Sintético", max_length=80)


class CastVoteRequest(BaseModel):
    selections: List[str] = Field(..., min_length=1, max_length=5)
    stellar_network: str = Field(default="TESTNET")
    stellar_contract_id: Optional[str] = None
    stellar_tx_hash: Optional[str] = None
    stellar_tx_confirmed: bool = False


class ArtifactUploadRequest(BaseModel):
    artifact_name: str = Field(..., min_length=3, max_length=120)
    artifact_type: str = Field(
        ...,
        pattern="^(wasm_contract|build_manifest|territorial_snapshot|audit_summary)$",
    )
    content_b64: str = Field(..., min_length=4, max_length=65536)
    sha256_digest: str = Field(..., min_length=64, max_length=64)
    git_commit_sha: str = Field(..., min_length=7, max_length=40)
    signer_id: str = Field(..., min_length=3, max_length=80)


# ============================================================================
# Privacy-Preserving In-Memory Store (Separated Tables/Collections)
# ============================================================================


class PrivacySeparatedVotingStore:
    """Explicitly separates participation markers, anonymous ballots, tx evidence, and audit."""

    def __init__(self) -> None:
        self.processes: Dict[str, Dict[str, Any]] = {}
        # Maps process_id -> set of one-way participation hashes (HMAC(process_id + subject_id))
        # Never stores which option the subject selected!
        self.participation_registry: Dict[str, set[str]] = {}
        # Maps process_id -> list of anonymous ballot receipts (never contains subject_id)
        self.anonymous_ballots: Dict[str, List[Dict[str, Any]]] = {}
        # Maps process_id -> option -> count
        self.aggregated_tallies: Dict[str, Dict[str, int]] = {}
        # Maps process_id -> list of verified Stellar transaction evidence records
        self.tx_evidence_registry: Dict[str, List[Dict[str, Any]]] = {}
        # Maps process_id -> deliberative proposals (for cabildo_abierto / iniciativa_ciudadana)
        self.deliberative_proposals: Dict[str, List[Dict[str, Any]]] = {}
        # Administrative audit log (no voter selections or secrets)
        self.admin_audit_log: List[Dict[str, Any]] = []
        # Local S3 artifact staging metadata
        self.s3_artifacts: List[Dict[str, Any]] = []
        self._seed_default_demo_process()

    def _seed_default_demo_process(self) -> None:
        now = int(time.time())
        demo_id = "proc-medellin-2026-001"
        options = ["PROYECTO_MOVILIDAD_SOSTENIBLE", "PROYECTO_PARQUES_EDUCATIVOS", "VOTO_EN_BLANCO"]
        self.processes[demo_id] = {
            "process_id": demo_id,
            "title": "Consulta Ciudadana Sintética — Priorización Urbana Medellín",
            "question": "¿Cuál iniciativa sintética prioriza para el laboratorio cívico de Medellín?",
            "description": "Escenario demostrativo no vinculante con datos sintéticos sobre Stellar Testnet.",
            "template_id": "consulta_popular",
            "template_name": TEMPLATES_BY_ID["consulta_popular"]["name"],
            "category": TEMPLATES_BY_ID["consulta_popular"]["category"],
            "is_ballot_centrist": True,
            "deliberation_flow_required": False,
            "options": options,
            "blank_vote_enabled": True,
            "allow_unmarked_vote": True,
            "allow_null_vote_simulation": True,
            "max_selections": 1,
            "opens_at_epoch": now - 3600,
            "closes_at_epoch": now + 86400,
            "state": "open",
            "territorial_scope": "municipal",
            "department_code": "05",
            "department_name": DEPARTMENTS_BY_CODE["05"]["official_name"],
            "municipality_code": "05001",
            "municipality_name": MUNICIPALITIES_BY_CODE["05001"]["official_name"],
            "fictitious_census_size": 100,
            "participation_threshold_pct": 33.33,
            "required_majority_rule": "mitad_mas_uno_con_tercera_parte_censo",
            "tie_breaker_rule": "no_aprobado_en_caso_de_empate",
            "tally_rule": "binario_si_no_con_umbral",
            "results_publication_mode": "tiempo_real_o_cierre",
            "cancellation_grounds": ["Vencimiento de término de simulación"],
            "stellar_network": "TESTNET",
            "stellar_contract_id": None,
            "secret_ballot_notice": (
                "Prototipo educativo sin secreto electoral criptográfico end-to-end en cadena pública. "
                "En la capa API se desacopla el registro de participación del contenido del voto."
            ),
            "created_at": now,
        }
        self.participation_registry[demo_id] = set()
        self.anonymous_ballots[demo_id] = []
        self.aggregated_tallies[demo_id] = {opt: 0 for opt in options}
        self.tx_evidence_registry[demo_id] = []
        self.deliberative_proposals[demo_id] = []

    def reset(self) -> None:
        self.processes.clear()
        self.participation_registry.clear()
        self.anonymous_ballots.clear()
        self.aggregated_tallies.clear()
        self.tx_evidence_registry.clear()
        self.deliberative_proposals.clear()
        self.admin_audit_log.clear()
        self.s3_artifacts.clear()
        self._seed_default_demo_process()


STORE = PrivacySeparatedVotingStore()


# ============================================================================
# Health & Readiness Endpoints
# ============================================================================


@app.get("/api/v1/health")
def health_check():
    return {
        "status": "ok",
        "service": "consensus-fastapi-integration",
        "version": "1.0.0",
        "educational_mvp_only": True,
    }


@app.get("/api/v1/ready")
def readiness_check():
    return {
        "ready": True,
        "divipola_departments": DIVIPOLA_CATALOG["metadata"]["total_departments"],
        "divipola_bogota_dc": DIVIPOLA_CATALOG["metadata"]["bogota_distrito_capital"],
        "divipola_municipalities": DIVIPOLA_CATALOG["metadata"][
            "total_municipalities_and_districts"
        ],
        "voting_templates_loaded": len(TEMPLATES_BY_ID),
    }


# ============================================================================
# DANE DIVIPOLA Territorial Catalog Endpoints
# ============================================================================


@app.get("/api/v1/territories/departments")
def list_departments():
    return {
        "metadata": DIVIPOLA_CATALOG["metadata"],
        "departments": [
            {
                "department_code": d["department_code"],
                "official_name": d["official_name"],
                "normalized_name": d["normalized_name"],
                "territorial_type": d["territorial_type"],
                "territorial_regime": d["territorial_regime"],
                "capital_code": d["capital_code"],
                "capital_name": d["capital_name"],
                "pilot": d["pilot"],
                "municipality_count": d["municipality_count"],
            }
            for d in DIVIPOLA_CATALOG["departments"]
        ],
    }


@app.get("/api/v1/territories/departments/{department_code}/municipalities")
def list_municipalities_by_department(department_code: str):
    code = department_code.strip().zfill(2)
    dept = DEPARTMENTS_BY_CODE.get(code)
    if not dept:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "department_not_found", "department_code": code},
        )
    return {
        "department_code": dept["department_code"],
        "department_official_name": dept["official_name"],
        "territorial_type": dept["territorial_type"],
        "territorial_regime": dept["territorial_regime"],
        "municipality_count": dept["municipality_count"],
        "municipalities": dept["municipalities"],
    }


@app.get("/api/v1/territories/search")
def search_territories(q: str = Query(..., min_length=2, max_length=60)):
    from data.territories.import_divipola import normalize_text

    needle = normalize_text(q)
    matches = [
        m
        for m in DIVIPOLA_CATALOG["municipalities"]
        if needle in m["normalized_name"]
        or needle in normalize_text(m["department_official_name"])
        or q.strip() == m["municipality_code"]
    ]
    return {"query": q, "count": len(matches[:50]), "results": matches[:50]}


# ============================================================================
# Colombian Voting Mechanisms & Templates Endpoints
# ============================================================================


@app.get("/api/v1/mechanisms/templates")
def list_voting_mechanism_templates():
    return MECHANISMS_CATALOG


@app.get("/api/v1/mechanisms/templates/{template_id}")
def get_voting_mechanism_template(template_id: str):
    tpl = TEMPLATES_BY_ID.get(template_id)
    if not tpl:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "template_not_found", "template_id": template_id},
        )
    return tpl


# ============================================================================
# Configurable Voting Processes Endpoints
# ============================================================================


@app.get("/api/v1/processes")
def list_processes():
    return {"processes": list(STORE.processes.values())}


@app.get("/api/v1/processes/{process_id}")
def get_process(process_id: str):
    proc = STORE.processes.get(process_id)
    if not proc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "process_not_found"},
        )
    return {
        **proc,
        "deliberative_proposals": STORE.deliberative_proposals.get(process_id, []),
    }


@app.post("/api/v1/processes", status_code=status.HTTP_201_CREATED)
def create_process(
    payload: ProcessConfigurationCreate,
    claims: Dict[str, Any] = Depends(require_scope("elections:write")),
):
    tpl = TEMPLATES_BY_ID.get(payload.template_id)
    if not tpl:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "unknown_mechanism_template", "template_id": payload.template_id},
        )

    if payload.closes_at_epoch <= payload.opens_at_epoch:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "closes_at_must_be_after_opens_at"},
        )

    dept_name = "NACIONAL"
    mpio_name = "NACIONAL"
    if payload.territorial_scope in ("departamental", "distrital", "municipal"):
        dept_code = (payload.department_code or "").strip().zfill(2)
        dept = DEPARTMENTS_BY_CODE.get(dept_code)
        if not dept:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": "invalid_divipola_department_code"},
            )
        dept_name = dept["official_name"]
        if payload.territorial_scope in ("municipal", "distrital"):
            mpio_code = (payload.municipality_code or "").strip().zfill(5)
            mpio = MUNICIPALITIES_BY_CODE.get(mpio_code)
            if not mpio or mpio["department_code"] != dept_code:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={"error": "municipality_does_not_belong_to_department"},
                )
            mpio_name = mpio["official_name"]

    options = list(payload.options)
    if payload.blank_vote_enabled and "VOTO_EN_BLANCO" not in options:
        options.append("VOTO_EN_BLANCO")
    if payload.allow_unmarked_vote and "VOTO_NO_MARCADO" not in options:
        options.append("VOTO_NO_MARCADO")
    if payload.allow_null_vote_simulation and "VOTO_NULO" not in options:
        options.append("VOTO_NULO")

    process_id = f"proc-{secrets.token_hex(4)}"
    record = {
        "process_id": process_id,
        "title": payload.title,
        "question": payload.question,
        "description": payload.description,
        "template_id": payload.template_id,
        "template_name": tpl["name"],
        "category": tpl["category"],
        "is_ballot_centrist": tpl["is_ballot_centrist"],
        "deliberation_flow_required": tpl["deliberation_flow_required"],
        "educational_vs_legal_note": tpl["educational_vs_legal_note"],
        "options": options,
        "blank_vote_enabled": payload.blank_vote_enabled,
        "allow_unmarked_vote": payload.allow_unmarked_vote,
        "allow_null_vote_simulation": payload.allow_null_vote_simulation,
        "max_selections": payload.max_selections,
        "opens_at_epoch": payload.opens_at_epoch,
        "closes_at_epoch": payload.closes_at_epoch,
        "state": "draft",
        "territorial_scope": payload.territorial_scope,
        "department_code": payload.department_code,
        "department_name": dept_name,
        "municipality_code": payload.municipality_code,
        "municipality_name": mpio_name,
        "fictitious_census_size": payload.fictitious_census_size,
        "participation_threshold_pct": payload.participation_threshold_pct,
        "required_majority_rule": payload.required_majority_rule,
        "tie_breaker_rule": payload.tie_breaker_rule,
        "tally_rule": payload.tally_rule,
        "results_publication_mode": payload.results_publication_mode,
        "cancellation_grounds": payload.cancellation_grounds,
        "stellar_network": payload.stellar_network,
        "stellar_contract_id": payload.stellar_contract_id,
        "secret_ballot_notice": (
            "Prototipo educativo: el registro de participación y el contenido de la boleta están "
            "separados en la API, pero las operaciones en Stellar Testnet son públicas."
        ),
        "created_at": int(time.time()),
    }
    STORE.processes[process_id] = record
    STORE.participation_registry[process_id] = set()
    STORE.anonymous_ballots[process_id] = []
    STORE.aggregated_tallies[process_id] = {opt: 0 for opt in options}
    STORE.tx_evidence_registry[process_id] = []
    STORE.deliberative_proposals[process_id] = []

    STORE.admin_audit_log.append(
        {
            "event": "process_created",
            "process_id": process_id,
            "actor_role": claims.get("role"),
            "timestamp": int(time.time()),
        }
    )
    return record


@app.post("/api/v1/processes/{process_id}/state")
def transition_process_state(
    process_id: str,
    payload: ProcessStateTransitionRequest,
    claims: Dict[str, Any] = Depends(require_scope("elections:write")),
):
    proc = STORE.processes.get(process_id)
    if not proc:
        raise HTTPException(status_code=404, detail={"error": "process_not_found"})

    current = proc["state"]
    target = payload.target_state
    if current in ("closed", "cancelled"):
        raise HTTPException(
            status_code=400,
            detail={"error": "terminal_process_state", "current_state": current},
        )
    if target == "open" and current != "draft":
        raise HTTPException(
            status_code=400,
            detail={"error": "only_draft_process_can_open", "current_state": current},
        )
    if target == "closed" and current != "open":
        raise HTTPException(
            status_code=400,
            detail={"error": "only_open_process_can_close", "current_state": current},
        )

    proc["state"] = target
    if payload.reason:
        proc["state_transition_reason"] = payload.reason

    STORE.admin_audit_log.append(
        {
            "event": f"process_state_{target}",
            "process_id": process_id,
            "actor_role": claims.get("role"),
            "timestamp": int(time.time()),
        }
    )
    return proc


@app.post("/api/v1/processes/{process_id}/proposals", status_code=status.HTTP_201_CREATED)
def submit_deliberative_proposal(
    process_id: str,
    payload: DeliberativeProposalCreate,
    claims: Dict[str, Any] = Depends(require_scope("elections:read")),
):
    """Supports deliberative mechanisms (Cabildo Abierto / Iniciativa Ciudadana) beyond simple ballots."""
    proc = STORE.processes.get(process_id)
    if not proc:
        raise HTTPException(status_code=404, detail={"error": "process_not_found"})
    if not proc.get("deliberation_flow_required"):
        raise HTTPException(
            status_code=400,
            detail={"error": "mechanism_does_not_use_deliberative_proposals"},
        )
    proposal = {
        "proposal_id": f"prop-{secrets.token_hex(4)}",
        "title": payload.title,
        "summary": payload.summary,
        "proposer_alias": payload.proposer_alias,
        "created_at": int(time.time()),
    }
    STORE.deliberative_proposals[process_id].append(proposal)
    return proposal


@app.post("/api/v1/processes/{process_id}/vote")
def cast_vote(
    process_id: str,
    payload: CastVoteRequest,
    claims: Dict[str, Any] = Depends(require_scope("votes:cast")),
):
    proc = STORE.processes.get(process_id)
    if not proc:
        raise HTTPException(status_code=404, detail={"error": "process_not_found"})

    if proc["state"] != "open":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "process_not_open", "state": proc["state"]},
        )

    now = int(time.time())
    if now < int(proc["opens_at_epoch"]) or now > int(proc["closes_at_epoch"]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "vote_outside_allowed_period"},
        )

    if payload.stellar_network != "TESTNET":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_stellar_network_must_be_testnet"},
        )

    if payload.stellar_contract_id:
        if not STELLAR_CONTRACT_REGEX.match(payload.stellar_contract_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": "invalid_stellar_contract_id"},
            )
        if proc.get("stellar_contract_id") and payload.stellar_contract_id != proc["stellar_contract_id"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": "contract_id_mismatch_with_process"},
            )

    if len(payload.selections) > int(proc["max_selections"]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "too_many_selections",
                "max_selections": proc["max_selections"],
            },
        )
    if len(set(payload.selections)) != len(payload.selections):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "duplicate_selection_in_same_ballot"},
        )

    valid_options = set(proc["options"])
    for sel in payload.selections:
        if sel not in valid_options:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": "invalid_option_selected", "option": sel},
            )

    # One-way participation marker: prevents double voting without linking subject_id to ballot choices
    subject_id = str(claims.get("sub", ""))
    voter_marker = hmac.new(
        INTERNAL_SERVICE_SECRET.encode("utf-8"),
        f"participation:{process_id}:{subject_id}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    if voter_marker in STORE.participation_registry[process_id]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": "duplicate_vote_rejected"},
        )

    STORE.participation_registry[process_id].add(voter_marker)

    # Record anonymous ballot (NO subject_id or voter_marker attached)
    receipt_id = f"rcpt_{secrets.token_hex(10)}"
    STORE.anonymous_ballots[process_id].append(
        {
            "receipt_id": receipt_id,
            "selections": list(payload.selections),
            "timestamp_bucket": (now // 60) * 60,
        }
    )
    for sel in payload.selections:
        STORE.aggregated_tallies[process_id][sel] = (
            STORE.aggregated_tallies[process_id].get(sel, 0) + 1
        )

    tx_status = "not_submitted_on_chain"
    if payload.stellar_tx_hash:
        if not STELLAR_TX_HASH_REGEX.match(payload.stellar_tx_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": "invalid_stellar_tx_hash_format"},
            )
        tx_status = "confirmed" if payload.stellar_tx_confirmed else "pending_verification"
        STORE.tx_evidence_registry[process_id].append(
            {
                "tx_hash": payload.stellar_tx_hash,
                "network": "TESTNET",
                "contract_id": payload.stellar_contract_id or proc.get("stellar_contract_id"),
                "confirmed": bool(payload.stellar_tx_confirmed),
                "status": tx_status,
                "recorded_at": now,
            }
        )

    return {
        "accepted": True,
        "process_id": process_id,
        "receipt_id": receipt_id,
        "stellar_network": "TESTNET",
        "transaction_status": tx_status,
        "transaction_confirmed": bool(payload.stellar_tx_Hash if hasattr(payload, "stellar_tx_Hash") else payload.stellar_tx_confirmed and payload.stellar_tx_hash),
        "privacy_separation": "participation_marker_decoupled_from_ballot_content",
    }


@app.get("/api/v1/processes/{process_id}/results")
def get_process_results(process_id: str):
    proc = STORE.processes.get(process_id)
    if not proc:
        raise HTTPException(status_code=404, detail={"error": "process_not_found"})

    tallies = STORE.aggregated_tallies.get(process_id, {})
    participants_count = len(STORE.participation_registry.get(process_id, set()))
    total_marks = sum(tallies.values())
    census = max(1, int(proc["fictitious_census_size"]))
    participation_pct = round((participants_count / census) * 100.0, 2)
    threshold_pct = float(proc["participation_threshold_pct"])
    threshold_met = participation_pct >= threshold_pct

    blank_votes = tallies.get("VOTO_EN_BLANCO", 0)
    valid_candidate_or_option_votes = sum(
        count
        for opt, count in tallies.items()
        if opt not in ("VOTO_NO_MARCADO", "VOTO_NULO")
    )
    blank_majority_alert = (
        proc.get("blank_vote_enabled", False)
        and valid_candidate_or_option_votes > 0
        and blank_votes > (valid_candidate_or_option_votes / 2.0)
    )

    confirmed_txs = [
        tx for tx in STORE.tx_evidence_registry.get(process_id, []) if tx["confirmed"]
    ]
    pending_txs = [
        tx for tx in STORE.tx_evidence_registry.get(process_id, []) if not tx["confirmed"]
    ]

    return {
        "process_id": process_id,
        "title": proc["title"],
        "template_id": proc["template_id"],
        "state": proc["state"],
        "territorial_scope": proc["territorial_scope"],
        "department_code": proc["department_code"],
        "department_name": proc["department_name"],
        "municipality_code": proc["municipality_code"],
        "municipality_name": proc["municipality_name"],
        "participants_count": participants_count,
        "total_option_marks": total_marks,
        "fictitious_census_size": census,
        "participation_pct": participation_pct,
        "participation_threshold_pct": threshold_pct,
        "participation_threshold_met": threshold_met,
        "required_majority_rule": proc["required_majority_rule"],
        "tally_rule": proc["tally_rule"],
        "tallies": tallies,
        "blank_vote_majority_notice": blank_majority_alert,
        "confirmed_stellar_transactions": confirmed_txs,
        "pending_stellar_transactions": pending_txs,
        "educational_disclaimer": (
            "Resultados de simulación sintética no vinculante. No constituyen escrutinio oficial."
        ),
    }


# ============================================================================
# AWS S3 + IAM Least-Privilege Adapter & Pinned GitHub Release Metadata
# ============================================================================


@app.get("/api/v1/integrations/s3/status")
def s3_integration_status():
    bucket_name = os.environ.get("CONSENSUS_S3_BUCKET", "").strip()
    aws_region = os.environ.get("AWS_REGION", "us-east-1").strip()
    role_arn = os.environ.get("CONSENSUS_IAM_ROLE_ARN", "").strip()
    return {
        "configured": bool(bucket_name),
        "bucket_name": bucket_name or "consensus-educational-mvp-artifacts (local-staging)",
        "aws_region": aws_region,
        "iam_auth_mode": "iam_role_or_sts_temporary_credentials" if role_arn else "local_staging_mode",
        "public_access_blocked": True,
        "encryption_at_rest": "AES256 / aws:kms",
        "allowed_extensions": sorted(ALLOWED_ARTIFACT_EXTENSIONS),
        "prohibited_data_types": [
            "identifiable_votes",
            "private_keys",
            "otp_codes",
            "session_secrets",
            "biometric_images_or_embeddings",
        ],
        "staged_artifacts_count": len(STORE.s3_artifacts),
    }


@app.post("/api/v1/integrations/s3/artifacts", status_code=status.HTTP_201_CREATED)
def register_or_upload_s3_artifact(
    payload: ArtifactUploadRequest,
    claims: Dict[str, Any] = Depends(require_scope("artifacts:write")),
):
    lowered_name = payload.artifact_name.lower()
    if any(forbidden in lowered_name for forbidden in PROHIBITED_S3_KEYWORDS):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "prohibited_sensitive_artifact_rejected",
                "reason": "S3 bucket strictly forbids PII, votes, OTPs, secrets, and biometric data.",
            },
        )

    ext = Path(payload.artifact_name).suffix.lower()
    if ext not in ALLOWED_ARTIFACT_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "disallowed_file_extension",
                "allowed_extensions": sorted(ALLOWED_ARTIFACT_EXTENSIONS),
            },
        )

    try:
        raw_bytes = base64.b64decode(payload.content_b64)
    except Exception:
        raise HTTPException(status_code=400, detail={"error": "invalid_base64_content"})

    if len(raw_bytes) > 49152:
        raise HTTPException(status_code=413, detail={"error": "artifact_exceeds_mvp_limit"})

    computed_sha256 = hashlib.sha256(raw_bytes).hexdigest()
    if not hmac.compare_digest(computed_sha256.lower(), payload.sha256_digest.lower()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "artifact_sha256_mismatch",
                "expected": payload.sha256_digest.lower(),
                "computed": computed_sha256,
            },
        )

    bucket_name = os.environ.get("CONSENSUS_S3_BUCKET", "").strip()
    object_key = f"artifacts/{payload.git_commit_sha[:12]}/{payload.artifact_name}"
    storage_mode = "local_staging_verified"

    if bucket_name and os.environ.get("CONSENSUS_ENABLE_LIVE_S3", "false").lower() == "true":
        import boto3  # type: ignore

        s3_client = boto3.client("s3", region_name=os.environ.get("AWS_REGION", "us-east-1"))
        s3_client.put_object(
            Bucket=bucket_name,
            Key=object_key,
            Body=raw_bytes,
            ServerSideEncryption="AES256",
            Metadata={
                "sha256": computed_sha256,
                "git_commit_sha": payload.git_commit_sha,
                "signer_id": payload.signer_id,
            },
        )
        storage_mode = "aws_s3_put_object_encrypted"

    artifact_record = {
        "artifact_id": f"art_{secrets.token_hex(6)}",
        "artifact_name": payload.artifact_name,
        "artifact_type": payload.artifact_type,
        "object_key": object_key,
        "size_bytes": len(raw_bytes),
        "sha256": computed_sha256,
        "git_commit_sha": payload.git_commit_sha,
        "signer_id": payload.signer_id,
        "storage_mode": storage_mode,
        "uploaded_by_role": claims.get("role"),
        "timestamp": int(time.time()),
    }
    STORE.s3_artifacts.append(artifact_record)
    return artifact_record


@app.get("/api/v1/integrations/github/release-metadata")
def get_github_repo_metadata(ref: str = Query(default="main", pattern="^[a-zA-Z0-9._/-]{1,64}$")):
    """Queries pinned repository metadata via GitHub API without executing remote code."""
    repo_slug = os.environ.get("CONSENSUS_GITHUB_REPO", "MrLuis-WebMaster/consensus")
    api_url = f"https://api.github.com/repos/{repo_slug}/commits/{ref}"
    live_fetch = os.environ.get("CONSENSUS_GITHUB_LIVE_FETCH", "false").lower() == "true"

    if live_fetch:
        try:
            req = urllib.request.Request(
                api_url,
                headers={
                    "Accept": "application/vnd.github+json",
                    "User-Agent": "Consensus-Colombia-MVP/1.0",
                },
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            return {
                "repository": repo_slug,
                "pinned_ref": ref,
                "commit_sha": data.get("sha"),
                "html_url": data.get("html_url"),
                "remote_code_execution": False,
                "source": "github_rest_api_live",
            }
        except Exception as exc:
            return {
                "repository": repo_slug,
                "pinned_ref": ref,
                "commit_sha": "local-pinned-ref",
                "remote_code_execution": False,
                "source": "fallback_offline",
                "note": str(exc),
            }

    return {
        "repository": repo_slug,
        "pinned_ref": ref,
        "api_endpoint": api_url,
        "remote_code_execution": False,
        "artifact_delivery_flow": "GitHub (pinned commit) -> CircleCI build & SHA-256 -> AWS S3 bucket via IAM role",
        "source": "configured_metadata_adapter",
    }
