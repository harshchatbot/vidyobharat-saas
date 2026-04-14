from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.core.config import Settings
from app.services.ai_video_service import AIVideoCreateService


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
        fallback_metadata = {
            'render_lane': request.render_lane,
            'persona_id': request.persona_id,
            'talking_audio_url': request.talking_audio_url,
        }
        if request.persona_image_url and request.talking_audio_url:
            try:
                video_url, metadata = self.service.fal.generate_infinite_talk(
                    persona_image_url=request.persona_image_url,
                    audio_url=request.talking_audio_url,
                    prompt=request.prompt,
                    duration_hint_seconds=request.duration_seconds,
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
                fallback_metadata['talking_avatar_fallback_reason'] = str(exc)

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
