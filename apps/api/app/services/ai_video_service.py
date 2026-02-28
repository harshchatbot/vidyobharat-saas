import json
import logging
import mimetypes
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.repositories.video_repository import VideoRepository
from app.models.entities import Video, VideoStatus
from app.services.asset_tagging_service import AssetTaggingService
from app.services.render_service import celery_app
from app.services.video_pipeline import VideoPipelineService

logger = logging.getLogger(__name__)
OPENAI_VIDEO_TIMEOUT_SECONDS = 600
OPENAI_POLL_INTERVAL_SECONDS = 5


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

    def _map_openai_video_size(self, aspect_ratio: str, resolution: str) -> str:
        if aspect_ratio == '1:1':
            raise ProviderError('OpenAI Sora 2 is currently configured only for 9:16 and 16:9 outputs')
        if aspect_ratio == '9:16':
            return '720x1280' if resolution == '720p' else '1024x1792'
        if aspect_ratio == '16:9':
            return '1280x720' if resolution == '720p' else '1792x1024'
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

    def _update_video_progress(self, video_id: str, progress: int) -> None:
        video = self.repo.get_by_id(video_id)
        if not video:
            return
        self.repo.update(video, status=VideoStatus.processing, progress=progress)


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
            'videoId': video.id,
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
            thumbnail_url=video.source_image_url or video.thumbnail_url,
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
