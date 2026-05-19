from __future__ import annotations

import json
import logging
import math
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cv2  # type: ignore
import numpy as np

from app.services.fal_video_service import FalVideoService

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class FaceTrackStats:
    detected_frames: int
    total_frames: int
    detection_rate: float
    crop_w: int
    crop_h: int
    pad_px: int
    source_w: int
    source_h: int


class LipsyncFaceService:
    """
    Backward-compatible storyboard lipsync service wrapper.

    Storyboard worker expects a class with `apply_lipsync(video_url, audio_url, metadata)`.
    This delegates provider execution to Fal Sync Lipsync v2.
    """

    def __init__(self) -> None:
        self.fal_service = FalVideoService()

    def apply_lipsync(
        self,
        *,
        video_url: str,
        audio_url: str,
        metadata: dict[str, Any] | None = None,
    ) -> str:
        if not str(video_url or "").strip():
            raise ValueError("video_url is required for lipsync")
        if not str(audio_url or "").strip():
            raise ValueError("audio_url is required for lipsync")
        out_url, _meta = self.fal_service.generate_sync_lipsync_v2(
            video_url=str(video_url).strip(),
            audio_url=str(audio_url).strip(),
        )
        return out_url


def crop_face_for_lipsync(input_video_path: str) -> tuple[str, dict[str, Any]]:
    """
    Returns:
      - face_crop_video_path: local MP4 path (H.264, no audio)
      - track: json-serializable dict with per-frame face boxes + crop metadata
    """
    src = Path(str(input_video_path or '').strip())
    if not src.exists():
        raise FileNotFoundError(f'input_video_path not found: {src}')

    info = _probe_video_info(str(src))
    fps = info.fps
    source_w, source_h = info.width, info.height
    total_frames = info.frame_count
    if total_frames <= 0:
        total_frames = int(round(info.duration_seconds * fps)) if info.duration_seconds else 0
    if total_frames <= 0:
        raise ValueError('Could not determine frame_count for lipsync face crop.')

    pad_px = 20
    boxes: list[dict[str, int]] = []
    detected_frames = 0

    face_detector = _load_face_detector()

    for frame_rgb in _iter_rgb_frames(str(src), width=source_w, height=source_h):
        box = _detect_bbox_opencv(face_detector, frame_rgb, source_w, source_h, pad_px=pad_px)
        if box is None:
            # Fallback: reuse last box or use center crop.
            if boxes:
                box = boxes[-1]
            else:
                box = _center_box(source_w, source_h)
        else:
            detected_frames += 1

        # Light EMA smoothing to reduce jitter.
        if boxes:
            box = _ema_box(boxes[-1], box, alpha=0.65)
        boxes.append(box)

        if len(boxes) >= total_frames:
            break

    # Choose stable crop size from median box sizes, clamp to reasonable bounds.
    widths = sorted(max(1, b['w']) for b in boxes)
    heights = sorted(max(1, b['h']) for b in boxes)
    crop_w = _make_even(int(_median(widths)))
    crop_h = _make_even(int(_median(heights)))
    crop_w = max(160, min(crop_w, source_w))
    crop_h = max(160, min(crop_h, source_h))

    # Second pass: produce face-crop frames with fixed size canvas.
    temp_dir = Path(tempfile.mkdtemp(prefix='rangmanch-lipsync-face-'))
    out_path = temp_dir / f'{src.stem}_facecrop.mp4'

    encoder = subprocess.Popen(
        [
            'ffmpeg',
            '-y',
            '-v',
            'error',
            '-f',
            'rawvideo',
            '-pix_fmt',
            'rgb24',
            '-s',
            f'{crop_w}x{crop_h}',
            '-r',
            str(fps),
            '-i',
            'pipe:0',
            '-an',
            '-c:v',
            'libx264',
            '-pix_fmt',
            'yuv420p',
            str(out_path),
        ],
        stdin=subprocess.PIPE,
    )
    assert encoder.stdin is not None

    try:
        frame_index = 0
        for frame_rgb in _iter_rgb_frames(str(src), width=source_w, height=source_h):
            if frame_index >= len(boxes):
                break
            box = boxes[frame_index]
            crop = _crop_from_box(frame_rgb, box)
            canvas = np.zeros((crop_h, crop_w, 3), dtype=np.uint8)
            # Resize crop into the fixed canvas to keep consistent dimensions for lipsync.
            resized = _resize_rgb(crop, crop_w, crop_h)
            canvas[:, :, :] = resized
            encoder.stdin.write(canvas.tobytes())
            frame_index += 1
            if frame_index >= total_frames:
                break
    finally:
        try:
            encoder.stdin.close()
        except Exception:
            pass
        encoder.wait(timeout=60)

    track = {
        'fps': fps,
        'frame_count': int(min(total_frames, len(boxes))),
        'crop_w': int(crop_w),
        'crop_h': int(crop_h),
        'boxes': boxes[: int(min(total_frames, len(boxes)))],
        'pad_px': int(pad_px),
        'source_w': int(source_w),
        'source_h': int(source_h),
        'stats': FaceTrackStats(
            detected_frames=detected_frames,
            total_frames=int(min(total_frames, len(boxes))),
            detection_rate=round(float(detected_frames) / float(max(1, min(total_frames, len(boxes)))), 4),
            crop_w=int(crop_w),
            crop_h=int(crop_h),
            pad_px=int(pad_px),
            source_w=int(source_w),
            source_h=int(source_h),
        ).__dict__,
    }
    logger.info(
        'lipsync_face_crop_ready',
        extra={
            'input_video_path': str(src),
            'output_face_crop_path': str(out_path),
            'fps': fps,
            'frame_count': track['frame_count'],
            'detected_frames': detected_frames,
            'detection_rate': track['stats']['detection_rate'],
            'crop_w': crop_w,
            'crop_h': crop_h,
        },
    )
    return str(out_path), track


def composite_lipsync_result(original_video_path: str, lipsync_face_video_path: str, track: dict[str, Any]) -> str:
    """
    Composites the lipsynced face crop video back onto the original full-frame video.
    Output is a local MP4 (no audio). Audio should be muxed by caller.
    """
    src = Path(str(original_video_path or '').strip())
    face = Path(str(lipsync_face_video_path or '').strip())
    if not src.exists():
        raise FileNotFoundError(f'original_video_path not found: {src}')
    if not face.exists():
        raise FileNotFoundError(f'lipsync_face_video_path not found: {face}')

    fps = float(track.get('fps') or 24.0)
    crop_w = int(track.get('crop_w') or 0)
    crop_h = int(track.get('crop_h') or 0)
    boxes = list(track.get('boxes') or [])
    source_w = int(track.get('source_w') or 0)
    source_h = int(track.get('source_h') or 0)
    frame_count = int(track.get('frame_count') or len(boxes) or 0)
    if not crop_w or not crop_h or not source_w or not source_h or not frame_count:
        raise ValueError('Invalid face track metadata; cannot composite.')

    temp_dir = Path(tempfile.mkdtemp(prefix='rangmanch-lipsync-composite-'))
    out_path = temp_dir / f'{src.stem}_lipsync_composited.mp4'

    # Precompute a feathered oval mask in [0..1].
    mask = _feathered_oval_mask(crop_w, crop_h, blur_radius=15)

    encoder = subprocess.Popen(
        [
            'ffmpeg',
            '-y',
            '-v',
            'error',
            '-f',
            'rawvideo',
            '-pix_fmt',
            'rgb24',
            '-s',
            f'{source_w}x{source_h}',
            '-r',
            str(fps),
            '-i',
            'pipe:0',
            '-an',
            '-c:v',
            'libx264',
            '-pix_fmt',
            'yuv420p',
            str(out_path),
        ],
        stdin=subprocess.PIPE,
    )
    assert encoder.stdin is not None

    try:
        src_iter = _iter_rgb_frames(str(src), width=source_w, height=source_h)
        face_info = _probe_video_info(str(face))
        face_iter = _iter_rgb_frames(str(face), width=face_info.width, height=face_info.height)

        frames_processed = 0
        for i in range(frame_count):
            try:
                orig = next(src_iter)
            except StopIteration:
                logger.warning(f'Source video exhausted at frame {i}/{frame_count}')
                break

            try:
                face_frame = next(face_iter)
            except StopIteration:
                logger.warning(f'Face crop video exhausted at frame {i}/{frame_count}, using original frame')
                encoder.stdin.write(orig.tobytes())
                frames_processed += 1
                continue

            box = boxes[i] if i < len(boxes) else boxes[-1]

            x, y, w, h = int(box['x']), int(box['y']), int(box['w']), int(box['h'])
            if w <= 0 or h <= 0:
                encoder.stdin.write(orig.tobytes())
                frames_processed += 1
                continue

            # Resize lipsynced face crop frame back to the box size.
            face_resized = _resize_rgb(face_frame, max(2, w), max(2, h))
            mask_resized = _resize_mask(mask, max(2, w), max(2, h))

            x0 = max(0, min(source_w - 1, x))
            y0 = max(0, min(source_h - 1, y))
            x1 = max(0, min(source_w, x0 + face_resized.shape[1]))
            y1 = max(0, min(source_h, y0 + face_resized.shape[0]))

            patch_w = x1 - x0
            patch_h = y1 - y0
            if patch_w <= 1 or patch_h <= 1:
                encoder.stdin.write(orig.tobytes())
                frames_processed += 1
                continue

            face_patch = face_resized[:patch_h, :patch_w, :].astype(np.float32)
            alpha = mask_resized[:patch_h, :patch_w].astype(np.float32)[..., None]
            base_patch = orig[y0:y1, x0:x1, :].astype(np.float32)

            blended = (alpha * face_patch + (1.0 - alpha) * base_patch).clip(0, 255).astype(np.uint8)
            orig[y0:y1, x0:x1, :] = blended

            encoder.stdin.write(orig.tobytes())
            frames_processed += 1

        logger.info(f'Lipsync compositing: processed {frames_processed}/{frame_count} frames')
    finally:
        try:
            encoder.stdin.close()
        except Exception:
            pass
        encoder.wait(timeout=120)

    logger.info(
        'lipsync_face_composite_ready',
        extra={
            'original_video_path': str(src),
            'lipsync_face_video_path': str(face),
            'output_path': str(out_path),
            'frame_count': frame_count,
            'fps': fps,
        },
    )
    return str(out_path)


@dataclass(frozen=True)
class _VideoInfo:
    width: int
    height: int
    fps: float
    frame_count: int
    duration_seconds: float | None


def _probe_video_info(path: str) -> _VideoInfo:
    raw = subprocess.check_output(
        [
            'ffprobe',
            '-v',
            'error',
            '-show_streams',
            '-show_format',
            '-print_format',
            'json',
            path,
        ],
        text=True,
    )
    data = json.loads(raw)
    streams = data.get('streams') or []
    v = next((s for s in streams if s.get('codec_type') == 'video'), None) or {}
    width = int(v.get('width') or 0)
    height = int(v.get('height') or 0)
    fps_str = str(v.get('avg_frame_rate') or v.get('r_frame_rate') or '0/1')
    fps = _parse_ratio(fps_str) or 24.0
    nb_frames = v.get('nb_frames')
    frame_count = int(nb_frames) if str(nb_frames or '').isdigit() else 0
    duration = None
    try:
        duration = float((data.get('format') or {}).get('duration') or 0) or None
    except Exception:
        duration = None
    if frame_count <= 0 and duration:
        frame_count = int(round(duration * fps))
    if width <= 0 or height <= 0:
        raise ValueError(f'ffprobe did not return width/height for video: {path}')
    return _VideoInfo(width=width, height=height, fps=float(fps), frame_count=int(frame_count), duration_seconds=duration)


def _parse_ratio(value: str) -> float | None:
    text = str(value or '').strip()
    if not text:
        return None
    if '/' in text:
        num, den = text.split('/', 1)
        try:
            den_f = float(den)
            if den_f == 0:
                return None
            return float(num) / den_f
        except Exception:
            return None
    try:
        return float(text)
    except Exception:
        return None


def _iter_rgb_frames(path: str, *, width: int, height: int):
    frame_size = int(width) * int(height) * 3
    proc = subprocess.Popen(
        [
            'ffmpeg',
            '-v',
            'error',
            '-i',
            path,
            '-f',
            'rawvideo',
            '-pix_fmt',
            'rgb24',
            'pipe:1',
        ],
        stdout=subprocess.PIPE,
        bufsize=frame_size * 2,
    )
    assert proc.stdout is not None
    try:
        while True:
            buf = proc.stdout.read(frame_size)
            if not buf or len(buf) < frame_size:
                break
            frame = np.frombuffer(buf, dtype=np.uint8).reshape((height, width, 3))
            yield frame.copy()
    finally:
        try:
            proc.stdout.close()
        except Exception:
            pass
        proc.wait(timeout=60)


def _detect_bbox(face_mesh, frame_rgb: np.ndarray, w: int, h: int, *, pad_px: int) -> dict[str, int] | None:
    raise NotImplementedError


def _load_face_detector() -> cv2.CascadeClassifier:
    cascade_path = str(Path(cv2.data.haarcascades) / 'haarcascade_frontalface_default.xml')
    detector = cv2.CascadeClassifier(cascade_path)
    if detector.empty():
        raise RuntimeError(f'Could not load OpenCV face cascade: {cascade_path}')
    return detector


def _detect_bbox_opencv(
    detector: cv2.CascadeClassifier,
    frame_rgb: np.ndarray,
    w: int,
    h: int,
    *,
    pad_px: int,
) -> dict[str, int] | None:
    gray = cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2GRAY)
    faces = detector.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(40, 40))
    if faces is None or len(faces) == 0:
        return None
    # Pick largest detected face.
    x, y, fw, fh = max(faces, key=lambda r: int(r[2]) * int(r[3]))
    x0 = int(max(0, x - pad_px))
    y0 = int(max(0, y - pad_px))
    x1 = int(min(w, x + fw + pad_px))
    y1 = int(min(h, y + fh + pad_px))
    bw = max(2, x1 - x0)
    bh = max(2, y1 - y0)
    return {'x': int(x0), 'y': int(y0), 'w': int(bw), 'h': int(bh)}


def _center_box(w: int, h: int) -> dict[str, int]:
    bw = int(w * 0.45)
    bh = int(h * 0.35)
    x = int((w - bw) / 2)
    y = int(h * 0.18)
    return {'x': x, 'y': y, 'w': max(2, bw), 'h': max(2, bh)}


def _ema_box(prev: dict[str, int], cur: dict[str, int], *, alpha: float) -> dict[str, int]:
    def blend(a: int, b: int) -> int:
        return int(round(alpha * b + (1.0 - alpha) * a))
    return {
        'x': blend(prev['x'], cur['x']),
        'y': blend(prev['y'], cur['y']),
        'w': max(2, blend(prev['w'], cur['w'])),
        'h': max(2, blend(prev['h'], cur['h'])),
    }


def _crop_from_box(frame: np.ndarray, box: dict[str, int]) -> np.ndarray:
    x, y, w, h = int(box['x']), int(box['y']), int(box['w']), int(box['h'])
    return frame[y : y + h, x : x + w, :]


def _make_even(value: int) -> int:
    v = int(value)
    return v if v % 2 == 0 else v + 1


def _median(values: list[int]) -> float:
    if not values:
        return 0.0
    n = len(values)
    mid = n // 2
    if n % 2 == 1:
        return float(values[mid])
    return (float(values[mid - 1]) + float(values[mid])) / 2.0


def _resize_rgb(frame: np.ndarray, target_w: int, target_h: int) -> np.ndarray:
    return cv2.resize(frame, (int(target_w), int(target_h)), interpolation=cv2.INTER_LINEAR)


def _feathered_oval_mask(w: int, h: int, *, blur_radius: int) -> np.ndarray:
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    cx = (w - 1) / 2.0
    cy = (h - 1) / 2.0
    rx = w * 0.42
    ry = h * 0.46
    norm = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2
    mask = (norm <= 1.0).astype(np.float32)
    # Feather edges with a gaussian blur (numpy-only approximation).
    if blur_radius <= 0:
        return mask
    return _gaussian_blur(mask, radius=int(blur_radius))


def _gaussian_blur(img: np.ndarray, *, radius: int) -> np.ndarray:
    # Separable gaussian blur, small radius only (e.g. 15).
    sigma = max(1.0, float(radius) / 3.0)
    k = int(radius) * 2 + 1
    x = np.arange(k, dtype=np.float32) - float(radius)
    kernel = np.exp(-(x * x) / (2.0 * sigma * sigma))
    kernel = kernel / max(1e-6, float(kernel.sum()))

    tmp = np.apply_along_axis(lambda m: np.convolve(m, kernel, mode='same'), axis=1, arr=img)
    out = np.apply_along_axis(lambda m: np.convolve(m, kernel, mode='same'), axis=0, arr=tmp)
    return out.clip(0.0, 1.0).astype(np.float32)


def _resize_mask(mask: np.ndarray, target_w: int, target_h: int) -> np.ndarray:
    return cv2.resize(mask, (int(target_w), int(target_h)), interpolation=cv2.INTER_LINEAR).astype(np.float32)
