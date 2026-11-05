"""Evidence-only video analysis. No LLM and no mutations to the uploaded source.

Run only after guest ownership and file-size checks in editor_routes.py.
All timestamps are SOURCE-VIDEO seconds. Optional analyzers report availability
honestly; they never invent a face, pause, transcript, or scene change.
"""
from __future__ import annotations

import json
import math
import os
import re
import subprocess
from pathlib import Path

from app.schemas.video_analysis import (
    AudioEvidence, BoundingBox, EditingCapabilities, FaceSample, Interval,
    MediaInfo, SpeechEvidence, StylePreset, VideoAnalysisReport, VisualEvidence, Word,
)

from app.services.video_analysis_timing import assess_timing, semantic_segments, safe_cut_candidates

MAX_ANALYSIS_SECONDS = 65
MAX_FACE_SAMPLES = 65
EFFECTS = [
    "fade-in", "fade-out", "zoom-in", "zoom-out", "punch-zoom",
    "flash", "grayscale", "blur", "brightness", "contrast",
    "vibrance", "vignette", "saturation", "sepia", "hue-rotate",
    "invert", "warm", "cool",
]


def _command(args: list[str], *, timeout: int = 60) -> str:
    result = subprocess.run(args, capture_output=True, text=True, timeout=timeout, check=True)
    return result.stdout + result.stderr


def probe_video(path: Path, media_id: str) -> MediaInfo:
    raw = _command(["ffprobe", "-v", "error", "-show_format", "-show_streams",
                    "-of", "json", str(path)], timeout=20)
    payload = json.loads(raw)
    streams = payload.get("streams", [])
    video = next((item for item in streams if item.get("codec_type") == "video"), None)
    if not video:
        raise ValueError("The uploaded file has no video stream.")
    fps_text = video.get("avg_frame_rate") or video.get("r_frame_rate") or "0/1"
    try:
        num, den = (float(piece) for piece in str(fps_text).split("/", 1))
        fps = num / den
    except (TypeError, ValueError, ZeroDivisionError):
        fps = 0
    duration = float(video.get("duration") or payload.get("format", {}).get("duration") or 0)
    width, height = int(video.get("width") or 0), int(video.get("height") or 0)
    if not (0.1 < duration <= MAX_ANALYSIS_SECONDS and 0 < fps <= 240 and width > 0 and height > 0):
        raise ValueError("Video metadata is invalid or exceeds the 65-second analysis limit.")
    from math import gcd
    common = gcd(width, height)
    return MediaInfo(
        media_id=media_id, duration_seconds=round(duration, 3),
        width=width, height=height, fps=round(fps, 3),
        aspect_ratio=f"{width // common}:{height // common}",
        has_audio=any(item.get("codec_type") == "audio" for item in streams),
    )


def parse_silence_log(log: str, duration: float) -> list[Interval]:
    events: list[Interval] = []
    started: float | None = None
    for line in log.splitlines():
        start = re.search(r"silence_start:\s*([0-9.]+)", line)
        end = re.search(r"silence_end:\s*([0-9.]+)", line)
        if start:
            started = float(start.group(1))
        if end and started is not None:
            finish = min(duration, float(end.group(1)))
            if finish - started >= 0.35:
                events.append(Interval(start=max(0, started), end=finish))
            started = None
    if started is not None and duration - started >= 0.35:
        events.append(Interval(start=max(0, started), end=duration))
    return events


def measure_silences(path: Path, duration: float) -> list[Interval]:
    # FFmpeg prints silence events to stderr. Downsample and cap input duration.
    output = _command(["ffmpeg", "-nostdin", "-hide_banner", "-i", str(path),
                       "-t", str(duration), "-vn", "-af",
                       "silencedetect=noise=-35dB:d=0.4", "-f", "null", "-"],
                      timeout=45)
    return parse_silence_log(output, duration)


def speech_pauses(words: list[Word], duration: float) -> list[Interval]:
    """Speech-timestamp gaps, not a claim that the audio is silent."""
    if not words:
        return []
    gaps: list[Interval] = []
    previous_end = 0.0
    for word in words:
        if word.start - previous_end >= 0.65:
            gaps.append(Interval(start=round(previous_end, 3), end=round(word.start, 3)))
        previous_end = max(previous_end, word.end)
    if duration - previous_end >= 0.65:
        gaps.append(Interval(start=round(previous_end, 3), end=duration))
    return gaps


def scene_changes(path: Path, duration: float) -> list[float]:
    # Limit inspection to <=3 frames/sec and at most 65 seconds.
    log = _command([
        "ffmpeg", "-nostdin", "-hide_banner", "-i", str(path),
        "-t", str(duration), "-vf", r"fps=3,select='gt(scene,0.35)',showinfo",
        "-an", "-f", "null", "-",
    ], timeout=60)
    points: list[float] = []
    for line in log.splitlines():
        if "showinfo" not in line:
            continue
        match = re.search(r"pts_time:\s*([0-9.]+)", line)
        if match:
            value = round(float(match.group(1)), 3)
            if 0.1 < value < duration and (not points or value - points[-1] >= 0.5):
                points.append(value)
    return points[:100]


def detect_faces(path: Path, duration: float) -> tuple[str, list[FaceSample]]:
    """YuNet is opt-in: the verified ONNX weight file must be installed locally."""
    model_file = os.environ.get("RANGMANCH_YUNET_MODEL_PATH", "").strip()
    if not model_file or not Path(model_file).is_file():
        return "unavailable", []
    try:
        import cv2
        detector = cv2.FaceDetectorYN_create(model_file, "", (320, 320), 0.75, 0.3, 5000)
        cap = cv2.VideoCapture(str(path))
        if not cap.isOpened():
            return "unavailable", []
        samples: list[FaceSample] = []
        try:
            for second in range(min(math.ceil(duration), MAX_FACE_SAMPLES)):
                cap.set(cv2.CAP_PROP_POS_MSEC, second * 1000)
                ok, frame = cap.read()
                if not ok:
                    continue
                height, width = frame.shape[:2]
                if width <= 0 or height <= 0:
                    continue
                detector.setInputSize((width, height))
                _, faces = detector.detect(frame)
                if faces is None:
                    continue
                # Largest reliable face, with normalized frame coordinates.
                ordered = sorted(faces, key=lambda face: float(face[2] * face[3]), reverse=True)
                face = ordered[0]
                confidence = float(face[-1])
                if confidence < 0.75:
                    continue
                x, y, w, h = [float(value) for value in face[:4]]
                left, top = max(0, x) / width, max(0, y) / height
                right, bottom = min(width, x + w) / width, min(height, y + h) / height
                if right <= left or bottom <= top:
                    continue
                samples.append(FaceSample(
                    time=float(second), confidence=min(1.0, max(0.0, confidence)),
                    box=BoundingBox(x=left, y=top, width=right - left, height=bottom - top),
                ))
        finally:
            cap.release()
        return ("complete" if samples else "no_faces"), samples
    except (ImportError, OSError, RuntimeError, AttributeError, ValueError):
        return "unavailable", []


def normalize_transcript(payload: dict | None, duration: float) -> SpeechEvidence:
    if payload is None:
        return SpeechEvidence(status="unavailable")
    if not isinstance(payload, dict) or not isinstance(payload.get("words"), list):
        raise ValueError("Transcription returned an invalid word list.")
    words: list[Word] = []
    for raw in payload["words"][:1000]:
        try:
            word = Word.model_validate(raw)
        except Exception as exc:
            raise ValueError("Transcription contains an invalid word timestamp.") from exc
        if word.end > duration + 0.1:
            continue
        words.append(word)
    words.sort(key=lambda word: word.start)
    language = payload.get("language")
    return SpeechEvidence(
        status="complete" if words else "no_speech",
        language=str(language)[:32] if language else None,
        words=words,
    )


def editing_capabilities(selected_style: str) -> EditingCapabilities:
    presets = [
        StylePreset(name="elegant", pacing="relaxed", preferred_zoom="zoom-in", transition="crossfade", effect_amount=0.65),
        StylePreset(name="energetic", pacing="fast", preferred_zoom="zoom-in", transition="slide-left", effect_amount=1.15),
        StylePreset(name="cinematic", pacing="measured", preferred_zoom="zoom-out", transition="crossfade", effect_amount=0.55),
    ]
    if selected_style not in {preset.name for preset in presets}:
        raise ValueError("Unsupported editing style.")
    return EditingCapabilities(
        selected_style=selected_style, available_styles=presets,
        supported_effects=EFFECTS, max_timeline_seconds=60,
        max_plan_operations=160,
        rules=[
            "Preserve spoken words; do not create quotes or claims not in the transcript.",
            "All timings refer to the original source recording in seconds.",
            "Never cut through spoken words; keep breathing room around phrases.",
            "Do not place caption overlays on detected faces or in platform unsafe zones.",
            "Only use the supported effect and transition vocabulary.",
            "Missing analysis evidence must not be replaced by invented observations.",
            "Human review is required before committing planned edits.",
        ],
    )


def build_video_analysis_report(
    path: Path, media_id: str, *, transcript: dict | None = None,
    style: str = "elegant",
) -> VideoAnalysisReport:
    media = probe_video(path, media_id)
    speech = normalize_transcript(transcript, media.duration_seconds)
    warnings: list[str] = []
    if not media.has_audio:
        speech = SpeechEvidence(status="no_speech")
    elif speech.status == "unavailable":
        warnings.append("Speech recognition unavailable; the report contains no transcript.")
    if media.has_audio:
        try:
            silences = measure_silences(path, media.duration_seconds)
            audio_status = "complete"
        except (OSError, subprocess.SubprocessError, ValueError):
            silences = []
            audio_status = "unavailable"
            warnings.append("Audio silence detection was unavailable.")
    else:
        silences, audio_status = [], "no_audio"

    face_status, samples = detect_faces(path, media.duration_seconds)
    if face_status == "unavailable":
        warnings.append("Face detection unavailable; configure a local YuNet ONNX model.")
    try:
        cuts, scene_status = scene_changes(path, media.duration_seconds), "complete"
    except (OSError, subprocess.SubprocessError, ValueError):
        cuts, scene_status = [], "unavailable"
        warnings.append("Scene-change detection was unavailable.")

    # Preserve raw words; annotate disagreements rather than shifting Whisper
    # timestamps onto low-energy audio regions.
    quality = assess_timing(speech.words, silences, audio_status == "complete", media.duration_seconds)
    speech.segments = semantic_segments(speech.words, quality.conflicts)
    candidates = (
        safe_cut_candidates(silences, speech.words, quality.conflicts, media.duration_seconds)
        if audio_status == "complete" and speech.status == "complete"
        else []
    )
    if quality.status == "review_required":
        warnings.append(f"{quality.conflict_count} speech/silence timing conflicts require review; unsafe cuts were excluded.")
    if speech.status != "complete":
        warnings.append("No verified transcript; no candidate cuts were generated.")

    return VideoAnalysisReport(
        media=media, speech=speech,
        audio=AudioEvidence(status=audio_status, silence_intervals=silences,
                            speech_pause_intervals=speech_pauses(speech.words, media.duration_seconds),
                            timing_quality=quality, safe_cut_candidates=candidates),
        visual=VisualEvidence(
            face_status=face_status, scene_status=scene_status, face_samples=samples,
            scene_changes_seconds=cuts,
        ),
        editing=editing_capabilities(style), warnings=warnings,
    )
