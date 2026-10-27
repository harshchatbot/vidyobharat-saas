from __future__ import annotations

import json
import logging
import math
import os
import selectors
import signal
import subprocess
import tempfile
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence

from app.schemas.editor import (
    TimelineClip,
    TimelineComposition,
    TimelineCropMode,
    TimelineEffectPreset,
)


logger = logging.getLogger(__name__)
_CAPACITY_LOCK = threading.Lock()
_PROCESS_CAPACITY: threading.BoundedSemaphore | None = None
_PROCESS_CAPACITY_LIMIT: int | None = None
_MAX_PROBE_OUTPUT_BYTES = 1024 * 1024
_MAX_PROBE_ERROR_BYTES = 64 * 1024


class TimelineRenderError(RuntimeError):
    """Base error for local timeline composition."""


class TimelineValidationError(TimelineRenderError):
    """Raised when a timeline or resolved source violates render constraints."""


class TimelineBusyError(TimelineRenderError):
    """Raised when this process has no free render slot."""


class TimelineProcessError(TimelineRenderError):
    """Raised when FFmpeg or FFprobe fails."""


@dataclass(frozen=True)
class TimelineRenderLimits:
    max_clips: int = 12
    max_total_duration_seconds: float = 60
    max_source_bytes: int = 500 * 1024 * 1024
    max_workspace_bytes: int = 1024 * 1024 * 1024
    max_output_bytes: int = 250 * 1024 * 1024
    max_source_pixels: int = 40_000_000
    max_output_width: int = 720
    max_output_height: int = 1280
    max_fps: int = 30
    ffmpeg_timeout_seconds: float = 300
    max_concurrent_renders: int = 1

    def validate(self) -> None:
        values = (
            self.max_clips,
            self.max_total_duration_seconds,
            self.max_source_bytes,
            self.max_workspace_bytes,
            self.max_output_bytes,
            self.max_source_pixels,
            self.max_output_width,
            self.max_output_height,
            self.max_fps,
            self.ffmpeg_timeout_seconds,
            self.max_concurrent_renders,
        )
        if any(not math.isfinite(float(value)) or value <= 0 for value in values):
            raise TimelineValidationError('Timeline render limits must be positive finite values.')
        if self.max_output_bytes > self.max_workspace_bytes:
            raise TimelineValidationError('The output limit cannot exceed the workspace limit.')


@dataclass(frozen=True)
class ResolvedTimelineMedia:
    media_id: str
    media_type: str
    path: Path
    file_size: int


@dataclass(frozen=True)
class TimelineOutputMetadata:
    duration_seconds: float
    width: int
    height: int
    fps: float
    video_codec: str
    audio_codec: str
    file_size: int
    faststart: bool


class TemporaryTimelineRender:
    def __init__(self, workspace: tempfile.TemporaryDirectory[str], path: Path, metadata: TimelineOutputMetadata) -> None:
        self._workspace = workspace
        self.path = path
        self.metadata = metadata
        self._closed = False

    def close(self) -> None:
        if not self._closed:
            self._workspace.cleanup()
            self._closed = True

    def __enter__(self) -> 'TemporaryTimelineRender':
        return self

    def __exit__(self, *_: object) -> None:
        self.close()


class TimelineRenderService:
    def __init__(
        self,
        *,
        limits: TimelineRenderLimits | None = None,
        ffmpeg_binary: str = 'ffmpeg',
        ffprobe_binary: str = 'ffprobe',
    ) -> None:
        self.limits = limits or TimelineRenderLimits()
        self.limits.validate()
        self.ffmpeg_binary = ffmpeg_binary
        self.ffprobe_binary = ffprobe_binary
        global _PROCESS_CAPACITY, _PROCESS_CAPACITY_LIMIT
        with _CAPACITY_LOCK:
            if _PROCESS_CAPACITY is None:
                _PROCESS_CAPACITY_LIMIT = self.limits.max_concurrent_renders
                _PROCESS_CAPACITY = threading.BoundedSemaphore(self.limits.max_concurrent_renders)
            elif _PROCESS_CAPACITY_LIMIT != self.limits.max_concurrent_renders:
                raise TimelineValidationError('Timeline render concurrency must be consistent within one process.')
            self._capacity = _PROCESS_CAPACITY

    def render(
        self,
        composition: TimelineComposition,
        media: Sequence[ResolvedTimelineMedia],
        *,
        reserved_workspace_bytes: int = 0,
    ) -> TemporaryTimelineRender:
        if reserved_workspace_bytes < 0 or reserved_workspace_bytes > self.limits.max_workspace_bytes:
            raise TimelineValidationError('Reserved workspace bytes are invalid.')
        if not self._capacity.acquire(blocking=False):
            raise TimelineBusyError('Local timeline render capacity is currently full.')
        workspace: tempfile.TemporaryDirectory[str] | None = None
        try:
            ordered_clips, source_by_id = self._validate_inputs(composition, media)
            workspace = tempfile.TemporaryDirectory(prefix='rangmanch-timeline-render-')
            workspace_path = Path(workspace.name).resolve()
            output = workspace_path / 'render.mp4'
            log_path = workspace_path / 'ffmpeg.log'
            command = self._build_command(composition, ordered_clips, source_by_id, output)
            logger.info(
                'timeline_render_started',
                extra={'clip_count': len(ordered_clips), 'duration_seconds': composition_duration(composition)},
            )
            self._run_ffmpeg(
                command,
                output,
                log_path,
                workspace_path,
                reserved_workspace_bytes=reserved_workspace_bytes,
            )
            metadata = self._validate_output(output, composition)
            logger.info(
                'timeline_render_completed',
                extra={'duration_seconds': metadata.duration_seconds, 'output_bytes': metadata.file_size},
            )
            result = TemporaryTimelineRender(workspace, output, metadata)
            workspace = None
            return result
        finally:
            if workspace is not None:
                workspace.cleanup()
            self._capacity.release()

    def _validate_inputs(
        self,
        composition: TimelineComposition,
        media: Sequence[ResolvedTimelineMedia],
    ) -> tuple[list[TimelineClip], dict[str, tuple[ResolvedTimelineMedia, dict[str, Any]]]]:
        if len(composition.clips) > self.limits.max_clips:
            raise TimelineValidationError(f'Timeline exceeds the {self.limits.max_clips}-clip limit.')
        total_duration = composition_duration(composition)
        if total_duration > self.limits.max_total_duration_seconds + 1e-6:
            raise TimelineValidationError('Timeline exceeds the configured duration limit.')
        if (
            composition.width > self.limits.max_output_width
            or composition.height > self.limits.max_output_height
            or composition.fps > self.limits.max_fps
        ):
            raise TimelineValidationError('Timeline output resolution or frame rate exceeds the configured V1 limit.')

        provided: dict[str, ResolvedTimelineMedia] = {}
        total_bytes = 0
        for item in media:
            if item.media_id in provided:
                raise TimelineValidationError('Resolved media IDs must be unique.')
            if item.media_type not in {'image', 'video', 'audio'}:
                raise TimelineValidationError('Resolved media type must be image, video, or audio.')
            source = self._require_regular_file(item.path)
            actual_size = source.stat().st_size
            if item.file_size != actual_size or actual_size <= 0:
                raise TimelineValidationError('Resolved media size does not match the source file.')
            total_bytes += actual_size
            provided[item.media_id] = ResolvedTimelineMedia(item.media_id, item.media_type, source, actual_size)
        if total_bytes > self.limits.max_source_bytes:
            raise TimelineValidationError('Timeline source media exceeds the configured byte limit.')

        source_by_id: dict[str, tuple[ResolvedTimelineMedia, dict[str, Any]]] = {}
        requested_ids = {clip.media_id for clip in composition.clips}
        requested_ids.update(item.media_id for item in composition.audio_items)
        if requested_ids != set(provided):
            raise TimelineValidationError('Every timeline media ID must resolve exactly once.')
        for media_id, item in provided.items():
            probe = self._probe(item.path, require_visual=item.media_type != 'audio')
            if item.media_type == 'audio':
                if not self._has_audio(probe):
                    raise TimelineValidationError('Timeline audio media has no decodable audio stream.')
            else:
                width, height = self._probe_dimensions(probe)
                if width * height > self.limits.max_source_pixels:
                    raise TimelineValidationError('Timeline source dimensions exceed the configured pixel limit.')
            source_by_id[media_id] = (item, probe)
        for clip in composition.clips:
            frame_count = clip.duration_seconds * composition.fps
            if frame_count < 1 - 1e-9:
                raise TimelineValidationError('Each timeline clip must be at least one output frame long.')
            item, probe = source_by_id[clip.media_id]
            if item.media_type == 'image':
                if clip.start_seconds != 0:
                    raise TimelineValidationError('Image clips cannot have a non-zero start time.')
            else:
                duration = self._probe_visual_duration(probe)
                if clip.start_seconds + clip.duration_seconds > duration + 1e-6:
                    raise TimelineValidationError('A video clip exceeds its source duration.')
        for audio in composition.audio_items:
            item, probe = source_by_id[audio.media_id]
            if item.media_type != 'audio':
                raise TimelineValidationError('Timeline audio items must reference uploaded audio media.')
            duration = self._probe_audio_duration(probe)
            if audio.source_start_seconds + audio.duration_seconds > duration + 1e-6:
                raise TimelineValidationError('An audio item exceeds its source duration.')
        return sorted(composition.clips, key=lambda clip: clip.order), source_by_id

    def _build_command(
        self,
        composition: TimelineComposition,
        clips: Sequence[TimelineClip],
        source_by_id: dict[str, tuple[ResolvedTimelineMedia, dict[str, Any]]],
        output: Path,
    ) -> list[str]:
        command = [self.ffmpeg_binary, '-hide_banner', '-loglevel', 'error', '-nostdin', '-y']
        for clip in clips:
            source, _ = source_by_id[clip.media_id]
            if source.media_type == 'image':
                command.extend(['-loop', '1', '-framerate', str(composition.fps), '-i', str(source.path)])
            else:
                command.extend(['-i', str(source.path)])
        audio_input_indices: dict[str, int] = {}
        for audio_offset, audio in enumerate(composition.audio_items):
            source, _ = source_by_id[audio.media_id]
            audio_input_indices[audio.id] = len(clips) + audio_offset
            command.extend(['-i', str(source.path)])

        filters: list[str] = []
        concat_inputs: list[str] = []
        for index, clip in enumerate(clips):
            source, probe = source_by_id[clip.media_id]
            duration = format_seconds(clip.duration_seconds)
            start = format_seconds(clip.start_seconds)
            scale = self._scale_filter(composition.width, composition.height, clip.crop_mode)
            if source.media_type == 'image':
                filters.append(
                    f'[{index}:v:0]trim=duration={duration},setpts=PTS-STARTPTS,{scale},'
                    f'fps={composition.fps},format=yuv420p,setsar=1[v{index}]'
                )
                filters.append(
                    f'anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration={duration},'
                    f'asetpts=PTS-STARTPTS[a{index}]'
                )
            else:
                filters.append(
                    f'[{index}:v:0]trim=start={start}:duration={duration},setpts=PTS-STARTPTS,{scale},'
                    f'fps={composition.fps},format=yuv420p,setsar=1[v{index}]'
                )
                if self._has_audio(probe) and not clip.muted and clip.volume > 0:
                    filters.append(
                        f'[{index}:a:0]atrim=start={start}:duration={duration},asetpts=PTS-STARTPTS,'
                        f'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,'
                        f'volume={clip.volume:.6f},apad,atrim=duration={duration}[a{index}]'
                    )
                else:
                    filters.append(
                        f'anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration={duration},'
                        f'asetpts=PTS-STARTPTS[a{index}]'
                    )
            concat_inputs.extend([f'[v{index}]', f'[a{index}]'])
        filters.append(''.join(concat_inputs) + f'concat=n={len(clips)}:v=1:a=1[vbase][abase]')
        video_label = 'vbase'
        filter_index = 0
        for effect in composition.effects:
            next_label = f've{filter_index}'
            expression = self._effect_filter(effect, composition)
            filters.append(f'[{video_label}]{expression}[{next_label}]')
            video_label = next_label
            filter_index += 1
        for overlay in composition.text_overlays:
            text_path = output.parent / f'text-{filter_index:03d}.txt'
            text_path.write_text(overlay.text, encoding='utf-8')
            layer_width = max(2, round(composition.width * overlay.width))
            layer_width += layer_width % 2
            layer_height = max(2, min(composition.height, round(overlay.font_size * 4)))
            layer_height += layer_height % 2
            layer_label = f'textlayer{filter_index}'
            rotated_label = f'textrot{filter_index}'
            next_label = f'vt{filter_index}'
            alignment_x = {
                'left': '0',
                'center': '(w-text_w)/2',
                'right': 'w-text_w',
            }[overlay.alignment.value]
            background = self._ffmpeg_color(overlay.background_color, overlay.background_opacity)
            shadow_options = (
                'shadowcolor=black@0.55:shadowx=0:shadowy=2'
                if overlay.shadow
                else 'shadowcolor=black@0:shadowx=0:shadowy=0'
            )
            filters.append(
                f'nullsrc=s={layer_width}x{layer_height}:r={composition.fps}:d='
                f'{format_seconds(composition_duration(composition))},format=rgba,'
                f'colorchannelmixer=aa=0,drawtext=textfile={self._escape_filter_value(str(text_path))}:'
                f"font={self._escape_filter_value(overlay.font_family + (' Bold' if overlay.bold else ''))}:"
                f'fontsize={overlay.font_size}:fontcolor={overlay.color}:'
                f'borderw={overlay.outline_width}:bordercolor={overlay.outline_color}:'
                f'{shadow_options}:box={1 if overlay.background_opacity > 0 else 0}:'
                f'boxcolor={background}:boxborderw=8:expansion=none:'
                f'x={alignment_x}:y=(h-text_h)/2[{layer_label}]'
            )
            filters.append(
                f'[{layer_label}]rotate=angle={math.radians(overlay.rotation_degrees):.10f}:'
                f'ow=rotw(iw):oh=roth(ih):c=none[{rotated_label}]'
            )
            filters.append(
                f'[{video_label}][{rotated_label}]overlay='
                f"x='W*{overlay.x:.10f}-w/2':y='H*{overlay.y:.10f}-h/2':"
                f"format=auto:enable='between(t,{format_seconds(overlay.start_seconds)},"
                f"{format_seconds(overlay.start_seconds + overlay.duration_seconds)})'[{next_label}]"
            )
            video_label = next_label
            filter_index += 1

        audio_labels = ['[abase]']
        for index, audio in enumerate(composition.audio_items):
            if audio.muted or audio.volume <= 0:
                continue
            input_index = audio_input_indices[audio.id]
            label = f'aext{index}'
            delay_ms = round(audio.start_seconds * 1000)
            filters.append(
                f'[{input_index}:a:0]atrim=start={format_seconds(audio.source_start_seconds)}:'
                f'duration={format_seconds(audio.duration_seconds)},asetpts=PTS-STARTPTS,'
                f'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,'
                f'volume={audio.volume:.6f},adelay={delay_ms}|{delay_ms},'
                f'apad,atrim=duration={format_seconds(composition_duration(composition))}[{label}]'
            )
            audio_labels.append(f'[{label}]')
        audio_label = 'abase'
        if len(audio_labels) > 1:
            audio_label = 'amixed'
            filters.append(
                ''.join(audio_labels)
                + f'amix=inputs={len(audio_labels)}:duration=first:dropout_transition=0:normalize=0,'
                + f'atrim=duration={format_seconds(composition_duration(composition))}[{audio_label}]'
            )
        command.extend(
            [
                '-filter_complex', ';'.join(filters),
                '-map', f'[{video_label}]', '-map', f'[{audio_label}]',
                '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
                '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k',
                '-movflags', '+faststart', '-threads', '1',
                str(output),
            ]
        )
        return command

    def _run_ffmpeg(
        self,
        command: Sequence[str],
        output: Path,
        log_path: Path,
        workspace: Path,
        *,
        reserved_workspace_bytes: int,
    ) -> None:
        deadline = time.monotonic() + self.limits.ffmpeg_timeout_seconds
        process: subprocess.Popen[bytes] | None = None
        try:
            with log_path.open('wb') as log:
                process = subprocess.Popen(
                    list(command),
                    stdout=subprocess.DEVNULL,
                    stderr=log,
                    start_new_session=True,
                )
                while process.poll() is None:
                    if time.monotonic() >= deadline:
                        self._stop_process(process)
                        raise TimelineProcessError('FFmpeg timeline render timed out.')
                    if (
                        reserved_workspace_bytes + self._workspace_size(workspace)
                        > self.limits.max_workspace_bytes
                    ):
                        self._stop_process(process)
                        raise TimelineProcessError('Timeline render exceeded the workspace byte limit.')
                    if output.exists() and output.stat().st_size > self.limits.max_output_bytes:
                        self._stop_process(process)
                        raise TimelineProcessError('Timeline render exceeded the output byte limit.')
                    time.sleep(0.05)
            if process.returncode != 0:
                detail = log_path.read_text(errors='replace')[-2000:]
                raise TimelineProcessError(f'FFmpeg timeline render failed: {detail.strip()}')
        except FileNotFoundError as exc:
            raise TimelineProcessError(f'Required media binary was not found: {command[0]}') from exc
        except BaseException:
            if process is not None and process.poll() is None:
                self._stop_process(process)
            raise
        if not output.is_file() or output.is_symlink() or output.stat().st_size <= 0:
            raise TimelineProcessError('FFmpeg did not create a valid output file.')

    def _probe(self, path: Path, *, require_visual: bool = True) -> dict[str, Any]:
        command = [
            self.ffprobe_binary, '-v', 'error', '-print_format', 'json',
            '-show_entries',
            'stream=codec_type,codec_name,width,height,duration,avg_frame_rate,pix_fmt,sample_rate:'
            'format=duration',
            '-show_streams', '-show_format', str(path),
        ]
        timeout = min(30.0, self.limits.ffmpeg_timeout_seconds)
        process: subprocess.Popen[bytes] | None = None
        try:
            process = subprocess.Popen(
                command,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                start_new_session=True,
            )
            stdout, stderr = self._communicate_bounded(process, timeout=timeout)
            if process.returncode != 0:
                detail = stderr[-2000:].decode('utf-8', errors='replace').strip()
                raise TimelineProcessError(f'FFprobe could not inspect timeline media: {detail}')
            payload = json.loads(stdout.decode('utf-8'))
        except FileNotFoundError as exc:
            raise TimelineProcessError(f'Required media binary was not found: {self.ffprobe_binary}') from exc
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise TimelineProcessError('FFprobe could not inspect timeline media.') from exc
        except BaseException:
            if process is not None and process.poll() is None:
                self._stop_process(process)
            raise
        streams = payload.get('streams')
        if not isinstance(streams, list):
            raise TimelineValidationError('Timeline media has no decodable streams.')
        required_type = 'video' if require_visual else 'audio'
        if not any(isinstance(stream, dict) and stream.get('codec_type') == required_type for stream in streams):
            raise TimelineValidationError(f'Timeline media has no decodable {required_type} stream.')
        return payload

    def _validate_output(self, output: Path, composition: TimelineComposition) -> TimelineOutputMetadata:
        size = output.stat().st_size
        if size > self.limits.max_output_bytes:
            raise TimelineProcessError('Timeline render exceeded the output byte limit.')
        payload = self._probe(output)
        streams = payload['streams']
        video = next(stream for stream in streams if stream.get('codec_type') == 'video')
        audio = next((stream for stream in streams if stream.get('codec_type') == 'audio'), None)
        fps = parse_frame_rate(video.get('avg_frame_rate'))
        duration = self._probe_duration(payload)
        video_duration = self._stream_duration(video, payload)
        audio_duration = self._stream_duration(audio, payload) if audio is not None else 0
        expected_duration = composition_duration(composition)
        if video.get('codec_name') != 'h264' or audio is None or audio.get('codec_name') != 'aac':
            raise TimelineProcessError('Rendered timeline does not contain H.264 video and AAC audio.')
        if video.get('pix_fmt') != 'yuv420p':
            raise TimelineProcessError('Rendered timeline does not use the browser-compatible yuv420p pixel format.')
        if str(audio.get('sample_rate')) != '48000':
            raise TimelineProcessError('Rendered timeline audio does not use a 48 kHz sample rate.')
        if int(video.get('width') or 0) != composition.width or int(video.get('height') or 0) != composition.height:
            raise TimelineProcessError('Rendered timeline dimensions are incorrect.')
        if abs(fps - composition.fps) > 0.01:
            raise TimelineProcessError('Rendered timeline frame rate is incorrect.')
        duration_tolerance = max(2 / composition.fps, 0.03, expected_duration * 0.01)
        if abs(duration - expected_duration) > duration_tolerance:
            raise TimelineProcessError('Rendered timeline duration is incorrect.')
        if (
            abs(video_duration - expected_duration) > duration_tolerance
            or abs(audio_duration - expected_duration) > duration_tolerance
            or abs(video_duration - audio_duration) > duration_tolerance
        ):
            raise TimelineProcessError('Rendered timeline audio and video durations are not synchronized.')
        faststart = has_faststart(output)
        if not faststart:
            raise TimelineProcessError('Rendered timeline is not optimized for progressive playback.')
        return TimelineOutputMetadata(
            duration_seconds=duration,
            width=composition.width,
            height=composition.height,
            fps=fps,
            video_codec='h264',
            audio_codec='aac',
            file_size=size,
            faststart=True,
        )

    @staticmethod
    def _require_regular_file(path: Path) -> Path:
        candidate = Path(path).expanduser()
        if candidate.is_symlink() or not candidate.is_file():
            raise TimelineValidationError('Resolved timeline source must be a regular non-symlink file.')
        return candidate.resolve(strict=True)

    @staticmethod
    def _scale_filter(width: int, height: int, crop_mode: TimelineCropMode) -> str:
        if crop_mode == TimelineCropMode.cover:
            return (
                f'scale={width}:{height}:force_original_aspect_ratio=increase:flags=lanczos,'
                f'crop={width}:{height}'
            )
        return (
            f'scale={width}:{height}:force_original_aspect_ratio=decrease:flags=lanczos,'
            f'pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black'
        )

    @staticmethod
    def _escape_filter_value(value: str) -> str:
        return value.replace('\\', '\\\\').replace(':', '\\:').replace("'", "\\'")

    @staticmethod
    def _ffmpeg_color(value: str, opacity: float) -> str:
        return f'0x{value[1:]}@{opacity:.6f}'

    @staticmethod
    def _effect_filter(effect: Any, composition: TimelineComposition) -> str:
        start = format_seconds(effect.start_seconds)
        end = format_seconds(effect.start_seconds + effect.duration_seconds)
        duration = format_seconds(effect.duration_seconds)
        amount = float(effect.amount)
        enable = f"enable='between(t,{start},{end})'"
        if effect.preset == TimelineEffectPreset.fade_in:
            return f'fade=t=in:st={start}:d={duration}'
        if effect.preset == TimelineEffectPreset.fade_out:
            return f'fade=t=out:st={start}:d={duration}'
        if effect.preset == TimelineEffectPreset.zoom_in:
            factor = 0.12 * amount
            clock = f'(on/{composition.fps})'
            zoom = f'max(0,min(1,({clock}-{start})/{duration}))*between({clock},{start},{end})'
            return (
                f"zoompan=z='1+{factor:.6f}*{zoom}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
                f'd=1:s={composition.width}x{composition.height}:fps={composition.fps}'
            )
        if effect.preset == TimelineEffectPreset.grayscale:
            return f'hue=s={max(0.0, 1.0 - min(1.0, amount)):.6f}:{enable}'
        if effect.preset == TimelineEffectPreset.blur:
            return f'boxblur=luma_radius={max(0.1, amount * 5):.3f}:luma_power=1:{enable}'
        if effect.preset == TimelineEffectPreset.brightness:
            return f'eq=brightness={max(-1.0, min(1.0, amount - 1)):.6f}:{enable}'
        if effect.preset == TimelineEffectPreset.contrast:
            return f'eq=contrast={max(0.0, min(2.0, amount)):.6f}:{enable}'
        if effect.preset == TimelineEffectPreset.saturation:
            return f'eq=saturation={max(0.0, min(2.0, amount)):.6f}:{enable}'
        if effect.preset == TimelineEffectPreset.vibrance:
            return f'vibrance=intensity={max(-1.0, min(1.0, amount - 1)):.6f}:{enable}'
        if effect.preset == TimelineEffectPreset.vignette:
            return f'vignette=angle={0.15 + min(2.0, amount) * 0.35:.6f}:{enable}'
        raise TimelineValidationError(f'Unsupported timeline effect: {effect.preset}.')

    @staticmethod
    def _has_audio(payload: dict[str, Any]) -> bool:
        return any(stream.get('codec_type') == 'audio' for stream in payload.get('streams', []))

    @staticmethod
    def _probe_duration(payload: dict[str, Any]) -> float:
        values = [(payload.get('format') or {}).get('duration')]
        values.extend(stream.get('duration') for stream in payload.get('streams', []))
        durations: list[float] = []
        for raw in values:
            try:
                value = float(raw)
            except (TypeError, ValueError):
                continue
            if math.isfinite(value) and value > 0:
                durations.append(value)
        if not durations:
            raise TimelineValidationError('Timeline video duration is missing or invalid.')
        return max(durations)

    @staticmethod
    def _probe_visual_duration(payload: dict[str, Any]) -> float:
        video = next(stream for stream in payload['streams'] if stream.get('codec_type') == 'video')
        values = [video.get('duration'), (payload.get('format') or {}).get('duration')]
        for raw in values:
            try:
                value = float(raw)
            except (TypeError, ValueError):
                continue
            if math.isfinite(value) and value > 0:
                return value
        raise TimelineValidationError('Timeline video duration is missing or invalid.')

    @staticmethod
    def _probe_audio_duration(payload: dict[str, Any]) -> float:
        audio = next(stream for stream in payload['streams'] if stream.get('codec_type') == 'audio')
        values = [audio.get('duration'), (payload.get('format') or {}).get('duration')]
        for raw in values:
            try:
                value = float(raw)
            except (TypeError, ValueError):
                continue
            if math.isfinite(value) and value > 0:
                return value
        raise TimelineValidationError('Timeline audio duration is missing or invalid.')

    @staticmethod
    def _stream_duration(stream: dict[str, Any], payload: dict[str, Any]) -> float:
        for raw in (stream.get('duration'), (payload.get('format') or {}).get('duration')):
            try:
                value = float(raw)
            except (TypeError, ValueError):
                continue
            if math.isfinite(value) and value > 0:
                return value
        raise TimelineProcessError('Rendered timeline stream duration is missing or invalid.')

    @staticmethod
    def _probe_dimensions(payload: dict[str, Any]) -> tuple[int, int]:
        video = next(stream for stream in payload['streams'] if stream.get('codec_type') == 'video')
        try:
            width = int(video.get('width') or 0)
            height = int(video.get('height') or 0)
        except (TypeError, ValueError) as exc:
            raise TimelineValidationError('Timeline source dimensions are invalid.') from exc
        if width <= 0 or height <= 0:
            raise TimelineValidationError('Timeline source dimensions are invalid.')
        return width, height

    @staticmethod
    def _workspace_size(path: Path) -> int:
        return sum(item.stat().st_size for item in path.iterdir() if item.is_file() and not item.is_symlink())

    @staticmethod
    def _stop_process(process: subprocess.Popen[bytes]) -> None:
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            return
        try:
            process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            pass
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        if process.poll() is None:
            try:
                process.wait(timeout=2)
            except subprocess.TimeoutExpired as exc:
                raise TimelineProcessError('Media process could not be terminated safely.') from exc

    def _communicate_bounded(
        self,
        process: subprocess.Popen[bytes],
        *,
        timeout: float,
    ) -> tuple[bytes, bytes]:
        assert process.stdout is not None and process.stderr is not None
        buffers = {process.stdout: bytearray(), process.stderr: bytearray()}
        limits = {process.stdout: _MAX_PROBE_OUTPUT_BYTES, process.stderr: _MAX_PROBE_ERROR_BYTES}
        selector = selectors.DefaultSelector()
        selector.register(process.stdout, selectors.EVENT_READ)
        selector.register(process.stderr, selectors.EVENT_READ)
        deadline = time.monotonic() + timeout
        try:
            while selector.get_map():
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    self._stop_process(process)
                    raise TimelineProcessError('FFprobe timed out while inspecting timeline media.')
                for key, _ in selector.select(timeout=min(0.05, remaining)):
                    stream = key.fileobj
                    chunk = os.read(stream.fileno(), 64 * 1024)
                    if not chunk:
                        selector.unregister(stream)
                        stream.close()
                        continue
                    buffer = buffers[stream]
                    if len(buffer) + len(chunk) > limits[stream]:
                        self._stop_process(process)
                        raise TimelineProcessError('FFprobe metadata exceeded the safe output limit.')
                    buffer.extend(chunk)
            try:
                process.wait(timeout=max(0.01, deadline - time.monotonic()))
            except subprocess.TimeoutExpired as exc:
                self._stop_process(process)
                raise TimelineProcessError('FFprobe timed out while inspecting timeline media.') from exc
            return bytes(buffers[process.stdout]), bytes(buffers[process.stderr])
        finally:
            selector.close()


def composition_duration(composition: TimelineComposition) -> float:
    return math.fsum(clip.duration_seconds for clip in composition.clips)


def format_seconds(value: float) -> str:
    return f'{value:.6f}'


def parse_frame_rate(value: object) -> float:
    if not isinstance(value, str):
        raise TimelineProcessError('Rendered timeline frame rate is missing.')
    numerator, separator, denominator = value.partition('/')
    try:
        result = float(numerator) / float(denominator) if separator else float(numerator)
    except (TypeError, ValueError, ZeroDivisionError) as exc:
        raise TimelineProcessError('Rendered timeline frame rate is invalid.') from exc
    if not math.isfinite(result) or result <= 0:
        raise TimelineProcessError('Rendered timeline frame rate is invalid.')
    return result


def has_faststart(path: Path) -> bool:
    moov_offset: int | None = None
    mdat_offset: int | None = None
    offset = 0
    size = path.stat().st_size
    with path.open('rb') as source:
        while offset + 8 <= size:
            source.seek(offset)
            header = source.read(16)
            if len(header) < 8:
                break
            atom_size = int.from_bytes(header[:4], 'big')
            atom_type = header[4:8]
            header_size = 8
            if atom_size == 1:
                if len(header) < 16:
                    break
                atom_size = int.from_bytes(header[8:16], 'big')
                header_size = 16
            elif atom_size == 0:
                atom_size = size - offset
            if atom_size < header_size or offset + atom_size > size:
                break
            if atom_type == b'moov':
                moov_offset = offset
            elif atom_type == b'mdat':
                mdat_offset = offset
            if moov_offset is not None and mdat_offset is not None:
                return moov_offset < mdat_offset
            offset += atom_size
    return False
