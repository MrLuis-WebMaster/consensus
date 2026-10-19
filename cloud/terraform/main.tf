# Consensus Colombia MVP — AWS S3 & Least-Privilege IAM Infrastructure
# Prohibited in S3: identifiable votes, private keys, OTP codes, session secrets, and biometric templates.

data "aws_caller_identity" "current" {}

locals {
  name_prefix        = "${var.project_name}-${var.environment}"
  artifacts_bucket   = "${local.name_prefix}-artifacts-${data.aws_caller_identity.current.account_id}"
  access_logs_bucket = "${local.name_prefix}-access-logs-${data.aws_caller_identity.current.account_id}"
}

# ============================================================================
# 1. S3 Access Logging Bucket (Encrypted & Public Access Blocked)
# ============================================================================

resource "aws_s3_bucket" "access_logs" {
  bucket        = local.access_logs_bucket
  force_destroy = false
}

resource "aws_s3_bucket_public_access_block" "access_logs" {
  bucket                  = aws_s3_bucket.access_logs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "access_logs" {
  bucket = aws_s3_bucket.access_logs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "access_logs" {
  bucket = aws_s3_bucket.access_logs.id

  rule {
    id     = "expire-access-logs"
    status = "Enabled"

    filter {
      prefix = "s3-access-logs/"
    }

    expiration {
      days = 90
    }
  }
}

# ============================================================================
# 2. Primary MVP Artifacts & Non-Sensitive Resources S3 Bucket
# ============================================================================

resource "aws_s3_bucket" "consensus_artifacts" {
  bucket        = local.artifacts_bucket
  force_destroy = false
}

resource "aws_s3_bucket_public_access_block" "consensus_artifacts" {
  bucket                  = aws_s3_bucket.consensus_artifacts.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "consensus_artifacts" {
  bucket = aws_s3_bucket.consensus_artifacts.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "consensus_artifacts" {
  bucket = aws_s3_bucket.consensus_artifacts.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_logging" "consensus_artifacts" {
  bucket        = aws_s3_bucket.consensus_artifacts.id
  target_bucket = aws_s3_bucket.access_logs.id
  target_prefix = "s3-access-logs/"
}

resource "aws_s3_bucket_lifecycle_configuration" "consensus_artifacts" {
  bucket = aws_s3_bucket.consensus_artifacts.id

  rule {
    id     = "noncurrent-artifact-cleanup"
    status = "Enabled"

    filter {
      prefix = "artifacts/"
    }

    noncurrent_version_expiration {
      noncurrent_days = var.artifact_retention_days
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 3
    }
  }
}

data "aws_iam_policy_document" "s3_tls_and_encryption_enforcement" {
  statement {
    sid    = "DenyInsecureTransport"
    effect = "Deny"

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    actions = ["s3:*"]

    resources = [
      aws_s3_bucket.consensus_artifacts.arn,
      "${aws_s3_bucket.consensus_artifacts.arn}/*",
    ]

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }

  statement {
    sid    = "DenyUnencryptedObjectUploads"
    effect = "Deny"

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.consensus_artifacts.arn}/*"]

    condition {
      test     = "StringNotEquals"
      variable = "s3:x-amz-server-side-encryption"
      values   = ["AES256"]
    }
  }
}

resource "aws_s3_bucket_policy" "consensus_artifacts" {
  bucket = aws_s3_bucket.consensus_artifacts.id
  policy = data.aws_iam_policy_document.s3_tls_and_encryption_enforcement.json
}

# ============================================================================
# 3. Separated IAM Roles: Application Runtime vs. CI/CD Deployment
# ============================================================================

data "aws_iam_policy_document" "runtime_assume_role" {
  statement {
    sid     = "AllowEC2OrECSRuntimeAssumeRole"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com", "ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "app_runtime" {
  name               = "${local.name_prefix}-app-runtime-role"
  assume_role_policy = data.aws_iam_policy_document.runtime_assume_role.json
}

data "aws_iam_policy_document" "app_runtime_least_privilege" {
  statement {
    sid    = "ListAllowedPrefixesOnly"
    effect = "Allow"
    actions = [
      "s3:ListBucket",
    ]
    resources = [aws_s3_bucket.consensus_artifacts.arn]

    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["artifacts/*", "public-resources/*"]
    }
  }

  statement {
    sid    = "ReadNonSensitiveResourcesAndArtifacts"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:GetObjectVersion",
    ]
    resources = [
      "${aws_s3_bucket.consensus_artifacts.arn}/artifacts/*",
      "${aws_s3_bucket.consensus_artifacts.arn}/public-resources/*",
    ]
  }
}

resource "aws_iam_role_policy" "app_runtime" {
  name   = "${local.name_prefix}-app-runtime-s3-read"
  role   = aws_iam_role.app_runtime.id
  policy = data.aws_iam_policy_document.app_runtime_least_privilege.json
}

# CI/CD Deployment Role (Separated from Runtime Role; allows PutObject to artifacts/* only)
data "aws_iam_policy_document" "ci_deploy_assume_role" {
  statement {
    sid     = "AllowAccountDeployerAssumeRoleWithMFAOrOIDC"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
  }
}

resource "aws_iam_role" "ci_deploy" {
  name               = "${local.name_prefix}-ci-deploy-role"
  assume_role_policy = data.aws_iam_policy_document.ci_deploy_assume_role.json
}

data "aws_iam_policy_document" "ci_deploy_least_privilege" {
  statement {
    sid    = "PublishVerifiedArtifactsOnly"
    effect = "Allow"
    actions = [
      "s3:PutObject",
      "s3:GetObject",
      "s3:ListBucket",
    ]
    resources = [
      aws_s3_bucket.consensus_artifacts.arn,
      "${aws_s3_bucket.consensus_artifacts.arn}/artifacts/*",
    ]
  }
}

resource "aws_iam_role_policy" "ci_deploy" {
  name   = "${local.name_prefix}-ci-deploy-s3-write"
  role   = aws_iam_role.ci_deploy.id
  policy = data.aws_iam_policy_document.ci_deploy_least_privilege.json
}

# ============================================================================
# 4. CloudWatch Log Group for Audit & Operational Monitoring
# ============================================================================

resource "aws_cloudwatch_log_group" "consensus_operations" {
  name              = "/consensus/${var.environment}/operations"
  retention_in_days = 30
}
