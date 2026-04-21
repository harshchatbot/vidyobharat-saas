from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from app.services.model_registry import GenerationModelDefinition, get_model_definition, resolve_model_key
from app.services.provider_registry import get_provider_definition

Medium = Literal['image', 'video']


@dataclass(frozen=True)
class GenerationRoute:
    medium: Medium
    mode_id: str | None
    provider_id: str
    provider_label: str
    canonical_model_key: str
    provider_model_key: str
    billing_model_key: str
    fallback_model_key: str | None
    fallback_provider_id: str | None
    description: str


def resolve_generation_route(*, medium: Medium, model_key: str | None = None, mode_id: str | None = None, template_id: str | None = None) -> GenerationRoute:
    definition = _resolve_definition(medium=medium, model_key=model_key, mode_id=mode_id, template_id=template_id)
    provider = get_provider_definition(definition.provider)
    fallback_definition = get_model_definition(definition.fallback_model_key) if definition.fallback_model_key else None
    return GenerationRoute(
        medium=medium,
        mode_id=mode_id or (definition.mode_ids[0] if definition.mode_ids else None),
        provider_id=definition.provider,
        provider_label=provider.label if provider else definition.provider,
        canonical_model_key=definition.model_key,
        provider_model_key=definition.provider_model_key,
        billing_model_key=_billing_model_key(definition.model_key),
        fallback_model_key=fallback_definition.model_key if fallback_definition else None,
        fallback_provider_id=fallback_definition.provider if fallback_definition else None,
        description=definition.user_facing_description,
    )


def _resolve_definition(*, medium: Medium, model_key: str | None, mode_id: str | None, template_id: str | None) -> GenerationModelDefinition:
    if model_key:
        definition = get_model_definition(model_key)
        if definition and definition.medium == medium:
            return definition

    if medium == 'image':
        if mode_id == 'design_carousel' or template_id in {'linkedin_carousel_pack', 'quote_infographic_post'}:
            return get_model_definition('recraft')
        if mode_id == 'creator_quality' or template_id in {'product_ad_creative', 'thumbnail_cover_art'}:
            return get_model_definition('gpt_image_1_5')
        return get_model_definition('budget_image_model')

    if mode_id == 'premium_cinema':
        return get_model_definition('veo_3_1')
    if mode_id == 'creator_mode' or template_id in {'character_explainer_reel', 'client_ad_reel', 'story_slides_reel'}:
        return get_model_definition('sora_2')
    return get_model_definition('wan_2_5')


def _billing_model_key(model_key: str) -> str:
    resolved = resolve_model_key(model_key) or model_key
    if resolved == 'budget_image_model':
        return 'gemini_flash_image'
    if resolved == 'gpt_image_1_5':
        return 'openai_image'
    if resolved == 'recraft':
        return 'recraft_studio'
    if resolved == 'wan_2_5':
        return 'kling'
    if resolved == 'kling_turbo':
        return 'kling'
    if resolved == 'kling':
        return 'kling3'
    if resolved == 'sora_2':
        return 'sora2'
    if resolved == 'veo_3_1':
        return 'veo3'
    if resolved == 'ltx':
        return 'ltx_benchmark'
    return resolved
