"""Download the official OpenCV Zoo YuNet ONNX file with SHA-256 verification.

Run from apps/api:
  python scripts/setup_yunet.py
  export RANGMANCH_YUNET_MODEL_PATH="$HOME/.cache/rangmanch/models/face_detection_yunet_2023mar.onnx"

The file is never added to source control. Review upstream MIT license
before deploying commercially.
"""
from __future__ import annotations

import argparse
import hashlib
import os
import tempfile
from pathlib import Path
from urllib.request import Request, urlopen

MODEL_NAME = "face_detection_yunet_2023mar.onnx"
SOURCE = (
    "https://huggingface.co/opencv/opencv_zoo/resolve/main/"
    "models/face_detection_yunet/face_detection_yunet_2023mar.onnx"
)
EXPECTED_SHA256 = "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4"
EXPECTED_SIZE = 232589


def verify_model(path: Path) -> None:
    if path.stat().st_size != EXPECTED_SIZE:
        raise RuntimeError("YuNet file size differs from expected official model.")
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != EXPECTED_SHA256:
        raise RuntimeError("YuNet SHA-256 differs from expected official model.")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--out", type=Path,
        default=Path.home() / ".cache/rangmanch/models" / MODEL_NAME,
    )
    opts = parser.parse_args()
    destination = opts.out.expanduser().resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        verify_model(destination)
        print(f"Verified existing YuNet model: {destination}")
        return
    fd, temp_name = tempfile.mkstemp(prefix=".yunet-", suffix=".onnx", dir=destination.parent)
    os.close(fd)
    temporary = Path(temp_name)
    try:
        req = Request(SOURCE, headers={"User-Agent": "RangManch-local-YuNet-setup"})
        with urlopen(req, timeout=30) as response, temporary.open("wb") as target:
            data = response.read(EXPECTED_SIZE + 1)
            if len(data) != EXPECTED_SIZE:
                raise RuntimeError("Unexpected YuNet model download size.")
            target.write(data)
        verify_model(temporary)
        os.chmod(temporary, 0o600)
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)
    print(f"Verified YuNet model: {destination}")
    print(f'export RANGMANCH_YUNET_MODEL_PATH="{destination}"')


if __name__ == "__main__":
    main()
