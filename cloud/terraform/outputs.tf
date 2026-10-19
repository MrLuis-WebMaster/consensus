output "project_name" {
  description = "Nombre del proyecto Consensus"
  value       = var.project_name
}

output "aws_region" {
  description = "Región de AWS configurada"
  value       = var.aws_region
}

output "stellar_backend" {
  description = "Red blockchain utilizada (externa a AWS)"
  value       = "Stellar Testnet/local RPC; no Amazon Managed Blockchain"
}

output "artifacts_bucket_name" {
  description = "Nombre del bucket S3 privado para artefactos verificados y recursos no sensibles"
  value       = aws_s3_bucket.consensus_artifacts.bucket
}

output "artifacts_bucket_arn" {
  description = "ARN del bucket S3 de artefactos"
  value       = aws_s3_bucket.consensus_artifacts.arn
}

output "app_runtime_role_arn" {
  description = "ARN del rol IAM de ejecución de mínimo privilegio (solo lectura de artefactos)"
  value       = aws_iam_role.app_runtime.arn
}

output "ci_deploy_role_arn" {
  description = "ARN del rol IAM separado para publicación de artefactos desde CircleCI"
  value       = aws_iam_role.ci_deploy.arn
}

output "cloudwatch_log_group_name" {
  description = "Grupo de logs de CloudWatch para auditoría técnica sin datos sensibles"
  value       = aws_cloudwatch_log_group.consensus_operations.name
}
