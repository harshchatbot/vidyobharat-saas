from __future__ import annotations

import json
import logging
import math
import os
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence


logger = logging.getLogger(__name__)


class EditorServiceError(RuntimeError):
    """Base error for local editor media operations."""


class EditorValidationError(EditorServiceError):
    """Raised when an editor request is invalid."""


class MediaProbeError(EditorServiceError):
    """Raised when FFprobe cannot inspect a media file."""


class MediaTrimError(EditorServiceError):
    """Raised when FFmpeg cannot produce a valid trimmed video."""


@dataclass(frozen=True)
class MediaInfo:
    duration_seconds: float
    has_video: bool
    has_audio: bool
    video_codec: str | None
    audio_codec: str | None


class EditorService:
    def __init__(
        self,
        *,
        ffmpeg_binary: str = "ffmpeg",
        ffprobe_binary: str = "ffprobe",
        command_timeout_seconds: float = 300.0,
    ) -> None:
        try:
            timeout = float(command_timeout_seconds)
        except (TypeError, ValueError) as exc:
            raise EditorValidationError("Command timeout must be a positive finite number") from exc
        if not math.isfinite(timeout) or timeout <= 0:
            raise EditorValidationError("Command timeout must be a positive finite number")
        self.ffmpeg_binary = ffmpeg_binary
        self.ffprobe_binary = ffprobe_binary
        self.command_timeout_seconds = timeout

    def inspect_media(self, path: str | Path) -> MediaInfo:
        media_path = self._require_input_file(path)
        logger.info("editor_media_probe_started", extra={"path": str(media_path)})

        command = [
            self.ffprobe_binary,
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_streams",
            "-show_format",
            str(media_path),
        ]
        completed = self._run(command, MediaProbeError, "FFprobe failed")

        try:
            payload: dict[str, Any] = json.loads(completed.stdout or "{}")
        except json.JSONDecodeError as exc:
            raise MediaProbeError("FFprobe returned invalid JSON") from exc

        streams = payload.get("streams")
        if not isinstance(streams, list):
            raise MediaProbeError("FFprobe returned no stream metadata")

        video_stream = next(
            (stream for stream in streams if isinstance(stream, dict) and stream.get("codec_type") == "video"),
            None,
        )
        audio_stream = next(
            (stream for stream in streams if isinstance(stream, dict) and stream.get("codec_type") == "audio"),
            None,
        )
        duration = self._read_duration(payload, streams)
        info = MediaInfo(
            duration_seconds=duration,
            has_video=video_stream is not None,
            has_audio=audio_stream is not None,
            video_codec=str(video_stream.get("codec_name")) if video_stream and video_stream.get("codec_name") else None,
            audio_codec=str(audio_stream.get("codec_name")) if audio_stream and audio_stream.get("codec_name") else None,
        )
        logger.info(
            "editor_media_probe_completed",
            extra={
                "path": str(media_path),
                "duration_seconds": info.duration_seconds,
                "has_video": info.has_video,
                "has_audio": info.has_audio,
            },
        )
        return info

    def get_duration(self, path: str | Path) -> float:
        return self.inspect_media(path).duration_seconds

    def trim_video(
        self,
        input_path: str | Path,
        output_path: str | Path,
        *,
        start_seconds: float,
        end_seconds: float,
    ) -> MediaInfo:
        source = self._require_input_file(input_path)
        destination = self._validate_output_path(output_path, source)
        source_info = self.inspect_media(source)
        if not source_info.has_video:
            raise EditorValidationError("Input media must contain a video stream")

        start, end = self._validate_range(start_seconds, end_seconds, source_info.duration_seconds)
        trim_duration = end - start
        logger.info(
            "editor_video_trim_started",
            extra={
                "input_path": str(source),
                "output_path": str(destination),
                "start_seconds": start,
                "end_seconds": end,
            },
        )

        temporary_path = self._temporary_output_path(destination)
        command = [
            self.ffmpeg_binary,
            "-hide_banner",
            "-loglevel",
            "error",
            "-nostdin",
            "-y",
            "-i",
            str(source),
            "-ss",
            self._format_timestamp(start),
            "-t",
            self._format_timestamp(trim_duration),
            "-map",
            "0:v:0",
            "-map",
            "0:a:0?",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "20",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-movflags",
            "+faststart",
            str(temporary_path),
        ]

        try:
            self._run(command, MediaTrimError, "FFmpeg trim failed")
            if not temporary_path.is_file() or temporary_path.stat().st_size <= 0:
                raise MediaTrimError("FFmpeg did not create a non-empty output file")

            output_info = self.inspect_media(temporary_path)
            self._validate_trimmed_output(output_info, source_info, trim_duration)
            os.replace(temporary_path, destination)
        finally:
            temporary_path.unlink(missing_ok=True)

        logger.info(
            "editor_video_trim_completed",
            extra={
                "output_path": str(destination),
                "duration_seconds": output_info.duration_seconds,
                "has_audio": output_info.has_audio,
            },
        )
        return output_info

    def _run(
        self,
        command: Sequence[str],
        error_type: type[EditorServiceError],
        message: str,
    ) -> subprocess.CompletedProcess[str]:
        try:
            return subprocess.run(
                list(command),
                check=True,
                capture_output=True,
                text=True,
                timeout=self.command_timeout_seconds,
            )
        except FileNotFoundError as exc:
            raise error_type(f"Required media binary was not found: {command[0]}") from exc
        except OSError as exc:
            raise error_type(f"Could not execute required media binary {command[0]}: {exc}") from exc
        except subprocess.TimeoutExpired as exc:
            raise error_type(f"{message}: command timed out") from exc
        except subprocess.CalledProcessError as exc:
            detail = (exc.stderr or exc.stdout or "unknown error").strip()
            raise error_type(f"{message}: {detail[:1200]}") from exc

    @staticmethod
    def _require_input_file(path: str | Path) -> Path:
        candidate = Path(path).expanduser()
        if not candidate.exists():
            raise EditorValidationError(f"Input file does not exist: {candidate}")
        if not candidate.is_file():
            raise EditorValidationError(f"Input path is not a file: {candidate}")
        return candidate.resolve()

    @staticmethod
    def _validate_output_path(path: str | Path, source: Path) -> Path:
        candidate = Path(path).expanduser()
        if candidate.suffix.lower() != ".mp4":
            raise EditorValidationError("Output path must use the .mp4 extension")
        if not candidate.parent.exists() or not candidate.parent.is_dir():
            raise EditorValidationError(f"Output directory does not exist: {candidate.parent}")
        if candidate.is_symlink():
            raise EditorValidationError("Output path must not be a symbolic link")
        destination = candidate.parent.resolve() / candidate.name
        if destination == source or (destination.exists() and destination.samefile(source)):
            raise EditorValidationError("Input and output paths must be different")
        if destination.exists() and not destination.is_file():
            raise EditorValidationError(f"Output path is not a file: {destination}")
        return destination

    @staticmethod
    def _validate_range(start_seconds: float, end_seconds: float, duration_seconds: float) -> tuple[float, float]:
        try:
            start = float(start_seconds)
            end = float(end_seconds)
        except (TypeError, ValueError) as exc:
            raise EditorValidationError("Trim timestamps must be numeric") from exc
        if not math.isfinite(start) or not math.isfinite(end):
            raise EditorValidationError("Trim timestamps must be finite")
        if start < 0:
            raise EditorValidationError("Trim start must be zero or greater")
        if end <= start:
            raise EditorValidationError("Trim end must be greater than trim start")
        if start >= duration_seconds:
            raise EditorValidationError("Trim start must be before the end of the input video")
        if end > duration_seconds + 0.001:
            raise EditorValidationError("Trim end exceeds the input video duration")
        return start, min(end, duration_seconds)

    @staticmethod
    def _read_duration(payload: dict[str, Any], streams: list[Any]) -> float:
        candidates = [(payload.get("format") or {}).get("duration")]
        candidates.extend(stream.get("duration") for stream in streams if isinstance(stream, dict))
        for raw_duration in candidates:
            try:
                duration = float(raw_duration)
            except (TypeError, ValueError):
                continue
            if math.isfinite(duration) and duration > 0:
                return duration
        raise MediaProbeError("Media duration is missing or invalid")

    @staticmethod
    def _temporary_output_path(destination: Path) -> Path:
        descriptor, name = tempfile.mkstemp(
            prefix=f".{destination.stem}-",
            suffix=".mp4",
            dir=destination.parent,
        )
        os.close(descriptor)
        return Path(name)

    @staticmethod
    def _format_timestamp(value: float) -> str:
        return f"{value:.6f}"

    @staticmethod
    def _validate_trimmed_output(output: MediaInfo, source: MediaInfo, requested_duration: float) -> None:
        if not output.has_video:
            raise MediaTrimError("Trimmed output does not contain a video stream")
        if output.video_codec != "h264":
            raise MediaTrimError("Trimmed output is not H.264 video")
        if source.has_audio and (not output.has_audio or output.audio_codec != "aac"):
            raise MediaTrimError("Trimmed output does not contain AAC audio")
        if not source.has_audio and output.has_audio:
            raise MediaTrimError("Trimmed output unexpectedly contains an audio stream")
        tolerance = max(0.12, requested_duration * 0.05)
        if abs(output.duration_seconds - requested_duration) > tolerance:
            raise MediaTrimError(
                "Trimmed output duration differs from the requested range "
                f"({output.duration_seconds:.3f}s vs {requested_duration:.3f}s)"
            )
