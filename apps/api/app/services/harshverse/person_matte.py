"""Optional per-frame person matte for genuine title-behind-presenter depth.

Uses MediaPipe Tasks ImageSegmenter with a *user-provided* local selfie
segmentation .tflite model. YuNet face samples are NOT an alpha matte:
their sparse boxes must never be used as a fake occlusion mask.

The model is optional, not downloaded/bundled here; ownership/licensing of
the specific weights must be checked before Phase 2 distribution. Fail closed.
"""
from __future__ import annotations

from dataclasses import dataclass
import math
from pathlib import Path
import subprocess

import numpy as np


@dataclass(frozen=True)
class MatteResult:
    path: Path
    frames: int
    coverage: float
    fps: int


def _extract_person_confidence(segmentation: object) -> np.ndarray:
    """Read the foreground *person* probability from MediaPipe selfie models.

    Official MediaPipe Selfie Segmenter variants may return one foreground
    confidence mask (person), rather than separate background/person masks.
    Other two-channel segmenters return background at index 0 and person at 1.
    We never infer a silhouette from face boxes, category IDs, or an empty mask.
    """
    masks = getattr(segmentation, "confidence_masks", None) or []
    if len(masks) == 1:
        # Single-channel Google SelfieSegmenter probability = person.
        mask = masks[0]
    elif len(masks) == 2:
        # Multi-channel person/background model: index 1 is person.
        mask = masks[1]
    else:
        raise RuntimeError(
            f"Unsupported MediaPipe person-confidence layout: {len(masks)} masks; "
            "expected 1 (selfie person) or 2 (background/person)."
        )
    raw = np.asarray(mask.numpy_view(), dtype=np.float32)
    # MediaPipe Image.numpy_view() returns H x W x channels, even when
    # channels == 1 (ImageFormat.VEC32F1). The earlier ndarray.ndim == 2
    # assumption rejected valid masks. Some models pack two confidences
    # (background, person) into a single H x W x 2 result.
    if raw.ndim == 3 and raw.shape[-1] == 1:
        person = raw[:, :, 0]
    elif raw.ndim == 3 and raw.shape[-1] == 2 and len(masks) == 1:
        person = raw[:, :, 1]
    elif raw.ndim == 2:
        person = raw
    else:
        raise RuntimeError(
            f"Unsupported person confidence mask shape {raw.shape}; "
            "expected HxW, HxWx1 or single packed HxWx2."
        )
    if not person.size or person.shape[0] < 2 or person.shape[1] < 2:
        raise RuntimeError("Person confidence mask must be a nonempty 2D image")
    if (not np.isfinite(person).all()
            or person.min() < -0.01 or person.max() > 1.01):
        raise RuntimeError("Invalid person confidence mask values")
    return np.clip(person, 0, 1)


def build_person_matte(
    video: Path, model: Path, output: Path, *,
    fps: int = 30, width: int = 360, height: int = 640,
    ffmpeg: str = "ffmpeg",
) -> MatteResult:
    """Segment every frame and encode a full-duration lossless gray matte.

    This intentionally does not claim to be temporal hair matting or an
    identity tracker. Edges still require human QA, especially hands/hair.
    """
    model = Path(model).expanduser().resolve()
    video = Path(video).expanduser().resolve()
    output = Path(output).expanduser().resolve()
    if not video.is_file() or not model.is_file() or model.suffix.lower() != ".tflite":
        raise FileNotFoundError("Presenter or local MediaPipe .tflite model missing")
    if (fps not in (24, 30) or width < 128 or height < 128
            or width * 16 != height * 9 or width % 2 or height % 2):
        raise ValueError("Invalid 9:16 person-matte dimensions")
    try:
        import mediapipe as mp
        import cv2
    except ImportError as exc:
        raise RuntimeError("MediaPipe Tasks and OpenCV are required for depth titles") from exc
    if not hasattr(mp, "tasks") or not hasattr(mp.tasks.vision, "ImageSegmenter"):
        raise RuntimeError("MediaPipe ImageSegmenter Tasks API unavailable in local installation")

    output.parent.mkdir(parents=True, exist_ok=True)
    raw_size = width * height * 3
    decoder = [
        ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error",
        "-i", str(video), "-map", "0:v:0", "-an", "-sn", "-dn",
        "-vf", f"fps={fps},scale={width}:{height}:flags=bicubic,setsar=1",
        "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1",
    ]
    encoder = [
        ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
        "-f", "rawvideo", "-pix_fmt", "gray", "-s", f"{width}x{height}",
        "-r", str(fps), "-i", "pipe:0", "-an",
        "-c:v", "ffv1", "-level", "3", "-pix_fmt", "gray", str(output),
    ]
    options = mp.tasks.vision.ImageSegmenterOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=str(model)),
        running_mode=mp.tasks.vision.RunningMode.VIDEO,
        output_category_mask=False,
        output_confidence_masks=True,
    )
    count = 0
    coverages: list[float] = []
    reader = None
    writer = None
    try:
        with mp.tasks.vision.ImageSegmenter.create_from_options(options) as segmenter:
            reader = subprocess.Popen(decoder, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            writer = subprocess.Popen(encoder, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
            assert reader.stdout is not None and writer.stdin is not None
            while True:
                frame_data = reader.stdout.read(raw_size)
                if not frame_data:
                    break
                if len(frame_data) != raw_size:
                    raise RuntimeError("Truncated source frame during person segmentation")
                rgb = np.frombuffer(frame_data, dtype=np.uint8).reshape((height, width, 3))
                frame = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb.copy())
                segmentation = segmenter.segment_for_video(frame, int(round(count * 1000 / fps)))
                person = _extract_person_confidence(segmentation)
                if person.shape != (height, width):
                    person = cv2.resize(person, (width, height), interpolation=cv2.INTER_LINEAR)
                if not np.isfinite(person).all():
                    raise RuntimeError("Invalid non-finite person confidence values")
                # Soft matte edges; suppress weak false positives in the room.
                alpha = np.clip((person - .22) / .65, 0, 1)
                alpha = cv2.GaussianBlur(alpha, (5, 5), 0)
                coverages.append(float(np.mean(alpha > .50)))
                writer.stdin.write((alpha * 255 + .5).astype(np.uint8).tobytes())
                count += 1
                if count > 60 * fps + 2:
                    raise ValueError("Person mask exceeds maximum 60-second clip")
            writer.stdin.close()
            # do not PIPE stderr indefinitely: there are only warnings/errors.
            write_error = writer.stderr.read() if writer.stderr else b""
            if writer.wait(timeout=120):
                raise RuntimeError(
                    "Lossless person-matte encoder failed: " +
                    write_error.decode("utf-8", errors="replace")[-400:]
                )
            if reader.wait(timeout=30):
                raise RuntimeError("Person segmentation decoder failed")
    except BaseException:
        if reader and reader.poll() is None:
            reader.kill()
        if writer and writer.poll() is None:
            writer.kill()
        output.unlink(missing_ok=True)
        raise
    average = sum(coverages) / max(1, len(coverages))
    if count < fps / 2 or not .025 <= average <= .80:
        output.unlink(missing_ok=True)
        raise RuntimeError("Person matte failed coverage sanity check; do not composite behind-head text")
    return MatteResult(output, count, round(average, 3), fps)
