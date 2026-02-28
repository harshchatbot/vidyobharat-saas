import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.repositories.video_repository import VideoRepository
from app.models.entities import Video, VideoStatus
from app.services.asset_tagging_service import AssetTaggingService
from app.services.render_service import celery_app
from app.services.video_pipeline import VideoPipelineService

logger = logging.getLogger(__name__)


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
        }

    def list_models(self) -> list[ModelRegistryEntry]:
        return list(self.VIDEO_MODEL_REGISTRY.values())

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

        normalized_duration = duration_seconds if duration_mode == 'custom' else 8
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
        )
        self.tagging.repo.add_tags(asset_id=video.id, asset_type='video', tags=self.tagging.tag_script(script), source='auto')
        if tags:
            self.tagging.repo.add_tags(asset_id=video.id, asset_type='video', tags=tags, source='user')
        celery_process_ai_video.delay(video.id)
        return video

    def get_video(self, video_id: str, user_id: str) -> Video | None:
        video = self.repo.get_by_id(video_id)
        if not video or video.user_id != user_id:
            return None
        return video

    def generate_with_sora2(self, params: dict[str, Any]) -> ProviderResult:
        # Environment variables required for real integration:
        # - OPENAI_API_KEY
        # - optional provider-specific model override if OpenAI changes naming
        #
        # Real API integration belongs here. When enabling live Sora calls, replace this fallback
        # with the official OpenAI video generation client call, e.g. openai.videos.create(...)
        # using:
        # - model="sora-2"
        # - prompt=params["script"]
        # - image reference when params["imageUrl"] is present
        # - aspect ratio / resolution / duration / voice mapped to the provider payload
        if not self.settings.openai_api_key:
            raise ProviderError('OPENAI_API_KEY is not configured for Sora 2')
        output_path, _ = self._render_local_proxy(
            render_id_prefix='sora2',
            script=params['script'],
            image_url=params.get('imageUrl'),
            voice=params['voice'],
            aspect_ratio=params['aspectRatio'],
            resolution=params['resolution'],
            duration_seconds=params['durationSeconds'],
        )
        return ProviderResult(
            provider='OpenAI Sora 2',
            model_key='sora2',
            video_url=output_path,
            metadata={'mode': 'local-proxy-placeholder', 'voice': params['voice']},
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
        output_path, _ = self._render_local_proxy(
            render_id_prefix='veo3',
            script=params['script'],
            image_url=params.get('imageUrl'),
            voice=params['voice'],
            aspect_ratio=params['aspectRatio'],
            resolution=params['resolution'],
            duration_seconds=params['durationSeconds'],
        )
        return ProviderResult(
            provider='Google Veo 3.1',
            model_key='veo3',
            video_url=output_path,
            metadata={'mode': 'local-proxy-placeholder', 'voice': params['voice']},
        )

    def _render_local_proxy(
        self,
        *,
        render_id_prefix: str,
        script: str,
        image_url: str | None,
        voice: str,
        aspect_ratio: str,
        resolution: str,
        duration_seconds: int,
    ) -> tuple[str, str]:
        render_id = f'{render_id_prefix}-{Path.cwd().name}-{Path(script[:32]).stem}'.replace(' ', '-')
        render_id = f'{render_id_prefix}-{abs(hash((script, image_url, voice, aspect_ratio, resolution, duration_seconds))) % 10**10}'
        image_urls = [image_url] if image_url else []
        self.pipeline.render_video_from_assets(
            video_id=render_id,
            title='AI Generated Video',
            script=script,
            voice_name=voice,
            image_urls=image_urls,
            aspect_ratio=aspect_ratio,
            resolution=resolution,
            duration_mode='custom',
            duration_seconds=duration_seconds,
            captions_enabled=True,
            music_mode='none',
            music_track_id=None,
            music_file_url=None,
            music_volume=0,
            duck_music=False,
        )
        return (f'/static/renders/{render_id}.mp4', f'/static/renders/{render_id}.jpg')


@celery_app.task(name='process_ai_video')
def celery_process_ai_video(video_id: str) -> None:
    from app.core.config import get_settings
    from app.db.session import SessionLocal

    db = SessionLocal()
    settings = get_settings()
    service = AIVideoCreateService(db, settings)
    repo = VideoRepository(db)
    try:
        video = repo.get_by_id(video_id)
        if not video:
            return
        repo.update(video, status=VideoStatus.processing, progress=20)
        payload = {
            'imageUrl': video.source_image_url,
            'script': video.script,
            'modelKey': video.selected_model,
            'aspectRatio': video.aspect_ratio,
            'resolution': video.resolution,
            'durationSeconds': video.duration_seconds or 8,
            'voice': video.voice,
        }
        adapter = service.providers.get(video.selected_model or '')
        if not adapter:
            raise ProviderError(f'Unsupported model: {video.selected_model}')
        repo.update(video, progress=55)
        result = adapter(payload)
        repo.update(
            video,
            provider_name=result.provider,
            output_url=result.video_url,
            thumbnail_url=video.source_image_url or f'/static/renders/{video_id}.jpg',
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
            repo.update(target, status=VideoStatus.failed, progress=100, error_message=str(exc)[:255])
    finally:
        db.close()
