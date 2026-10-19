# Consensus Colombia · Kanban e Inventario del MVP

Tablero de seguimiento e inventario de funcionalidades del MVP verificadas con pruebas automatizadas.

## Hecho y Verificado (`implementado`)

- [x] **KAN-001** — Primera pantalla de login seguro en 4 pasos (Correo + Google reCAPTCHA server-side -> OTP por correo con HMAC-SHA256, expiración y límite de intentos -> Verificación facial 1:1 con consentimiento informado o alternativa autorizada -> Sesión `HttpOnly`/`Secure`/`SameSite=Lax`).
- [x] **KAN-002** — Evaluación técnica y legal de `Faceplugin-ltd/Open-Source-Face-Recognition-SDK` e implementación del adaptador desacoplado `FaceRecognitionProvider` (`encryption/biometric/lab/face_provider.py`) sin simular coincidencias falsas cuando el motor no está instalado y con limpieza de memoria efímera.
- [x] **KAN-003** — Catálogo territorial oficial DANE DIVIPOLA completo (`data/territories/colombia_divipola.json`): **32 departamentos + Bogotá D.C. (33 entidades territoriales) y 1,122 municipios** con verificación de integridad SHA-256.
- [x] **KAN-004** — Catálogo parametrizable de **12 mecanismos de votación y participación** en Colombia (`data/territories/voting_mechanisms_colombia.json`), incluyendo elecciones unipersonales, listas abiertas/cerradas, voto en blanco promovido, plebiscito, referendo, consulta popular, **cabildo abierto** (flujo deliberativo de ponencias y compromisos), iniciativa normativa y revocatoria del mandato.
- [x] **KAN-005** — API de integración **FastAPI** (`services/api/app/main.py`) con validación Pydantic v2, autorización mediante tickets HMAC emitidos por Django, votación con separación entre registro de participación y papeleta anónima, recibos verificables (`receipt_id` + `ballot_commitment_hash`), adaptador S3/IAM y adaptador GitHub REST API por SHA inmutable.
- [x] **KAN-006** — Contrato inteligente **Stellar Soroban** (`stellar/contracts/voting/src/lib.rs`) actualizado con `configure_process`, `process_id`, validación de ventana temporal (`OutOfVotingWindow`), elegibilidad, voto único y pruebas unitarias de casos válidos y adversarios.
- [x] **KAN-007** — Servicio de dominio en **Rust** (`backend/`) con validación de reglas electorales (`POST /api/v1/elections/validate-vote`) y separación de privacidad en conteos.
- [x] **KAN-008** — Infraestructura declarativa **Terraform** (`cloud/terraform/`) para bucket AWS S3 privado, cifrado SSE-S3, bloqueo público total, versionado, ciclo de vida, política HTTPS-only y roles IAM separados (`app-runtime-role` y `ci-deploy-role`).
- [x] **KAN-009** — Automatización **Ansible** (`ansible/`) con inventarios (`dev`, `test`, `staging`) y roles idempotentes (`common_security`, `consensus_services`, `health_validation`).
- [x] **KAN-010** — Pipeline CI/CD en **CircleCI** (`.circleci/config.yml`) con 14 jobs (escaneo de secretos, Django, FastAPI, Rust/WASM, TypeScript, DIVIPOLA, Terraform, Ansible, E2E y despliegue de artefactos a S3).
- [x] **KAN-011** — Interfaz completa en `frontend/` con las 14 vistas del MVP, accesibilidad por teclado/ARIA y cero tokens de sesión en `localStorage`.

## Requiere Credenciales o Despliegue Externo (`parcial` / `bloqueado por credencial externa`)

- [ ] **EXT-001** — Despliegue en vivo del contrato `.wasm` a Stellar Testnet con una cuenta financiada por Friendbot y registro del `contractId` resultante. El código y el cliente nunca simulan un hash confirmado en Testnet si no proviene de una transacción real de 64 caracteres hexadecimales con `ledger > 0`.
- [ ] **EXT-002** — Ejecución de `terraform apply` y `scripts/deploy_artifacts_s3.py` contra una cuenta AWS real usando credenciales temporales OIDC/STS en CircleCI.
- [ ] **EXT-003** — Licencia comercial o autorización explícita de pesos/modelos ONNX de FacePlugin para habilitar inferencia facial en producción (en el MVP opera de forma transparente con el método alternativo autorizado cuando el motor local no está instalado).
