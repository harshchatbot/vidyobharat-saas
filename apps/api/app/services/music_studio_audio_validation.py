
"""Lightweight validation for guest Music Studio audio uploads."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from fastapi import UploadFile
import aiofiles

MAX_DURATION_SECONDS = 120
MAX_UPLOAD_BYTES = 25 * 1024 * 1024

SUPPORTED_EXTENSIONS = {
    ".wav", ".wave", ".aif", ".aiff", ".mp3", ".m4a"
}


def validate_audio(path: Path) -> float:
    """Validate a saved audio file without fully decoding it."""

    if path.suffix.lower() not in SUPPORTED_EXTENSIONS:
        raise ValueError("Use WAV, AIFF, MP3, or M4A audio.")

    size = path.stat().st_size

    if size == 0 or size > MAX_UPLOAD_BYTES:
        raise ValueError("Audio must be between 1 byte and 25 MB.")

    result = subprocess.run(
        [
            "ffprobe",
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "json",
            str(path),
        ],
        capture_output=True,
        text=True,
        timeout=15,
        check=True,
    )

    duration = float(json.loads(result.stdout)["format"]["duration"])

    if not 0 < duration <= MAX_DURATION_SECONDS:
        raise ValueError("Audio must be 2 minutes or shorter.")

    return duration



async def save_upload_limited(upload, destination: Path) -> None:
    """Stream a guest audio upload to a private file with a size limit."""
    destination.parent.mkdir(parents=True, exist_ok=True)

    total = 0

    try:
        with destination.open("xb") as output:
            while chunk := await upload.read(1024 * 1024):
                total += len(chunk)

                if total > MAX_UPLOAD_BYTES:
                    raise ValueError(
                        "Each audio file must be 25 MB or smaller."
                    )

                output.write(chunk)

    except Exception:
        destination.unlink(missing_ok=True)
        raise

    finally:
        await upload.close()
