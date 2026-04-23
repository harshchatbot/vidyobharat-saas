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
        fallback_model_key='openai_image',
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
        fallback_model_key='openai_image',
    ),
    'fal_ltx23_i2v': GenerationModelDefinition(
        model_key='fal_ltx23_i2v',
        display_name='LTX 2.3 I2V',
        medium='video',
        provider='fal',
        provider_model_key='fal-ai/ltx-2.3/image-to-video',
        mode_ids=('creator_mode', 'daily_reels'),
        cost_profile='fal_ltx23_i2v',
        billing_unit='per_second',
        quality_tier='economy',
        user_facing_description='Low-cost image-to-video route for seeded testing and practical short-form iteration.',
        default_duration_seconds=4,
        aliases=('ltx23_i2v', 'fal-ai/ltx-2.3/image-to-video'),
    ),
    'sora2': GenerationModelDefinition(
        model_key='sora2',
        display_name='Sora 2',
        medium='video',
        provider='openai',
        provider_model_key='sora-2',
        mode_ids=('premium_cinema',),
        cost_profile='sora2',
        billing_unit='per_second',
        quality_tier='premium',
        user_facing_description='Best for cinematic short-form storytelling and polished promo clips.',
        default_duration_seconds=8,
        aliases=('sora_2',),
    ),
    'ltx': GenerationModelDefinition(
        model_key='ltx',
        display_name='Self-hosted LTX',
        medium='video',
        provider='ltx',
        provider_model_key='ltx-self-hosted',
        mode_ids=('internal_benchmark',),
        cost_profile='ltx',
        billing_unit='per_second',
        quality_tier='experimental',
        user_facing_description='Internal stitched-scene benchmark route intentionally retained for self-hosted LTX cinematic montage testing.',
        default_duration_seconds=5,
        is_experimental=True,
        aliases=('ltx_benchmark',),
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
