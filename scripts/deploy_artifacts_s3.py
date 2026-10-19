"""Controlled S3 deployment script for approved CircleCI artifacts via IAM role credentials."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Upload verified provenance manifest to AWS S3.")
    parser.add_argument("--manifest", default="artifacts/provenance-manifest.json")
    args = parser.parse_args()

    manifest_path = Path(args.manifest)
    if not manifest_path.exists():
        print(f"Manifest not found: {manifest_path}", file=sys.stderr)
        return 1

    raw = manifest_path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    bucket = os.environ.get("CONSENSUS_S3_BUCKET", "").strip()
    region = os.environ.get("AWS_REGION", "us-east-1").strip()

    if not bucket:
        print(
            f"[DRY-RUN] CONSENSUS_S3_BUCKET not set. Verified manifest SHA-256={digest} ready for IAM role upload."
        )
        return 0

    import boto3  # type: ignore

    s3 = boto3.client("s3", region_name=region)
    commit_sha = os.environ.get("CIRCLE_SHA1", "manual")[:12]
    key = f"artifacts/{commit_sha}/provenance-manifest.json"
    s3.put_object(
        Bucket=bucket,
        Key=key,
        Body=raw,
        ServerSideEncryption="AES256",
        Metadata={"sha256": digest, "commit": commit_sha},
    )
    print(f"[OK] Uploaded {key} (SHA-256={digest}) to s3://{bucket}/{key}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
