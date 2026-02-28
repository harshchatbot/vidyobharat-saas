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
        image_url: str | None,
        script: str,
        model_key: str,
        aspect_ratio: str,
        resolution: str,
        duration_seconds: int,
        voice: str,
    ) -> Video:
        registry_entry = self.VIDEO_MODEL_REGISTRY.get(model_key)
        adapter = self.providers.get(model_key)
        if not registry_entry or not adapter:
            raise ProviderError(f'Unsupported model: {model_key}')

        video = self.repo.create(
            user_id=user_id,
            title=script[:80] or registry_entry.label,
            script=script,
            voice=voice,
            aspect_ratio=aspect_ratio,
            resolution=resolution,
            duration_mode='custom',
            duration_seconds=duration_seconds,
            captions_enabled=True,
            status=VideoStatus.processing,
            progress=15,
            image_urls=json.dumps([image_url] if image_url else []),
            selected_model=model_key,
            provider_name=registry_entry.label,
            source_image_url=image_url,
            reference_images=json.dumps([image_url] if image_url else []),
            music_mode='none',
        )

        try:
            result = adapter(
                {
                    'imageUrl': image_url,
                    'script': script,
                    'modelKey': model_key,
                    'aspectRatio': aspect_ratio,
                    'resolution': resolution,
                    'durationSeconds': duration_seconds,
                    'voice': voice,
                }
            )
            self.repo.update(
                video,
                provider_name=result.provider,
                output_url=result.video_url,
                thumbnail_url=image_url,
                progress=100,
                status=VideoStatus.completed,
                error_message=None,
            )
            self.tagging.auto_tag_video(video)
        except Exception as exc:
            logger.exception('ai_video_create_failed', extra={'render_id': video.id, 'model_key': model_key})
            self.repo.update(video, status=VideoStatus.failed, progress=100, error_message=str(exc)[:255])
            raise
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
