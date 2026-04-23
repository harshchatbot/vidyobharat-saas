from __future__ import annotations

import math
import wave
from pathlib import Path

from app.services.audio_analysis_service import AudioAnalysisService


def _write_test_wav(path: Path) -> None:
    sample_rate = 8000
    segments = [
        (400, 0.5),
        (1600, 0.5),
        (3200, 0.5),
    ]
    frames = bytearray()

    for amplitude, seconds in segments:
        total_samples = int(sample_rate * seconds)
        for index in range(total_samples):
            sample = int(amplitude * math.sin(2 * math.pi * 220 * index / sample_rate))
            frames.extend(int(sample).to_bytes(2, byteorder="little", signed=True))

    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(sample_rate)
        handle.writeframes(bytes(frames))


def test_audio_analysis_extracts_and_normalizes_energy(tmp_path: Path) -> None:
    audio_path = tmp_path / "energy.wav"
    _write_test_wav(audio_path)
    service = AudioAnalysisService()

    energy = service.extract_audio_energy(audio_path, bucket_count=3)
    normalized = service.normalize_energy(energy)

    assert len(energy) >= 3
    assert len(normalized) == len(energy)
    assert max(normalized) == 1.0
    assert min(normalized) >= 0.0


def test_audio_analysis_builds_audio_reactive_timeline(tmp_path: Path) -> None:
    audio_path = tmp_path / "reactive.wav"
    _write_test_wav(audio_path)
    service = AudioAnalysisService()
    timing_map = [
        {"start_ms": 0, "end_ms": 500},
        {"start_ms": 500, "end_ms": 1000},
        {"start_ms": 1000, "end_ms": 1500},
    ]

    timeline = service.analyze_audio_reactivity(audio_path=audio_path, timing_map=timing_map)

    assert len(timeline) == 3
    assert timeline[0]["start"] == 0
    assert timeline[-1]["end"] == 1500
    assert timeline[0]["expression_intensity"]["intensity"] in {"low", "medium", "high"}


def test_audio_analysis_merges_audio_intensity_with_behavior() -> None:
    service = AudioAnalysisService()
    behavior_timeline = [
        {"emotion": "neutral", "smoothed_emotion": "neutral"},
        {"emotion": "excited", "smoothed_emotion": "transition_excited"},
    ]
    audio_reactive_timeline = [
        {"energy": 0.2, "expression_intensity": {"mouth_open": 0.3, "intensity": "low"}},
        {"energy": 0.9, "expression_intensity": {"mouth_open": 0.9, "intensity": "high"}},
    ]

    merged = service.merge_with_behavior(behavior_timeline, audio_reactive_timeline)

    assert merged[0]["audio_intensity"]["intensity"] == "low"
    assert merged[1]["audio_intensity"]["intensity"] == "high"
    assert merged[1]["audio_energy"] == 0.9
