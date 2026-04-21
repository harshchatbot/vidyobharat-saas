import logging
import re
import shlex
import subprocess
import tempfile
from pathlib import Path
from typing import Any

import httpx

from app.providers.broll import BrollProvider
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
        self.renders_dir = Path('data/renders')
        self.renders_dir.mkdir(parents=True, exist_ok=True)
        self.tts_cache_dir = Path('data/tts_cache')
        self.tts_cache_dir.mkdir(parents=True, exist_ok=True)
        self.broll_provider = BrollProvider()
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

    def generate_narration_track(
        self,
        *,
        render_id: str,
        script: str,
        language_name: str | None,
        voice_name: str,
        audio_sample_rate_hz: int,
        speech_rate: float = 1.0,
    ) -> tuple[Path | None, float, dict[str, object]]:
        if not script.strip():
            return None, 0.0, {
                'tts_provider': None,
                'tts_resolved_voice': None,
                'tts_provider_message': None,
                'tts_fallback_used': False,
            }
        voice_result = generate_voiceover_detailed(
            script=script,
            voice=voice_name,
            cache_dir=self.tts_cache_dir,
            language=language_name,
            sample_rate_hz=audio_sample_rate_hz,
            speech_rate=speech_rate,
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
    ) -> Path:
        if not input_video_path.exists():
            raise FileNotFoundError(f'Input video not found: {input_video_path}')

        duration = max(0.1, self._probe_duration(input_video_path))
        text_filters: list[str] = []
        if captions_enabled and script.strip():
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
        path = self._url_to_local_path(url)
        if path.exists():
            return path

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
        segment = max(0.8, total_duration / len(parts))
        filters: list[str] = []
        for index, sentence in enumerate(parts):
            start = index * segment
            end = min(total_duration, (index + 1) * segment)
            text = self._escape_drawtext(sentence[:140])
            font_clause = self._font_clause(sentence)
            filters.append(
                "drawtext="
                f"text='{text}'{font_clause}:{style_tail}"
                f"enable='between(t,{start:.2f},{end:.2f})'"
            )
        return filters
