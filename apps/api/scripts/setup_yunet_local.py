"""Install/verify official YuNet face detection for the existing RangManch Visual Engine.

No video is uploaded, altered or sent to a remote service. The optional YuNet
ONNX model is fetched from OpenCV's upstream model registry at a pinned revision,
SHA256-verified, stored in an ignored local data directory, and configured in
the canonical apps/api/.env without modifying any other settings.

From repo root:
  PYTHONPATH=apps/api apps/api/.venv/bin/python apps/api/scripts/setup_yunet_local.py
  PYTHONPATH=apps/api apps/api/.venv/bin/python apps/api/scripts/setup_yunet_local.py --check-only

Model: OpenCV Zoo face_detection_yunet_2026may.onnx (MIT license, see upstream
models/face_detection_yunet/LICENSE). No identity recognition or face storage.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import urllib.error
import urllib.request

from dotenv import load_dotenv

from app.core.config import ENV_FILE
from app.services.video_analysis_service import probe_video, detect_faces


_API_DIR = ENV_FILE.parent
_MODEL_NAME = "face_detection_yunet_2026may.onnx"
_MODEL_PATH = _API_DIR / "data" / "models" / _MODEL_NAME
# Pinned dynamic-input YuNet from official OpenCV Zoo Git LFS.
# The older 2023mar model has fixed input dims and can fail under OpenCV 5.
# SHA256 verified against upstream commit 47534e27.
_MODEL_URL = (
    "https://media.githubusercontent.com/media/opencv/opencv_zoo/"
    "47534e27c9851bb1128ccc0102f1145e27f23f98/"
    "models/face_detection_yunet/face_detection_yunet_2026may.onnx"
)
_MODEL_SHA256 = "ebafce4e3c118d6554634be5c27ab333b4c047a9a8c3faf1d7cf93101c22f0f0"
_MODEL_MAX_BYTES = 2 * 1024 * 1024
_KEY_PATTERN = re.compile(r"^(\s*(?:export\s+)?RANGMANCH_YUNET_MODEL_PATH\s*=).*$")


def _sha256(path: Path) -> str:
    checksum = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(128 * 1024), b""):
            checksum.update(chunk)
    return checksum.hexdigest()


def _opencv():
    try:
        import cv2
        import numpy as np
    except ImportError as exc:
        raise RuntimeError(
            "OpenCV or NumPy unavailable. Install API dependencies in the active "
            "venv (apps/api/requirements.txt includes opencv-python-headless)."
        ) from exc
    if not hasattr(cv2, "FaceDetectorYN_create"):
        raise RuntimeError(
            f"OpenCV {cv2.__version__} does not provide FaceDetectorYN_create; "
            "install a compatible opencv-python-headless build."
        )
    return cv2, np


def _validate_model(path: Path) -> str:
    cv2, np = _opencv()
    if not path.is_file() or path.stat().st_size < 1024:
        raise RuntimeError("YuNet ONNX model is missing or truncated")
    try:
        # The detector used in Visual Analysis V2 accepts a variable-sized
        # runtime input. A small sanity frame catches missing/broken ONNX
        # models before we change the user's .env.
        detector = cv2.FaceDetectorYN_create(str(path), "", (320, 320), 0.75, 0.3, 5000)
        detector.detect(np.zeros((320, 320, 3), dtype=np.uint8))
    except Exception as exc:
        detail = str(exc).replace("\n", " ")[:480]
        raise RuntimeError(
            f"OpenCV {cv2.__version__} could not run YuNet model "
            f"{path.name} ({type(exc).__name__}: {detail}). "
            "Check the model SHA, OpenCV backend, and ONNX version."
        ) from exc
    return cv2.__version__


def _download_pinned_model(destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.is_file() and _sha256(destination) == _MODEL_SHA256:
        return
    fd, tmp_name = tempfile.mkstemp(prefix=".yunet-", suffix=".part", dir=destination.parent)
    os.close(fd)
    temp = Path(tmp_name)
    try:
        request = urllib.request.Request(
            _MODEL_URL, headers={"User-Agent": "RangManch-Local-YuNet-Installer/1.0"}
        )
        with urllib.request.urlopen(request, timeout=45) as response, temp.open("wb") as stream:
            content = response.read(_MODEL_MAX_BYTES + 1)
            if len(content) > _MODEL_MAX_BYTES:
                raise RuntimeError("Refusing model download larger than expected")
            stream.write(content)
        if _sha256(temp) != _MODEL_SHA256:
            raise RuntimeError("YuNet download SHA256 mismatch; refusing unverified weights")
        _validate_model(temp)
        os.replace(temp, destination)
    finally:
        temp.unlink(missing_ok=True)


def _configure_env(model_path: Path) -> None:
    # Update only this one setting. All other .env lines (including secrets)
    # are retained unchanged; we never print the .env content.
    value = str(model_path.resolve()).replace("\\", "\\\\").replace('"', '\\"')
    line = f'RANGMANCH_YUNET_MODEL_PATH="{value}"'
    existed = ENV_FILE.exists()
    original = ENV_FILE.read_text(encoding="utf-8") if existed else ""
    lines = original.splitlines(keepends=True)
    replaced = False
    updated: list[str] = []
    for existing in lines:
        if _KEY_PATTERN.match(existing):
            if not replaced:
                updated.append(line + "\n")
                replaced = True
        else:
            updated.append(existing)
    if not replaced:
        if updated and not updated[-1].endswith("\n"):
            updated.append("\n")
        updated.append(line + "\n")
    if "".join(updated) != original:
        ENV_FILE.parent.mkdir(parents=True, exist_ok=True)
        fd, temp_path = tempfile.mkstemp(prefix=".yunet-env-", dir=ENV_FILE.parent)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as stream:
                stream.writelines(updated)
            if existed:
                os.chmod(temp_path, ENV_FILE.stat().st_mode & 0o777)
            else:
                os.chmod(temp_path, 0o600)
            os.replace(temp_path, ENV_FILE)
        finally:
            Path(temp_path).unlink(missing_ok=True)


def _model_from_env() -> Path | None:
    model = os.environ.get("RANGMANCH_YUNET_MODEL_PATH", "").strip()
    if not model:
        return None
    path = Path(model).expanduser()
    if not path.is_absolute():
        path = ENV_FILE.parent / path
    return path.resolve()


def check_video(video: Path) -> dict:
    video = video.expanduser().resolve()
    if not video.is_file():
        raise FileNotFoundError(f"Presenter video does not exist: {video}")
    info = probe_video(video, "local-yunet-diagnostic")
    status, observations = detect_faces(video, info.duration_seconds, info.width, info.height)
    return {
        "face_status": status,
        "face_samples": len(observations),
        "video_duration_seconds": info.duration_seconds,
        "first_observations": [
            {"time": sample.time,
             "confidence": round(sample.confidence, 3),
             "box": sample.box.model_dump()}
            for sample in observations[:3]
        ],
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Install and verify existing RangManch YuNet face detector locally")
    parser.add_argument("--check-only", action="store_true",
                        help="Do not download model or edit .env; diagnose current setup")
    parser.add_argument("--video", type=Path,
                        default=Path.home() / "Downloads" / "Test_Talking_Head_Harsh.mp4",
                        help="Local presenter video to test with Visual Engine V2")
    args = parser.parse_args(argv)
    load_dotenv(dotenv_path=ENV_FILE, override=False)
    try:
        version = _opencv()[0].__version__
        if args.check_only:
            model_path = _model_from_env()
            if model_path is None:
                raise RuntimeError("RANGMANCH_YUNET_MODEL_PATH is not configured in the environment")
        else:
            # Don't persist until bytes and inference have been validated.
            _download_pinned_model(_MODEL_PATH)
            _validate_model(_MODEL_PATH)
            _configure_env(_MODEL_PATH)
            model_path = _MODEL_PATH.resolve()
            os.environ["RANGMANCH_YUNET_MODEL_PATH"] = str(model_path)
        _validate_model(model_path)
        # The analysis function reads this exact env key. Relative .env
        # paths are normalized here so the original pipeline sees them.
        os.environ["RANGMANCH_YUNET_MODEL_PATH"] = str(model_path)
        diagnostics = check_video(args.video)
        print(json.dumps({
            "installed": True,
            "opencv_version": version,
            "model_path": str(model_path),
            "model_sha256": _sha256(model_path),
            **diagnostics,
        }, indent=2))
        if diagnostics["face_status"] == "complete":
            return 0
        if diagnostics["face_status"] == "no_faces":
            print("YuNet ran but detected no faces at the existing 1 FPS sampling cadence.", file=sys.stderr)
            return 3
        print("YuNet could not analyze this recording. Check FFmpeg and model compatibility.", file=sys.stderr)
        return 2
    except (OSError, ValueError, RuntimeError, urllib.error.URLError) as exc:
        print(f"YuNet setup/diagnostic failed: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
