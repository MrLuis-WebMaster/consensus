# Infraestructura Cloud AWS (Terraform — S3 + IAM de Mínimo Privilegio)

Esta carpeta define la infraestructura declarativa en AWS para el MVP de **Consensus Colombia** centrada exclusivamente en **Amazon S3** e **IAM de mínimo privilegio**, más un grupo de logs de auditoría en CloudWatch con retención acotada.

> [!IMPORTANT]
> Amazon Managed Blockchain no opera nodos de la red Stellar; no se aprovisiona ningún recurso de blockchain administrada ni instancias EC2/RDS costosas para este MVP.

## Recursos Declarados en `cloud/terraform/`

1. **`aws_s3_bucket.consensus_artifacts`**: Bucket privado para artefactos de compilación (`wasm/`, `frontend/`, `manifests/`), catálogos públicos versionados (`catalogs/`) y reportes de auditoría sin PII (`audit-exports/`).
2. **`aws_s3_bucket_public_access_block`**: Bloqueo total de acceso público (`block_public_acls = true`, `block_public_policy = true`, `ignore_public_acls = true`, `restrict_public_buckets = true`).
3. **`aws_s3_bucket_server_side_encryption_configuration`**: Cifrado en reposo `AES256` (SSE-S3).
4. **`aws_s3_bucket_versioning`**: Versionado habilitado para trazabilidad de artefactos y manifiestos SHA-256.
5. **`aws_s3_bucket_lifecycle_configuration`**: Expiración automática de versiones no actuales y limpieza de cargas multiparte incompletas para optimizar costos.
6. **`aws_s3_bucket_policy`**: Política `DenyInsecureTransport` que rechaza cualquier operación S3 sin TLS (`aws:SecureTransport = false`).
7. **Roles IAM separados (Mínimo Privilegio):**
   - `aws_iam_role.app_runtime_role`: Rol de ejecución de la aplicación con acceso restringido a `catalogs/*`, `manifests/*` y `audit-exports/*`.
   - `aws_iam_role.ci_deploy_role`: Rol de CI/CD (CircleCI) con permiso de publicación sobre `wasm/*`, `frontend/*`, `catalogs/*` y `manifests/*`.

## Datos Prohibidos en S3

Nunca almacenes en este bucket:
- Imágenes faciales o vectores/embeddings biométricos.
- Códigos OTP, tokens de sesión o secretos administrativos.
- Claves privadas de Stellar o semillas criptográficas.
- Votos identificables vinculados a una persona.

## Validación y Despliegue

```powershell
terraform -chdir=cloud/terraform init -backend=false
terraform -chdir=cloud/terraform fmt -check
terraform -chdir=cloud/terraform validate
terraform -chdir=cloud/terraform plan
```

Para validar localmente las políticas y artefactos sin credenciales AWS:

```powershell
python scripts/verify_pipeline_and_artifacts.py --strict --emit-artifacts
python scripts/deploy_artifacts_s3.py --dry-run
```
