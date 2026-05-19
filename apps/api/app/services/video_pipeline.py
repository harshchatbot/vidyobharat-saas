import logging
import json
import re
import shlex
import subprocess
import tempfile
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx

from app.providers.broll import BrollProvider
from app.providers.firebase import get_firebase_app, normalize_firebase_bucket
from app.services.persona_voice_service import PersonaVoiceService
from app.services.tts import generate_voiceover_detailed

logger = logging.getLogger(__name__)

DEFAULT_IMAGE_DURATION = 3.0
MUSIC_BASE_GAIN = 0.7

BUILTIN_MUSIC_TRACKS: dict[str, str] = {
    'uplift-india': '/static/music/uplift-india.mp3',
    'corporate-calm': '/static/music/corporate-calm.mp3',
    'soft-motivation': '/static/music/soft-motivation.mp3',
}


class VideoPipelineService:
    def __init__(self) -> None:
        self.renders_dir = Path('data/renders').resolve()
        self.renders_dir.mkdir(parents=True, exist_ok=True)
        self.tts_cache_dir = Path('data/tts_cache').resolve()
        self.tts_cache_dir.mkdir(parents=True, exist_ok=True)
        self.broll_provider = BrollProvider()
        self.persona_voice = PersonaVoiceService()
        self._font_cache: dict[str, str | None] = {}

    def build_video(self, render_id: str, script: str, include_broll: bool) -> tuple[str, str]:
        output_path = self.renders_dir / f'{render_id}.mp4'
        thumb_path = self.renders_dir / f'{render_id}.jpg'

        if include_broll:
            self.broll_provider.fetch_clip(topic='india startup growth')

        caption = (script or 'RangManch AI Render').replace(':', ' ').replace("'", '')[:80]
        cmd = [
            'ffmpeg',
            '-y',
            '-f',
            'lavfi',
            '-i',
            'color=c=0x111827:s=1280x720:d=6',
            '-vf',
            f"drawtext=text='{caption}':fontcolor=white:fontsize=42:x=(w-text_w)/2:y=(h-text_h)/2",
            '-c:v',
            'libx264',
            '-pix_fmt',
            'yuv420p',
            str(output_path),
        ]

        try:
            self._run(cmd)
            self._make_thumbnail(output_path, thumb_path)
        except Exception as exc:
            logger.warning('ffmpeg_unavailable_fallback', extra={'render_id': render_id, 'error': str(exc)})
            output_path.write_bytes(b'VIDYOBHARAT-MOCK-MP4')
            thumb_path.write_bytes(b'VIDYOBHARAT-MOCK-THUMB')

        return str(output_path), str(thumb_path)

    def render_video_from_assets(
        self,
        video_id: str,
        title: str | None,
        script: str,
        language_name: str | None,
        voice_name: str,
        audio_sample_rate_hz: int,
        image_urls: list[str],
        aspect_ratio: str,
        resolution: str,
        duration_mode: str,
        duration_seconds: int | None,
        captions_enabled: bool,
        narration_enabled: bool,
        caption_style: str | None,
        music_mode: str,
        music_track_id: str | None,
        music_file_url: str | None,
        music_volume: int,
        duck_music: bool,
    ) -> tuple[str, str, dict[str, object]]:
        output_path = self.renders_dir / f'{video_id}.mp4'
        thumb_path = self.renders_dir / f'{video_id}.jpg'
        slideshow_path = self.renders_dir / f'{video_id}_slideshow.mp4'
        voice_path: Path | None = None
        tts_diagnostics: dict[str, object] = {
            'tts_provider': None,
            'tts_resolved_voice': None,
            'tts_provider_message': None,
            'tts_fallback_used': False,
        }

        image_paths = self._urls_to_local_paths(image_urls)
        voice_exists = bool(narration_enabled and script.strip())
        real_voice_exists = False
        target_size = self._resolve_target_size(aspect_ratio, resolution)

        voice_duration = 0.0
        if voice_exists:
            voice_path, voice_duration, tts_diagnostics = self.generate_narration_track(
                render_id=video_id,
                script=script,
                language_name=language_name,
                voice_name=voice_name,
                audio_sample_rate_hz=audio_sample_rate_hz,
            )
            real_voice_exists = voice_path is not None

        total_duration, per_image_duration = self._resolve_timing(
            voice_duration=voice_duration,
            image_count=len(image_paths),
            voice_exists=real_voice_exists,
            duration_mode=duration_mode,
            duration_seconds=duration_seconds,
        )
        self._build_slideshow(
            slideshow_path=slideshow_path,
            image_paths=image_paths,
            per_image_duration=per_image_duration,
            total_duration=total_duration,
            title=title,
            script=script,
            captions_enabled=captions_enabled,
            caption_style=caption_style,
            target_size=target_size,
        )

        music_path = self._resolve_music_path(music_mode, music_track_id, music_file_url)
        self._compose_final_video(
            output_path=output_path,
            slideshow_path=slideshow_path,
            total_duration=total_duration,
            voice_path=voice_path if real_voice_exists else None,
            music_path=music_path,
            music_volume=music_volume,
            duck_music=duck_music,
            voice_exists=real_voice_exists,
            render_id=video_id,
        )

        self._make_thumbnail(output_path, thumb_path)
        return str(output_path), str(thumb_path), tts_diagnostics

    def ensure_local_media_path(self, url: str) -> Path | None:
        path = self._ensure_local_media(url)
        if path and path.exists():
            return path.resolve()
        return None

    def inspect_media(self, path_or_url: str) -> dict[str, Any]:
        local = self.ensure_local_media_path(path_or_url)
        if not local or not local.exists():
            raise FileNotFoundError(f'Media not found or could not be resolved: {path_or_url}')
        metadata: dict[str, Any] = {
            'path': str(local),
            'duration_seconds': 0.0,
            'has_video': False,
            'has_audio': False,
            'video_codec': None,
            'audio_codec': None,
            'width': None,
            'height': None,
            'fps': None,
            'file_size_bytes': int(local.stat().st_size) if local.exists() else 0,
        }
        try:
            probe = subprocess.run(
                [
                    'ffprobe',
                    '-v',
                    'error',
                    '-print_format',
                    'json',
                    '-show_streams',
                    '-show_format',
                    str(local),
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            data = json.loads(probe.stdout or '{}')
            streams = list(data.get('streams') or [])
            format_data = data.get('format') or {}
            metadata['duration_seconds'] = max(0.0, float(format_data.get('duration') or 0.0))
            for stream in streams:
                codec_type = str(stream.get('codec_type') or '').strip().lower()
                if codec_type == 'video' and not metadata['has_video']:
                    metadata['has_video'] = True
                    metadata['video_codec'] = stream.get('codec_name')
                    metadata['width'] = stream.get('width')
                    metadata['height'] = stream.get('height')
                    frame_rate_raw = str(stream.get('avg_frame_rate') or stream.get('r_frame_rate') or '').strip()
                    if frame_rate_raw and frame_rate_raw != '0/0':
                        if '/' in frame_rate_raw:
                            num, den = frame_rate_raw.split('/', 1)
                            try:
                                den_float = float(den)
                                metadata['fps'] = round(float(num) / den_float, 3) if den_float else None
                            except Exception:
                                metadata['fps'] = None
                        else:
                            try:
                                metadata['fps'] = round(float(frame_rate_raw), 3)
                            except Exception:
                                metadata['fps'] = None
                if codec_type == 'audio' and not metadata['has_audio']:
                    metadata['has_audio'] = True
                    metadata['audio_codec'] = stream.get('codec_name')
        except Exception as exc:
            logger.warning('media_inspection_failed', extra={'path': str(local), 'error': str(exc)})
            metadata['has_video'] = self._media_has_video(local)
            metadata['has_audio'] = self._media_has_audio(local)
            try:
                metadata['duration_seconds'] = max(0.0, self._probe_duration(local))
            except Exception:
                metadata['duration_seconds'] = 0.0
        return metadata

    def generate_narration_track(
        self,
        *,
        render_id: str,
        script: str,
        language_name: str | None,
        voice_name: str,
        audio_sample_rate_hz: int,
        speech_rate: float = 1.0,
        voice_profile: dict | None = None,
    ) -> tuple[Path | None, float, dict[str, object]]:
        if not script.strip():
            return None, 0.0, {
                'tts_provider': None,
                'tts_resolved_voice': None,
                'tts_provider_message': None,
                'tts_fallback_used': False,
            }
        persona_input = self.persona_voice.prepare_tts_input(
            script=script,
            voice_profile=voice_profile,
            fallback_speaker=voice_name,
            fallback_speech_rate=speech_rate,
        )
        voice_result = generate_voiceover_detailed(
            script=str(persona_input['text']),
            voice=str(persona_input['voice_key']),
            cache_dir=self.tts_cache_dir,
            language=language_name,
            sample_rate_hz=audio_sample_rate_hz,
            speech_rate=float(persona_input['speech_rate']),
        )
        voice_path = voice_result.path
        voice_duration = self._probe_duration(voice_path)
        tts_diagnostics: dict[str, object] = {
            'tts_provider': voice_result.provider,
            'tts_resolved_voice': voice_result.resolved_voice,
            'tts_provider_message': voice_result.provider_message,
            'tts_fallback_used': voice_result.provider != 'Sarvam AI',
        }
        logger.info(
            'tts_generated',
            extra={
                'render_id': render_id,
                'voice': voice_result.resolved_voice,
                'persona_speaker': persona_input['speaker'],
                'persona_speech_rate': float(persona_input['speech_rate']),
                'tts_provider': voice_result.provider,
                'tts_fallback_used': voice_result.provider != 'Sarvam AI',
                'cached': voice_result.cached,
                'voice_duration_seconds': round(voice_duration, 3),
                'voice_path': str(voice_path),
            },
        )
        return voice_path, voice_duration, tts_diagnostics

    def burn_overlays_on_video(
        self,
        *,
        input_video_path: Path,
        output_video_path: Path,
        title: str | None,
        script: str,
        captions_enabled: bool,
        caption_style: str | None = None,
        timing_map: list[dict[str, Any]] | None = None,
    ) -> Path:
        if not input_video_path.exists():
            raise FileNotFoundError(f'Input video not found: {input_video_path}')

        duration = max(0.1, self._probe_duration(input_video_path))
        text_filters: list[str] = []
        if captions_enabled:
            if timing_map:
                text_filters.extend(self._build_caption_filters_from_timing_map(timing_map=timing_map, total_duration=duration, caption_style=caption_style))
            elif script.strip():
                text_filters.extend(self._build_caption_filters(script=script, total_duration=duration, caption_style=caption_style))

        if not text_filters:
            return input_video_path

        output_video_path.parent.mkdir(parents=True, exist_ok=True)
        self._run(
            [
                'ffmpeg',
                '-y',
                '-i',
                str(input_video_path),
                '-vf',
                ','.join(text_filters),
                '-c:v',
                'libx264',
                '-preset',
                'medium',
                '-pix_fmt',
                'yuv420p',
                '-c:a',
                'aac',
                '-b:a',
                '192k',
                '-movflags',
                '+faststart',
                str(output_video_path),
            ]
        )
        return output_video_path

    def video_has_audio_stream(self, video_path: Path) -> bool:
        if not video_path.exists():
            return False
        try:
            result = subprocess.run(
                [
                    'ffprobe',
                    '-v',
                    'error',
                    '-select_streams',
                    'a',
                    '-show_entries',
                    'stream=codec_type',
                    '-of',
                    'csv=p=0',
                    str(video_path),
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            return bool((result.stdout or '').strip())
        except Exception:
            logger.warning('video_audio_probe_failed', extra={'path': str(video_path)})
            return False

    def stitch_videos(
        self,
        *,
        video_urls: list[str],
        project_id: str,
        output_prefix: str | None = None,
        transition_type: str = 'crossfade',
        transition_duration: float = 0.3,
    ) -> str:
        if not video_urls:
            raise ValueError('No scene videos provided for stitching')

        render_id = output_prefix or f'storyboard-{project_id}'
        tmp_dir = Path(tempfile.mkdtemp(prefix=f'{render_id}-', dir='data/tmp'))
        output_path = (self.renders_dir / f'{render_id}-final.mp4').resolve()
        concat_file = tmp_dir / 'concat.txt'
        local_files: list[Path] = []
        transition_output_path = tmp_dir / 'transition_output.mp4'
        audio_mux_output_path = tmp_dir / 'audio_mux_output.mp4'
        validated_final_output_path = tmp_dir / 'validated_final_output.mp4'
        keep_artifacts = False
        logger.info('storyboard_stitch_download_started', extra={'project_id': project_id, 'clip_count': len(video_urls)})
        logger.info('storyboard_stitch_transition_type', extra={'project_id': project_id, 'transition_type': transition_type})
        logger.info('storyboard_stitch_transition_duration', extra={'project_id': project_id, 'transition_duration': float(transition_duration)})
        try:
            for idx, url in enumerate(video_urls):
                local_path = tmp_dir / f'clip-{idx + 1}.mp4'
                raw_input = str(url or '').strip()
                if raw_input.startswith('gs://'):
                    raise ValueError('gs:// input must be resolved before stitching')
                if raw_input.startswith(('http://', 'https://')):
                    with httpx.Client(timeout=httpx.Timeout(90.0, connect=20.0), follow_redirects=True) as client:
                        response = client.get(raw_input)
                        response.raise_for_status()
                        local_path.write_bytes(response.content)
                else:
                    src = Path(raw_input)
                    if not src.exists():
                        raise FileNotFoundError(f'Scene video not found: {src}')
                    local_path.write_bytes(src.read_bytes())
                local_files.append(local_path)
                scene_probe = self.inspect_media(str(local_path))
                logger.info(
                    'storyboard_ffprobe_scene_input',
                    extra={'project_id': project_id, 'index': idx + 1, 'probe': scene_probe},
                )
            logger.info('storyboard_stitch_download_completed', extra={'project_id': project_id, 'downloaded_count': len(local_files)})
            audio_flags = [self._media_has_audio(path) for path in local_files]
            logger.info('storyboard_stitch_input_audio_streams_detected', extra={'project_id': project_id, 'audio_flags': audio_flags, 'audio_clip_count': sum(1 for v in audio_flags if v)})

            transition_mode = str(transition_type or 'none').strip().lower()
            transition_seconds = max(0.0, float(transition_duration or 0.0))

            def _run_concat() -> None:
                concat_file.write_text('\n'.join([f"file '{clip.resolve()}'" for clip in local_files]), encoding='utf-8')
                logger.info('storyboard_stitch_ffmpeg_started', extra={'project_id': project_id, 'output': str(transition_output_path), 'mode': 'concat'})
                self._run(
                    [
                        'ffmpeg',
                        '-y',
                        '-f',
                        'concat',
                        '-safe',
                        '0',
                        '-i',
                        str(concat_file),
                        '-c:v',
                        'libx264',
                        '-pix_fmt',
                        'yuv420p',
                        '-c:a',
                        'aac',
                        '-movflags',
                        '+faststart',
                        str(transition_output_path),
                    ]
                )
                logger.info('storyboard_stitch_ffmpeg_completed', extra={'project_id': project_id, 'output': str(transition_output_path), 'mode': 'concat'})

            if transition_mode == 'none' or len(local_files) < 2:
                logger.info('storyboard_stitch_audio_strategy_selected', extra={'project_id': project_id, 'strategy': 'concat_mux'})
                _run_concat()
            else:
                durations = [max(0.1, self._probe_duration(path)) for path in local_files]
                safe_transition = min(transition_seconds, 1.0)
                if any(duration <= safe_transition for duration in durations):
                    safe_transition = min(safe_transition, max(0.05, min(durations) * 0.25))
                ffmpeg_cmd: list[str] = ['ffmpeg', '-y']
                for clip in local_files:
                    ffmpeg_cmd.extend(['-i', str(clip)])
                filter_lines: list[str] = []
                for i in range(len(local_files)):
                    filter_lines.append(
                        f'[{i}:v]fps=24,scale=1080:1920:force_original_aspect_ratio=decrease,'
                        f'pad=1080:1920:(ow-iw)/2:(oh-ih)/2,format=yuv420p,setsar=1[v{i}]'
                    )

                current_label = 'v0'
                offset = durations[0] - safe_transition
                for i in range(1, len(local_files)):
                    trans = 'fadeblack' if transition_mode == 'fade_black' else 'fade'
                    out_label = f'xf{i}'
                    filter_lines.append(
                        f'[{current_label}][v{i}]xfade=transition={trans}:duration={safe_transition:.3f}:offset={max(0.0, offset):.3f}[{out_label}]'
                    )
                    current_label = out_label
                    offset += durations[i] - safe_transition

                filter_complex = ';'.join(filter_lines)
                ffmpeg_cmd.extend(
                    [
                        '-filter_complex',
                        filter_complex,
                        '-map',
                        f'[{current_label}]',
                        '-an',
                        '-c:v',
                        'libx264',
                        '-pix_fmt',
                        'yuv420p',
                        '-movflags',
                        '+faststart',
                        str(transition_output_path),
                    ]
                )
                try:
                    logger.info('storyboard_stitch_transition_ffmpeg_started', extra={'project_id': project_id, 'output': str(transition_output_path), 'transition_type': transition_mode})
                    self._run(ffmpeg_cmd)
                    logger.info('storyboard_stitch_transition_ffmpeg_completed', extra={'project_id': project_id, 'output': str(transition_output_path), 'transition_type': transition_mode})
                    logger.info(
                        'storyboard_ffprobe_transition_output',
                        extra={'project_id': project_id, 'probe': self.inspect_media(str(transition_output_path))},
                    )
                    if any(audio_flags):
                        logger.info('storyboard_stitch_audio_strategy_selected', extra={'project_id': project_id, 'strategy': 'concat_audio_then_mux'})
                        normalized_with_audio: list[Path] = []
                        for i, clip in enumerate(local_files):
                            normalized = tmp_dir / f'clip-audio-{i + 1}.mp4'
                            if audio_flags[i]:
                                self._run(
                                    [
                                        'ffmpeg', '-y', '-i', str(clip),
                                        '-c:v', 'copy',
                                        '-c:a', 'aac',
                                        '-shortest',
                                        str(normalized),
                                    ]
                                )
                            else:
                                duration = max(0.1, self._probe_duration(clip))
                                self._run(
                                    [
                                        'ffmpeg', '-y', '-i', str(clip),
                                        '-f', 'lavfi', '-i', f'anullsrc=r=44100:cl=stereo:d={duration:.3f}',
                                        '-map', '0:v', '-map', '1:a',
                                        '-c:v', 'copy', '-c:a', 'aac', '-shortest',
                                        str(normalized),
                                    ]
                                )
                            normalized_with_audio.append(normalized)

                        audio_concat_file = tmp_dir / 'audio-concat.txt'
                        audio_concat_file.write_text('\n'.join([f"file '{clip.resolve()}'" for clip in normalized_with_audio]), encoding='utf-8')
                        concat_with_audio_path = tmp_dir / 'concat-audio.mp4'
                        logger.info('storyboard_stitch_audio_ffmpeg_started', extra={'project_id': project_id})
                        self._run(
                            [
                                'ffmpeg', '-y',
                                '-f', 'concat', '-safe', '0',
                                '-i', str(audio_concat_file),
                                '-c:v', 'copy',
                                '-c:a', 'aac',
                                '-movflags', '+faststart',
                                str(concat_with_audio_path),
                            ]
                        )
                        logger.info('storyboard_stitch_audio_ffmpeg_completed', extra={'project_id': project_id})
                        self._run(
                            [
                                'ffmpeg', '-y',
                                        '-i', str(transition_output_path),
                                        '-i', str(concat_with_audio_path),
                                        '-map', '0:v', '-map', '1:a',
                                        '-c:v', 'copy', '-c:a', 'aac',
                                        '-shortest',
                                        '-movflags', '+faststart',
                                        str(audio_mux_output_path),
                                    ]
                                )
                    else:
                        logger.info('storyboard_stitch_audio_strategy_selected', extra={'project_id': project_id, 'strategy': 'mute_inputs_all'})
                        self._run(
                            [
                                'ffmpeg', '-y',
                                '-i', str(transition_output_path),
                                '-c:v', 'copy',
                                '-an',
                                str(audio_mux_output_path),
                            ]
                        )
                except Exception as exc:
                    logger.warning(
                        'storyboard_stitch_transition_failed_fallback_concat',
                        extra={'project_id': project_id, 'transition_type': transition_mode, 'error': str(exc)},
                    )
                    _run_concat()

            if not audio_mux_output_path.exists():
                if not transition_output_path.exists():
                    raise RuntimeError('Stitching did not produce transition output')
                audio_mux_output_path = transition_output_path

            self._run(
                [
                    'ffmpeg', '-y',
                    '-i', str(audio_mux_output_path),
                    '-map', '0:v:0',
                    '-map', '0:a?',
                    '-c:v', 'copy',
                    '-c:a', 'aac',
                    '-movflags', '+faststart',
                    str(validated_final_output_path),
                ]
            )
            self._run(
                [
                    'ffmpeg', '-y',
                    '-i', str(validated_final_output_path),
                    '-map', '0:v:0',
                    '-map', '0:a?',
                    '-c:v', 'copy',
                    '-c:a', 'copy',
                    '-movflags', '+faststart',
                    str(output_path),
                ]
            )
            output_abs_path = str(output_path.resolve())
            output_exists = output_path.exists()
            output_size = int(output_path.stat().st_size) if output_exists else 0
            logger.info('storyboard_stitch_output_path', extra={'project_id': project_id, 'path': output_abs_path})
            logger.info('storyboard_stitch_output_exists', extra={'project_id': project_id, 'exists': output_exists})
            logger.info('storyboard_stitch_output_size_bytes', extra={'project_id': project_id, 'size_bytes': output_size})
            if not output_exists:
                raise FileNotFoundError(f'Final output was not created at absolute path: {output_abs_path}')
            logger.info(
                'storyboard_ffprobe_final_output',
                extra={'project_id': project_id, 'probe': self.inspect_media(output_abs_path)},
            )
            output_has_audio = self._media_has_audio(output_path)
            logger.info('storyboard_stitch_output_has_audio', extra={'project_id': project_id, 'has_audio': output_has_audio})
            if any(audio_flags) and not output_has_audio:
                logger.warning('storyboard_stitch_output_audio_missing_warning', extra={'project_id': project_id})
            logger.info('storyboard_stitch_upload_started', extra={'project_id': project_id})
            logger.info('storyboard_stitch_upload_completed', extra={'project_id': project_id, 'final_path': output_abs_path})
            return output_abs_path
        except Exception:
            keep_artifacts = True
            failed_artifacts: list[dict[str, Any]] = []
            for artifact in [transition_output_path, audio_mux_output_path, validated_final_output_path, output_path]:
                exists = artifact.exists()
                item: dict[str, Any] = {
                    'path': str(artifact.resolve()) if exists else str(artifact),
                    'exists': exists,
                    'size_bytes': int(artifact.stat().st_size) if exists else 0,
                }
                if exists:
                    try:
                        item['probe'] = self.inspect_media(str(artifact))
                    except Exception as probe_exc:
                        item['probe_error'] = str(probe_exc)
                failed_artifacts.append(item)
            logger.error('storyboard_stitch_failed_artifacts', extra={'project_id': project_id, 'artifacts': failed_artifacts})
            raise
        finally:
            if keep_artifacts:
                logger.warning('storyboard_stitch_artifacts_preserved', extra={'project_id': project_id, 'tmp_dir': str(tmp_dir.resolve())})
            else:
                for path in local_files:
                    try:
                        path.unlink(missing_ok=True)
                    except Exception:
                        pass
                try:
                    concat_file.unlink(missing_ok=True)
                except Exception:
                    pass
                for artifact in [transition_output_path, audio_mux_output_path, validated_final_output_path]:
                    try:
                        artifact.unlink(missing_ok=True)
                    except Exception:
                        pass
                try:
                    tmp_dir.rmdir()
                except Exception:
                    pass

    def mux_audio_to_video(
        self,
        *,
        video_path: str,
        audio_path: str,
        output_path: str,
        trim_audio_to_video: bool = True,
    ) -> str:
        local_video = self.ensure_local_media_path(video_path)
        local_audio = self.ensure_local_media_path(audio_path)
        if not local_video or not local_video.exists():
            raise FileNotFoundError(f'Video for mux not found: {video_path}')
        if not local_audio or not local_audio.exists():
            raise FileNotFoundError(f'Audio for mux not found: {audio_path}')

        final_output = Path(output_path)
        final_output.parent.mkdir(parents=True, exist_ok=True)

        video_duration = max(0.0, self._probe_duration(local_video))
        audio_duration = max(0.0, self._probe_duration(local_audio))
        logger.info(
            'storyboard_mux_audio_started',
            extra={
                'video_path': str(local_video),
                'audio_path': str(local_audio),
                'output_path': str(final_output),
            },
        )
        logger.info(
            'storyboard_mux_audio_video_duration',
            extra={'duration_seconds': round(video_duration, 3)},
        )
        logger.info(
            'storyboard_mux_audio_audio_duration',
            extra={'duration_seconds': round(audio_duration, 3)},
        )

        cmd = [
            'ffmpeg',
            '-y',
            '-i',
            str(local_video),
            '-i',
            str(local_audio),
            '-map',
            '0:v:0',
            '-map',
            '1:a:0',
            '-c:v',
            'copy',
            '-c:a',
            'aac',
            '-b:a',
            '192k',
            '-movflags',
            '+faststart',
        ]
        if trim_audio_to_video:
            cmd.append('-shortest')
        cmd.append(str(final_output))

        try:
            self._run(cmd)
            logger.info(
                'storyboard_mux_audio_completed',
                extra={'output_path': str(final_output)},
            )
            return str(final_output.resolve())
        except Exception:
            logger.exception(
                'storyboard_mux_audio_failed',
                extra={'output_path': str(final_output)},
            )
            raise

    def strip_audio_from_video(self, *, input_video_path: Path, output_video_path: Path) -> Path:
        if not input_video_path.exists():
            raise FileNotFoundError(f'Input video not found: {input_video_path}')
        output_video_path.parent.mkdir(parents=True, exist_ok=True)
        self._run(
            [
                'ffmpeg',
                '-y',
                '-i',
                str(input_video_path),
                '-c:v',
                'copy',
                '-an',
                str(output_video_path),
            ]
        )
        return output_video_path

    def merge_narration_with_video(
        self,
        *,
        input_video_path: Path,
        output_video_path: Path,
        voice_path: Path,
        render_id: str,
    ) -> Path:
        if not input_video_path.exists():
            raise FileNotFoundError(f'Input video not found: {input_video_path}')
        if not voice_path.exists():
            raise FileNotFoundError(f'Voice track not found: {voice_path}')
        output_video_path.parent.mkdir(parents=True, exist_ok=True)
        video_duration = max(0.1, self._probe_duration(input_video_path))
        logger.info(
            'audio_merge_started',
            extra={
                'render_id': render_id,
                'input_video_path': str(input_video_path),
                'voice_path': str(voice_path),
                'video_duration_seconds': round(video_duration, 3),
            },
        )
        self._run(
            [
                'ffmpeg',
                '-y',
                '-i',
                str(input_video_path),
                '-i',
                str(voice_path),
                '-filter_complex',
                f'[1:a]apad=pad_dur={video_duration:.2f},atrim=0:{video_duration:.2f},asetpts=N/SR/TB[aout]',
                '-map',
                '0:v',
                '-map',
                '[aout]',
                '-c:v',
                'copy',
                '-c:a',
                'aac',
                '-b:a',
                '192k',
                '-movflags',
                '+faststart',
                '-shortest',
                str(output_video_path),
            ]
        )
        logger.info(
            'audio_merge_completed',
            extra={
                'render_id': render_id,
                'output_video_path': str(output_video_path),
            },
        )
        return output_video_path

    def probe_media_streams(self, media_path: Path) -> dict[str, Any]:
        if not media_path.exists():
            return {'video_streams': 0, 'audio_streams': 0, 'path': str(media_path)}
        try:
            result = subprocess.run(
                [
                    'ffprobe',
                    '-v',
                    'error',
                    '-show_entries',
                    'stream=codec_type',
                    '-of',
                    'csv=p=0',
                    str(media_path),
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            stream_types = [line.strip() for line in (result.stdout or '').splitlines() if line.strip()]
            return {
                'path': str(media_path),
                'video_streams': stream_types.count('video'),
                'audio_streams': stream_types.count('audio'),
                'stream_types': stream_types,
            }
        except Exception:
            logger.warning('media_stream_probe_failed', extra={'path': str(media_path)})
            return {'video_streams': 0, 'audio_streams': 0, 'path': str(media_path)}

    def _resolve_timing(
        self,
        voice_duration: float,
        image_count: int,
        voice_exists: bool,
        duration_mode: str,
        duration_seconds: int | None,
    ) -> tuple[float, float]:
        count = max(1, image_count)
        if duration_mode == 'custom' and duration_seconds is not None:
            total = float(max(5, min(300, duration_seconds)))
            per_image = max(1.0, total / count)
            return total, per_image
        if voice_exists:
            total = max(0.1, voice_duration)
            per_image = max(0.1, total / count)
            return total, per_image
        per_image = DEFAULT_IMAGE_DURATION
        return per_image * count, per_image

    def _build_slideshow(
        self,
        slideshow_path: Path,
        image_paths: list[Path],
        per_image_duration: float,
        total_duration: float,
        title: str | None,
        script: str,
        captions_enabled: bool,
        caption_style: str | None,
        target_size: tuple[int, int],
    ) -> None:
        target_w, target_h = target_size
        text_filters: list[str] = []
        if captions_enabled and script.strip():
            text_filters.extend(self._build_caption_filters(script=script, total_duration=total_duration, caption_style=caption_style))
        video_filter = (
            f'scale={target_w}:{target_h}:force_original_aspect_ratio=decrease,'
            f'pad={target_w}:{target_h}:(ow-iw)/2:(oh-ih)/2,format=yuv420p'
        )
        if text_filters:
            video_filter = f"{video_filter},{','.join(text_filters)}"

        if not image_paths:
            self._run([
                'ffmpeg',
                '-y',
                '-f',
                'lavfi',
                '-i',
                f'color=c=0x111827:s={target_w}x{target_h}:d={total_duration:.2f}',
                '-c:v',
                'libx264',
                '-pix_fmt',
                'yuv420p',
                '-vf',
                video_filter,
                str(slideshow_path),
            ])
            return

        if len(image_paths) == 1:
            self._run([
                'ffmpeg',
                '-y',
                '-loop',
                '1',
                '-i',
                str(image_paths[0]),
                '-vf',
                video_filter,
                '-r',
                '30',
                '-c:v',
                'libx264',
                '-pix_fmt',
                'yuv420p',
                '-t',
                f'{total_duration:.2f}',
                str(slideshow_path),
            ])
            return

        concat_file = self.renders_dir / f'{slideshow_path.stem}.txt'
        lines: list[str] = []
        for path in image_paths:
            lines.append(f"file {shlex.quote(str(path))}")
            lines.append(f'duration {per_image_duration:.3f}')
        lines.append(f"file {shlex.quote(str(image_paths[-1]))}")
        concat_file.write_text('\n'.join(lines), encoding='utf-8')

        self._run([
            'ffmpeg',
            '-y',
            '-f',
            'concat',
            '-safe',
            '0',
            '-i',
            str(concat_file),
            '-vf',
            video_filter,
            '-r',
            '30',
            '-c:v',
            'libx264',
            '-pix_fmt',
            'yuv420p',
            '-t',
            f'{total_duration:.2f}',
            str(slideshow_path),
        ])

    def _compose_final_video(
        self,
        output_path: Path,
        slideshow_path: Path,
        total_duration: float,
        voice_path: Path | None,
        music_path: Path | None,
        music_volume: int,
        duck_music: bool,
        voice_exists: bool,
        render_id: str,
    ) -> None:
        if not voice_path and not music_path:
            self._run([
                'ffmpeg',
                '-y',
                '-i',
                str(slideshow_path),
                '-f',
                'lavfi',
                '-i',
                f'anullsrc=r=44100:cl=stereo:d={total_duration:.2f}',
                '-map',
                '0:v',
                '-map',
                '1:a',
                '-c:v',
                'copy',
                '-shortest',
                '-c:a',
                'aac',
                '-b:a',
                '128k',
                str(output_path),
            ])
            return

        cmd = ['ffmpeg', '-y', '-i', str(slideshow_path)]
        filter_parts: list[str] = []
        map_audio = ''

        input_index = 1
        voice_input_index: int | None = None
        music_input_index: int | None = None

        if voice_path:
            cmd.extend(['-i', str(voice_path)])
            voice_input_index = input_index
            input_index += 1

        if music_path:
            cmd.extend(['-stream_loop', '-1', '-i', str(music_path)])
            music_input_index = input_index

        music_gain = max(0.0, min(1.0, music_volume / 100.0)) * MUSIC_BASE_GAIN
        if voice_exists and duck_music:
            music_gain *= 0.6

        if voice_input_index is not None and music_input_index is not None:
            filter_parts.append(f'[{music_input_index}:a]atrim=0:{total_duration:.2f},asetpts=N/SR/TB,volume={music_gain:.3f}[bg]')
            filter_parts.append(f'[{voice_input_index}:a]apad=pad_dur={total_duration:.2f},atrim=0:{total_duration:.2f},asetpts=N/SR/TB[voice]')
            filter_parts.append('[voice][bg]amix=inputs=2:duration=first:dropout_transition=0[aout]')
            map_audio = '[aout]'
            logger.info(f'Muxed voice + bg music for render {render_id}', extra={'render_id': render_id})
        elif voice_input_index is not None:
            filter_parts.append(f'[{voice_input_index}:a]apad=pad_dur={total_duration:.2f},atrim=0:{total_duration:.2f},asetpts=N/SR/TB[aout]')
            map_audio = '[aout]'
        elif music_input_index is not None:
            filter_parts.append(f'[{music_input_index}:a]atrim=0:{total_duration:.2f},asetpts=N/SR/TB,volume={music_gain:.3f}[aout]')
            map_audio = '[aout]'

        if filter_parts:
            cmd.extend(['-filter_complex', ';'.join(filter_parts)])

        cmd.extend(['-map', '0:v'])
        if map_audio:
            cmd.extend(['-map', map_audio])

        cmd.extend([
            '-c:v',
            'libx264',
            '-c:a',
            'aac',
            '-b:a',
            '128k',
            '-t',
            f'{total_duration:.2f}',
            str(output_path),
        ])

        self._run(cmd)

    def _probe_duration(self, media_path: Path) -> float:
        result = subprocess.run(
            [
                'ffprobe',
                '-v',
                'error',
                '-show_entries',
                'format=duration',
                '-of',
                'default=noprint_wrappers=1:nokey=1',
                str(media_path),
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        value = float(result.stdout.strip() or '0')
        return max(0.0, value)

    def _media_has_audio(self, media_path: Path) -> bool:
        if not media_path.exists():
            return False
        try:
            result = subprocess.run(
                [
                    'ffprobe',
                    '-v',
                    'error',
                    '-select_streams',
                    'a',
                    '-show_entries',
                    'stream=codec_type',
                    '-of',
                    'csv=p=0',
                    str(media_path),
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            return bool((result.stdout or '').strip())
        except Exception:
            return False

    def _media_has_video(self, media_path: Path) -> bool:
        if not media_path.exists():
            return False
        try:
            result = subprocess.run(
                [
                    'ffprobe',
                    '-v',
                    'error',
                    '-select_streams',
                    'v',
                    '-show_entries',
                    'stream=codec_type',
                    '-of',
                    'csv=p=0',
                    str(media_path),
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            return bool((result.stdout or '').strip())
        except Exception:
            return False

    def _resolve_music_path(self, music_mode: str, track_id: str | None, music_file_url: str | None) -> Path | None:
        if music_mode == 'none':
            return None
        if music_mode == 'library' and track_id:
            track_url = BUILTIN_MUSIC_TRACKS.get(track_id)
            if not track_url:
                return None
            return self._ensure_local_media(track_url)
        if music_mode == 'upload' and music_file_url:
            return self._ensure_local_media(music_file_url)
        return None

    def _urls_to_local_paths(self, urls: list[str]) -> list[Path]:
        paths: list[Path] = []
        for url in urls:
            path = self._ensure_local_media(url)
            if path and path.exists():
                paths.append(path.resolve())
        return paths

    def _ensure_local_media(self, url: str) -> Path | None:
        normalized = str(url or '').strip()
        if not normalized:
            return None
        direct_path = Path(normalized)
        if direct_path.exists():
            return direct_path.resolve()

        gs_local = self._download_gs_uri(normalized)
        if gs_local and gs_local.exists():
            return gs_local.resolve()

        path = self._url_to_local_path(url)
        if path.exists():
            return path.resolve()

        if url.startswith('http://') or url.startswith('https://'):
            tmp_root = Path('data/tmp/media_cache')
            tmp_root.mkdir(parents=True, exist_ok=True)

            suffix = Path(url.split('?', 1)[0]).suffix or '.bin'
            timeout = httpx.Timeout(connect=20.0, read=300.0, write=60.0, pool=60.0)

            last_error: Exception | None = None

            for attempt in range(3):
                temp_dir = Path(tempfile.mkdtemp(prefix='rangmanch-media-', dir=tmp_root))
                target = temp_dir / f'asset{suffix}'

                try:
                    with httpx.Client(timeout=timeout, follow_redirects=True) as client:
                        with client.stream('GET', url) as response:
                            if response.status_code >= 400:
                                return None

                            with target.open('wb') as file_handle:
                                for chunk in response.iter_bytes(chunk_size=1024 * 1024):
                                    if chunk:
                                        file_handle.write(chunk)

                    return target

                except httpx.TimeoutException as exc:
                    last_error = exc
                    logger.warning(
                        'media_download_timeout',
                        extra={
                            'url': url,
                            'attempt': attempt + 1,
                        },
                    )
                except httpx.HTTPError as exc:
                    last_error = exc
                    logger.warning(
                        'media_download_http_error',
                        extra={
                            'url': url,
                            'attempt': attempt + 1,
                            'error': str(exc),
                        },
                    )
                except Exception as exc:
                    last_error = exc
                    logger.warning(
                        'media_download_unexpected_error',
                        extra={
                            'url': url,
                            'attempt': attempt + 1,
                            'error': str(exc),
                        },
                    )

            logger.error(
                'media_download_failed',
                extra={
                    'url': url,
                    'error': str(last_error) if last_error else 'unknown',
                },
            )
            return None

        return None

    def _download_gs_uri(self, uri: str) -> Path | None:
        value = str(uri or '').strip()
        if not value.startswith('gs://'):
            return None
        parsed = urlparse(value)
        bucket_name = normalize_firebase_bucket(parsed.netloc)
        object_path = str(parsed.path or '').strip('/')
        if not bucket_name or not object_path:
            return None
        try:
            from firebase_admin import storage
            bucket = storage.bucket(bucket_name, app=get_firebase_app())
            blob = bucket.blob(object_path)
            if not blob.exists():
                return None
            suffix = Path(object_path).suffix or '.bin'
            tmp_root = Path('data/tmp/media_cache')
            tmp_root.mkdir(parents=True, exist_ok=True)
            temp_dir = Path(tempfile.mkdtemp(prefix='rangmanch-gs-', dir=tmp_root))
            target = temp_dir / f'asset{suffix}'
            blob.download_to_filename(str(target))
            return target
        except Exception:
            logger.warning('media_download_gs_failed', extra={'uri': value.split('?', 1)[0]}, exc_info=True)
            return None

    def _url_to_local_path(self, url: str) -> Path:
        normalized = url.strip()
        if normalized.startswith('/static/'):
            normalized = normalized.replace('/static/', '', 1)
        return Path('data') / normalized

    def _make_thumbnail(self, source_video: Path, thumb_path: Path) -> None:
        self._run(['ffmpeg', '-y', '-i', str(source_video), '-frames:v', '1', str(thumb_path)])

    def _run(self, cmd: list[str]) -> None:
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            stderr = (result.stderr or '').strip()
            raise RuntimeError(f'ffmpeg failed ({result.returncode}): {stderr[:800]}')

    def _escape_drawtext(self, text: str) -> str:
        value = text.strip().replace('\n', ' ')
        return (
            value.replace('\\', r'\\')
            .replace(':', r'\:')
            .replace("'", r"\'")
            .replace('%', r'\%')
            .replace(',', r'\,')
        )

    def _resolve_target_size(self, aspect_ratio: str, resolution: str) -> tuple[int, int]:
        matrix = {
            ('9:16', '720p'): (720, 1280),
            ('9:16', '1080p'): (1080, 1920),
            ('16:9', '720p'): (1280, 720),
            ('16:9', '1080p'): (1920, 1080),
            ('1:1', '720p'): (720, 720),
            ('1:1', '1080p'): (1080, 1080),
        }
        return matrix.get((aspect_ratio, resolution), (1080, 1920))

    def _font_clause(self, text: str) -> str:
        font_path = self._resolve_font_path(text)
        if not font_path:
            return ''
        return f":fontfile='{self._escape_drawtext(font_path)}'"

    def _resolve_font_path(self, text: str) -> str | None:
        script_key = self._detect_script(text)
        if script_key in self._font_cache:
            return self._font_cache[script_key]

        candidates_by_script: dict[str, list[Path]] = {
            'devanagari': [
                Path('/System/Library/Fonts/Supplemental/ITFDevanagari.ttc'),
                Path('/System/Library/Fonts/Supplemental/Devanagari Sangam MN.ttc'),
                Path('/System/Library/Fonts/Supplemental/DevanagariMT.ttc'),
                Path('/usr/share/fonts/truetype/noto/NotoSansDevanagari-Regular.ttf'),
                Path('/usr/share/fonts/opentype/noto/NotoSansDevanagari-Regular.ttf'),
            ],
            'tamil': [
                Path('/System/Library/Fonts/Supplemental/Tamil MN.ttc'),
                Path('/System/Library/Fonts/Supplemental/Tamil Sangam MN.ttc'),
                Path('/usr/share/fonts/truetype/noto/NotoSansTamil-Regular.ttf'),
                Path('/usr/share/fonts/opentype/noto/NotoSansTamil-Regular.ttf'),
            ],
            'unicode': [
                Path('/System/Library/Fonts/Supplemental/Arial Unicode.ttf'),
                Path('/Library/Fonts/Arial Unicode.ttf'),
                Path('/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf'),
                Path('/usr/share/fonts/opentype/noto/NotoSans-Regular.ttf'),
            ],
        }

        candidates = [
            *candidates_by_script.get(script_key, []),
            *candidates_by_script['unicode'],
        ]
        for candidate in candidates:
            if candidate.exists():
                resolved = str(candidate)
                self._font_cache[script_key] = resolved
                return resolved

        logger.warning('drawtext_font_not_found', extra={'script': script_key})
        self._font_cache[script_key] = None
        return None

    def _detect_script(self, text: str) -> str:
        if re.search(r'[\u0900-\u097F]', text):
            return 'devanagari'
        if re.search(r'[\u0B80-\u0BFF]', text):
            return 'tamil'
        if any(ord(char) > 127 for char in text):
            return 'unicode'
        return 'unicode'

    def _build_caption_filters(self, script: str, total_duration: float, caption_style: str | None) -> list[str]:
        parts = [value.strip() for value in re.split(r'(?<=[.!?])\s+', script.strip()) if value.strip()]
        if not parts:
            return []
        return self._build_caption_filters_for_segments(
            segments=[
                {
                    "text": sentence,
                    "start": index * max(0.8, total_duration / len(parts)),
                    "end": min(total_duration, (index + 1) * max(0.8, total_duration / len(parts))),
                }
                for index, sentence in enumerate(parts)
            ],
            caption_style=caption_style,
        )

    def _build_caption_filters_from_timing_map(
        self,
        *,
        timing_map: list[dict[str, Any]],
        total_duration: float,
        caption_style: str | None,
    ) -> list[str]:
        segments: list[dict[str, float | str]] = []
        for item in timing_map:
            text = str(item.get("text") or "").strip()
            start = max(0.0, float(item.get("start_ms") or 0) / 1000.0)
            end = min(total_duration, float(item.get("end_ms") or 0) / 1000.0)
            if text and end > start:
                segments.append({"text": text, "start": start, "end": end})
        return self._build_caption_filters_for_segments(segments=segments, caption_style=caption_style)

    def _build_caption_filters_for_segments(
        self,
        *,
        segments: list[dict[str, float | str]],
        caption_style: str | None,
    ) -> list[str]:
        if not segments:
            return []
        style = (caption_style or 'classic').strip().lower()
        if style == 'bold':
            style_tail = (
                "fontcolor=white:fontsize=38:x=(w-text_w)/2:y=h-th-96:"
                "box=1:boxcolor=black@0.72:boxborderw=14:shadowcolor=black@0.9:shadowx=2:shadowy=2:"
            )
        elif style == 'minimal':
            style_tail = (
                "fontcolor=white@0.95:fontsize=26:x=(w-text_w)/2:y=h-th-76:"
                "box=0:shadowcolor=black@0.8:shadowx=1:shadowy=1:"
            )
        else:
            style_tail = (
                "fontcolor=white:fontsize=30:x=(w-text_w)/2:y=h-th-90:"
                "box=1:boxcolor=black@0.55:boxborderw=10:shadowcolor=black@0.7:shadowx=1:shadowy=1:"
            )
        filters: list[str] = []
        for segment in segments:
            sentence = str(segment["text"])
            start = float(segment["start"])
            end = float(segment["end"])
            text = self._escape_drawtext(sentence[:140])
            font_clause = self._font_clause(sentence)
            filters.append(
                "drawtext="
                f"text='{text}'{font_clause}:{style_tail}"
                f"enable='between(t,{start:.2f},{end:.2f})'"
            )
        return filters
