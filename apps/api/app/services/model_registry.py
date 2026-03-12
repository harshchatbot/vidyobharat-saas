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
        user_facing_description='Best for realistic images, polished ads, and prompt fidelity.',
        fallback_model_key='openai_image',
        aliases=('openai_image',),
    ),
    'recraft': GenerationModelDefinition(
        model_key='recraft',
        display_name='Recraft',
        medium='image',
        provider='recraft',
        provider_model_key='recraftv4',
        mode_ids=('design_carousel',),
        cost_profile='recraft',
        billing_unit='per_image',
        quality_tier='premium',
        user_facing_description='Best for graphics, carousels, and design-led assets.',
        fallback_model_key='recraft_studio',
        aliases=('recraft_studio',),
    ),
    'gemini_flash_image': GenerationModelDefinition(
        model_key='gemini_flash_image',
        display_name='Gemini 3.1 Flash Image',
        medium='image',
        provider='gemini',
        provider_model_key='gemini_flash_image',
        mode_ids=('fast_social',),
        cost_profile='gemini_flash_image',
        billing_unit='per_image',
        quality_tier='standard',
        user_facing_description='Affordable Gemini image route for fast, high-volume output.',
        fallback_model_key='gpt_image_1_5',
        aliases=('nano_banana',),
    ),
    'gemini_pro_image': GenerationModelDefinition(
        model_key='gemini_pro_image',
        display_name='Gemini 3 Pro Image',
        medium='image',
        provider='gemini',
        provider_model_key='gemini_pro_image',
        mode_ids=('creator_quality',),
        cost_profile='gemini_pro_image',
        billing_unit='per_image',
        quality_tier='premium',
        user_facing_description='Premium Gemini image route for sharper composition control.',
        fallback_model_key='gpt_image_1_5',
    ),
    'openai_image': GenerationModelDefinition(
        model_key='openai_image',
        display_name='OpenAI Image',
        medium='image',
        provider='openai',
        provider_model_key='gpt-image-1',
        mode_ids=('creator_quality',),
        cost_profile='openai_image',
        billing_unit='per_image',
        quality_tier='premium',
        user_facing_description='Premium general-purpose image generation with reliable prompt following.',
        fallback_model_key='gemini_pro_image',
    ),
    'recraft_studio': GenerationModelDefinition(
        model_key='recraft_studio',
        display_name='Recraft Studio',
        medium='image',
        provider='recraft',
        provider_model_key='recraftv4',
        mode_ids=('design_carousel',),
        cost_profile='recraft_studio',
        billing_unit='per_image',
        quality_tier='premium',
        user_facing_description='Premium design-led image generation for branding and ad assets.',
        fallback_model_key='recraft',
    ),
    'wan_2_5': GenerationModelDefinition(
        model_key='wan_2_5',
        display_name='WAN 2.5',
        medium='video',
        provider='fal',
        provider_model_key='wan_2_5',
        mode_ids=('daily_reels',),
        cost_profile='wan_2_5',
        billing_unit='per_second',
        quality_tier='economy',
        user_facing_description='Low-cost daily reel engine for high-frequency short-form posting.',
        default_duration_seconds=8,
        fallback_model_key='kling_turbo',
        aliases=('wan2.1_t2v_turbo', 'wan2.5_t2v_preview'),
    ),
    'kling_turbo': GenerationModelDefinition(
        model_key='kling_turbo',
        display_name='Kling Turbo',
        medium='video',
        provider='fal',
        provider_model_key='kling_turbo',
        mode_ids=('daily_reels',),
        cost_profile='kling_turbo',
        billing_unit='per_second',
        quality_tier='economy',
        user_facing_description='Fast-turnaround social clip engine for frequent posting.',
        default_duration_seconds=8,
        fallback_model_key='wan_2_5',
        aliases=('wan2.6_i2v_flash',),
    ),
    'kling': GenerationModelDefinition(
        model_key='kling',
        display_name='Kling',
        medium='video',
        provider='fal',
        provider_model_key='kling',
        mode_ids=('creator_mode',),
        cost_profile='kling',
        billing_unit='per_second',
        quality_tier='balanced',
        user_facing_description='Balanced creator-grade motion engine for stylized and promo clips.',
        default_duration_seconds=8,
        fallback_model_key='sora_2',
        aliases=('kling3', 'wan2.6_t2v', 'grok_pro', 'grok_daily'),
    ),
    'sora_2': GenerationModelDefinition(
        model_key='sora_2',
        display_name='Sora 2',
        medium='video',
        provider='openai',
        provider_model_key='sora-2',
        mode_ids=('creator_mode',),
        cost_profile='sora_2',
        billing_unit='per_second',
        quality_tier='premium',
        user_facing_description='Best for cinematic short-form storytelling and polished promo clips.',
        default_duration_seconds=8,
        fallback_model_key='kling',
        aliases=('sora2',),
    ),
    'veo_3_1': GenerationModelDefinition(
        model_key='veo_3_1',
        display_name='Veo 3.1',
        medium='video',
        provider='gemini',
        provider_model_key='veo_3_1',
        mode_ids=('premium_cinema',),
        cost_profile='veo_3_1',
        billing_unit='per_second',
        quality_tier='premium',
        user_facing_description='Premium cinematic route for the strongest short-form visual quality.',
        default_duration_seconds=8,
        fallback_model_key='sora_2',
        aliases=('veo3',),
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
