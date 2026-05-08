from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from app.core.shared_config import load_shared_json

Medium = Literal['image', 'video']
BillingUnit = Literal['per_image', 'per_request', 'per_second', 'per_clip', 'per_video']


@dataclass(frozen=True)
class GenerationModelDefinition:
    model_key: str
    display_name: str
    medium: Medium
    provider: str
    provider_model_key: str
    mode_ids: tuple[str, ...]
    cost_profile: str
    billing_unit: BillingUnit
    quality_tier: str
    user_facing_description: str
    default_duration_seconds: int | None = None
    default_image_count: int | None = None
    is_enabled: bool = True
    is_experimental: bool = False
    fallback_model_key: str | None = None
    aliases: tuple[str, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class NormalVideoFamilyDefinition:
    key: str
    display_name: str
    tags: tuple[str, ...]
    description: str
    supports_text_to_video: bool
    supports_image_to_video: bool
    supports_native_audio: bool
    native_audio_default: bool
    native_audio_notes: str
    supported_durations: tuple[int, ...]
    supported_qualities: tuple[dict[str, str], ...]
    supported_resolutions: tuple[str, ...]
    supported_aspect_ratios: tuple[str, ...]
    required_inputs_by_generation_mode: dict[str, tuple[str, ...]]
    provider_routes_by_generation_mode_and_quality: dict[str, dict[str, str]]
    payload_mapping: dict[str, object]
    pricing_type: str
    pricing_config: dict[str, object]
    hidden: bool = False
    dev_only: bool = False


MODEL_REGISTRY: dict[str, GenerationModelDefinition] = {

    # ---------------- IMAGE MODELS ---------------- #

    'budget_image_model': GenerationModelDefinition(
        model_key='budget_image_model',
        display_name='Budget Image Model',
        medium='image',
        provider='together',
        provider_model_key='budget_image_model',
        mode_ids=('fast_social',),
        cost_profile='budget_image_model',
        billing_unit='per_image',
        quality_tier='economy',
        user_facing_description='Best for fast, budget-safe social image generation.',
        fallback_model_key='gemini_flash_image',
    ),

    'gpt_image_1_5': GenerationModelDefinition(
        model_key='gpt_image_1_5',
        display_name='GPT Image 1.5',
        medium='image',
        provider='openai',
        provider_model_key='gpt-image-1',
        mode_ids=('creator_quality',),
        cost_profile='gpt_image_1_5',
        billing_unit='per_image',
        quality_tier='premium',
        user_facing_description='Best for realistic images and ads.',
        fallback_model_key='openai_image',
        aliases=('openai_image',),
    ),

    'gemini_flash_image': GenerationModelDefinition(
        model_key='gemini_flash_image',
        display_name='Gemini Flash Image',
        medium='image',
        provider='gemini',
        provider_model_key='gemini_flash_image',
        mode_ids=('fast_social',),
        cost_profile='gemini_flash_image',
        billing_unit='per_image',
        quality_tier='standard',
        user_facing_description='Affordable fast image generation.',
        fallback_model_key='gpt_image_1_5',
        aliases=('nano_banana',),
    ),

    # ---------------- VIDEO MODELS ---------------- #

    'fal_ltx23_t2v': GenerationModelDefinition(
        model_key='fal_ltx23_t2v',
        display_name='LTX 2.3 22B Text to Video',
        medium='video',
        provider='fal',
        provider_model_key='fal-ai/ltx-2.3-22b/text-to-video',
        mode_ids=('creator_mode',),
        cost_profile='fal_ltx23_t2v',
        billing_unit='per_second',
        quality_tier='economy',
        user_facing_description='Affordable prompt-to-video generation.',
        default_duration_seconds=5,
        aliases=('fal-ai/ltx-2.3-22b/text-to-video',),
    ),

    'fal_ltx23_i2v': GenerationModelDefinition(
        model_key='fal_ltx23_i2v',
        display_name='LTX 2.3 22B Image to Video',
        medium='video',
        provider='fal',
        provider_model_key='fal-ai/ltx-2.3-22b/image-to-video',
        mode_ids=('creator_mode',),
        cost_profile='fal_ltx23_i2v',
        billing_unit='per_second',
        quality_tier='economy',
        user_facing_description='Low-cost testing model.',
        default_duration_seconds=5,
        aliases=('ltx23_i2v', 'fal-ai/ltx-2.3-22b/image-to-video'),
    ),

    'seedance_v1_lite_t2v': GenerationModelDefinition(
        model_key='seedance_v1_lite_t2v',
        display_name='Seedance Lite Text to Video',
        medium='video',
        provider='fal',
        provider_model_key='fal-ai/bytedance/seedance/v1/lite/text-to-video',
        mode_ids=('creator_pro',),
        billing_unit='per_video',
        quality_tier='affordable',
        cost_profile='seedance_v1_lite_t2v',
        user_facing_description='Affordable prompt-to-video route for Seedance Lite.',
        fallback_model_key='kling_o3_standard_t2v',
        aliases=('fal-ai/bytedance/seedance/v1/lite/text-to-video',),
    ),

    'seedance_v1_lite_i2v': GenerationModelDefinition(
        model_key='seedance_v1_lite_i2v',
        display_name='Seedance Lite Image to Video',
        medium='video',
        provider='fal',
        provider_model_key='fal-ai/bytedance/seedance/v1/lite/image-to-video',
        mode_ids=('creator_pro',),
        billing_unit='per_video',
        quality_tier='affordable',
        cost_profile='seedance_v1_lite_i2v',
        user_facing_description='Affordable image-to-video route for Seedance Lite.',
        fallback_model_key='kling_o3_standard_i2v',
        aliases=('fal-ai/bytedance/seedance/v1/lite/image-to-video',),
    ),

    'kling_o3_standard_t2v': GenerationModelDefinition(
        model_key='kling_o3_standard_t2v',
        display_name='Kling O3 Standard Text to Video',
        medium='video',
        provider='fal',
        provider_model_key='fal-ai/kling-video/o3/standard/text-to-video',
        mode_ids=('premium',),
        billing_unit='per_second',
        quality_tier='standard',
        cost_profile='kling_o3_standard_t2v',
        user_facing_description='Balanced text-to-video route for Kling O3.',
        fallback_model_key='fal_ltx23_t2v',
        aliases=('fal-ai/kling-video/o3/standard/text-to-video',),
    ),

    'kling_o3_standard_i2v': GenerationModelDefinition(
        model_key='kling_o3_standard_i2v',
        display_name='Kling O3 Standard Image to Video',
        medium='video',
        provider='fal',
        provider_model_key='fal-ai/kling-video/o3/standard/image-to-video',
        mode_ids=('premium',),
        billing_unit='per_second',
        quality_tier='standard',
        cost_profile='kling_o3_standard_i2v',
        user_facing_description='Balanced image-to-video route for Kling O3.',
        fallback_model_key='fal_ltx23_i2v',
        aliases=('fal-ai/kling-video/o3/standard/image-to-video',),
    ),

    'kling_o3_pro_t2v': GenerationModelDefinition(
        model_key='kling_o3_pro_t2v',
        display_name='Kling O3 Pro Text to Video',
        medium='video',
        provider='fal',
        provider_model_key='fal-ai/kling-video/o3/pro/text-to-video',
        mode_ids=('premium',),
        billing_unit='per_second',
        quality_tier='pro',
        cost_profile='kling_o3_pro_t2v',
        user_facing_description='Higher-quality text-to-video route for Kling O3.',
        fallback_model_key='kling_o3_standard_t2v',
        aliases=('fal-ai/kling-video/o3/pro/text-to-video',),
    ),

    'kling_o3_pro_i2v': GenerationModelDefinition(
        model_key='kling_o3_pro_i2v',
        display_name='Kling O3 Pro Image to Video',
        medium='video',
        provider='fal',
        provider_model_key='fal-ai/kling-video/o3/pro/image-to-video',
        mode_ids=('premium',),
        billing_unit='per_second',
        quality_tier='pro',
        cost_profile='kling_o3_pro_i2v',
        user_facing_description='Higher-quality image-to-video route for Kling O3.',
        fallback_model_key='kling_o3_standard_i2v',
        aliases=('fal-ai/kling-video/o3/pro/image-to-video',),
    ),

    'kling_o3_4k_t2v': GenerationModelDefinition(
        model_key='kling_o3_4k_t2v',
        display_name='Kling O3 4K Text to Video',
        medium='video',
        provider='fal',
        provider_model_key='fal-ai/kling-video/o3/4k/text-to-video',
        mode_ids=('premium',),
        billing_unit='per_second',
        quality_tier='ultra_premium',
        cost_profile='kling_o3_4k_t2v',
        user_facing_description='Native 4K text-to-video route for Kling O3.',
        fallback_model_key='kling_o3_pro_t2v',
        aliases=('fal-ai/kling-video/o3/4k/text-to-video',),
    ),

    'kling_o3_4k_i2v': GenerationModelDefinition(
        model_key='kling_o3_4k_i2v',
        display_name='Kling O3 4K Image to Video',
        medium='video',
        provider='fal',
        provider_model_key='fal-ai/kling-video/o3/4k/image-to-video',
        mode_ids=('premium',),
        billing_unit='per_second',
        quality_tier='ultra_premium',
        cost_profile='kling_o3_4k_i2v',
        user_facing_description='Native 4K image-to-video route for Kling O3.',
        fallback_model_key='kling_o3_pro_i2v',
        aliases=('fal-ai/kling-video/o3/4k/image-to-video',),
    ),

    # ✅ STANDARD (ELEMENTS)
    'kling_v16_standard_elements': GenerationModelDefinition(
        model_key='kling_v16_standard_elements',
        display_name='Kling Standard (Elements)',
        medium='video',
        provider='fal',
        provider_model_key='fal-ai/kling-video/v1.6/standard/elements',
        mode_ids=('creator_pro',),
        billing_unit='per_second',
        quality_tier='standard',
        cost_profile='kling_v16_standard_elements',
        user_facing_description='Low-cost multi-image video generation.',
        fallback_model_key='fal_ltx23_i2v',
        aliases=(
            'kling_standard_elements',
            'fal-ai/kling-video/v1.6/standard/elements',
        ),
    ),


    # ✅ HIGH QUALITY (PRO ELEMENTS)
    'kling_v16_pro_elements': GenerationModelDefinition(
        model_key='kling_v16_pro_elements',
        display_name='Kling Pro (Elements)',
        medium='video',
        provider='fal',
        provider_model_key='fal-ai/kling-video/v1.6/pro/elements',
        mode_ids=('premium',),
        billing_unit='per_second',
        quality_tier='pro',
        cost_profile='kling_v16_pro_elements',
        user_facing_description='Better multi-image quality.',
        fallback_model_key='kling_v16_standard_elements',
        aliases=(
            'kling_pro_elements',
            'fal-ai/kling-video/v1.6/pro/elements',
        ),
    ),

    # 🔥 PREMIUM (O3)
    'kling_o3_reference': GenerationModelDefinition(
        model_key='kling_o3_reference',
        display_name='Kling O3 Reference',
        medium='video',
        provider='fal',
        provider_model_key='fal-ai/kling-video/o3/standard/reference-to-video',
        mode_ids=('premium',),
        billing_unit='per_second',
        quality_tier='premium',
        cost_profile='kling_o3_reference',
        user_facing_description='Best avatar + product consistency.',
        fallback_model_key='kling_v16_pro_elements',
        aliases=(
            'kling_o3',
            'kling_o3_standard_reference',
            'fal-ai/kling-video/o3/standard/reference-to-video',
        ),
    ),

    'seedance_v1_lite_reference': GenerationModelDefinition(
        model_key='seedance_v1_lite_reference',
        display_name='Seedance Lite Reference',
        medium='video',
        provider='fal',
        provider_model_key='fal-ai/bytedance/seedance/v1/lite/reference-to-video',
        mode_ids=('creator_pro',),
        billing_unit='per_video',
        quality_tier='affordable',
        cost_profile='seedance_v1_lite_reference',
        user_facing_description='Affordable reference-to-video route for avatar product ads.',
        fallback_model_key='kling_o3_standard_reference',
        aliases=(
            'seedance_lite_reference',
            'seedance_v1_lite',
            'fal-ai/bytedance/seedance/v1/lite/reference-to-video',
        ),
    ),

    'pixverse_c1_reference': GenerationModelDefinition(
        model_key='pixverse_c1_reference',
        display_name='PixVerse C1 Reference',
        medium='video',
        provider='fal',
        provider_model_key='fal-ai/pixverse/c1/reference-to-video',
        mode_ids=('premium',),
        billing_unit='per_second',
        quality_tier='premium',
        cost_profile='pixverse_c1_reference',
        user_facing_description='Reference-to-video route for anime reels and freeform stylized reference generation.',
        default_duration_seconds=5,
        aliases=(
            'fal-ai/pixverse/c1/reference-to-video',
        ),
    ),

    'kling_v26_standard_motion_control': GenerationModelDefinition(
        model_key='kling_v26_standard_motion_control',
        display_name='Kling 2.6 Motion Control',
        medium='video',
        provider='fal',
        provider_model_key='fal-ai/kling-video/v2.6/standard/motion-control',
        mode_ids=('premium',),
        billing_unit='per_second',
        quality_tier='standard',
        cost_profile='kling_v26_standard_motion_control',
        user_facing_description='Reference-driven dance and motion-transfer route for viral reels.',
        default_duration_seconds=10,
        aliases=(
            'fal-ai/kling-video/v2.6/standard/motion-control',
        ),
    ),

}


MODEL_ALIASES: dict[str, str] = {}
for definition in MODEL_REGISTRY.values():
    MODEL_ALIASES[definition.model_key] = definition.model_key
    for alias in definition.aliases:
        MODEL_ALIASES[alias] = definition.model_key


_VIDEO_MODELS_SHARED_CONFIG = load_shared_json('shared/config/video-models.json')
NORMAL_VIDEO_FAMILY_REGISTRY: dict[str, NormalVideoFamilyDefinition] = {
    str(item['key']): NormalVideoFamilyDefinition(
        key=str(item['key']),
        display_name=str(item.get('displayName') or item['key']),
        tags=tuple(str(tag) for tag in item.get('tags') or []),
        description=str(item.get('description') or ''),
        supports_text_to_video=bool(item.get('supportsTextToVideo', False)),
        supports_image_to_video=bool(item.get('supportsImageToVideo', False)),
        supports_native_audio=bool(item.get('supportsNativeAudio', False)),
        native_audio_default=bool(item.get('nativeAudioDefault', False)),
        native_audio_notes=str(item.get('nativeAudioNotes') or ''),
        supported_durations=tuple(int(value) for value in item.get('supportedDurations') or []),
        supported_qualities=tuple(dict(entry) for entry in item.get('supportedQualities') or []),
        supported_resolutions=tuple(str(value) for value in item.get('supportedResolutions') or []),
        supported_aspect_ratios=tuple(str(value) for value in item.get('supportedAspectRatios') or []),
        required_inputs_by_generation_mode={
            str(mode): tuple(str(value) for value in values or [])
            for mode, values in dict(item.get('requiredInputsByGenerationMode') or {}).items()
        },
        provider_routes_by_generation_mode_and_quality={
            str(mode): {str(quality): str(route) for quality, route in dict(mapping or {}).items()}
            for mode, mapping in dict(item.get('providerRoutesByGenerationModeAndQuality') or {}).items()
        },
        payload_mapping=dict(item.get('payloadMapping') or {}),
        pricing_type=str(item.get('pricingType') or ''),
        pricing_config=dict(item.get('pricingConfig') or {}),
        hidden=bool(item.get('hidden', False)),
        dev_only=bool(item.get('devOnly', False)),
    )
    for item in _VIDEO_MODELS_SHARED_CONFIG.get('normalVideoFamilies', [])
    if item.get('key')
}


def resolve_model_key(model_key: str | None) -> str | None:
    if not model_key:
        return None
    return MODEL_ALIASES.get(model_key, model_key)


def get_model_definition(model_key: str | None) -> GenerationModelDefinition | None:
    resolved = resolve_model_key(model_key)
    if not resolved:
        return None
    return MODEL_REGISTRY.get(resolved)


def get_normal_video_family_definition(model_family: str | None) -> NormalVideoFamilyDefinition | None:
    if not model_family:
        return None
    return NORMAL_VIDEO_FAMILY_REGISTRY.get(str(model_family).strip().lower())


def list_normal_video_family_definitions() -> list[NormalVideoFamilyDefinition]:
    return list(NORMAL_VIDEO_FAMILY_REGISTRY.values())
