"""Reproducible *process-cold* versus cached local transcription timings.

Run from apps/api:
  python scripts/benchmark_stt_cold.py /absolute/path/to/original.mp4

Spawns a new Python process, which has no in-memory Whisper model/transcript
cache, then repeats transcription on the same bytes to measure warm cache.
No upload, GCS download, remote API or transcript contents are printed.
Requires installed faster-whisper, its model weights and local ffmpeg.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services.editor_transcription import MAX_INPUT_BYTES, transcribe_video_bytes


def worker(path: Path):
    data = path.read_bytes()
    started = time.perf_counter()
    cold = transcribe_video_bytes(data, use_cache=False)
    cold_seconds = time.perf_counter() - started
    started = time.perf_counter()
    warm_first = transcribe_video_bytes(data)
    warm_first_seconds = time.perf_counter() - started
    started = time.perf_counter()
    warm_again = transcribe_video_bytes(data)
    warm_hit_seconds = time.perf_counter() - started
    print(json.dumps({
        "cold_no_transcript_cache_seconds": round(cold_seconds, 3),
        "warm_model_fresh_transcription_seconds": round(warm_first_seconds, 3),
        "warm_transcript_cache_hit_seconds": round(warm_hit_seconds, 3),
        "word_count": len(cold.get("words", [])),
        "results_identical": cold == warm_first == warm_again,
        "scope": "local STT only; excludes upload/download, FFmpeg analysis and API request",
    }))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("video", type=Path)
    parser.add_argument("--worker", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    if not args.video.is_file() or not 0 < args.video.stat().st_size <= MAX_INPUT_BYTES:
        parser.error("Provide a readable, nonempty local recording <=100 MB")
    if args.worker:
        worker(args.video)
        return 0
    result = subprocess.run(
        [sys.executable, str(Path(__file__).resolve()), str(args.video.resolve()), "--worker"],
        check=True, text=True, capture_output=True,
    )
    # Child emits one result line; suppress verbose model logs.
    print(result.stdout.strip().splitlines()[-1])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
