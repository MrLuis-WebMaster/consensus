"""Decoupled Face Recognition Provider adapter for Consensus Colombia MVP.

Evaluates and adapts https://github.com/Faceplugin-ltd/Open-Source-Face-Recognition-SDK
as the primary candidate while enforcing strict privacy, licensing transparency, and
honest test-mode behavior:
- Never simulates a real biometric match when the engine is not installed.
- Differentiates 1:1 verification, face detection, and 1:N identification (disabled for login).
- Reports liveness support honestly (the public FacePlugin open-source repo lacks a verifiable
  anti-spoofing/liveness module in its source tree).
- Processes all buffers ephemerally in memory and zeroes/deletes arrays immediately.
"""

from __future__ import annotations

import abc
import dataclasses
import hashlib
import importlib
import math
import os
import sys
from typing import Dict, List, Optional, Sequence


@dataclasses.dataclass(frozen=True)
class FaceBoundingBox:
    x1: float
    y1: float
    x2: float
    y2: float
    confidence: float


@dataclasses.dataclass
class EphemeralFeatureVector:
    values: List[float]
    provider_name: str
    engine_enabled: bool

    def clear(self) -> None:
        for idx in range(len(self.values)):
            self.values[idx] = 0.0
        self.values.clear()


@dataclasses.dataclass(frozen=True)
class LivenessCheckResult:
    supported: bool
    passed: bool
    provider_name: str
    reason: str


@dataclasses.dataclass(frozen=True)
class FaceComparison1To1Result:
    matched: bool
    similarity: Optional[float]
    threshold: float
    engine_enabled: bool
    simulated: bool
    provider_name: str
    operation_mode: str  # "1:1_verification"
    liveness: LivenessCheckResult
    reason: str
    audit_digest: str


@dataclasses.dataclass(frozen=True)
class FaceIdentification1ToNResult:
    allowed: bool
    matched_subject_id: Optional[str]
    provider_name: str
    operation_mode: str  # "1:N_identification"
    reason: str


class FaceRecognitionProvider(abc.ABC):
    """Abstract contract for facial detection, feature extraction, and 1:1 matching."""

    @property
    @abc.abstractmethod
    def provider_id(self) -> str:
        """Identifier of the active provider implementation."""

    @property
    @abc.abstractmethod
    def engine_enabled(self) -> bool:
        """True only if a real local neural recognition engine is loaded and verified."""

    @abc.abstractmethod
    def status_metadata(self) -> Dict[str, object]:
        """Returns technical and licensing audit metadata for UI and health checks."""

    @abc.abstractmethod
    def detect_faces(self, image_bytes: bytes, max_faces: int = 1) -> List[FaceBoundingBox]:
        """Detects face bounding boxes in an image buffer without persisting the image."""

    @abc.abstractmethod
    def extract_features(self, image_bytes: bytes) -> Optional[EphemeralFeatureVector]:
        """Extracts an ephemeral feature embedding from a single detected face."""

    @abc.abstractmethod
    def check_liveness(self, image_bytes: bytes) -> LivenessCheckResult:
        """Checks presentation attack / liveness ONLY if verifiably supported."""

    @abc.abstractmethod
    def compare_1to1(
        self,
        probe_image_bytes: bytes,
        reference_image_bytes: bytes,
        threshold: float = 0.72,
    ) -> FaceComparison1To1Result:
        """Performs 1:1 facial comparison between probe and reference images ephemerally."""

    def identify_1toN(
        self,
        probe_image_bytes: bytes,
        gallery_count: int = 0,
    ) -> FaceIdentification1ToNResult:
        """Explicitly separates 1:N identification from 1:1 verification.

        By design and data-minimization policy (Ley 1581 de 2012), 1:N biometric search
        across a central gallery is prohibited in the Consensus login flow.
        """
        del probe_image_bytes
        return FaceIdentification1ToNResult(
            allowed=False,
            matched_subject_id=None,
            provider_name=self.provider_id,
            operation_mode="1:N_identification",
            reason=(
                f"1:N identification against gallery (size={gallery_count}) is disabled by "
                "privacy policy; Consensus only permits consented 1:1 verification or fallback."
            ),
        )


class FacePluginSdkProvider(FaceRecognitionProvider):
    """Adapter for https://github.com/Faceplugin-ltd/Open-Source-Face-Recognition-SDK.

    Loads the SDK modules (`face_detect`, `face_landmark`, `face_feature`) only when
    `FACEPLUGIN_SDK_PATH` points to a valid local checkout and `cv2` + `torch` are present.
    If not installed or if license approval (`FACEPLUGIN_LICENSE_REVIEWED=true`) is absent,
    `engine_enabled` remains False and `compare_1to1` refuses to fabricate a real match.
    """

    def __init__(
        self,
        sdk_path: Optional[str] = None,
        license_reviewed: bool = False,
        default_threshold: float = 0.72,
    ) -> None:
        self._sdk_path = (sdk_path or os.environ.get("FACEPLUGIN_SDK_PATH", "")).strip()
        self._license_reviewed = license_reviewed or (
            os.environ.get("FACEPLUGIN_LICENSE_REVIEWED", "false").lower() == "true"
        )
        self._default_threshold = default_threshold
        self._loaded = False
        self._load_error = "FACEPLUGIN_SDK_PATH not configured"
        self._detect_fn = None
        self._landmark_fn = None
        self._feature_fn = None
        self._try_load_sdk()

    def _try_load_sdk(self) -> None:
        if not self._sdk_path:
            self._load_error = "FACEPLUGIN_SDK_PATH is empty; real facial engine is disabled."
            return
        if not os.path.isdir(self._sdk_path):
            self._load_error = f"SDK directory not found at {self._sdk_path}"
            return
        if not self._license_reviewed:
            self._load_error = (
                "FacePlugin repository lacks an explicit SPDX LICENSE file; set "
                "FACEPLUGIN_LICENSE_REVIEWED=true only after legal/technical approval."
            )
            return
        try:
            if self._sdk_path not in sys.path:
                sys.path.insert(0, self._sdk_path)
            detect_mod = importlib.import_module("face_detect.detect_imgs")
            landmark_mod = importlib.import_module("face_landmark.GetLandmark")
            feature_mod = importlib.import_module("face_feature.GetFeature")
            self._detect_fn = getattr(detect_mod, "get_face_boundingbox")
            self._landmark_fn = getattr(landmark_mod, "get_face_landmark")
            self._feature_fn = getattr(feature_mod, "get_face_feature")
            self._loaded = True
            self._load_error = ""
        except Exception as exc:  # pragma: no cover - defensive runtime check
            self._loaded = False
            self._load_error = f"Failed to initialize FacePlugin SDK modules: {exc}"

    @property
    def provider_id(self) -> str:
        return "faceplugin-open-source-sdk" if self._loaded else "faceplugin-sdk-disabled"

    @property
    def engine_enabled(self) -> bool:
        return self._loaded

    def status_metadata(self) -> Dict[str, object]:
        return {
            "candidate_repository": "https://github.com/Faceplugin-ltd/Open-Source-Face-Recognition-SDK",
            "provider_id": self.provider_id,
            "engine_enabled": self._loaded,
            "status_reason": "ready" if self._loaded else self._load_error,
            "license_audit": {
                "readme_badge": "Open Source",
                "spdx_license_file_present": False,
                "model_weights_license_documented": False,
                "commercial_or_civic_free_use_verified": False,
                "note": (
                    "Repository has no LICENSE file in root or model directories; "
                    "cannot be claimed free for unrestricted use without author license grant."
                ),
            },
            "capabilities": {
                "face_detection": self._loaded,
                "comparison_1to1": self._loaded,
                "identification_1toN": False,
                "liveness_detection": False,
                "liveness_note": (
                    "Public repo only contains face_detect, face_landmark, face_feature, and "
                    "face_pose; no verifiable anti-spoofing/liveness model is present."
                ),
                "sensitive_attribute_inference": False,
            },
            "privacy_controls": {
                "storage_persistence": "none (ephemeral in-memory only)",
                "s3_persistence": False,
                "stellar_persistence": False,
                "log_persistence": False,
            },
        }

    def check_liveness(self, image_bytes: bytes) -> LivenessCheckResult:
        del image_bytes
        return LivenessCheckResult(
            supported=False,
            passed=False,
            provider_name=self.provider_id,
            reason=(
                "liveness_not_supported_by_public_faceplugin_sdk: "
                "The audited repository does not include a verifiable anti-spoofing module."
            ),
        )

    def detect_faces(self, image_bytes: bytes, max_faces: int = 1) -> List[FaceBoundingBox]:
        if not self._loaded or not image_bytes:
            return []
        try:
            import cv2  # type: ignore
            import numpy as np  # type: ignore

            arr = np.frombuffer(image_bytes, dtype=np.uint8)
            bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            del arr
            if bgr is None:
                return []
            boxes, scores = self._detect_fn(bgr)  # type: ignore[misc]
            del bgr
            results: List[FaceBoundingBox] = []
            for idx in range(min(len(boxes), max_faces)):
                b = boxes[idx].data.numpy().tolist()
                s = float(scores[idx].data.numpy())
                results.append(
                    FaceBoundingBox(
                        x1=float(b[0]),
                        y1=float(b[1]),
                        x2=float(b[2]),
                        y2=float(b[3]),
                        confidence=s,
                    )
                )
            return results
        except Exception:
            return []

    def extract_features(self, image_bytes: bytes) -> Optional[EphemeralFeatureVector]:
        if not self._loaded or not image_bytes:
            return None
        try:
            import cv2  # type: ignore
            import numpy as np  # type: ignore

            arr = np.frombuffer(image_bytes, dtype=np.uint8)
            bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            del arr
            if bgr is None:
                return None
            gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
            boxes, _scores = self._detect_fn(bgr)  # type: ignore[misc]
            if len(boxes) == 0:
                del bgr, gray
                return None
            bboxes = [boxes[0].data.numpy()]
            landmarks = self._landmark_fn(gray, bboxes)  # type: ignore[misc]
            features = self._feature_fn(bgr, landmarks)  # type: ignore[misc]
            del bgr, gray, bboxes, landmarks
            if not features:
                return None
            vec = [float(x) for x in np.asarray(features[0]).flatten().tolist()]
            return EphemeralFeatureVector(
                values=vec,
                provider_name=self.provider_id,
                engine_enabled=True,
            )
        except Exception:
            return None

    def compare_1to1(
        self,
        probe_image_bytes: bytes,
        reference_image_bytes: bytes,
        threshold: Optional[float] = None,
    ) -> FaceComparison1To1Result:
        active_threshold = self._default_threshold if threshold is None else threshold
        audit_digest = hashlib.sha256(
            hashlib.sha256(probe_image_bytes).digest()
            + hashlib.sha256(reference_image_bytes).digest()
        ).hexdigest()[:16]
        liveness = self.check_liveness(probe_image_bytes)

        if not self._loaded:
            del probe_image_bytes, reference_image_bytes
            return FaceComparison1To1Result(
                matched=False,
                similarity=None,
                threshold=active_threshold,
                engine_enabled=False,
                simulated=False,
                provider_name=self.provider_id,
                operation_mode="1:1_verification",
                liveness=liveness,
                reason=f"real_engine_disabled: {self._load_error}",
                audit_digest=audit_digest,
            )

        probe_vec = self.extract_features(probe_image_bytes)
        ref_vec = self.extract_features(reference_image_bytes)
        del probe_image_bytes, reference_image_bytes

        if probe_vec is None or ref_vec is None:
            if probe_vec:
                probe_vec.clear()
            if ref_vec:
                ref_vec.clear()
            return FaceComparison1To1Result(
                matched=False,
                similarity=None,
                threshold=active_threshold,
                engine_enabled=True,
                simulated=False,
                provider_name=self.provider_id,
                operation_mode="1:1_verification",
                liveness=liveness,
                reason="face_not_detected_in_probe_or_reference",
                audit_digest=audit_digest,
            )

        try:
            similarity = _cosine_similarity(probe_vec.values, ref_vec.values)
        finally:
            probe_vec.clear()
            ref_vec.clear()

        return FaceComparison1To1Result(
            matched=similarity >= active_threshold,
            similarity=round(similarity, 4),
            threshold=active_threshold,
            engine_enabled=True,
            simulated=False,
            provider_name=self.provider_id,
            operation_mode="1:1_verification",
            liveness=liveness,
            reason="1to1_feature_comparison_completed",
            audit_digest=audit_digest,
        )


def _cosine_similarity(vec_a: Sequence[float], vec_b: Sequence[float]) -> float:
    if not vec_a or not vec_b or len(vec_a) != len(vec_b):
        return 0.0
    dot = sum(a * b for a, b in zip(vec_a, vec_b))
    norm_a = math.sqrt(sum(a * a for a in vec_a))
    norm_b = math.sqrt(sum(b * b for b in vec_b))
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return max(-1.0, min(1.0, dot / (norm_a * norm_b)))


def get_face_recognition_provider() -> FaceRecognitionProvider:
    """Factory returning the configured FaceRecognitionProvider instance."""
    return FacePluginSdkProvider()
