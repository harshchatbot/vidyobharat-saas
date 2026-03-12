from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

ProviderMedium = Literal['image', 'video']


@dataclass(frozen=True)
class ProviderDefinition:
    provider_id: str
    label: str
    mediums: tuple[ProviderMedium, ...]
    description: str
    primary_for_modes: tuple[str, ...] = ()
    supports_fallback: bool = True


PROVIDER_REGISTRY: dict[str, ProviderDefinition] = {
    'openai': ProviderDefinition(
        provider_id='openai',
        label='OpenAI',
        mediums=('image', 'video'),
        description='Premium general-purpose provider used for images and Sora-based video generation.',
    ),
    'gemini': ProviderDefinition(
        provider_id='gemini',
        label='Google Gemini',
        mediums=('image', 'video'),
        description='Google Gemini provider used for image generation and premium Veo cinematic routing.',
    ),
    'together': ProviderDefinition(
        provider_id='together',
        label='Together AI',
        mediums=('image',),
        description='Primary budget-friendly image generation provider for fast social and creator-quality image output.',
        primary_for_modes=('fast_social',),
    ),
    'fal': ProviderDefinition(
        provider_id='fal',
        label='fal.ai',
        mediums=('video',),
        description='Primary async video generation provider for daily reels and creator-oriented clip generation.',
        primary_for_modes=('daily_reels', 'creator_mode'),
    ),
    'recraft': ProviderDefinition(
        provider_id='recraft',
        label='Recraft',
        mediums=('image',),
        description='Design-first provider for graphics, carousels, and branding-oriented image generation.',
        primary_for_modes=('design_carousel',),
        supports_fallback=False,
    ),
}


def get_provider_definition(provider_id: str) -> ProviderDefinition | None:
    return PROVIDER_REGISTRY.get(provider_id)
