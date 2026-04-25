from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from app.core.config import Settings
from app.services.ai_video_service import AIVideoCreateService
from app.services.heygen_avatar_service import HeygenAvatarService

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
    persona_provider: str | None = None
    persona_avatar_id: str | None = None
    persona_voice_id: str | None = None
    voice_provider: str | None = None
    talking_audio_url: str | None = None
    talking_audio_duration_seconds: float | None = None
    timing_map: list[dict[str, Any]] | None = None
    speaking_segments: list[dict[str, int]] | None = None
    audio_reactive_timeline: list[dict[str, Any]] | None = None
    talking_behavior_prompt: str | None = None
    talking_script: str | None = None


class VideoGenerationService:
    def __init__(self, settings: Settings) -> None:
        self.service = AIVideoCreateService(None, settings)
        self.heygen = HeygenAvatarService(settings)

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
        normalized_persona_provider = str(request.persona_provider or '').strip().lower() or None
        normalized_voice_provider = str(request.voice_provider or '').strip().lower() or ('heygen' if normalized_persona_provider == 'heygen' else 'sarvam')
        fallback_metadata = {
            'render_lane': request.render_lane,
            'persona_id': request.persona_id,
            'persona_provider': normalized_persona_provider,
            'persona_avatar_id': request.persona_avatar_id,
            'persona_voice_id': request.persona_voice_id,
            'voice_provider': normalized_voice_provider,
            'talking_audio_url': request.talking_audio_url,
            'talking_audio_duration_seconds': request.talking_audio_duration_seconds,
            'timing_map': request.timing_map,
            'speaking_segments': request.speaking_segments,
            'audio_reactive_timeline': request.audio_reactive_timeline,
        }
        if normalized_persona_provider == 'heygen':
            supports_avatar_video_generation = (request.metadata or {}).get('supports_avatar_video_generation')
            if supports_avatar_video_generation is not True:
                raise RuntimeError(
                    f'Selected avatar "{request.persona_id}" is not Avatar IV compatible. '
                    'Please choose a HeyGen avatar that supports avatar video generation.'
                )
            if not request.persona_avatar_id:
                raise RuntimeError(f'Selected avatar "{request.persona_id}" is configured for HeyGen but is missing a provider avatar id')
            try:
                request_context = {
                    **request.metadata,
                    'video_id': request.video_id,
                    'persona_id': request.persona_id,
                }
                is_avatar_product = str((request.metadata or {}).get('recipe_id') or '').strip() == 'avatar_product'
                if is_avatar_product:
                    product_image_url = str(request.reference_image_url or '').strip()
                    if not product_image_url:
                        raise RuntimeError(
                            'Avatar Product requires the uploaded product image to generate HeyGen Video Agent scenes.'
                        )
                    video_url, metadata = self.heygen.generate_video_agent_avatar_video(
                        avatar_id=request.persona_avatar_id,
                        prompt=self._build_avatar_product_video_agent_prompt(
                            scene_prompt=request.talking_script or request.prompt,
                            scene_metadata=request.metadata,
                        ),
                        voice_id=request.persona_voice_id,
                        aspect_ratio=request.aspect_ratio,
                        product_image_url=product_image_url,
                        metadata=request_context,
                    )
                else:
                    video_url, metadata = self.heygen.generate_avatar_video(
                        avatar_id=request.persona_avatar_id,
                        script=request.talking_script or request.prompt,
                        voice_id=request.persona_voice_id,
                        aspect_ratio=request.aspect_ratio,
                        resolution=request.resolution,
                        voice_provider=normalized_voice_provider,
                        audio_url=request.talking_audio_url,
                        metadata=request_context,
                    )
                from app.services.ai_video_service import ProviderResult

                return ProviderResult(
                    provider='HeyGen',
                    model_key='heygen_video_agent_avatar_video' if is_avatar_product else 'heygen_avatar_video',
                    video_url=video_url,
                    metadata={**fallback_metadata, **metadata},
                )
            except Exception as exc:
                logger.exception(
                    'ugc_talking_avatar_provider_failed',
                    extra={
                        'persona_id': request.persona_id,
                        'persona_provider': normalized_persona_provider,
                        'persona_avatar_id': request.persona_avatar_id,
                        'voice_provider': normalized_voice_provider,
                        'error': str(exc),
                    },
                )
                fallback_metadata['talking_avatar_fallback_reason'] = str(exc)
                if require_talking_avatar:
                    raise RuntimeError(
                        f'HeyGen failed for selected avatar "{request.persona_id}": {exc}'
                    ) from exc
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
                    wait_for_completion=True,
                    metadata={
                        **request.metadata,
                        'video_id': request.video_id,
                        'persona_id': request.persona_id,
                        'talking_behavior_prompt': request.talking_behavior_prompt,
                        'timing_map': request.timing_map,
                        'speaking_segments': request.speaking_segments,
                        'audio_reactive_timeline': request.audio_reactive_timeline,
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
                        'timing_map': request.timing_map,
                        'audio_reactive_timeline': request.audio_reactive_timeline,
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

    def _build_avatar_product_video_agent_prompt(
        self,
        *,
        scene_prompt: str,
        scene_metadata: dict[str, Any] | None,
    ) -> str:
        metadata = scene_metadata or {}
        stage_name = str(metadata.get('stage_name') or metadata.get('scene_role') or '').strip().lower()
        must_show_elements = metadata.get('must_show_elements') or []
        must_show_text = ', '.join(str(item).strip() for item in must_show_elements if str(item).strip())
        stage_instruction = {
            'hook': 'Open with the spokesperson naturally introducing the uploaded product with the product clearly visible in-frame from the first beat.',
            'showcase': 'Keep the spokesperson and the uploaded product visible together while demonstrating or presenting the product as the hero visual.',
            'cta': 'Close with the spokesperson recommending the uploaded product, keeping the product visible in-frame during the CTA.',
        }.get(stage_name, 'Keep the spokesperson and the uploaded product naturally visible in the same frame like a real creator ad.')
        extra_visibility = f' Required visible product elements: {must_show_text}.' if must_show_text else ''
        return (
            f'{scene_prompt.strip()}\n\n'
            'Video Agent requirements: Use the selected avatar as the spokesperson identity. '
            'Use the uploaded product image in the attached files as the exact product being promoted. '
            'Generate a natural product ad where the spokesperson is on screen with the same product visibly present in-frame, '
            'not a plain talking head. '
            f'{stage_instruction}{extra_visibility} '
            'Maintain realistic creator-style framing, keep the product recognizable, and do not replace the product with a generic object.'
        ).strip()
