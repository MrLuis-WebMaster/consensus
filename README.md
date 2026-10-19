# Consensus Colombia — MVP de Participación Democrática, Identidad Digital y Votación Verificable

Plataforma configurable para realizar simulaciones electorales, consultas ciudadanas, votaciones internas y ejercicios de participación democrática en Colombia, integrando contratos inteligentes en **Stellar Soroban (WASM)**, catálogo territorial oficial **DANE DIVIPOLA** completo (**32 departamentos + Bogotá D.C. y 1,122 municipios**), **12 mecanismos de votación y participación** (Categorías A y B), autenticación multifactor de **4 pasos** (Correo + Google reCAPTCHA server-side, OTP criptográfico, verificación facial 1:1 desacoplada con **FacePlugin SDK** + alternativa autorizada, y sesión `HttpOnly`/`Secure`/`SameSite=Lax`), API de integración **FastAPI**, infraestructura **AWS S3 + IAM** de mínimo privilegio con **Terraform**, configuración **Ansible** y CI/CD en **CircleCI**.

> [!WARNING]
> **Límite obligatorio:** El resultado es un **MVP educativo y experimental**, no un sistema certificado para elecciones oficiales ni vinculantes. No afirmamos que una autenticación facial, una transacción en blockchain o un resultado verificable garantizan por sí solos una elección legal, secreta, libre de coacción o resistente a todos los ataques. El contrato público en Stellar Soroban no provee secreto criptográfico de voto en cadena; todas las cuentas, datos biométricos y opciones deben ser sintéticos y contar con consentimiento informado.

---

## Arquitectura del Monorepo

| Directorio / Archivo | Tecnología | Responsabilidad |
| --- | --- | --- |
| [`frontend/`](frontend/) | TypeScript + Vite + Freighter | Primera pantalla de login seguro en 4 pasos, selector territorial DIVIPOLA completo, 12 mecanismos de votación, cabina de votación, recibo verificable, panel de resultados, auditoría y administración |
| [`encryption/biometric/`](encryption/biometric/) | Python + Django 5.2 | Servicio de identidad: flujo MFA de 4 pasos (`/v1/auth/*`), `FaceRecognitionProvider` (`FacePluginSdkProvider`), RBAC (`participante`, `administrador`, `auditor`), emisión de tickets HMAC de servicio y bitácora de auditoría redactada |
| [`services/api/`](services/api/) | Python + FastAPI + Pydantic v2 | API de integración desacoplada (`/api/v1/*`): catálogo DIVIPOLA y mecanismos, ciclo de vida de procesos, votación con separación de privacidad (participación vs. papeleta anónima), recibos criptográficos, manifiesto S3/IAM y metadatos GitHub REST API |
| [`backend/`](backend/) | Rust + Axum | Dominio electoral, invariantes de transición de estados, elegibilidad territorial y endpoint de validación de reglas (`POST /api/v1/elections/validate-vote`) |
| [`stellar/contracts/voting/`](stellar/contracts/voting/) | Rust + Soroban SDK (`wasm32v1-none`) | Contrato inteligente en Stellar: `configure_process`, `process_id`, ventana temporal (`OutOfVotingWindow`), `register_option`, `register_voter`, `open`, `cast_vote` (1 voto por votante) y `close` |
| [`data/territories/`](data/territories/) | JSON + Python | Catálogo oficial DANE DIVIPOLA versionado (`colombia_divipola.json`: 33 entidades territoriales, 1,122 municipios) y catálogo de 12 mecanismos (`voting_mechanisms_colombia.json`) |
| [`cloud/terraform/`](cloud/terraform/) | Terraform >= 1.6 (AWS) | Bucket S3 privado con cifrado SSE-S3, bloqueo público total, versionado, ciclo de vida, TLS obligatorio y roles IAM separados (`app-runtime-role` vs `ci-deploy-role`) de mínimo privilegio |
| [`ansible/`](ansible/) | Ansible | Playbooks idempotentes (`common_security`, `consensus_services`, `health_validation`) e inventarios separados (`dev`, `test`, `staging`) |
| [`.circleci/config.yml`](.circleci/config.yml) | CircleCI 2.1 | Pipeline CI/CD de 14 jobs: escaneo de secretos, tests Django, tests FastAPI, tests y build WASM Rust/Soroban, build TypeScript, validación DIVIPOLA, validación Terraform/Ansible, E2E y publicación firmada de artefactos a S3 |

> **Nota sobre gobernanza y Stellar:** Los ocho administradores propuestos en el laboratorio son perfiles de aplicación (umbral objetivo 5-de-8); **no son nodos validadores de la red Stellar**, ni existe una red de validadores Stellar separada por departamento o municipio.

---

## Flujo de Primera Pantalla: Login Seguro en 4 Pasos

1. **Paso 1 — Correo electrónico + Google reCAPTCHA (`POST /v1/auth/login/start`):** Normalización de correo, verificación server-side del token reCAPTCHA y generación de código OTP de 6 dígitos con CSPRNG (`secrets.randbelow`).
2. **Paso 2 — Código OTP por correo (`POST /v1/auth/otp/verify`, `POST /v1/auth/otp/resend`):** Almacenamiento como `HMAC-SHA256`, expiración de 5 minutos, máximo 3 intentos, enfriamiento de 60 segundos para reenvío e invalidación inmediata tras su primer uso.
3. **Paso 3 — Verificación facial 1:1 con Consentimiento Informado (`POST /v1/auth/biometric/consent`, `POST /v1/auth/biometric/verify`, `POST /v1/auth/biometric/fallback`):**
   - Evalúa e integra [`Faceplugin-ltd/Open-Source-Face-Recognition-SDK`](https://github.com/Faceplugin-ltd/Open-Source-Face-Recognition-SDK) detrás de `FaceRecognitionProvider`.
   - Cuando el runtime local no está instalado, informa explícitamente `engine_enabled: false` y **jamás simula una coincidencia biométrica ficticia como si fuera real**, habilitando el método alternativo autorizado (`ALT-CONSENSUS-2026` o código TOTP).
   - No persiste imágenes faciales ni vectores biométricos en disco, base de datos, S3, Stellar ni logs.
4. **Paso 4 — Emisión de Sesión Segura (`POST /v1/auth/session/issue`):** Emite cookie firmada `HttpOnly`, `SameSite=Lax`, `Secure` (en HTTPS) y guarda cero tokens de sesión o secretos en `localStorage`.

---

## Ejecución Local y Pruebas

### 1. Servicio de Identidad (Django)

```powershell
python encryption/biometric/manage.py check
python encryption/biometric/manage.py test lab -v 2
```

### 2. Servicio de Integración (FastAPI)

```powershell
python -m pytest services/api/tests/test_api.py -v
```

### 3. Frontend (TypeScript + Vite)

```powershell
cd frontend
npm.cmd ci
npm.cmd test
npm.cmd run build
```

### 4. Verificación Integral de Artefactos, Contratos, Terraform, Ansible y E2E

```powershell
python scripts/verify_pipeline_and_artifacts.py --strict --emit-artifacts
python -m pytest tests/test_integration_e2e.py -v
```

### 5. Contenedores Locales (Docker Compose)

```powershell
Copy-Item .env.example .env
docker compose --profile lab up --build
```

---

## Documentación Principal

- [Arquitectura MVP, Operaciones y Modelo de Amenazas](docs/17-mvp-architecture-and-operations.md)
- [Evaluación Técnica y Legal de FacePlugin SDK y Privacidad Biométrica](docs/18-faceplugin-evaluation-and-privacy.md)
- [Catálogo DANE DIVIPOLA (32 Departamentos + Bogotá D.C., 1,122 Municipios) y 12 Mecanismos de Votación](docs/19-colombia-divipola-and-mechanisms.md)
- [Plan de Pruebas de Aceptación (PA-001 a PA-022)](docs/12-acceptance-test-plan.md)
- [Registro de Decisiones Técnicas (ADR / Decision Log)](docs/13-decision-log.md)
- [Tablero Kanban e Inventario del MVP](KANBAN.md)
- [Guía de Infraestructura AWS S3 + IAM con Terraform](cloud/README.md)
- [Guía del Contrato Inteligente Stellar Soroban](stellar/README.md)
