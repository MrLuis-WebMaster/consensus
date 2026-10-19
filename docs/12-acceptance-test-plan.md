# 12. Plan de pruebas de aceptación

**Estado:** ejecutado y verificado en el MVP (PA-001 a PA-022 aprobados en suites automatizadas de Django, FastAPI, Rust/Soroban, TypeScript y E2E).

| ID | Escenario | Requisitos | Resultado esperado | Estado / Evidencia automatizada |
| --- | --- | --- | --- | --- |
| PA-001 | Crear elección válida con alcance territorial y mecanismo | RF-001 | Se crea en `draft`/`configured` con identificador consultable, territorio DIVIPOLA y reglas del mecanismo. | **Aprobado** (`services/api/tests/test_api.py`, `tests/test_integration_e2e.py`) |
| PA-002 | Abrir configuración incompleta | RF-004 | La transición es rechazada si faltan opciones o configuración válida. | **Aprobado** (`stellar/contracts/voting/src/lib.rs`, `backend/src/application/elections.rs`) |
| PA-003 | Abrir elección válida | RF-002, RF-003, RF-005 | El estado cambia a `open` (`Abierta`). | **Aprobado** (`services/api/tests/test_api.py`, `tests/test_integration_e2e.py`) |
| PA-004 | Voto válido con separación de privacidad | RF-006, RF-007 | Se acepta, registra participación separada del contenido del voto, aumenta el conteo y emite recibo verificable (`receipt_id` + `ballot_commitment_hash`). | **Aprobado** (`services/api/tests/test_api.py`, `tests/test_integration_e2e.py`) |
| PA-005 | Votante no habilitado o fuera de circunscripción territorial | RF-008 | Se rechaza con HTTP 403 / `VoterNotEligible` sin modificar el conteo. | **Aprobado** (`services/api/tests/test_api.py`, `stellar/contracts/voting/src/lib.rs`) |
| PA-006 | Segundo voto (doble voto) | RF-009 | Se rechaza con HTTP 409 / `AlreadyVoted` sin modificar el conteo. | **Aprobado** (`services/api/tests/test_api.py`, `tests/test_integration_e2e.py`) |
| PA-007 | Cerrar elección | RF-010 | El estado cambia a `closed` (`Cerrada`). | **Aprobado** (`services/api/tests/test_api.py`, `tests/test_integration_e2e.py`) |
| PA-008 | Votar antes de abrir | RF-011 | Se rechaza con HTTP 409 / `NotOpen` / `OutOfVotingWindow`. | **Aprobado** (`stellar/contracts/voting/src/lib.rs`, `backend/src/application/elections.rs`) |
| PA-009 | Votar después de cerrar | RF-011 | Se rechaza con HTTP 409 / `NotOpen` / `OutOfVotingWindow`. | **Aprobado** (`stellar/contracts/voting/src/lib.rs`, `services/api/tests/test_api.py`) |
| PA-010 | Consultar resultado e invariante de conteo | RF-012, RF-013 | Estado y suma de conteos por opción coinciden exactamente con el total de participaciones registradas. | **Aprobado** (`services/api/tests/test_api.py`, `tests/test_integration_e2e.py`) |
| PA-011 | Verificación independiente de recibo y transacción Stellar | RF-014, RF-015 | Cualquier participante o auditor verifica `receipt_id`, `ballot_commitment_hash` y estado `confirmed_on_testnet`. | **Aprobado** (`services/api/tests/test_api.py`, `tests/test_integration_e2e.py`) |
| PA-012 | Recrear escenario y verificar artefactos deterministas | RF-017 | `verify_pipeline_and_artifacts.py --strict --emit-artifacts` regenera y valida manifiestos SHA-256. | **Aprobado** (`scripts/verify_pipeline_and_artifacts.py`) |
| PA-013 | Red incorrecta o transacción Stellar no confirmada | RNF-007 | No se reporta un enlace o transacción como confirmada en Testnet sin hash de 64 hex y `ledger > 0`. | **Aprobado** (`services/api/tests/test_api.py`, `frontend/src/stellar.ts`) |
| PA-014 | Revisión de secretos en repositorio y logs | RNF-001 | No existen claves privadas, semillas Stellar, OTPs en texto claro ni tokens en el código ni en la bitácora de auditoría. | **Aprobado** (`encryption/biometric/lab/tests.py`, `scripts/verify_pipeline_and_artifacts.py`) |
| PA-015 | Revisión de privacidad y consentimiento biométrico | RNF-002, RNF-012 | Se exige consentimiento informado previo, se permite revocación y alternativa sin cámara, y jamás se persisten imágenes o vectores biométricos. | **Aprobado** (`encryption/biometric/lab/tests.py`, `tests/test_integration_e2e.py`) |
| PA-016 | Navegación accesible y compilación estricta de UI | RNF-006 | Las 14 vistas del MVP incluyen etiquetas ARIA, anuncios `aria-live` y compilan con `tsc --noEmit` sin errores. | **Aprobado** (`frontend/src/main.ts`) |
| PA-017 | Acción administrativa no autorizada (RBAC) | RF-001..RF-010, AUT-001 | Un perfil `participante` no puede crear procesos, abrir/cerrar votaciones ni acceder a vistas administrativas; recibe HTTP 403. | **Aprobado** (`encryption/biometric/lab/tests.py`, `services/api/tests/test_api.py`, `tests/test_integration_e2e.py`) |
| PA-018 | Flujo completo MFA de 4 pasos (Correo + reCAPTCHA -> OTP -> Biometría/Alternativa -> Cookie HttpOnly) | AUT-002 | No es posible emitir sesión saltándose el OTP ni la verificación biométrica/alternativa; OTP expira y se invalida al primer uso. | **Aprobado** (`encryption/biometric/lab/tests.py`, `tests/test_integration_e2e.py`) |
| PA-019 | Honestidad del adaptador FacePlugin SDK | BIO-001 | Cuando el motor nativo no está instalado, devuelve `engine_enabled: false` (HTTP 503 en verificación facial directa) y nunca simula un match falso, requiriendo el método alternativo autorizado. | **Aprobado** (`encryption/biometric/lab/tests.py`) |
| PA-020 | Catálogo oficial DANE DIVIPOLA completo | TER-001 | Catálogo contiene exactamente 32 departamentos + Bogotá D.C. (33 entidades) y los 1,122 municipios de Colombia con integridad SHA-256 verificada. | **Aprobado** (`scripts/verify_pipeline_and_artifacts.py`, `services/api/tests/test_api.py`) |
| PA-021 | 12 Mecanismos de votación y Cabildo Abierto | MEC-001 | Los 12 mecanismos (Categorías A y B) aplican sus reglas específicas; Cabildo Abierto exige registro deliberativo y respuesta institucional. | **Aprobado** (`services/api/tests/test_api.py`, `tests/test_integration_e2e.py`) |
| PA-022 | Infraestructura AWS S3 + IAM y trazabilidad remota GitHub API | INF-001 | Terraform define bucket S3 cifrado sin acceso público, políticas IAM separadas de mínimo privilegio y adaptador GitHub API con SHA inmutable. | **Aprobado** (`scripts/verify_pipeline_and_artifacts.py`, `services/api/tests/test_api.py`) |

## Comandos de Verificación Reproducible

```powershell
python encryption/biometric/manage.py test lab -v 2
python -m pytest services/api/tests/test_api.py -v
python -m pytest tests/test_integration_e2e.py -v
python scripts/verify_pipeline_and_artifacts.py --strict --emit-artifacts
```
