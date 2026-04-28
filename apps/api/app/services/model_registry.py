from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

Medium = Literal['image', 'video']
BillingUnit = Literal['per_image', 'per_request', 'per_second', 'per_clip']


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

    'fal_ltx23_i2v': GenerationModelDefinition(
        model_key='fal_ltx23_i2v',
        display_name='LTX 2.3 I2V',
        medium='video',
        provider='fal',
        provider_model_key='fal-ai/ltx-2.3/image-to-video',
        mode_ids=('creator_mode',),
        cost_profile='fal_ltx23_i2v',
        billing_unit='per_second',
        quality_tier='economy',
        user_facing_description='Low-cost testing model.',
        default_duration_seconds=4,
        aliases=('ltx23_i2v',),
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

}


MODEL_ALIASES: dict[str, str] = {}
for definition in MODEL_REGISTRY.values():
    MODEL_ALIASES[definition.model_key] = definition.model_key
    for alias in definition.aliases:
        MODEL_ALIASES[alias] = definition.model_key


def resolve_model_key(model_key: str | None) -> str | None:
    if not model_key:
        return None
    return MODEL_ALIASES.get(model_key, model_key)


def get_model_definition(model_key: str | None) -> GenerationModelDefinition | None:
    resolved = resolve_model_key(model_key)
    if not resolved:
        return None
    return MODEL_REGISTRY.get(resolved)