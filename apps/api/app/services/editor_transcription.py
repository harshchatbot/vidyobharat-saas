"""Optional local speech-to-text engine for short editor recordings.

Install faster-whisper separately on the API worker. Models are downloaded on first
use; review model-weight licensing before commercial deployment.
"""
from __future__ import annotations

import os
import subprocess
import tempfile
from collections import OrderedDict
from copy import deepcopy
from hashlib import sha256
from pathlib import Path
from threading import Lock

MAX_INPUT_BYTES = 100 * 1024 * 1024
MAX_TRANSCRIPT_CACHE_ENTRIES = 24

# The editor may ask for the same guest recording more than once (for example
# when a user closes and reopens the Auto Edit preview). Keep both the model and
# completed transcript in this local worker process so a retry does not download
# or initialise Whisper again. The media endpoint remains owner-scoped; these
# caches are only an implementation detail behind that check.
_cache_lock = Lock()
_models: dict[str, object] = {}
_transcripts: OrderedDict[str, dict] = OrderedDict()


def _model(model_name: str):
    with _cache_lock:
        cached = _models.get(model_name)
        if cached is not None:
            return cached

        try:
            from faster_whisper import WhisperModel
        except ImportError as exc:
            raise RuntimeError("Local transcription is not installed. Install faster-whisper on the API worker.") from exc

        model = WhisperModel(model_name, device="cpu", compute_type="int8")
        _models[model_name] = model
        return model


def _cached_transcript(content_hash: str) -> dict | None:
    with _cache_lock:
        cached = _transcripts.get(content_hash)
        if cached is None:
            return None
        _transcripts.move_to_end(content_hash)
        return deepcopy(cached)


def _store_transcript(content_hash: str, transcript: dict) -> dict:
    with _cache_lock:
        _transcripts[content_hash] = deepcopy(transcript)
        _transcripts.move_to_end(content_hash)
        while len(_transcripts) > MAX_TRANSCRIPT_CACHE_ENTRIES:
            _transcripts.popitem(last=False)
    return deepcopy(transcript)


def clear_transcription_caches_for_testing() -> None:
    with _cache_lock:
        _models.clear()
        _transcripts.clear()


def transcribe_video_bytes(data: bytes) -> dict:
    if not data or len(data) > MAX_INPUT_BYTES:
        raise ValueError("Video is empty or exceeds the 100 MB transcription limit.")
    content_hash = sha256(data).hexdigest()
    cached = _cached_transcript(content_hash)
    if cached is not None:
        return cached

    with tempfile.TemporaryDirectory(prefix="rangmanch-stt-") as temp_dir:
        video = Path(temp_dir) / "source.mp4"
        audio = Path(temp_dir) / "speech.wav"
        video.write_bytes(data)
        try:
            subprocess.run(
                ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error",
                 "-y", "-i", str(video), "-t", "65", "-vn", "-ac", "1",
                 "-ar", "16000", str(audio)],
                check=True, timeout=45, capture_output=True,
            )
        except (FileNotFoundError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
            raise ValueError("Unable to decode audio from this recording.") from exc

        model_name = os.getenv("RANGMANCH_STT_MODEL", "small")
        model = _model(model_name)
        segments, info = model.transcribe(
            str(audio), beam_size=5, word_timestamps=True, vad_filter=True,
            condition_on_previous_text=False,
        )
        words = []
        for segment in segments:
            for word in segment.words or []:
                start, end = float(word.start), float(word.end)
                if 0 <= start < end <= 65 and word.word.strip():
                    words.append({"text": word.word.strip(), "start": start, "end": end})
                if len(words) >= 1000:
                    break
            if len(words) >= 1000:
                break
        return _store_transcript(content_hash, {"language": info.language, "words": words})
