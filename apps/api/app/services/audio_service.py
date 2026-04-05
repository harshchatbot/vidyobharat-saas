from __future__ import annotations

import base64
import logging
import os
import subprocess
from pathlib import Path

import httpx

from app.services.video_pipeline import BUILTIN_MUSIC_TRACKS, VideoPipelineService

logger = logging.getLogger(__name__)

RECIPE_MUSIC_MAP = {
    'playful': 'soft-motivation',
    'soft_documentary_underscore': 'soft-motivation',
}

SARVAM_TTS_URL = 'https://api.sarvam.ai/text-to-speech'
SARVAM_DEFAULT_MODEL = 'bulbul:v3'
SARVAM_DEFAULT_LANGUAGE = 'en-IN'


class RecipeAudioService:
    def __init__(self) -> None:
        self.pipeline = VideoPipelineService()

    def add_audio(
        self,
        *,
        video_path: Path,
        recipe_music: str | None,
        render_id: str,
        narration_text: str | None = None,
        voice: str | None = None,
        language: str | None = None,
    ) -> Path:
        narration_path: Path | None = None
        music_path: Path | None = None

        cleaned_narration = str(narration_text or '').strip()
        if cleaned_narration:
            narration_path = self._generate_narration_track(
                text=cleaned_narration,
                render_id=render_id,
                voice=voice,
                language=language,
            )

        if recipe_music:
            track_id = RECIPE_MUSIC_MAP.get(recipe_music)
            if not track_id or track_id not in BUILTIN_MUSIC_TRACKS:
                logger.info(
                    'recipe_audio_track_unavailable',
                    extra={'render_id': render_id, 'recipe_music': recipe_music},
                )
            else:
                resolved_music_path = self.pipeline._resolve_music_path('library', track_id, None)
                if resolved_music_path and resolved_music_path.exists():
                    music_path = resolved_music_path
                else:
                    logger.info(
                        'recipe_audio_track_missing',
                        extra={'render_id': render_id, 'track_id': track_id},
                    )

        if narration_path and music_path:
            return self._mux_narration_and_music(
                video_path=video_path,
                narration_path=narration_path,
                music_path=music_path,
                render_id=render_id,
            )

        if narration_path:
            return self._mux_narration_only(
                video_path=video_path,
                narration_path=narration_path,
                render_id=render_id,
            )

        if music_path:
            return self._mux_music_only(
                video_path=video_path,
                music_path=music_path,
                render_id=render_id,
            )

        return video_path

    def _generate_narration_track(
        self,
        *,
        text: str,
        render_id: str,
        voice: str | None,
        language: str | None,
    ) -> Path | None:
        """
        Try Sarvam TTS first. Fall back to macOS 'say' only for local/dev safety.
        """
        sarvam_path = self._generate_narration_track_sarvam(
            text=text,
            render_id=render_id,
            voice=voice,
            language=language,
        )
        if sarvam_path:
            return sarvam_path

        return self._generate_narration_track_local_fallback(
            text=text,
            render_id=render_id,
            voice=voice,
            language=language,
        )

    def _generate_narration_track_sarvam(
        self,
        *,
        text: str,
        render_id: str,
        voice: str | None,
        language: str | None,
    ) -> Path | None:
        api_key = os.getenv('SARVAM_API_KEY') or os.getenv('SARVAM_SUBSCRIPTION_KEY')
        if not api_key:
            logger.info(
                'recipe_narration_sarvam_skipped',
                extra={'render_id': render_id, 'reason': 'missing_api_key'},
            )
            return None

        output_path = Path('data/renders') / f'{render_id}-narration.wav'
        output_path.parent.mkdir(parents=True, exist_ok=True)

        speaker = (voice or 'shubh').strip().lower() or 'shubh'
        target_language_code = self._normalize_language_code(language)

        payload = {
            'text': text,
            'target_language_code': target_language_code,
            'model': SARVAM_DEFAULT_MODEL,
            'speaker': speaker,
            'pace': 1.0,
            'speech_sample_rate': 24000,
            'output_audio_codec': 'wav',
            'temperature': 0.4,
        }

        headers = {
            'api-subscription-key': api_key,
            'Content-Type': 'application/json',
        }

        timeout = httpx.Timeout(connect=20.0, read=120.0, write=60.0, pool=60.0)

        try:
            with httpx.Client(timeout=timeout, follow_redirects=True) as client:
                response = client.post(SARVAM_TTS_URL, json=payload, headers=headers)
                response.raise_for_status()
                data = response.json()

            audios = data.get('audios') or []
            if not audios:
                logger.warning(
                    'recipe_narration_sarvam_empty',
                    extra={'render_id': render_id, 'speaker': speaker},
                )
                return None

            audio_b64 = ''.join(audios)
            audio_bytes = base64.b64decode(audio_b64)
            output_path.write_bytes(audio_bytes)

            logger.info(
                'recipe_narration_generated',
                extra={
                    'render_id': render_id,
                    'provider': 'sarvam',
                    'voice': speaker,
                    'language': target_language_code,
                    'path': str(output_path),
                },
            )
            return output_path

        except Exception as exc:
            logger.warning(
                'recipe_narration_sarvam_failed',
                extra={
                    'render_id': render_id,
                    'speaker': speaker,
                    'language': target_language_code,
                    'error': str(exc),
                },
            )
            return None

    def _generate_narration_track_local_fallback(
        self,
        *,
        text: str,
        render_id: str,
        voice: str | None,
        language: str | None,
    ) -> Path | None:
        """
        Local/dev fallback only. This is NOT Sarvam.
        """
        output_path = Path('data/renders') / f'{render_id}-narration.aiff'
        output_path.parent.mkdir(parents=True, exist_ok=True)

        requested_voice = (voice or '').strip()
        selected_voice = requested_voice if requested_voice else 'Samantha'

        try:
            subprocess.run(
                [
                    'say',
                    '-v',
                    selected_voice,
                    '-o',
                    str(output_path),
                    text,
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            logger.info(
                'recipe_narration_generated',
                extra={
                    'render_id': render_id,
                    'provider': 'local_fallback',
                    'voice': selected_voice,
                    'language': language or '',
                    'path': str(output_path),
                },
            )
            return output_path
        except FileNotFoundError:
            logger.warning(
                'recipe_narration_unavailable',
                extra={
                    'render_id': render_id,
                    'reason': 'say_command_missing',
                },
            )
            return None
        except subprocess.CalledProcessError as exc:
            logger.warning(
                'recipe_narration_failed',
                extra={
                    'render_id': render_id,
                    'voice': selected_voice,
                    'stderr': (exc.stderr or '')[:500],
                },
            )
            return None

    def _normalize_language_code(self, language: str | None) -> str:
        normalized = (language or '').strip().lower()
        if normalized in {'english', 'en', 'en-in'}:
            return 'en-IN'
        if normalized in {'hindi', 'hi', 'hi-in'}:
            return 'hi-IN'
        return SARVAM_DEFAULT_LANGUAGE

    def _mux_narration_only(self, *, video_path: Path, narration_path: Path, render_id: str) -> Path:
        output_path = Path('data/renders') / f'{render_id}-narration.mp4'
        output_path.parent.mkdir(parents=True, exist_ok=True)

        self.pipeline._run(
            [
                'ffmpeg',
                '-y',
                '-i',
                str(video_path),
                '-i',
                str(narration_path),
                '-map',
                '0:v',
                '-map',
                '1:a',
                '-c:v',
                'copy',
                '-c:a',
                'aac',
                '-b:a',
                '128k',
                '-shortest',
                str(output_path),
            ]
        )
        return output_path

    def _mux_music_only(self, *, video_path: Path, music_path: Path, render_id: str) -> Path:
        output_path = Path('data/renders') / f'{render_id}-music.mp4'
        output_path.parent.mkdir(parents=True, exist_ok=True)

        self.pipeline._run(
            [
                'ffmpeg',
                '-y',
                '-i',
                str(video_path),
                '-stream_loop',
                '-1',
                '-i',
                str(music_path),
                '-filter_complex',
                '[1:a]atrim=0,asetpts=N/SR/TB,volume=0.28[aout]',
                '-map',
                '0:v',
                '-map',
                '[aout]',
                '-c:v',
                'copy',
                '-c:a',
                'aac',
                '-b:a',
                '128k',
                '-shortest',
                str(output_path),
            ]
        )
        return output_path

    def _mux_narration_and_music(
        self,
        *,
        video_path: Path,
        narration_path: Path,
        music_path: Path,
        render_id: str,
    ) -> Path:
        output_path = Path('data/renders') / f'{render_id}-final-audio.mp4'
        output_path.parent.mkdir(parents=True, exist_ok=True)

        self.pipeline._run(
            [
                'ffmpeg',
                '-y',
                '-i',
                str(video_path),
                '-i',
                str(narration_path),
                '-stream_loop',
                '-1',
                '-i',
                str(music_path),
                '-filter_complex',
                '[2:a]atrim=0,asetpts=N/SR/TB,volume=0.08[bg];'
                '[1:a][bg]amix=inputs=2:duration=first:dropout_transition=2[aout]',
                '-map',
                '0:v',
                '-map',
                '[aout]',
                '-c:v',
                'copy',
                '-c:a',
                'aac',
                '-b:a',
                '128k',
                '-shortest',
                str(output_path),
            ]
        )
        return output_path