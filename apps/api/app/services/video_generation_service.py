from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from app.core.config import Settings
from app.services.ai_video_service import AIVideoCreateService

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ClipGenerationRequest:
    video_id: str
    prompt: str
    model_key: str
    aspect_ratio: str
    resolution: str
    duration_seconds: int
    reference_image_url: str | None = None
    voice: str = 'Shubh'
    language: str = 'English'
    captions_enabled: bool = False
    narration_enabled: bool = False
    caption_style: str | None = None
    audio_settings: dict[str, Any] = field(default_factory=lambda: {'sampleRateHz': 22050})
    metadata: dict[str, Any] = field(default_factory=dict)
    multi_prompt: list[dict[str, Any]] = field(default_factory=list)
    render_lane: str = 'cinematic_broll'
    persona_id: str | None = None
    persona_image_url: str | None = None
    talking_audio_url: str | None = None
    talking_audio_duration_seconds: float | None = None
    talking_behavior_prompt: str | None = None
    talking_script: str | None = None


class VideoGenerationService:
    def __init__(self, settings: Settings) -> None:
        self.service = AIVideoCreateService(None, settings)

    def generate_video_clip(self, request: ClipGenerationRequest):
        if request.render_lane == 'talking_avatar':
            return self.generate_talking_avatar_clip(request)

        payload = {
            'videoId': request.video_id,
            'imageUrl': request.reference_image_url,
            'script': request.prompt,
            'language': request.language,
            'modelKey': request.model_key,
            'aspectRatio': request.aspect_ratio,
            'resolution': request.resolution,
            'durationSeconds': request.duration_seconds,
            'voice': request.voice,
            'captionsEnabled': request.captions_enabled,
            'narrationEnabled': request.narration_enabled,
            'captionStyle': request.caption_style,
            'audioSettings': request.audio_settings,
            'recipeMetadata': request.metadata,
        }

        if request.multi_prompt:
            payload['multiPrompt'] = request.multi_prompt

        return self.service.execute_model_with_router(payload)

    def generate_talking_avatar_clip(self, request: ClipGenerationRequest):
        require_talking_avatar = bool((request.metadata or {}).get('require_talking_avatar'))
        fallback_metadata = {
            'render_lane': request.render_lane,
            'persona_id': request.persona_id,
            'talking_audio_url': request.talking_audio_url,
            'talking_audio_duration_seconds': request.talking_audio_duration_seconds,
        }
        if request.persona_id and not request.persona_image_url:
            raise RuntimeError(f'Selected avatar "{request.persona_id}" could not be resolved to a usable image for talking scenes')
        if request.persona_id and not request.talking_audio_url:
            raise RuntimeError(f'Talking scene narration audio is missing for avatar "{request.persona_id}"')
        if request.persona_image_url and request.talking_audio_url:
            try:
                video_url, metadata = self.service.fal.generate_infinite_talk(
                    persona_image_url=request.persona_image_url,
                    audio_url=request.talking_audio_url,
                    prompt=request.prompt,
                    duration_hint_seconds=request.duration_seconds,
                    audio_duration_seconds=request.talking_audio_duration_seconds,
                    resolution=request.resolution,
                    metadata={
                        **request.metadata,
                        'persona_id': request.persona_id,
                        'talking_behavior_prompt': request.talking_behavior_prompt,
                    },
                )
                from app.services.ai_video_service import ProviderResult

                return ProviderResult(
                    provider='fal.ai InfiniteTalk',
                    model_key='fal_infinite_talk',
                    video_url=video_url,
                    metadata={**fallback_metadata, **metadata},
                )
            except Exception as exc:
                logger.exception(
                    'ugc_talking_avatar_provider_failed',
                    extra={
                        'persona_id': request.persona_id,
                        'audio_url': request.talking_audio_url,
                        'audio_duration_seconds': request.talking_audio_duration_seconds,
                        'error': str(exc),
                    },
                )
                fallback_metadata['talking_avatar_fallback_reason'] = str(exc)
                if require_talking_avatar:
                    raise RuntimeError(
                        f'InfiniteTalk failed for selected avatar "{request.persona_id}": {exc}'
                    ) from exc

        if require_talking_avatar and request.persona_id:
            raise RuntimeError(
                f'Selected avatar "{request.persona_id}" could not be rendered via InfiniteTalk for this talking scene'
            )
        output_path, _, tts_diagnostics = self.service._render_local_proxy(
            render_id_prefix='ugc-talking-avatar',
            script=request.talking_script or request.prompt,
            image_url=request.persona_image_url or request.reference_image_url,
            language=request.language,
            voice=request.voice,
            audio_sample_rate_hz=int((request.audio_settings or {}).get('sampleRateHz') or 22050),
            aspect_ratio=request.aspect_ratio,
            resolution=request.resolution,
            duration_seconds=request.duration_seconds,
            captions_enabled=False,
            narration_enabled=True,
            caption_style=request.caption_style,
        )
        from app.services.ai_video_service import ProviderResult

        return ProviderResult(
            provider='Talking Avatar Fallback',
            model_key='talking_avatar_fallback',
            video_url=output_path,
            metadata={
                **fallback_metadata,
                'mode': 'talking-avatar-local-fallback',
                'talking_behavior_prompt': request.talking_behavior_prompt,
                **tts_diagnostics,
            },
        )
