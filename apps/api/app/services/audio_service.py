from __future__ import annotations

import base64
import logging
import subprocess
from pathlib import Path

import httpx

from app.core.config import get_settings
from app.services.persona_voice_service import PersonaVoiceService
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
        self.settings = get_settings()
        self.pipeline = VideoPipelineService()
        self.persona_voice = PersonaVoiceService()

    def add_audio(
        self,
        *,
        video_path: Path,
        recipe_music: str | None,
        render_id: str,
        narration_text: str | None = None,
        voice: str | None = None,
        voice_profile: dict | None = None,
        language: str | None = None,
        audio_fade_in_seconds: float = 0.0,
        audio_fade_out_seconds: float = 0.0,
        music_mix_gain: float = 0.08,
    ) -> Path:
        narration_path: Path | None = None
        music_path: Path | None = None

        cleaned_narration = str(narration_text or '').strip()
        if cleaned_narration:
            narration_path = self._generate_narration_track(
                text=cleaned_narration,
                render_id=render_id,
                voice=voice,
                voice_profile=voice_profile,
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
                audio_fade_in_seconds=audio_fade_in_seconds,
                audio_fade_out_seconds=audio_fade_out_seconds,
                music_mix_gain=music_mix_gain,
            )

        if narration_path:
            return self._mux_narration_only(
                video_path=video_path,
                narration_path=narration_path,
                render_id=render_id,
                audio_fade_in_seconds=audio_fade_in_seconds,
                audio_fade_out_seconds=audio_fade_out_seconds,
            )

        if music_path:
            return self._mux_music_only(
                video_path=video_path,
                music_path=music_path,
                render_id=render_id,
                audio_fade_in_seconds=audio_fade_in_seconds,
                audio_fade_out_seconds=audio_fade_out_seconds,
            )

        return video_path

    def _generate_narration_track(
        self,
        *,
        text: str,
        render_id: str,
        voice: str | None,
        voice_profile: dict | None,
        language: str | None,
    ) -> Path | None:
        """
        Try Sarvam TTS first. Fall back to macOS 'say' only for local/dev safety.
        """
        persona_input = self.persona_voice.prepare_tts_input(
            script=text,
            voice_profile=voice_profile,
            fallback_speaker=(voice or 'Shubh'),
            fallback_speech_rate=self.settings.avatar_tts_speech_rate,
        )
        sarvam_path = self._generate_narration_track_sarvam(
            text=str(persona_input['text']),
            render_id=render_id,
            voice=str(persona_input['speaker']),
            language=language,
            speech_rate=float(persona_input['speech_rate']),
        )
        if sarvam_path:
            return sarvam_path

        return self._generate_narration_track_local_fallback(
            text=str(persona_input['text']),
            render_id=render_id,
            voice=str(persona_input['voice_key']),
            language=language,
        )

    def _generate_narration_track_sarvam(
        self,
        *,
        text: str,
        render_id: str,
        voice: str | None,
        language: str | None,
        speech_rate: float = 1.0,
    ) -> Path | None:
        api_key = self.settings.sarvam_api_key
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

        try:
            audio_bytes = self._synthesize_with_sarvam(
                text=text,
                api_key=api_key,
                speaker=speaker,
                target_language_code=target_language_code,
                pace=speech_rate,
            )
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
                    'has_api_key': bool(api_key),
                    'speaker': speaker,
                    'language': target_language_code,
                    'text_preview': text[:120],
                    'error': str(exc),
                },
            )
            return None

    def _synthesize_with_sarvam(
        self,
        *,
        text: str,
        api_key: str,
        speaker: str,
        target_language_code: str,
        pace: float = 1.0,
    ) -> bytes:
        payload = {
            'text': text,
            'target_language_code': target_language_code,
            'model': SARVAM_DEFAULT_MODEL,
            'speaker': speaker,
            'pace': max(0.7, min(float(pace or 1.0), 1.35)),
            'speech_sample_rate': 24000,
            'output_audio_codec': 'wav',
            'temperature': 0.4,
        }

        headers = {
            'api-subscription-key': api_key,
            'Content-Type': 'application/json',
        }

        timeout = httpx.Timeout(connect=20.0, read=120.0, write=60.0, pool=60.0)

        with httpx.Client(timeout=timeout, follow_redirects=True) as client:
            response = client.post(SARVAM_TTS_URL, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()

        audios = data.get('audios') or []
        if not audios:
            raise RuntimeError(f'Sarvam returned no audio payload: {data}')

        audio_b64 = ''.join(audios)
        return base64.b64decode(audio_b64)

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

    def _mux_narration_only(
        self,
        *,
        video_path: Path,
        narration_path: Path,
        render_id: str,
        audio_fade_in_seconds: float,
        audio_fade_out_seconds: float,
    ) -> Path:
        output_path = Path('data/renders') / f'{render_id}-narration.mp4'
        output_path.parent.mkdir(parents=True, exist_ok=True)
        filter_chain = self._audio_smoothing_filter_chain(
            fade_in_seconds=audio_fade_in_seconds,
            fade_out_seconds=audio_fade_out_seconds,
        )

        if filter_chain:
            filter_complex = f'[1:a]{filter_chain}[aout]'
            audio_map = '[aout]'
            filter_args = ['-filter_complex', filter_complex]
        else:
            audio_map = '1:a'
            filter_args = []

        self.pipeline._run(
            [
                'ffmpeg',
                '-y',
                '-i',
                str(video_path),
                '-i',
                str(narration_path),
                *filter_args,
                '-map',
                '0:v',
                '-map',
                audio_map,
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

    def _mux_music_only(
        self,
        *,
        video_path: Path,
        music_path: Path,
        render_id: str,
        audio_fade_in_seconds: float,
        audio_fade_out_seconds: float,
    ) -> Path:
        output_path = Path('data/renders') / f'{render_id}-music.mp4'
        output_path.parent.mkdir(parents=True, exist_ok=True)
        filter_chain = self._audio_smoothing_filter_chain(
            fade_in_seconds=audio_fade_in_seconds,
            fade_out_seconds=audio_fade_out_seconds,
        )
        if filter_chain:
            filter_complex = f'[1:a]atrim=0,asetpts=N/SR/TB,volume=0.28,{filter_chain}[aout]'
        else:
            filter_complex = '[1:a]atrim=0,asetpts=N/SR/TB,volume=0.28[aout]'

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
                filter_complex,
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
        audio_fade_in_seconds: float,
        audio_fade_out_seconds: float,
        music_mix_gain: float,
    ) -> Path:
        output_path = Path('data/renders') / f'{render_id}-final-audio.mp4'
        output_path.parent.mkdir(parents=True, exist_ok=True)
        clamped_gain = max(0.0, min(1.0, float(music_mix_gain)))
        smoothing_chain = self._audio_smoothing_filter_chain(
            fade_in_seconds=audio_fade_in_seconds,
            fade_out_seconds=audio_fade_out_seconds,
        )
        if smoothing_chain:
            filter_complex = (
                f'[2:a]atrim=0,asetpts=N/SR/TB,volume={clamped_gain:.2f}[bg];'
                f'[1:a][bg]amix=inputs=2:duration=first:dropout_transition=2[mix];'
                f'[mix]{smoothing_chain}[aout]'
            )
        else:
            filter_complex = (
                f'[2:a]atrim=0,asetpts=N/SR/TB,volume={clamped_gain:.2f}[bg];'
                '[1:a][bg]amix=inputs=2:duration=first:dropout_transition=2[aout]'
            )

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
                filter_complex,
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

    def _audio_smoothing_filter_chain(self, *, fade_in_seconds: float, fade_out_seconds: float) -> str:
        chain: list[str] = []
        try:
            fade_in = max(0.0, float(fade_in_seconds))
        except (TypeError, ValueError):
            fade_in = 0.0
        try:
            fade_out = max(0.0, float(fade_out_seconds))
        except (TypeError, ValueError):
            fade_out = 0.0

        if fade_in > 0:
            chain.append(f'afade=t=in:st=0:d={fade_in:.3f}')
        if fade_out > 0:
            # End fade without pre-probing track duration.
            chain.append(f'areverse,afade=t=in:st=0:d={fade_out:.3f},areverse')
        return ",".join(chain)
