import json
import logging
import mimetypes
import subprocess
import threading
import time
from base64 import b64decode
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from uuid import uuid4

import httpx
from openai import OpenAI
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.repositories.video_repository import VideoRepository
from app.models.entities import Video, VideoStatus
from app.providers.storage import build_storage_provider
from app.services.asset_tagging_service import AssetTaggingService
from app.services.credit_service import CreditService
from app.services.render_service import celery_app
from app.services.smart_model_router import SmartModelRouter
from app.services.video_pipeline import VideoPipelineService

logger = logging.getLogger(__name__)
OPENAI_VIDEO_TIMEOUT_SECONDS = 600
OPENAI_POLL_INTERVAL_SECONDS = 5

VIDEO_INSPIRATION_ITEMS = [
    {
        'id': 'vid-insp-1',
        'creator_name': 'Meera',
        'model_key': 'sora2',
        'provider_name': 'OpenAI Sora 2',
        'title': 'Apocalyptic Street Teaser',
        'prompt': 'Abandoned city street after rainfall, cinematic fog, creeping vines, cracked asphalt, silent tension, premium vertical teaser framing.',
        'video_url': '/videos/samples/hindi-festival-9x16.mp4',
        'thumbnail_url': '/videos/samples/hindi-festival-9x16-frame.jpg',
        'aspect_ratio': '9:16',
        'resolution': '720p',
        'duration_seconds': 8,
        'created_at': '2026-02-28T08:45:00Z',
        'tags': ['cinematic', 'post-apocalyptic', 'street', 'fog', 'vertical teaser'],
    },
    {
        'id': 'vid-insp-2',
        'creator_name': 'Kabir',
        'model_key': 'veo3',
        'provider_name': 'Google Veo 3.1',
        'title': 'Founder Launch Cut',
        'prompt': 'Premium founder launch montage inside a dark tech office, moody blue-gold lighting, confident close-ups, polished motion, startup launch energy.',
        'video_url': 'https://cdn.coverr.co/videos/coverr-working-in-the-office-5176/1080p.mp4',
        'thumbnail_url': 'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1200&q=80',
        'aspect_ratio': '16:9',
        'resolution': '1080p',
        'duration_seconds': 8,
        'created_at': '2026-02-25T11:20:00Z',
        'tags': ['startup', 'office', 'launch', 'cinematic', 'brand film'],
    },
    {
        'id': 'vid-insp-3',
        'creator_name': 'Aarohi',
        'model_key': 'kling3',
        'provider_name': 'Kling 3.0',
        'title': 'Luxury Fashion Motion Poster',
        'prompt': 'High-fashion motion poster with glossy reflections, portrait lens compression, elegant movement, and gold-accent editorial lighting.',
        'video_url': 'https://cdn.coverr.co/videos/coverr-model-looking-at-camera-1568045416603?download=1080p',
        'thumbnail_url': 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1200&q=80',
        'aspect_ratio': '4:5',
        'resolution': '1080p',
        'duration_seconds': 6,
        'created_at': '2026-02-21T15:05:00Z',
        'tags': ['fashion', 'luxury', 'poster', 'studio', 'editorial'],
    },
]


class ProviderError(Exception):
    pass


@dataclass(frozen=True)
class ModelRegistryEntry:
    key: str
    label: str
    description: str
    frontend_hint: str
    api_adapter: str


@dataclass
class ProviderResult:
    provider: str
    model_key: str
    video_url: str
    metadata: dict[str, Any]


class AIVideoCreateService:
    VIDEO_MODEL_REGISTRY: dict[str, ModelRegistryEntry] = {
        'sora2': ModelRegistryEntry(
            key='sora2',
            label='Cinematic Storytelling (Sora 2)',
            description='Best for realistic narrative videos with synced audio and premium motion realism.',
            frontend_hint='Use this when story continuity and high-end realism matter most.',
            api_adapter='generate_with_sora2',
        ),
        'veo3': ModelRegistryEntry(
            key='veo3',
            label='High-Quality Cinematics (Veo 3.1)',
            description='Best for polished short-form videos with native audio and cinematic motion.',
            frontend_hint='Use this for strong cinematic finish and premium short-form outputs.',
            api_adapter='generate_with_veo3',
        ),
        'kling3': ModelRegistryEntry(
            key='kling3',
            label='Stylized Rapid Drafts (Kling 3.0)',
            description='Best for quick stylized clips, fast iteration, and visually expressive drafts.',
            frontend_hint='Use this when you want creative motion fast and need tighter control over short clip length.',
            api_adapter='generate_with_kling3',
        ),
    }

    DURATION_RULES: dict[str, dict[str, Any]] = {
        'sora2': {'presets': {4, 8, 12}, 'default': 8},
        'veo3': {'presets': {4, 6, 8}, 'default': 8, 'seeded_only': 8},
        'kling3': {'min': 3, 'max': 10, 'default': 5},
    }

    OUTPUT_RULES: dict[str, dict[str, Any]] = {
        'sora2': {'aspects': {'9:16', '16:9'}, 'resolutions': {'720p'}},
        'veo3': {'aspects': {'9:16', '16:9', '1:1'}, 'resolutions': {'720p', '1080p'}},
        'kling3': {'aspects': {'9:16', '16:9', '1:1'}, 'resolutions': {'720p', '1080p'}},
    }

    def __init__(self, db: Session, settings: Settings) -> None:
        self.db = db
        self.settings = settings
        self.repo = VideoRepository(db)
        self.pipeline = VideoPipelineService()
        self.tagging = AssetTaggingService(db)
        self.providers = {
            'sora2': self.generate_with_sora2,
            'veo3': self.generate_with_veo3,
            'kling3': self.generate_with_kling3,
        }
        self.model_router = SmartModelRouter()
        # Keep fallbacks conservative: only retry with another compatible short-form provider.
        self.video_fallbacks: dict[str, list[str]] = {
            'sora2': [],
            'veo3': ['kling3'],
            'kling3': ['veo3'],
        }

    def list_models(self) -> list[ModelRegistryEntry]:
        return list(self.VIDEO_MODEL_REGISTRY.values())

    def list_inspiration(self) -> list[dict[str, object]]:
        return VIDEO_INSPIRATION_ITEMS

    def create_video(
        self,
        *,
        user_id: str,
        template: str,
        language: str,
        image_urls: list[str],
        script: str,
        tags: list[str],
        model_key: str,
        aspect_ratio: str,
        resolution: str,
        duration_mode: str,
        duration_seconds: int | None,
        voice: str,
        music: dict[str, Any] | None = None,
        audio_settings: dict[str, Any] | None = None,
        captions_enabled: bool = True,
        caption_style: str | None = None,
    ) -> Video:
        registry_entry = self.VIDEO_MODEL_REGISTRY.get(model_key)
        adapter = self.providers.get(model_key)
        if not registry_entry or not adapter:
            raise ProviderError(f'Unsupported model: {model_key}')

        self._validate_output_settings(model_key=model_key, aspect_ratio=aspect_ratio, resolution=resolution)

        normalized_duration = self._normalize_duration(
            model_key=model_key,
            duration_mode=duration_mode,
            duration_seconds=duration_seconds,
            image_urls=image_urls,
        )
        sample_rate_hz = int((audio_settings or {}).get('sampleRateHz') or 22050)
        if sample_rate_hz not in {8000, 22050, 48000}:
            raise ProviderError('sampleRateHz must be one of 8000, 22050, or 48000')
        seed_image_url = image_urls[0] if image_urls else None
        video = self.repo.create(
            user_id=user_id,
            title=script[:80] or registry_entry.label,
            template=template,
            language=language,
            script=script,
            voice=voice,
            aspect_ratio=aspect_ratio,
            resolution=resolution,
            duration_mode=duration_mode,
            duration_seconds=normalized_duration,
            captions_enabled=captions_enabled,
            caption_style=caption_style,
            status=VideoStatus.draft,
            progress=0,
            image_urls=json.dumps(image_urls),
            selected_model=model_key,
            provider_name=registry_entry.label,
            source_image_url=seed_image_url,
            reference_images=json.dumps(image_urls),
            music_mode=str((music or {}).get('type') or 'none'),
            music_file_url=(music or {}).get('url'),
            music_volume=int((audio_settings or {}).get('volume') or 20),
            duck_music=bool((audio_settings or {}).get('ducking', True)),
            audio_sample_rate_hz=sample_rate_hz,
        )
        self.tagging.repo.add_tags(asset_id=video.id, asset_type='video', tags=self.tagging.tag_script(script), source='auto')
        if tags:
            self.tagging.repo.add_tags(asset_id=video.id, asset_type='video', tags=tags, source='user')
        try:
            async_result = celery_process_ai_video.apply_async(args=[video.id])
            logger.info(
                'ai_video_enqueue_success',
                extra={
                    'render_id': video.id,
                    'task_name': 'process_ai_video',
                    'task_id': async_result.id,
                    'queue': getattr(celery_app.conf, 'task_default_queue', 'celery'),
                },
            )
        except Exception as exc:
            logger.exception('ai_video_enqueue_failed', extra={'render_id': video.id})
            # Redis/Celery may be temporarily unavailable in production.
            # Fall back to a detached in-process worker so requests remain non-blocking.
            try:
                self.repo.update(video, status=VideoStatus.processing, progress=15, error_message=None)
                logger.info(
                    'ai_video_local_runner_activated',
                    extra={'render_id': video.id, 'reason': str(exc)[:180]},
                )
                _launch_local_video_job(video.id)
                return video
            except Exception as fallback_exc:
                self.repo.update(
                    video,
                    status=VideoStatus.provider_failed,
                    progress=100,
                    error_message=f'Failed to enqueue render job: {str(exc)[:180]}',
                )
                raise ProviderError('Video worker queue is unavailable right now. Please try again shortly.') from fallback_exc
        return video

    def get_video(self, video_id: str, user_id: str) -> Video | None:
        video = self.repo.get_by_id(video_id)
        if not video or video.user_id != user_id:
            return None
        return video

    def generate_with_sora2(self, params: dict[str, Any]) -> ProviderResult:
        # Environment variables required for real integration:
        # - OPENAI_API_KEY
        # - OPENAI_VIDEO_MODEL (optional override, defaults to sora-2)
        #
        # This uses the official OpenAI video REST endpoints:
        # - POST /v1/videos
        # - GET /v1/videos/{id}
        # - GET /v1/videos/{id}/content
        #
        # If OpenAI changes the contract, update this adapter only. The rest of the app
        # should stay stable because we normalize the provider result below.
        if not self.settings.openai_api_key:
            raise ProviderError('OPENAI_API_KEY is not configured for Sora 2')

        model = self.settings.openai_video_model
        size = self._map_openai_video_size(params['aspectRatio'], params['resolution'])
        prompt = self._build_sora_prompt(
            script=params['script'],
            voice=params['voice'],
            aspect_ratio=params['aspectRatio'],
            resolution=params['resolution'],
            duration_seconds=params['durationSeconds'],
        )

        render_dir = Path('data/renders')
        render_dir.mkdir(parents=True, exist_ok=True)
        local_video_path = render_dir / f"{params['videoId']}.mp4"

        headers = {
            'Authorization': f'Bearer {self.settings.openai_api_key}',
        }
        multipart_fields: list[tuple[str, tuple[str | None, bytes | str, str | None]]] = [
            ('model', (None, model, None)),
            ('prompt', (None, prompt, None)),
            ('size', (None, size, None)),
            ('seconds', (None, str(params['durationSeconds']), None)),
        ]

        if params.get('imageUrl'):
            filename, content, mime = self._load_reference_image(params['imageUrl'], size)
            multipart_fields.append(('input_reference', (filename, content, mime)))

        with httpx.Client(timeout=httpx.Timeout(120.0, connect=30.0)) as client:
            response = client.post(
                'https://api.openai.com/v1/videos',
                headers=headers,
                files=multipart_fields,
            )
            if response.status_code >= 400:
                raise ProviderError(f'OpenAI Sora create failed ({response.status_code}): {self._truncate_error(response.text)}')

            payload = response.json()
            openai_video_id = str(payload.get('id') or '')
            if not openai_video_id:
                raise ProviderError('OpenAI Sora create response did not include a video id')

            start = time.time()
            last_progress = 30
            while True:
                status_response = client.get(
                    f'https://api.openai.com/v1/videos/{openai_video_id}',
                    headers=headers,
                )
                if status_response.status_code >= 400:
                    raise ProviderError(f'OpenAI Sora status failed ({status_response.status_code}): {self._truncate_error(status_response.text)}')

                status_payload = status_response.json()
                status_value = str(status_payload.get('status') or '').lower()
                progress = status_payload.get('progress')
                if isinstance(progress, int):
                    current_progress = max(30, min(95, progress))
                else:
                    current_progress = min(last_progress + 8, 92)
                last_progress = current_progress
                self._update_video_progress(params['videoId'], current_progress)

                if status_value in {'completed', 'succeeded', 'success'}:
                    break
                if status_value in {'failed', 'error', 'cancelled', 'canceled'}:
                    error_message = status_payload.get('error') or status_payload.get('last_error') or 'OpenAI Sora generation failed'
                    raise ProviderError(str(error_message))
                if time.time() - start > OPENAI_VIDEO_TIMEOUT_SECONDS:
                    raise ProviderError('OpenAI Sora generation timed out while waiting for completion')
                time.sleep(OPENAI_POLL_INTERVAL_SECONDS)

            content_response = client.get(
                f'https://api.openai.com/v1/videos/{openai_video_id}/content',
                headers=headers,
            )
            if content_response.status_code >= 400:
                raise ProviderError(f'OpenAI Sora content download failed ({content_response.status_code}): {self._truncate_error(content_response.text)}')

            local_video_path.write_bytes(content_response.content)

        return ProviderResult(
            provider='OpenAI Sora 2',
            model_key='sora2',
            video_url=f'/static/renders/{params["videoId"]}.mp4',
            metadata={
                'voice': params['voice'],
                'size': size,
                'openai_video_model': model,
            },
        )

    def generate_with_veo3(self, params: dict[str, Any]) -> ProviderResult:
        # Environment variables required for real integration:
        # - GEMINI_API_KEY
        # - or Vertex AI credentials if you choose the Vertex route for Veo 3.1
        #
        # Real Gemini / Vertex video generation integration belongs here. Replace this fallback
        # with the official Google Veo 3.1 call using:
        # - prompt=params["script"]
        # - image reference when params["imageUrl"] is present
        # - aspect ratio / duration / voice mapped to the provider payload
        if not self.settings.gemini_api_key:
            raise ProviderError('GEMINI_API_KEY is not configured for Veo 3.1')
        output_path, _, tts_diagnostics = self._render_local_proxy(
            render_id_prefix='veo3',
            script=params['script'],
            image_url=params.get('imageUrl'),
            language=params.get('language'),
            voice=params['voice'],
            audio_sample_rate_hz=int((params.get('audioSettings') or {}).get('sampleRateHz') or 22050),
            aspect_ratio=params['aspectRatio'],
            resolution=params['resolution'],
            duration_seconds=params['durationSeconds'],
            captions_enabled=bool(params.get('captionsEnabled', True)),
            caption_style=params.get('captionStyle'),
        )
        return ProviderResult(
            provider='Google Veo 3.1',
            model_key='veo3',
            video_url=output_path,
            metadata={'mode': 'local-proxy-placeholder', 'voice': params['voice'], **tts_diagnostics},
        )

    def generate_with_kling3(self, params: dict[str, Any]) -> ProviderResult:
        # Environment variables for real integration:
        # - KLING_API_KEY
        # - KLING_API_SECRET
        # - KLING_API_BASE
        #
        # Insert the real Kling 3.0 API request here. The normalized response should
        # still return the final video URL and provider label so the rest of the app
        # does not care which provider produced the clip.
        if not self.settings.kling_api_key:
            raise ProviderError('KLING_API_KEY is not configured for Kling 3.0')
        if not self.settings.kling_api_secret:
            raise ProviderError('KLING_API_SECRET is not configured for Kling 3.0')
        output_path, _, tts_diagnostics = self._render_local_proxy(
            render_id_prefix='kling3',
            script=params['script'],
            image_url=params.get('imageUrl'),
            language=params.get('language'),
            voice=params['voice'],
            audio_sample_rate_hz=int((params.get('audioSettings') or {}).get('sampleRateHz') or 22050),
            aspect_ratio=params['aspectRatio'],
            resolution=params['resolution'],
            duration_seconds=params['durationSeconds'],
            captions_enabled=bool(params.get('captionsEnabled', True)),
            caption_style=params.get('captionStyle'),
        )
        return ProviderResult(
            provider='Kling 3.0',
            model_key='kling3',
            video_url=output_path,
            metadata={'mode': 'local-proxy-placeholder', 'voice': params['voice'], **tts_diagnostics},
        )

    def execute_model_with_router(self, payload: dict[str, Any]) -> ProviderResult:
        requested_model = str(payload.get('modelKey') or '')
        if requested_model not in self.providers:
            raise ProviderError(f'Unsupported model: {requested_model}')

        fallback_models = self.video_fallbacks.get(requested_model, [])
        routed = self.model_router.resolve_and_execute(
            requested_model_id=requested_model,
            fallback_model_ids=fallback_models,
            execute=lambda model_id: self.providers[model_id]({**payload, 'modelKey': model_id}),
        )
        result = routed.value
        result.metadata = {
            **(result.metadata or {}),
            'requested_model': requested_model,
            'resolved_model': routed.resolved_model_id,
            'fallback_used': routed.fallback_used,
            'retry_errors': routed.retry_errors,
            'fallback_reason': routed.retry_errors[-1] if routed.retry_errors else None,
        }
        if routed.fallback_used:
            logger.warning(
                'video_generation_model_fallback_used',
                extra={'requested_model': requested_model, 'resolved_model': routed.resolved_model_id},
            )
        return result

    def _render_local_proxy(
        self,
        *,
        render_id_prefix: str,
        script: str,
        image_url: str | None,
        language: str | None,
        voice: str,
        audio_sample_rate_hz: int,
        aspect_ratio: str,
        resolution: str,
        duration_seconds: int,
        captions_enabled: bool,
        caption_style: str | None,
    ) -> tuple[str, str, dict[str, object]]:
        render_id = f'{render_id_prefix}-{Path.cwd().name}-{Path(script[:32]).stem}'.replace(' ', '-')
        render_id = f'{render_id_prefix}-{abs(hash((script, image_url, voice, aspect_ratio, resolution, duration_seconds))) % 10**10}'
        seed_image_url = self._ensure_proxy_seed_image(
            render_id=render_id,
            script=script,
            image_url=image_url,
            aspect_ratio=aspect_ratio,
            resolution=resolution,
        )
        image_urls = [seed_image_url] if seed_image_url else []
        _, _, tts_diagnostics = self.pipeline.render_video_from_assets(
            video_id=render_id,
            title='AI Generated Video',
            script=script,
            language_name=language,
            voice_name=voice,
            audio_sample_rate_hz=audio_sample_rate_hz,
            image_urls=image_urls,
            aspect_ratio=aspect_ratio,
            resolution=resolution,
            duration_mode='custom',
            duration_seconds=duration_seconds,
            captions_enabled=captions_enabled,
            caption_style=caption_style,
            music_mode='none',
            music_track_id=None,
            music_file_url=None,
            music_volume=0,
            duck_music=False,
        )
        return (
            f'/static/renders/{render_id}.mp4',
            f'/static/renders/{render_id}.jpg',
            tts_diagnostics,
        )

    def _ensure_proxy_seed_image(
        self,
        *,
        render_id: str,
        script: str,
        image_url: str | None,
        aspect_ratio: str,
        resolution: str,
    ) -> str | None:
        if image_url:
            return image_url

        generated = self._generate_proxy_seed_with_openai(
            render_id=render_id,
            script=script,
            aspect_ratio=aspect_ratio,
            resolution=resolution,
        )
        if generated:
            return generated

        placeholder = self._generate_proxy_seed_placeholder(
            render_id=render_id,
            aspect_ratio=aspect_ratio,
            resolution=resolution,
        )
        return placeholder

    def _generate_proxy_seed_with_openai(
        self,
        *,
        render_id: str,
        script: str,
        aspect_ratio: str,
        resolution: str,
    ) -> str | None:
        if not self.settings.openai_api_key:
            return None
        try:
            size = self._openai_image_size_for_proxy(aspect_ratio=aspect_ratio, resolution=resolution)
            client = OpenAI(api_key=self.settings.openai_api_key)
            response = client.images.generate(
                model=self.settings.openai_image_model,
                prompt=(
                    f'Create a cinematic video keyframe for this scene: {script}. '
                    f'Keep composition rich, detailed, realistic, and suitable as a storyboard frame for {aspect_ratio}.'
                ),
                size=size,
            )
            if not response.data:
                return None

            output_path = Path('data/renders') / f'{render_id}-seed.png'
            output_path.parent.mkdir(parents=True, exist_ok=True)

            image_base64 = getattr(response.data[0], 'b64_json', None)
            if image_base64:
                output_path.write_bytes(b64decode(image_base64))
                return f'/static/renders/{output_path.name}'

            remote_url = getattr(response.data[0], 'url', None)
            if isinstance(remote_url, str) and remote_url.strip():
                return remote_url.strip()
        except Exception:
            logger.warning('proxy_seed_openai_generation_failed', extra={'render_id': render_id})
        return None

    def _generate_proxy_seed_placeholder(
        self,
        *,
        render_id: str,
        aspect_ratio: str,
        resolution: str,
    ) -> str | None:
        try:
            width, height = self._proxy_dimensions(aspect_ratio=aspect_ratio, resolution=resolution)
            output_path = Path('data/renders') / f'{render_id}-seed.png'
            output_path.parent.mkdir(parents=True, exist_ok=True)
            subprocess.run(
                [
                    'ffmpeg',
                    '-y',
                    '-f',
                    'lavfi',
                    '-i',
                    f'color=c=0x1f2937:s={width}x{height}',
                    '-frames:v',
                    '1',
                    str(output_path),
                ],
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            return f'/static/renders/{output_path.name}'
        except Exception:
            logger.warning('proxy_seed_placeholder_generation_failed', extra={'render_id': render_id})
            return None

    def _proxy_dimensions(self, *, aspect_ratio: str, resolution: str) -> tuple[int, int]:
        matrix = {
            ('9:16', '720p'): (720, 1280),
            ('9:16', '1080p'): (1080, 1920),
            ('16:9', '720p'): (1280, 720),
            ('16:9', '1080p'): (1920, 1080),
            ('1:1', '720p'): (720, 720),
            ('1:1', '1080p'): (1080, 1080),
        }
        return matrix.get((aspect_ratio, resolution), (720, 1280))

    def _openai_image_size_for_proxy(self, *, aspect_ratio: str, resolution: str) -> str:
        _ = resolution
        if aspect_ratio in {'9:16', '4:5'}:
            return '1024x1536'
        if aspect_ratio == '16:9':
            return '1536x1024'
        return '1024x1024'

    def _map_openai_video_size(self, aspect_ratio: str, resolution: str) -> str:
        if aspect_ratio == '1:1':
            raise ProviderError('OpenAI Sora 2 is currently configured only for 9:16 and 16:9 outputs')
        if resolution != '720p':
            raise ProviderError('OpenAI Sora 2 currently supports only 720p output sizes')
        if aspect_ratio == '9:16':
            return '720x1280'
        if aspect_ratio == '16:9':
            return '1280x720'
        raise ProviderError(f'Unsupported aspect ratio for Sora 2: {aspect_ratio}')

    def _build_sora_prompt(
        self,
        *,
        script: str,
        voice: str,
        aspect_ratio: str,
        resolution: str,
        duration_seconds: int,
    ) -> str:
        return (
            f'Create a cinematic AI video for the following narration script: {script}\n'
            f'Narration voice preference: {voice}.\n'
            f'Aspect ratio: {aspect_ratio}. Resolution target: {resolution}. Approx duration: {duration_seconds} seconds.\n'
            'Prioritize coherent motion, clean scene transitions, and visual alignment with the narration.'
        )

    def _load_reference_image(self, image_url: str, size: str) -> tuple[str, bytes, str]:
        if image_url.startswith('http://') or image_url.startswith('https://'):
            with httpx.Client(timeout=httpx.Timeout(60.0, connect=20.0), follow_redirects=True) as client:
                response = client.get(image_url)
                if response.status_code >= 400:
                    raise ProviderError(f'Failed to fetch reference image ({response.status_code})')
                parsed = urlparse(image_url)
                filename = Path(parsed.path).name or 'reference-image.png'
                mime = response.headers.get('content-type') or mimetypes.guess_type(filename)[0] or 'image/png'
                prepared_bytes = self._prepare_reference_image_bytes(
                    source_bytes=response.content,
                    source_name=filename,
                    target_size=size,
                )
                return f'{Path(filename).stem}-{size.replace("x", "-")}.png', prepared_bytes, 'image/png'

        normalized = image_url
        if normalized.startswith('/static/'):
            normalized = normalized.replace('/static/', '', 1)
        elif normalized.startswith('/'):
            normalized = normalized.lstrip('/')
        local_path = Path('data') / normalized
        if not local_path.exists():
            raise ProviderError('Reference image file not found locally')
        prepared_bytes = self._prepare_reference_image_bytes(
            source_bytes=local_path.read_bytes(),
            source_name=local_path.name,
            target_size=size,
        )
        return f'{local_path.stem}-{size.replace("x", "-")}.png', prepared_bytes, 'image/png'

    def _prepare_reference_image_bytes(self, *, source_bytes: bytes, source_name: str, target_size: str) -> bytes:
        width_str, height_str = target_size.split('x', 1)
        width = int(width_str)
        height = int(height_str)

        temp_dir = Path('data/tmp')
        temp_dir.mkdir(parents=True, exist_ok=True)
        source_path = temp_dir / f'sora-source-{abs(hash((source_name, len(source_bytes), target_size))) % 10**10}{Path(source_name).suffix or ".img"}'
        output_path = temp_dir / f'sora-prepared-{abs(hash((source_name, target_size))) % 10**10}.png'

        source_path.write_bytes(source_bytes)
        try:
            subprocess.run(
                [
                    'ffmpeg',
                    '-y',
                    '-i',
                    str(source_path),
                    '-vf',
                    f'scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,format=rgba',
                    '-frames:v',
                    '1',
                    str(output_path),
                ],
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            return output_path.read_bytes()
        except subprocess.CalledProcessError as exc:
            raise ProviderError(f'Failed to prepare reference image for Sora: {self._truncate_error(exc.stderr.decode("utf-8", errors="ignore"))}') from exc
        finally:
            if source_path.exists():
                source_path.unlink()

    def _truncate_error(self, value: str, limit: int = 260) -> str:
        compact = ' '.join(value.split())
        return compact[:limit]

    def _validate_output_settings(self, *, model_key: str, aspect_ratio: str, resolution: str) -> None:
        rules = self.OUTPUT_RULES.get(model_key)
        if not rules:
            raise ProviderError(f'Unsupported model: {model_key}')
        if aspect_ratio not in rules['aspects']:
            raise ProviderError(
                f'{self.VIDEO_MODEL_REGISTRY[model_key].label} supports only these aspect ratios: {", ".join(sorted(rules["aspects"]))}'
            )
        if resolution not in rules['resolutions']:
            raise ProviderError(
                f'{self.VIDEO_MODEL_REGISTRY[model_key].label} supports only these resolutions: {", ".join(sorted(rules["resolutions"]))}'
            )

    def _normalize_duration(
        self,
        *,
        model_key: str,
        duration_mode: str,
        duration_seconds: int | None,
        image_urls: list[str],
    ) -> int:
        rules = self.DURATION_RULES.get(model_key)
        if not rules:
            raise ProviderError(f'Unsupported model: {model_key}')

        if model_key == 'veo3' and image_urls:
            if duration_seconds is not None and duration_seconds != rules['seeded_only']:
                raise ProviderError('Veo 3.1 image-seeded videos currently support only 8 second clips')
            return int(rules['seeded_only'])

        if duration_mode != 'custom' or duration_seconds is None:
            return int(rules['default'])

        if 'presets' in rules:
            allowed = sorted(int(item) for item in rules['presets'])
            if duration_seconds not in rules['presets']:
                raise ProviderError(
                    f'{self.VIDEO_MODEL_REGISTRY[model_key].label} supports only {", ".join(f"{value}s" for value in allowed)} durations'
                )
            return int(duration_seconds)

        minimum = int(rules['min'])
        maximum = int(rules['max'])
        if duration_seconds < minimum or duration_seconds > maximum:
            raise ProviderError(
                f'{self.VIDEO_MODEL_REGISTRY[model_key].label} supports durations between {minimum}s and {maximum}s'
            )
        return int(duration_seconds)

    def _update_video_progress(self, video_id: str, progress: int) -> None:
        video = self.repo.get_by_id(video_id)
        if not video:
            return
        self.repo.update(video, status=VideoStatus.processing, progress=progress)

    def _reconcile_video_credits_for_resolved_model(self, *, video: Video, result: ProviderResult) -> None:
        resolved_model = str((result.metadata or {}).get('resolved_model') or video.selected_model or '')
        requested_model = str(video.selected_model or resolved_model)
        if not resolved_model or resolved_model == requested_model:
            return

        try:
            credit_service = CreditService(None)
            charged_credits = int(getattr(video, 'applied_credits', 0) or 0)
            estimate_payload = {
                'modelKey': resolved_model,
                'resolution': video.resolution,
                'durationSeconds': video.duration_seconds or 8,
                'quality': str(getattr(video, 'request_quality', None) or ('high' if (video.resolution or '').lower() == '1080p' else 'standard')),
                'captionsEnabled': bool(video.captions_enabled),
                'voice': video.voice,
                'imageUrls': json.loads(video.image_urls or '[]'),
                'audioSettings': {'sampleRateHz': video.audio_sample_rate_hz or 22050},
            }
            expected_credits = credit_service.estimate('video_create', estimate_payload).required_credits
            delta = expected_credits - charged_credits

            if delta > 0:
                try:
                    credit_service.deduct_credits(
                        user_id=video.user_id,
                        amount=delta,
                        feature_key='video_create_model_reconcile',
                        metadata={'video_id': video.id, 'requested_model': requested_model, 'resolved_model': resolved_model},
                        source='premium',
                        idempotency_key=credit_service.make_idempotency_key(
                            'video_create_model_reconcile',
                            {'video_id': video.id, 'requested_model': requested_model, 'resolved_model': resolved_model, 'delta': delta},
                        ),
                    )
                except Exception:
                    # Keep generation successful even if reconcile deduction cannot be applied.
                    logger.warning(
                        'video_generation_model_reconcile_deduct_failed',
                        extra={'render_id': video.id, 'requested_model': requested_model, 'resolved_model': resolved_model, 'delta': delta},
                    )
            elif delta < 0:
                credit_service.top_up_credits(
                    user_id=video.user_id,
                    credits=abs(delta),
                    metadata={
                        'refund_for': 'video_create_model_reconcile',
                        'video_id': video.id,
                        'requested_model': requested_model,
                        'resolved_model': resolved_model,
                    },
                )

            self.repo.update(video, applied_credits=expected_credits)
            logger.info(
                'video_generation_model_reconciled',
                extra={
                    'render_id': video.id,
                    'requested_model': requested_model,
                    'resolved_model': resolved_model,
                    'charged_before': charged_credits,
                    'charged_after': expected_credits,
                },
            )
        except Exception:
            logger.exception(
                'video_generation_model_reconcile_failed',
                extra={'render_id': video.id, 'requested_model': requested_model, 'resolved_model': resolved_model},
            )


@celery_app.task(name='process_ai_video')
def celery_process_ai_video(video_id: str) -> None:
    from app.core.config import get_settings

    settings = get_settings()
    service = AIVideoCreateService(None, settings)
    repo = VideoRepository(None)
    storage = build_storage_provider(settings)
    logger.info(
        'ai_video_worker_task_received',
        extra={'render_id': video_id, 'task_name': 'process_ai_video'},
    )
    try:
        video = repo.get_by_id(video_id)
        if not video:
            return
        logger.info(
            'ai_video_worker_task_start',
            extra={'render_id': video_id, 'current_status': str(video.status.value if hasattr(video.status, "value") else video.status)},
        )
        repo.update(video, status=VideoStatus.processing, progress=20)
        logger.info(
            'ai_video_status_transition',
            extra={'render_id': video_id, 'from_status': 'queued', 'to_status': 'processing', 'progress': 20},
        )
        payload = {
            'videoId': video.id,
            'imageUrl': video.source_image_url,
            'script': video.script,
            'language': video.language,
            'modelKey': video.selected_model,
            'aspectRatio': video.aspect_ratio,
            'resolution': video.resolution,
            'durationSeconds': video.duration_seconds or 8,
            'voice': video.voice,
            'captionsEnabled': bool(video.captions_enabled),
            'captionStyle': video.caption_style,
            'audioSettings': {
                'sampleRateHz': video.audio_sample_rate_hz or 22050,
            },
        }
        repo.update(video, progress=55)
        result = service.execute_model_with_router(payload)
        local_result_path = _resolve_local_generated_file(result.video_url)
        if local_result_path and local_result_path.exists() and (bool(video.captions_enabled) or bool((video.title or '').strip())):
            overlay_output = Path('data/renders') / f'{video.id}-overlay.mp4'
            try:
                final_overlay_path = service.pipeline.burn_overlays_on_video(
                    input_video_path=local_result_path,
                    output_video_path=overlay_output,
                    title=video.title,
                    script=video.script,
                    captions_enabled=bool(video.captions_enabled),
                    caption_style=video.caption_style,
                )
                result.video_url = f'/static/renders/{final_overlay_path.name}'
            except Exception:
                logger.exception('ai_video_overlay_burn_failed', extra={'render_id': video.id})
        final_duration_seconds = _probe_video_duration_seconds(result.video_url)
        logger.info(
            'ai_video_render_diagnostics',
            extra={
                'render_id': video.id,
                'requested_duration_seconds': int(payload.get('durationSeconds') or 0),
                'final_video_duration_seconds': final_duration_seconds,
                'provider': result.provider,
                'requested_model': video.selected_model,
                'resolved_model': (result.metadata or {}).get('resolved_model'),
                'fallback_used': bool((result.metadata or {}).get('fallback_used', False)),
                'tts_provider': (result.metadata or {}).get('tts_provider'),
                'tts_fallback_used': bool((result.metadata or {}).get('tts_fallback_used', False)),
            },
        )
        existing_provider_message = (result.metadata or {}).get('tts_provider_message')
        provider_notes: list[str] = []
        mode = str((result.metadata or {}).get('mode') or '')
        requested_model = str((result.metadata or {}).get('requested_model') or video.selected_model or '')
        resolved_model = str((result.metadata or {}).get('resolved_model') or requested_model)
        if mode == 'local-proxy-placeholder':
            provider_notes.append(
                f'{requested_model.upper()} generation is currently running via local proxy render mode.'
            )
        if bool((result.metadata or {}).get('fallback_used', False)):
            fallback_reason = str((result.metadata or {}).get('fallback_reason') or '').strip()
            if fallback_reason:
                provider_notes.append(
                    f'Model fallback used: {requested_model} -> {resolved_model}. Reason: {fallback_reason}'
                )
            else:
                provider_notes.append(f'Model fallback used: {requested_model} -> {resolved_model}.')
        combined_provider_message = ' '.join(
            [part for part in [str(existing_provider_message or '').strip(), *provider_notes] if part]
        ) or None
        service._reconcile_video_credits_for_resolved_model(video=video, result=result)
        stored_video_url = _persist_generated_video(storage, video.user_id, video.selected_model or 'video', result.video_url)
        stored_thumb_url = _persist_generated_thumbnail(
            storage=storage,
            user_id=video.user_id,
            model_key=video.selected_model or 'video',
            result_video_url=result.video_url,
            source_thumbnail_url=video.source_image_url or video.thumbnail_url,
            video_id=video.id,
        )
        repo.update(
            video,
            provider_name=result.provider,
            output_url=stored_video_url,
            thumbnail_url=stored_thumb_url,
            tts_provider=(result.metadata or {}).get('tts_provider'),
            tts_resolved_voice=(result.metadata or {}).get('tts_resolved_voice'),
            tts_provider_message=combined_provider_message,
            tts_fallback_used=bool((result.metadata or {}).get('tts_fallback_used', False)),
            progress=100,
            status=VideoStatus.completed,
            error_message=None,
        )
        refreshed = repo.get_by_id(video_id)
        if refreshed:
            service.tagging.auto_tag_video(refreshed)
    except Exception as exc:
        logger.exception('ai_video_job_failed', extra={'render_id': video_id})
        target = repo.get_by_id(video_id)
        if target:
            failure_status = _classify_video_failure_status(exc)
            repo.update(target, status=failure_status, progress=100, error_message=str(exc)[:255])
            try:
                raw = repo.collection.document(video_id).get()
                raw_data = raw.to_dict() or {}
                charged_credits = int(raw_data.get('applied_credits') or 0)
                estimate_payload = {
                    'modelKey': target.selected_model,
                    'resolution': target.resolution,
                    'durationSeconds': target.duration_seconds or 8,
                    'quality': str(raw_data.get('request_quality') or ('high' if (target.resolution or '').lower() == '1080p' else 'standard')),
                    'captionsEnabled': bool(target.captions_enabled),
                    'voice': target.voice,
                    'imageUrls': json.loads(target.image_urls or '[]'),
                    'audioSettings': {'sampleRateHz': target.audio_sample_rate_hz or 22050},
                }
                credit_service = CreditService(None)
                if charged_credits <= 0:
                    estimate = credit_service.estimate('video_create', estimate_payload)
                    charged_credits = estimate.required_credits
                if charged_credits > 0:
                    credit_service.top_up_credits(
                        user_id=target.user_id,
                        credits=charged_credits,
                        metadata={
                            'refund_for': 'video_create_failed_status',
                            'video_id': target.id,
                            'model_key': target.selected_model,
                        },
                    )
                    logger.info(
                        'ai_video_job_refunded',
                        extra={'render_id': video_id, 'user_id': target.user_id, 'credits': charged_credits},
                    )
            except Exception:
                logger.exception('ai_video_refund_failed', extra={'render_id': video_id})


def _classify_video_failure_status(exc: Exception) -> VideoStatus:
    text = str(exc or '').lower()
    timeout_markers = (
        'timed out',
        'timeout',
        'time out',
        'deadline',
    )
    provider_markers = (
        'provider',
        'openai',
        'sora',
        'gemini',
        'veo',
        'kling',
        'moderation',
        'rate limit',
        'resourceexhausted',
        '503',
        '429',
    )
    if any(marker in text for marker in timeout_markers):
        return VideoStatus.timed_out
    if any(marker in text for marker in provider_markers):
        return VideoStatus.provider_failed
    return VideoStatus.failed


def _launch_local_video_job(video_id: str) -> None:
    def _runner() -> None:
        try:
            celery_process_ai_video(video_id)
        except Exception:
            logger.exception('ai_video_local_job_failed', extra={'render_id': video_id})

    thread = threading.Thread(
        target=_runner,
        name=f'ai-video-fallback-{video_id[:8]}',
        daemon=True,
    )
    thread.start()

def _persist_generated_video(storage, user_id: str, model_key: str, source_url: str) -> str:
    source_path = _resolve_local_generated_file(source_url)
    if source_path and source_path.exists():
        content = source_path.read_bytes()
        content_type = mimetypes.guess_type(source_path.name)[0] or 'video/mp4'
        filename = source_path.name
    else:
        with httpx.Client(timeout=httpx.Timeout(120.0, connect=20.0), follow_redirects=True) as client:
            response = client.get(source_url)
            if response.status_code >= 400:
                raise ProviderError(f'Failed to fetch generated video asset ({response.status_code})')
            content = response.content
            filename = Path(source_url.split('?', 1)[0]).name or f'{model_key}.mp4'
            content_type = response.headers.get('content-type') or mimetypes.guess_type(filename)[0] or 'video/mp4'
    signed = storage.upload_bytes(
        filename,
        content,
        content_type=content_type,
        kind=f'users/{user_id}/generated/videos',
    )
    return signed.public_url


def _persist_generated_thumbnail(
    *,
    storage,
    user_id: str,
    model_key: str,
    result_video_url: str,
    source_thumbnail_url: str | None,
    video_id: str,
) -> str | None:
    if source_thumbnail_url and (source_thumbnail_url.startswith('http://') or source_thumbnail_url.startswith('https://')):
        with httpx.Client(timeout=httpx.Timeout(60.0, connect=20.0), follow_redirects=True) as client:
            response = client.get(source_thumbnail_url)
            if response.status_code < 400:
                filename = Path(source_thumbnail_url.split('?', 1)[0]).name or f'{video_id}.jpg'
                content_type = response.headers.get('content-type') or mimetypes.guess_type(filename)[0] or 'image/jpeg'
                signed = storage.upload_bytes(
                    filename,
                    response.content,
                    content_type=content_type,
                    kind=f'users/{user_id}/generated/videos',
                )
                return signed.public_url

    local_video = _resolve_local_generated_file(result_video_url)
    if local_video and local_video.exists():
        thumb_path = Path('data/renders') / f'{video_id}.jpg'
        if not thumb_path.exists():
            VideoPipelineService()._make_thumbnail(local_video, thumb_path)
        if thumb_path.exists():
            signed = storage.upload_bytes(
                thumb_path.name,
                thumb_path.read_bytes(),
                content_type='image/jpeg',
                kind=f'users/{user_id}/generated/videos',
            )
            return signed.public_url
    return source_thumbnail_url


def _resolve_local_generated_file(url: str) -> Path | None:
    normalized = url.strip()
    if normalized.startswith('/static/'):
        normalized = normalized.replace('/static/', '', 1)
        candidate = Path('data') / normalized
        return candidate
    path = Path(normalized)
    if path.exists():
        return path
    return None


def _probe_video_duration_seconds(url_or_path: str) -> float | None:
    local_file = _resolve_local_generated_file(url_or_path)
    if not local_file or not local_file.exists():
        return None
    try:
        result = subprocess.run(
            [
                'ffprobe',
                '-v',
                'error',
                '-show_entries',
                'format=duration',
                '-of',
                'default=noprint_wrappers=1:nokey=1',
                str(local_file),
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        value = float((result.stdout or '').strip() or '0')
        return round(max(0.0, value), 3)
    except Exception:
        logger.warning('ai_video_duration_probe_failed', extra={'path': str(local_file)})
        return None
