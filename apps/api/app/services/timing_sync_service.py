from __future__ import annotations

import re
import wave
from pathlib import Path
from typing import Any, Callable

try:
    from pydub import AudioSegment
except ModuleNotFoundError:  # pragma: no cover - exercised through wav fallback paths
    AudioSegment = None  # type: ignore[assignment]


class TimingSyncService:
    def __init__(self, *, pause_after_line_ms: int = 300) -> None:
        self.pause_after_line_ms = max(0, int(pause_after_line_ms))

    def split_script(self, script: str) -> list[str]:
        return self.smart_split(script)

    def smart_split(self, script: str) -> list[str]:
        parts = re.split(r'(?<=[.!?])\s+', str(script or "").strip())
        final: list[str] = []

        for part in parts:
            normalized = part.strip()
            if not normalized:
                continue

            if len(normalized.split()) > 12:
                words = normalized.split()
                mid = len(words) // 2
                final.append(" ".join(words[:mid]).strip())
                final.append(" ".join(words[mid:]).strip())
            else:
                final.append(normalized)

        return [item for item in final if item]

    def get_pause(self, line: str) -> int:
        normalized = str(line or "").strip()
        if "..." in normalized:
            return 500
        if len(normalized.split()) < 6:
            return 350
        return 250

    def generate_audio_segments(
        self,
        lines: list[str],
        tts_func: Callable[[str], str | Path | None],
    ) -> list[dict[str, Any]]:
        segments: list[dict[str, Any]] = []
        for line in lines:
            audio_path = tts_func(line)
            if not audio_path:
                raise RuntimeError("TTS returned no audio path for timing segment")
            resolved_path = Path(audio_path)
            duration_ms = self._measure_duration_ms(resolved_path)
            segments.append(
                {
                    "text": line,
                    "audio_path": str(resolved_path),
                    "duration_ms": duration_ms,
                }
            )
        return segments

    def build_timing_map(self, segments: list[dict[str, Any]]) -> list[dict[str, Any]]:
        timeline: list[dict[str, Any]] = []
        current_time = 0
        for index, segment in enumerate(segments):
            duration_ms = int(segment.get("duration_ms") or 0)
            start = current_time
            end = start + duration_ms
            timeline.append(
                {
                    "text": str(segment.get("text") or ""),
                    "start_ms": start,
                    "end_ms": end,
                    "duration_ms": duration_ms,
                    "pause_after_ms": self._pause_for_segment(index=index, segments=segments),
                }
            )
            current_time = end
            if index < len(segments) - 1:
                current_time += self._pause_for_segment(index=index, segments=segments)
        return timeline

    def merge_audio(self, segments: list[dict[str, Any]], output_path: str | Path) -> Path:
        if AudioSegment is None:
            return self._merge_wav_segments(segments, output_path)

        combined = AudioSegment.empty()
        for index, segment in enumerate(segments):
            audio = AudioSegment.from_file(segment["audio_path"])
            combined += audio
            pause_duration = self._pause_for_segment(index=index, segments=segments)
            if index < len(segments) - 1 and pause_duration > 0:
                combined += AudioSegment.silent(duration=pause_duration)

        resolved_output = Path(output_path)
        resolved_output.parent.mkdir(parents=True, exist_ok=True)
        combined.export(resolved_output, format="wav")
        self._assert_drift_safe(segments=segments, merged_audio_path=resolved_output)
        return resolved_output

    def _measure_duration_ms(self, audio_path: Path) -> int:
        if AudioSegment is not None:
            return len(AudioSegment.from_file(audio_path))
        with wave.open(str(audio_path), "rb") as handle:
            return int((handle.getnframes() / float(handle.getframerate() or 1)) * 1000)

    def _merge_wav_segments(self, segments: list[dict[str, Any]], output_path: str | Path) -> Path:
        resolved_output = Path(output_path)
        resolved_output.parent.mkdir(parents=True, exist_ok=True)
        if not segments:
            raise RuntimeError("No audio segments available for merge")

        with wave.open(str(segments[0]["audio_path"]), "rb") as first_handle:
            params = first_handle.getparams()
            combined_frames = [first_handle.readframes(first_handle.getnframes())]
            silence_frames = b"\x00" * int(
                params.sampwidth * params.nchannels * params.framerate * (self.pause_after_line_ms / 1000.0)
            )

        for index, segment in enumerate(segments[1:], start=1):
            pause_duration = self._pause_for_segment(index=index - 1, segments=segments)
            if pause_duration > 0:
                silence_frames = b"\x00" * int(
                    params.sampwidth * params.nchannels * params.framerate * (pause_duration / 1000.0)
                )
                combined_frames.append(silence_frames)
            with wave.open(str(segment["audio_path"]), "rb") as handle:
                if handle.getnchannels() != params.nchannels or handle.getsampwidth() != params.sampwidth or handle.getframerate() != params.framerate:
                    raise RuntimeError("TimingSyncService requires matching WAV parameters across segments")
                combined_frames.append(handle.readframes(handle.getnframes()))

        with wave.open(str(resolved_output), "wb") as output_handle:
            output_handle.setparams(params)
            for frames in combined_frames:
                output_handle.writeframes(frames)

        self._assert_drift_safe(segments=segments, merged_audio_path=resolved_output)
        return resolved_output

    def build_speaking_segments(self, timing_map: list[dict[str, Any]] | None) -> list[dict[str, int]] | None:
        if not timing_map:
            return None
        return [
            {
                "start": int(item.get("start_ms") or 0),
                "end": int(item.get("end_ms") or 0),
            }
            for item in timing_map
        ]

    def _pause_for_segment(self, *, index: int, segments: list[dict[str, Any]]) -> int:
        if index >= len(segments) - 1:
            return 0
        if self.pause_after_line_ms > 0:
            return self.get_pause(str(segments[index].get("text") or ""))
        return 0

    def _assert_drift_safe(self, *, segments: list[dict[str, Any]], merged_audio_path: Path) -> None:
        expected_duration = sum(int(segment.get("duration_ms") or 0) for segment in segments)
        expected_duration += sum(self._pause_for_segment(index=index, segments=segments) for index in range(len(segments) - 1))
        merged_duration = self._measure_duration_ms(merged_audio_path)
        if abs(expected_duration - merged_duration) >= 50:
            raise RuntimeError(
                f"TimingSyncService drift exceeded threshold: expected={expected_duration}ms actual={merged_duration}ms"
            )
