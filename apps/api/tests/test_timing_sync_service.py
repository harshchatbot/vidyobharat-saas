from __future__ import annotations

import wave
from pathlib import Path

from app.services.timing_sync_service import TimingSyncService


def _write_silent_wav(path: Path, *, duration_ms: int) -> None:
    frame_rate = 8000
    sample_width = 2
    channels = 1
    frame_count = int(frame_rate * (duration_ms / 1000.0))
    silence = b"\x00\x00" * frame_count
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(channels)
        handle.setsampwidth(sample_width)
        handle.setframerate(frame_rate)
        handle.writeframes(silence)


def test_timing_sync_builds_timeline_with_pause(tmp_path: Path) -> None:
    service = TimingSyncService(pause_after_line_ms=300)
    first = tmp_path / "first.wav"
    second = tmp_path / "second.wav"
    _write_silent_wav(first, duration_ms=400)
    _write_silent_wav(second, duration_ms=600)

    segments = [
        {"text": "Hello there", "audio_path": str(first), "duration_ms": 400},
        {"text": "How are you", "audio_path": str(second), "duration_ms": 600},
    ]

    timing_map = service.build_timing_map(segments)
    assert timing_map[0]["start_ms"] == 0
    assert timing_map[0]["end_ms"] == 400
    assert timing_map[0]["pause_after_ms"] == 350
    assert timing_map[1]["start_ms"] == 750
    assert timing_map[1]["end_ms"] == 1350


def test_timing_sync_merges_audio_segments(tmp_path: Path) -> None:
    service = TimingSyncService(pause_after_line_ms=300)
    first = tmp_path / "first.wav"
    second = tmp_path / "second.wav"
    output = tmp_path / "merged.wav"
    _write_silent_wav(first, duration_ms=400)
    _write_silent_wav(second, duration_ms=600)

    merged = service.merge_audio(
        [
            {"text": "Hello there", "audio_path": str(first), "duration_ms": 400},
            {"text": "How are you", "audio_path": str(second), "duration_ms": 600},
        ],
        output,
    )

    assert merged.exists()
    with wave.open(str(merged), "rb") as handle:
        duration_ms = int((handle.getnframes() / handle.getframerate()) * 1000)
    assert 1330 <= duration_ms <= 1370


def test_timing_sync_smart_split_breaks_long_sentences() -> None:
    service = TimingSyncService()
    result = service.smart_split(
        "This is a long sentence that should be broken into smaller chunks for better avatar pacing and timing."
    )
    assert len(result) == 2
    assert all(result)


def test_timing_sync_builds_speaking_segments() -> None:
    service = TimingSyncService()
    speaking_segments = service.build_speaking_segments(
        [
            {"start_ms": 0, "end_ms": 400},
            {"start_ms": 750, "end_ms": 1350},
        ]
    )
    assert speaking_segments == [{"start": 0, "end": 400}, {"start": 750, "end": 1350}]
