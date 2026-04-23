from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.services.credit_service import CreditEstimate, CreditService
from app.services.model_registry import get_model_definition, resolve_model_key


@dataclass(frozen=True)
class GenerationCostBreakdown:
    medium: str
    mode_id: str | None
    provider_id: str | None
    canonical_model_key: str | None
    billing_model_key: str
    estimated_provider_cost: float
    estimated_user_credits: int
    actual_user_credits: int | None = None
    billing_status: str = 'estimated'


class GenerationCostService:
    def __init__(self, credit_service: CreditService | None = None) -> None:
        self.credit_service = credit_service or CreditService()

    def estimate_image_generation(self, *, model_key: str, resolution: str, mode_id: str | None = None) -> GenerationCostBreakdown:
        definition = get_model_definition(model_key)
        billing_model_key = self._billing_model_key(model_key)
        estimate: CreditEstimate = self.credit_service.estimate(
            'image_generate',
            {
                'model_key': billing_model_key,
                'resolution': resolution,
                'aspect_ratio': '1:1',
                'prompt': 'estimate',
                'reference_urls': [],
            },
        )
        return GenerationCostBreakdown(
            medium='image',
            mode_id=mode_id or (definition.mode_ids[0] if definition and definition.mode_ids else None),
            provider_id=definition.provider if definition else None,
            canonical_model_key=definition.model_key if definition else resolve_model_key(model_key),
            billing_model_key=billing_model_key,
            estimated_provider_cost=round(estimate.required_credits * 0.18, 2),
            estimated_user_credits=estimate.required_credits,
        )

    def estimate_video_generation(self, *, model_key: str, resolution: str, duration_seconds: int, quality: str, mode_id: str | None = None) -> GenerationCostBreakdown:
        definition = get_model_definition(model_key)
        billing_model_key = self._billing_model_key(model_key)
        estimate: CreditEstimate = self.credit_service.estimate(
            'video_create',
            {
                'modelKey': billing_model_key,
                'resolution': resolution,
                'durationSeconds': duration_seconds,
                'quality': quality,
                'captionsEnabled': True,
                'voice': 'Shubh',
                'imageUrls': [],
                'audioSettings': {'sampleRateHz': 22050},
            },
        )
        return GenerationCostBreakdown(
            medium='video',
            mode_id=mode_id or (definition.mode_ids[0] if definition and definition.mode_ids else None),
            provider_id=definition.provider if definition else None,
            canonical_model_key=definition.model_key if definition else resolve_model_key(model_key),
            billing_model_key=billing_model_key,
            estimated_provider_cost=round(estimate.required_credits * 0.32, 2),
            estimated_user_credits=estimate.required_credits,
        )

    def settle_generation_credits(self, estimate: GenerationCostBreakdown, *, actual_user_credits: int | None = None, billing_status: str = 'settled') -> GenerationCostBreakdown:
        return GenerationCostBreakdown(
            medium=estimate.medium,
            mode_id=estimate.mode_id,
            provider_id=estimate.provider_id,
            canonical_model_key=estimate.canonical_model_key,
            billing_model_key=estimate.billing_model_key,
            estimated_provider_cost=estimate.estimated_provider_cost,
            estimated_user_credits=estimate.estimated_user_credits,
            actual_user_credits=actual_user_credits or estimate.estimated_user_credits,
            billing_status=billing_status,
        )

    def _billing_model_key(self, model_key: str) -> str:
        resolved = resolve_model_key(model_key)
        if resolved == 'budget_image_model':
            return 'gemini_flash_image'
        if resolved == 'gpt_image_1_5':
            return 'openai_image'
        if resolved == 'recraft':
            return 'recraft_studio'
        if resolved == 'sora_2':
            return 'sora2'
        if resolved in {'fal-ai/ltx-2.3/image-to-video', 'ltx23_i2v'}:
            return 'fal_ltx23_i2v'
        if resolved == 'ltx':
            return 'ltx'
        return resolved or model_key
