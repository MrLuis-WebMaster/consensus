variable "aws_region" {
  description = "Región de AWS para el bucket S3 de artefactos y recursos no sensibles del MVP"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Identificador base del proyecto educativo Consensus Colombia"
  type        = string
  default     = "consensus-educational"
}

variable "environment" {
  description = "Entorno de despliegue (dev, test, staging)"
  type        = string
  default     = "test"

  validation {
    condition     = contains(["dev", "test", "staging"], var.environment)
    error_message = "El entorno del MVP debe ser dev, test o staging."
  }
}

variable "artifact_retention_days" {
  description = "Días de retención para versiones no actuales de artefactos en S3"
  type        = number
  default     = 30
}

variable "max_upload_size_bytes" {
  description = "Tamaño máximo permitido de carga de artefactos en la aplicación (bytes)"
  type        = number
  default     = 5242880
}

variable "github_repository" {
  description = "Repositorio remoto permitido para federación OIDC de CI/CD"
  type        = string
  default     = "MrLuis-WebMaster/consensus"
}

variable "amb_note" {
  description = "Aclaración arquitectónica sobre Amazon Managed Blockchain y Stellar"
  type        = string
  default     = "AMB no es compatible con Stellar; usar RPC Stellar Testnet externo"
}
