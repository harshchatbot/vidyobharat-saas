"""Optional local speech-to-text engine for short editor recordings.

Install faster-whisper separately on the API worker. Models are downloaded on first
use; review model-weight licensing before commercial deployment.
"""
from __future__ import annotations

import os
import subprocess
import tempfile
from pathlib import Path

MAX_INPUT_BYTES = 100 * 1024 * 1024


def transcribe_video_bytes(data: bytes) -> dict:
    if not data or len(data) > MAX_INPUT_BYTES:
        raise ValueError("Video is empty or exceeds the 100 MB transcription limit.")
    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:
        raise RuntimeError("Local transcription is not installed. Install faster-whisper on the API worker.") from exc

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
        model = WhisperModel(model_name, device="cpu", compute_type="int8")
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
        return {"language": info.language, "words": words}
