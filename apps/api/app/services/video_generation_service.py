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


class VideoGenerationService:
    def __init__(self, settings: Settings) -> None:
        self.service = AIVideoCreateService(None, settings)

    def generate_video_clip(self, request: ClipGenerationRequest):
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