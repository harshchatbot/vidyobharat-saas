from __future__ import annotations

import wave
from pathlib import Path
from typing import Any

try:
    from pydub import AudioSegment
except ModuleNotFoundError:  # pragma: no cover - exercised through wav fallback paths
    AudioSegment = None  # type: ignore[assignment]


class AudioAnalysisService:
    def extract_audio_energy(self, audio_path: str | Path, *, bucket_count: int = 20) -> list[float]:
        resolved_path = Path(audio_path)
        if not resolved_path.exists():
            raise RuntimeError(f"Audio file not found for energy analysis: {resolved_path}")

        if AudioSegment is not None:
            audio = AudioSegment.from_file(resolved_path)
            samples = audio.get_array_of_samples()
        else:
            with wave.open(str(resolved_path), "rb") as handle:
                samples = handle.readframes(handle.getnframes())
                sample_width = handle.getsampwidth()
                if sample_width != 2:
                    raise RuntimeError("WAV fallback energy analysis currently expects 16-bit PCM audio")
                import array

                samples = array.array("h", samples)

        sample_count = len(samples)
        if sample_count <= 0:
            return []

        chunk_count = max(1, int(bucket_count or 20))
        chunk_size = max(1, int(sample_count / chunk_count))
        energy_levels: list[float] = []

        for index in range(0, sample_count, chunk_size):
            chunk = samples[index : index + chunk_size]
            if len(chunk) <= 0:
                continue
            energy = sum(abs(int(value)) for value in chunk) / len(chunk)
            energy_levels.append(float(energy))

        return energy_levels

    def normalize_energy(self, energy_levels: list[float] | None) -> list[float]:
        if not energy_levels:
            return []
        max_val = max(float(level) for level in energy_levels) or 1.0
        return [float(level) / max_val for level in energy_levels]

    def map_energy_to_expression(self, level: float) -> dict[str, Any]:
        normalized = float(level or 0.0)
        if normalized > 0.7:
            return {"mouth_open": 0.9, "intensity": "high"}
        if normalized > 0.4:
            return {"mouth_open": 0.6, "intensity": "medium"}
        return {"mouth_open": 0.3, "intensity": "low"}

    def build_audio_reactive_timeline(
        self,
        energy_levels: list[float] | None,
        timing_map: list[dict[str, Any]] | None,
    ) -> list[dict[str, Any]]:
        if not energy_levels or not timing_map:
            return []

        timeline: list[dict[str, Any]] = []
        for index, segment in enumerate(timing_map):
            energy = float(energy_levels[min(index, len(energy_levels) - 1)])
            timeline.append(
                {
                    "start": int(segment.get("start_ms") or segment.get("start") or 0),
                    "end": int(segment.get("end_ms") or segment.get("end") or 0),
                    "energy": energy,
                    "expression_intensity": self.map_energy_to_expression(energy),
                }
            )
        return timeline

    def analyze_audio_reactivity(
        self,
        *,
        audio_path: str | Path,
        timing_map: list[dict[str, Any]] | None,
    ) -> list[dict[str, Any]]:
        if not timing_map:
            return []
        raw_energy = self.extract_audio_energy(audio_path, bucket_count=max(len(timing_map), 1))
        normalized = self.normalize_energy(raw_energy)
        return self.build_audio_reactive_timeline(normalized, timing_map)

    def merge_with_behavior(
        self,
        behavior_timeline: list[dict[str, Any]] | None,
        audio_reactive_timeline: list[dict[str, Any]] | None,
    ) -> list[dict[str, Any]]:
        if not behavior_timeline:
            return []
        if not audio_reactive_timeline:
            return list(behavior_timeline)

        merged: list[dict[str, Any]] = []
        for index, behavior in enumerate(behavior_timeline):
            audio_reactive = audio_reactive_timeline[min(index, len(audio_reactive_timeline) - 1)]
            entry = {
                **behavior,
                "audio_energy": audio_reactive.get("energy"),
                "audio_intensity": audio_reactive.get("expression_intensity"),
            }
            merged.append(entry)
        return merged
