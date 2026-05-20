from __future__ import annotations

import math
import hashlib
import hmac
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from functools import lru_cache
from pathlib import Path
from typing import Any

import httpx

from app.core.config import get_settings
from app.core.shared_config import load_shared_json
from app.db.repositories.firestore_credit_repository import (
    FirestoreCreditRepository,
    FirestoreCreditTopUpOrder,
    FirestoreCreditTransaction,
    FirestoreCreditWallet,
)
from app.services.model_registry import get_normal_video_family_definition
from app.services.pricing_service import CheckoutPlanSelection, PricingService

import logging

logger = logging.getLogger(__name__)


class InsufficientCreditsError(RuntimeError):
    def __init__(self, required: int, available: int) -> None:
        super().__init__(f'Insufficient credits. Required {required}, available {available}.')
        self.required = required
        self.available = available


class CreditCapExceededError(RuntimeError):
    def __init__(self, requested: int, allowed: int, feature: str) -> None:
        super().__init__(f'Requested configuration exceeds allowed credit cap for {feature}. Requested {requested}, max {allowed}.')
        self.requested = requested
        self.allowed = allowed
        self.feature = feature


@dataclass
class CreditCostItem:
    component: str
    label: str
    value: float


@dataclass
class CreditEstimate:
    required_credits: int
    breakdown: list[CreditCostItem]
    premium: bool
    metadata: dict[str, Any] | None = None


@dataclass
class CreditDeductionResult:
    wallet: FirestoreCreditWallet
    transaction: FirestoreCreditTransaction
    already_processed: bool


@dataclass
class CreditTopUpOrderResult:
    provider: str
    region: str
    country: str
    plan_name: str
    order_id: str | None
    key_id: str | None
    checkout_session_id: str | None
    checkout_url: str | None
    amount_minor: int
    currency: str
    credits: int
    message: str | None = None


class CreditService:
    FREE_PLAN_MONTHLY_CREDITS = 40
    ACTIVATION_BONUS_CREDITS = 120
    ACTIVATION_BONUS_PROGRAM = 'activation_bonus_v1'
    DEFAULT_RECURRING_PLAN = 'free'
    VOICE_PROVIDER_ALIASES = {
        'sarvam ai': 'sarvam',
        'sarvam': 'sarvam',
        'elevenlabs': 'elevenlabs',
        'free': 'free',
        'fallback tts': 'free',
    }

    def __init__(self, db: Any | None = None) -> None:
        self.db = db
        self.repo = FirestoreCreditRepository()
        self.settings = get_settings()
        self.pricing_service = PricingService()
        self.credit_engine = load_shared_json('shared/config/credit-engine.json')
        self.credit_costs = self.credit_engine['fixedCosts']
        self.credit_plans = _load_json_config('credit_plans.json')
        self.credit_multipliers = {
            'video': {
                'base_credits': self.credit_engine['video']['baseCredits'],
                'base_duration': self.credit_engine['video']['baseDuration'],
                'model_multiplier': self.credit_engine['video']['modelMultiplier'],
                'resolution_multiplier': self.credit_engine['video']['resolutionMultiplier'],
                'quality_multiplier': self.credit_engine['video']['qualityMultiplier'],
                'max_credits_cap': self.credit_engine['video']['maxCreditsCap'],
            },
            'image': {
                'base_credits': self.credit_engine['image']['baseCredits'],
                'resolution_multiplier': self.credit_engine['image']['resolutionMultiplier'],
                'resolution_multiplier_overrides': self.credit_engine['image'].get('resolutionMultiplierOverrides', {}),
                'model_pricing': self.credit_engine['image'].get('modelPricing', {}),
                'model_multiplier': self.credit_engine['image']['modelMultiplier'],
                'max_credits_cap': self.credit_engine['image']['maxCreditsCap'],
            },
            'voice': {
                'base_credits': self.credit_engine['voice']['baseCredits'],
                'provider_multiplier': self.credit_engine['voice']['providerMultiplier'],
                'sample_rate_multiplier': self.credit_engine['voice']['sampleRateMultiplier'],
                'max_credits_cap': self.credit_engine['voice']['maxCreditsCap'],
            },
        }
        self.free_voice_keys = set(self.credit_engine['freeVoiceKeys'])
        self.free_image_models = set(self.credit_engine['freeImageModels'])
        self.free_image_resolutions = set(self.credit_engine['freeImageResolutions'])
        self.video_model_aliases = self.credit_engine['videoModelAliases']
        self.image_model_tiers = self.credit_engine['imageModelTiers']
        self.image_model_aliases = self.credit_engine.get('imageModelAliases', {})
        self.avatar_product_fixed_pricing = self.credit_engine.get('avatarProductFixedPricing', {})
        self.normal_video_fixed_pricing = self.credit_engine.get('normalVideoFixedPricing', {})
        self.video_add_ons = self.credit_engine.get('videoAddOns', {})
        self.provider_cost_pricing = self.credit_engine.get('providerCostPricing', {})
        self.pixverse_reference_pricing = self.credit_engine.get('pixverseReferencePricing', {})

    def ensure_wallet(self, user_id: str) -> FirestoreCreditWallet:
        wallet = self.repo.get_wallet(user_id)
        if wallet:
            before = self._wallet_signature(wallet)
            self._normalize_wallet_entitlement(wallet)
            reset_applied = self._apply_monthly_reset_if_due(wallet)
            after = self._wallet_signature(wallet)
            if reset_applied or after != before:
                self.repo.update_wallet(wallet)
            return wallet

        plan = 'free'
        monthly_credits = self.FREE_PLAN_MONTHLY_CREDITS
        wallet = self.repo.create_wallet(
            user_id=user_id,
            current_credits=monthly_credits,
            plan_type=plan,
            monthly_credits=monthly_credits,
        )
        logger.info('wallet_autocreated', extra={'user_id': user_id, 'plan_type': plan, 'current_credits': monthly_credits})
        return wallet

    def estimate(self, action: str, payload: dict[str, Any]) -> CreditEstimate:
        if action == 'tts_preview':
            return self._estimate_tts_preview(payload)
        if action == 'image_generate':
            return self._estimate_image_generate(payload)
        if action == 'image_action':
            return self._estimate_image_action(payload)
        if action == 'video_create':
            return self._estimate_video_create(payload)
        if action == 'script_enhance':
            return self._estimate_script_enhance()
        if action == 'script_generate':
            return CreditEstimate(required_credits=0, breakdown=[], premium=False)
        if action == 'video_retry':
            return self._estimate_video_retry(payload)
        if action == 'influencer_content_generate':
            return self._sum([self._item('influencer_content_generate'), self._item('auto_tag')])
        if action == 'influencer_reference_lock':
            return self._sum([self._item('influencer_reference_lock')])
        if action == 'influencer_image_generate':
            estimate = self._estimate_image_generate(payload)
            consistency_cost = int(self.credit_costs['character_consistency'])
            estimate.breakdown.append(
                CreditCostItem(
                    component='character_consistency',
                    label='Character lock',
                    value=float(consistency_cost),
                )
            )
            estimate.required_credits += consistency_cost
            estimate.premium = True
            return estimate
        if action == 'avatar_preview_generate':
            return self._estimate_avatar_preview(payload)
        return CreditEstimate(required_credits=0, breakdown=[], premium=False)


    def _estimate_avatar_preview(self, payload: dict[str, Any]) -> CreditEstimate:
        items: list[CreditCostItem] = [self._item('avatar_preview_generate')]
        return self._sum(items)


    # Central dynamic billing functions. These are the single source of truth for
    # estimate and deduction paths for video/image/voice compute pricing.
    def calculate_video_credits(
        self,
        *,
        model: str,
        resolution: str,
        duration_seconds: int,
        quality: str,
    ) -> int:
        total, _ = self._calculate_video_credits_with_breakdown(
            model=model,
            resolution=resolution,
            duration_seconds=duration_seconds,
            quality=quality,
        )
        return total

    def calculate_image_credits(
        self,
        *,
        resolution: str,
        model: str,
    ) -> int:
        total, _ = self._calculate_image_credits_with_breakdown(resolution=resolution, model=model, model_key=model)
        return total

    def calculate_voice_credits(
        self,
        *,
        provider: str,
        sample_rate: str,
    ) -> int:
        total, _ = self._calculate_voice_credits_with_breakdown(provider=provider, sample_rate=sample_rate)
        return total

    def get_user_credit_balance(self, user_id: str) -> int:
        """Return current credit balance for a user, creating the wallet if needed."""
        wallet = self.ensure_wallet(user_id)
        return wallet.current_credits

    def estimate_for_user(self, user_id: str, action: str, payload: dict[str, Any]) -> tuple[FirestoreCreditWallet, CreditEstimate]:
        wallet = self.ensure_wallet(user_id)
        estimate = self.estimate(action, payload)
        return wallet, estimate

    def make_idempotency_key(self, prefix: str, metadata: dict[str, Any]) -> str:
        return self._stable_key(prefix, metadata)

    def top_up_credits(
        self,
        user_id: str,
        credits: int,
        metadata: dict[str, Any] | None = None,
        idempotency_key: str | None = None,
    ) -> FirestoreCreditWallet:
        metadata = metadata or {}
        resolved_idempotency_key = idempotency_key or self._stable_key(
            'topup',
            {
                'user_id': user_id,
                'credits': credits,
                'metadata': metadata,
            },
        )
        transaction: FirestoreCreditTransaction | None = None
        wallet, transaction, already_processed = self.repo.run_wallet_mutation(
            user_id=user_id,
            create_defaults={
                'current_credits': self.FREE_PLAN_MONTHLY_CREDITS,
                'plan_type': 'free',
                'monthly_credits': self.FREE_PLAN_MONTHLY_CREDITS,
            },
            idempotency_key=resolved_idempotency_key,
            mutate=lambda wallet: self._topup_mutation(wallet, credits, metadata, resolved_idempotency_key),
        )
        if already_processed:
            return wallet
        wallet = self.ensure_wallet(user_id)
        return wallet

    def grant_activation_bonus_if_eligible(
        self,
        *,
        user_id: str,
        trigger: str,
        trigger_ref: str | None = None,
    ) -> tuple[FirestoreCreditWallet, bool]:
        wallet = self.ensure_wallet(user_id)
        if str(wallet.recurring_plan_type or wallet.plan_type or '').strip().lower() != self.DEFAULT_RECURRING_PLAN:
            return wallet, False

        idempotency_key = self._stable_key(
            'activation_bonus',
            {
                'user_id': user_id,
                'program': self.ACTIVATION_BONUS_PROGRAM,
            },
        )
        if self.repo.get_transaction_by_idempotency_key(idempotency_key):
            return wallet, False

        wallet = self.top_up_credits(
            user_id=user_id,
            credits=self.ACTIVATION_BONUS_CREDITS,
            metadata={
                'transaction_feature_key': 'activation_bonus',
                'transaction_source': 'bonus',
                'program': self.ACTIVATION_BONUS_PROGRAM,
                'trigger': trigger,
                'trigger_ref': trigger_ref,
            },
            idempotency_key=idempotency_key,
        )
        logger.info(
            'activation_bonus_granted',
            extra={
                'user_id': user_id,
                'credits': self.ACTIVATION_BONUS_CREDITS,
                'trigger': trigger,
                'trigger_ref': trigger_ref,
                'program': self.ACTIVATION_BONUS_PROGRAM,
            },
        )
        return wallet, True

    def create_topup_order(self, user_id: str, selection: CheckoutPlanSelection) -> CreditTopUpOrderResult:
        if selection.payment_provider == 'razorpay':
            return self._create_razorpay_topup_order(user_id, selection)
        return self._create_stripe_placeholder_topup_order(user_id, selection)

    def verify_razorpay_topup(
        self,
        *,
        user_id: str,
        razorpay_order_id: str,
        razorpay_payment_id: str,
        razorpay_signature: str,
    ) -> FirestoreCreditWallet:
        if not self.settings.razorpay_key_secret:
            raise RuntimeError('Razorpay is not configured')
        logger.info('topup_verify_started', extra={'user_id': user_id, 'provider_order_id': razorpay_order_id})
        topup_order = self.repo.get_topup_order_by_provider_order_id(razorpay_order_id)
        if not topup_order or topup_order.user_id != user_id:
            raise RuntimeError('Top-up order not found')
        if topup_order.status == 'paid':
            logger.info('topup_verify_already_paid', extra={'user_id': user_id, 'provider_order_id': razorpay_order_id})
            return self.ensure_wallet(user_id)
        if topup_order.provider != 'razorpay':
            raise RuntimeError('This order is not a Razorpay order')
        expected_signature = hmac.new(
            self.settings.razorpay_key_secret.encode('utf-8'),
            f'{razorpay_order_id}|{razorpay_payment_id}'.encode('utf-8'),
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(expected_signature, razorpay_signature):
            raise RuntimeError('Invalid Razorpay signature')
        logger.info('topup_verify_signature_valid', extra={'user_id': user_id, 'provider_order_id': razorpay_order_id})
        wallet, _, already_paid = self.repo.complete_topup_order(
            provider_order_id=razorpay_order_id,
            user_id=user_id,
            payment_id=razorpay_payment_id,
            signature=razorpay_signature,
            credit_metadata={
                'provider': 'razorpay',
                'plan_name': topup_order.plan_name,
                'plan_credits': topup_order.credits,
                'pricing_region': topup_order.pricing_region,
                'country': topup_order.country,
                'razorpay_order_id': razorpay_order_id,
                'razorpay_payment_id': razorpay_payment_id,
            },
        )
        logger.info(
            'topup_verify_credit_applied' if not already_paid else 'topup_verify_already_paid',
            extra={'user_id': user_id, 'provider_order_id': razorpay_order_id, 'credits': topup_order.credits},
        )
        return self.ensure_wallet(user_id)

    def reconcile_razorpay_topup(
        self,
        *,
        razorpay_order_id: str,
        razorpay_payment_id: str,
        razorpay_signature: str,
    ) -> FirestoreCreditWallet:
        topup_order = self.repo.get_topup_order_by_provider_order_id(razorpay_order_id)
        if not topup_order:
            raise RuntimeError('Top-up order not found')
        if topup_order.provider != 'razorpay':
            raise RuntimeError('This order is not a Razorpay order')
        wallet, _, _ = self.repo.complete_topup_order(
            provider_order_id=razorpay_order_id,
            user_id=topup_order.user_id,
            payment_id=razorpay_payment_id,
            signature=razorpay_signature,
            credit_metadata={
                'provider': 'razorpay',
                'plan_name': topup_order.plan_name,
                'plan_credits': topup_order.credits,
                'pricing_region': topup_order.pricing_region,
                'country': topup_order.country,
                'razorpay_order_id': razorpay_order_id,
                'razorpay_payment_id': razorpay_payment_id,
            },
        )
        return self.ensure_wallet(topup_order.user_id)

    def deduct_credits(
        self,
        *,
        user_id: str,
        amount: int,
        feature_key: str,
        metadata: dict[str, Any],
        source: str,
        idempotency_key: str,
    ) -> CreditDeductionResult:
        result: CreditDeductionResult | None = None
        wallet, transaction, already_processed = self.repo.run_wallet_mutation(
            user_id=user_id,
            create_defaults={
                'current_credits': self.FREE_PLAN_MONTHLY_CREDITS,
                'plan_type': 'free',
                'monthly_credits': self.FREE_PLAN_MONTHLY_CREDITS,
            },
            idempotency_key=idempotency_key,
            mutate=lambda wallet: self._deduction_mutation(
                wallet=wallet,
                amount=amount,
                feature_key=feature_key,
                metadata=metadata,
                source=source,
                idempotency_key=idempotency_key,
            ),
        )
        result = CreditDeductionResult(wallet=wallet, transaction=transaction, already_processed=already_processed)
        assert result is not None
        if feature_key in ('video_create', 'avatar_product') and amount > 0:
            logger.info(
                'avatar_product_cost_tracked',
                extra={
                    'user_id': user_id,
                    'feature_key': feature_key,
                    'credits_deducted': amount,
                    'balance_after': wallet.current_credits,
                    'video_model': metadata.get('video_model') or metadata.get('modelKey') or metadata.get('model_key'),
                    'recipe_id': metadata.get('recipeId') or metadata.get('recipe_id'),
                    'already_processed': already_processed,
                },
            )
        # Record streak activity on successful credit deduction
        if amount > 0 and not already_processed:
            try:
                from app.services.streak_service import StreakService
                StreakService().record_activity(user_id)
            except Exception as e:
                logger.exception('streak_recording_failed', extra={'user_id': user_id, 'error': str(e)})
        return result

    def list_history(self, user_id: str, limit: int = 100) -> list[FirestoreCreditTransaction]:
        self.ensure_wallet(user_id)
        try:
            return self.repo.list_history(user_id, limit=limit)
        except Exception:
            logger.exception('credit_history_read_failed', extra={'user_id': user_id, 'limit': limit})
            raise

    def run_monthly_reset(self) -> int:
        count = 0
        for wallet in self.repo.list_wallets():
            if self._apply_monthly_reset_if_due(wallet):
                self.repo.update_wallet(wallet)
                count += 1
        return count

    def _estimate_tts_preview(self, payload: dict[str, Any]) -> CreditEstimate:
        provider = self._resolve_voice_provider(
            voice=str(payload.get('voice') or ''),
            provider=payload.get('provider'),
        )
        sample_rate = str(int(payload.get('sample_rate_hz') or payload.get('sampleRateHz') or 22050))
        total, dynamic_breakdown = self._calculate_voice_credits_with_breakdown(
            provider=provider,
            sample_rate=sample_rate,
        )
        return CreditEstimate(required_credits=total, breakdown=dynamic_breakdown, premium=total > 0)

    def _estimate_image_generate(self, payload: dict[str, Any]) -> CreditEstimate:
        model_key = self._resolve_image_model_key(str(payload.get('model_key') or payload.get('modelKey') or payload.get('model') or ''))
        resolution = str(payload.get('resolution') or '')
        image_count = max(1, min(int(payload.get('image_count') or payload.get('imageCount') or 1), 4))
        reference_urls = payload.get('reference_urls') or payload.get('referenceUrls') or []
        items: list[CreditCostItem] = []
        if model_key not in self.free_image_models or resolution not in self.free_image_resolutions:
            dynamic_total, dynamic_items = self._calculate_image_credits_with_breakdown(
                resolution=resolution,
                model=self._resolve_image_model_tier(model_key),
                model_key=model_key,
            )
            items.extend(dynamic_items)
        else:
            dynamic_total = 0
        if isinstance(reference_urls, list) and len(reference_urls) > 0:
            items.append(self._item('character_consistency'))
        estimate = self._sum(items, base_total=dynamic_total)
        if image_count <= 1:
            return estimate
        additional_images_cost = estimate.required_credits * (image_count - 1)
        estimate.breakdown.append(
            CreditCostItem(
                component='additional_images',
                label=f'Additional images ({image_count - 1})',
                value=float(additional_images_cost),
            )
        )
        estimate.required_credits += additional_images_cost
        if additional_images_cost > 0:
            estimate.premium = True
        return estimate

    def _estimate_image_action(self, payload: dict[str, Any]) -> CreditEstimate:
        action = str(payload.get('action_type') or payload.get('action') or '')
        items: list[CreditCostItem] = []
        if action == 'upscale':
            items.append(self._item('image_upscale'))
        return self._sum(items)

    def _estimate_video_create(self, payload: dict[str, Any]) -> CreditEstimate:
        recipe_id = str(payload.get('recipeId') or payload.get('recipe_id') or '').strip()
        model_key = str(
            payload.get('modelKey')
            or payload.get('selected_model')
            or payload.get('selectedModel')
            or payload.get('model')
            or ''
        )
        resolution = str(payload.get('resolution') or '1080p')
        duration_seconds = int(payload.get('durationSeconds') or 15)
        quality = str(payload.get('quality') or 'standard')
        captions_enabled = bool(payload.get('captionsEnabled') if 'captionsEnabled' in payload else payload.get('captions_enabled'))
        narration_enabled = bool(payload.get('narrationEnabled') if 'narrationEnabled' in payload else payload.get('narration_enabled', True))
        voice = str(payload.get('voice') or '')
        image_urls = payload.get('imageUrls') or payload.get('image_urls') or payload.get('reference_images') or []
        inputs = payload.get('inputs') if isinstance(payload.get('inputs'), dict) else {}
        audio_settings = payload.get('audioSettings') if isinstance(payload.get('audioSettings'), dict) else {}
        audio_mode = str(payload.get('audioMode') or payload.get('audio_mode') or '').strip().lower() or 'silent'
        native_audio_enabled = bool(audio_settings.get('nativeAudioEnabled', False))
        sample_rate = int(payload.get('sampleRateHz') or ((payload.get('audioSettings') or {}).get('sampleRateHz') if isinstance(payload.get('audioSettings'), dict) else 22050) or 22050)
        effective_audio_mode = 'auto_scene_sound' if (audio_mode == 'auto_scene_sound' or native_audio_enabled) else 'silent'

        if recipe_id == 'avatar_product':
            quality_profile = str(
                (inputs or {}).get('quality_profile')
                or (inputs or {}).get('quality')
                or quality
                or 'standard'
            ).strip().lower()
            duration_key = self._duration_bucket_str(
                payload.get('durationSeconds')
                or (inputs or {}).get('duration_seconds')
                or duration_seconds
            )
            return self._estimate_avatar_product_fixed_pricing(
                quality_profile=quality_profile,
                duration_key=duration_key,
            )
        if recipe_id in {'anime_lofi_reel', 'reference_video_generator_advanced'}:
            recipe_inputs = inputs or {}
            quality_profile = str(
                recipe_inputs.get('quality_profile')
                or recipe_inputs.get('quality')
                or quality
                or 'standard'
            ).strip().lower()
            duration_value = (
                recipe_inputs.get('duration_seconds')
                or payload.get('durationSeconds')
                or duration_seconds
            )
            audio_value = str(
                recipe_inputs.get('audio_mode')
                or payload.get('audioMode')
                or effective_audio_mode
                or 'silent'
            ).strip().lower()
            return self._estimate_pixverse_reference_video(
                recipe_id=recipe_id,
                quality_profile=quality_profile,
                duration_seconds=int(duration_value or 5),
                effective_audio_mode='auto_scene_sound' if audio_value == 'auto_scene_sound' else 'silent',
                image_urls=image_urls,
            )

        model_family = str(payload.get('modelFamily') or payload.get('model_family') or '').strip().lower()
        generation_mode = str(payload.get('generationMode') or payload.get('generation_mode') or '').strip().lower()
        if not generation_mode:
            generation_mode = 'image_to_video' if isinstance(image_urls, list) and len(image_urls) > 0 else 'text_to_video'
        if model_family:
            return self._estimate_normal_video_provider_cost_pricing(
                model_family=model_family,
                model_key=model_key,
                generation_mode=generation_mode,
                resolution=resolution,
                duration_seconds=duration_seconds,
                quality=quality,
                effective_audio_mode=effective_audio_mode,
            )

        normalized_model = self._normalize_video_model(model_key)
        duration_key = self._duration_bucket_str(duration_seconds)
        if normalized_model in self.normal_video_fixed_pricing:
            return self._estimate_normal_video_fixed_pricing(
                model_key=normalized_model,
                duration_key=duration_key,
                effective_audio_mode=effective_audio_mode,
                narration_enabled=narration_enabled,
                narration_text=str(payload.get('script') or payload.get('text') or ''),
                captions_enabled=captions_enabled,
                image_urls=image_urls,
            )

        video_total, items = self._calculate_video_credits_with_breakdown(
            model=model_key,
            resolution=resolution,
            duration_seconds=duration_seconds,
            quality=quality,
        )
        voice_total = 0
        if narration_enabled:
            voice_provider = self._resolve_voice_provider(voice=voice, provider=payload.get('provider'))
            voice_total, voice_items = self._calculate_voice_credits_with_breakdown(
                provider=voice_provider,
                sample_rate=str(sample_rate),
            )
            items.extend(voice_items)
        if captions_enabled:
            items.append(self._item('auto_caption'))
        if isinstance(image_urls, list) and len(image_urls) > 0:
            items.append(self._item('character_consistency'))
        items.append(self._item('auto_tag'))
        return self._sum(
            items,
            base_total=video_total + voice_total,
            metadata={
                'pricing_mode': 'legacy_multiplier',
                'selected_model': normalized_model,
                'duration_seconds': duration_seconds,
                'audio_mode': effective_audio_mode,
                'applied_add_ons': [item.component for item in items],
            },
        )

    def _estimate_avatar_product_fixed_pricing(self, *, quality_profile: str, duration_key: str) -> CreditEstimate:
        normalized_quality = self._normalize_avatar_product_quality(quality_profile)
        quality_pricing = self.avatar_product_fixed_pricing.get(normalized_quality) or {}
        if duration_key not in quality_pricing:
            raise ValueError(f'Unsupported avatar product pricing combination: {normalized_quality} / {duration_key}s')
        total = int(quality_pricing[duration_key])
        return CreditEstimate(
            required_credits=total,
            breakdown=[
                CreditCostItem(
                    component='avatar_product_fixed',
                    label=f'Avatar Product {normalized_quality.title()} {duration_key}s',
                    value=float(total),
                )
            ],
            premium=total > 0,
            metadata={
                'pricing_mode': 'avatar_product_fixed',
                'selected_model': 'avatar_product',
                'duration_seconds': int(duration_key),
                'audio_mode': 'silent',
                'applied_add_ons': [],
            },
        )

    def _estimate_pixverse_reference_video(
        self,
        *,
        recipe_id: str,
        quality_profile: str,
        duration_seconds: int,
        effective_audio_mode: str,
        image_urls: Any,
    ) -> CreditEstimate:
        pricing = dict(self.pixverse_reference_pricing or {})
        resolution_by_quality = dict(pricing.get('resolutionByQuality') or {})
        normalized_quality = self._normalize_family_quality(quality_profile)
        resolution = str(resolution_by_quality.get(normalized_quality) or '')
        if resolution not in {'360p', '540p', '720p'}:
            raise ValueError(f'Unsupported PixVerse quality profile: {quality_profile}')
        if int(duration_seconds) not in {5, 10}:
            raise ValueError('PixVerse reference video supports only 5s or 10s')

        rates = dict((pricing.get('ratesUsdPerSecond') or {}).get(resolution, {}) or {})
        rate_key = 'audioOn' if effective_audio_mode == 'auto_scene_sound' else 'audioOff'
        provider_cost_usd = float(rates.get(rate_key, 0) or 0) * int(duration_seconds)
        usd_inr_rate = float(pricing.get('usdInrRate', 95) or 95)
        credit_inr_value = float(pricing.get('creditInrValue', 2) or 2)
        markup_multiplier = float(pricing.get('markupMultiplier', 2.0) or 2.0)
        minimum_margin_credits = int(pricing.get('minimumMarginCredits', 5) or 5)
        infra_buffer = int((pricing.get('infraBufferCreditsByDuration') or {}).get(str(duration_seconds), 0) or 0)
        provider_cost_inr = provider_cost_usd * usd_inr_rate
        raw_cost_credits = provider_cost_inr / credit_inr_value if credit_inr_value > 0 else 0
        total = max(minimum_margin_credits, math.ceil(raw_cost_credits * markup_multiplier + infra_buffer))

        return CreditEstimate(
            required_credits=total,
            breakdown=[
                CreditCostItem(
                    component='pixverse_reference_video',
                    label=f'PixVerse {resolution} {duration_seconds}s',
                    value=float(total),
                )
            ],
            premium=total > 0,
            metadata={
                'pricing_mode': 'provider_cost_plus_margin',
                'selected_model_family': 'pixverse_c1_reference',
                'selected_model': 'pixverse_c1_reference',
                'resolved_provider_route': 'fal-ai/pixverse/c1/reference-to-video',
                'generation_mode': 'image_to_video',
                'quality_profile': normalized_quality,
                'resolution': resolution,
                'duration_seconds': int(duration_seconds),
                'fps': 0,
                'frames': 0,
                'audio_mode': effective_audio_mode,
                'native_audio_enabled': effective_audio_mode == 'auto_scene_sound',
                'provider_cost_usd': round(provider_cost_usd, 6),
                'provider_cost_inr': round(provider_cost_inr, 4),
                'markup_multiplier': markup_multiplier,
                'infra_buffer_credits': infra_buffer,
                'final_credits': total,
                'image_reference_count': len(image_urls) if isinstance(image_urls, list) else 0,
                'recipe_id': recipe_id,
            },
        )

    def _estimate_normal_video_fixed_pricing(
        self,
        *,
        model_key: str,
        duration_key: str,
        effective_audio_mode: str,
        narration_enabled: bool,
        narration_text: str,
        captions_enabled: bool,
        image_urls: Any,
    ) -> CreditEstimate:
        model_pricing = self.normal_video_fixed_pricing.get(model_key) or {}
        if duration_key not in model_pricing:
            raise ValueError(f'Unsupported normal video pricing combination: {model_key} / {duration_key}s')

        base_total = int(model_pricing[duration_key])
        items = [
            CreditCostItem(
                component='normal_video_fixed',
                label=f'{model_key} {duration_key}s base pricing',
                value=float(base_total),
            )
        ]
        applied_add_ons: list[str] = []

        native_audio_total = 0
        if effective_audio_mode == 'auto_scene_sound':
            native_audio_total = self._duration_add_on_value('nativeAutoSceneSound', duration_key)
            if native_audio_total > 0:
                items.append(
                    CreditCostItem(
                        component='native_auto_scene_sound',
                        label=f'Native auto scene sound +{duration_key}s',
                        value=float(native_audio_total),
                    )
                )
                applied_add_ons.append('native_auto_scene_sound')

        narration_total = 0
        if narration_enabled:
            narration_total = self._estimate_gemini_tts_narration_add_on(narration_text)
            if narration_total > 0:
                items.append(
                    CreditCostItem(
                        component='gemini_tts_narration',
                        label='Gemini TTS narration add-on',
                        value=float(narration_total),
                    )
                )
                applied_add_ons.append('narration')

        reference_total = 0
        if isinstance(image_urls, list) and len(image_urls) > 0:
            reference_total = int(self.video_add_ons.get('referenceConsistency', 0) or 0)
            if reference_total > 0:
                items.append(
                    CreditCostItem(
                        component='reference_consistency',
                        label='Reference image / character consistency',
                        value=float(reference_total),
                    )
                )
                applied_add_ons.append('reference_consistency')

        infra_total = self._duration_add_on_value('infraBuffer', duration_key)
        if infra_total > 0:
            items.append(
                CreditCostItem(
                    component='infra_buffer',
                    label=f'Normal video infra buffer +{duration_key}s',
                    value=float(infra_total),
                )
            )
            applied_add_ons.append('infra_buffer')

        if captions_enabled:
            logger.warning('captions_enabled_ignored_for_fixed_video_pricing model=%s duration=%s', model_key, duration_key)

        total = base_total + native_audio_total + narration_total + reference_total + infra_total
        return CreditEstimate(
            required_credits=total,
            breakdown=items,
            premium=total > 0,
            metadata={
                'pricing_mode': 'normal_video_fixed',
                'selected_model': model_key,
                'duration_seconds': int(duration_key),
                'audio_mode': effective_audio_mode,
                'applied_add_ons': applied_add_ons,
            },
        )

    def _estimate_normal_video_provider_cost_pricing(
        self,
        *,
        model_family: str,
        model_key: str,
        generation_mode: str,
        resolution: str,
        duration_seconds: int,
        quality: str,
        effective_audio_mode: str,
    ) -> CreditEstimate:
        family = get_normal_video_family_definition(model_family)
        if family is None:
            raise ValueError(f'Unsupported normal video model family: {model_family}')

        normalized_quality = self._normalize_family_quality(quality)
        quality_entry = next((entry for entry in family.supported_qualities if str(entry.get('key')) == normalized_quality), None)
        if quality_entry is None:
            raise ValueError(f'Unsupported quality for {family.display_name}: {quality}')

        resolved_resolution = str(resolution or quality_entry.get('resolution') or '')
        supported_resolutions = {str(value) for value in family.supported_resolutions}
        if resolved_resolution not in supported_resolutions:
            raise ValueError(f'Unsupported resolution for {family.display_name}: {resolved_resolution}')
        supported_durations = {int(value) for value in family.supported_durations}
        if int(duration_seconds) not in supported_durations:
            raise ValueError(f'Unsupported duration for {family.display_name}: {duration_seconds}')
        if effective_audio_mode == 'auto_scene_sound' and not family.supports_native_audio:
            raise ValueError(f'Native audio is not available for {family.display_name}')

        resolved_provider_route = (
            family.provider_routes_by_generation_mode_and_quality.get(generation_mode, {}).get(normalized_quality)
            or model_key
        )
        provider_cost_usd, pricing_metadata = self._calculate_provider_cost_usd(
            family=family,
            quality=normalized_quality,
            resolution=resolved_resolution,
            duration_seconds=int(duration_seconds),
            audio_mode=effective_audio_mode,
        )

        usd_inr_rate = float(self.provider_cost_pricing.get('usdInrRate', 95) or 95)
        credit_inr_value = float(self.provider_cost_pricing.get('creditInrValue', 2) or 2)
        markup_multiplier = float(self.provider_cost_pricing.get('providerCostMarkupMultiplier', 2.0) or 2.0)
        minimum_margin_credits = int(self.provider_cost_pricing.get('minimumMarginCredits', 5) or 5)
        infra_buffer = int((self.provider_cost_pricing.get('infraBufferCreditsByDuration') or {}).get(self._duration_bucket_str(duration_seconds), 0) or 0)
        provider_cost_inr = provider_cost_usd * usd_inr_rate
        raw_cost_credits = provider_cost_inr / credit_inr_value if credit_inr_value > 0 else 0
        total = max(minimum_margin_credits, math.ceil(raw_cost_credits * markup_multiplier + infra_buffer))

        return CreditEstimate(
            required_credits=total,
            breakdown=[
                CreditCostItem(
                    component='normal_video_provider_cost',
                    label=f'{family.display_name} {normalized_quality.title()} {duration_seconds}s',
                    value=float(total),
                )
            ],
            premium=total > 0,
            metadata={
                'pricing_mode': 'provider_cost_plus_margin',
                'selected_model_family': family.key,
                'selected_model': model_key,
                'resolved_provider_route': resolved_provider_route,
                'generation_mode': generation_mode,
                'quality_profile': normalized_quality,
                'resolution': resolved_resolution,
                'duration_seconds': int(duration_seconds),
                'fps': pricing_metadata.get('fps'),
                'frames': pricing_metadata.get('frames'),
                'audio_mode': effective_audio_mode,
                'native_audio_enabled': effective_audio_mode == 'auto_scene_sound',
                'provider_cost_usd': round(provider_cost_usd, 6),
                'provider_cost_inr': round(provider_cost_inr, 4),
                'markup_multiplier': markup_multiplier,
                'infra_buffer_credits': infra_buffer,
                'final_credits': total,
            },
        )

    def _calculate_provider_cost_usd(
        self,
        *,
        family: Any,
        quality: str,
        resolution: str,
        duration_seconds: int,
        audio_mode: str,
    ) -> tuple[float, dict[str, float | int]]:
        pricing_type = str(getattr(family, 'pricing_type', '') or '')
        pricing_config = dict(getattr(family, 'pricing_config', {}) or {})

        if pricing_type == 'megapixel':
            fps = int(pricing_config.get('fps', 24) or 24)
            width, height = self._dimensions_for_resolution(resolution)
            frames = fps * int(duration_seconds)
            megapixels = (width * height * frames) / 1_000_000
            cost = megapixels * float(pricing_config.get('costPerMegapixelUsd', 0) or 0)
            return cost, {'fps': fps, 'frames': frames}

        if pricing_type == 'token_base720p5s':
            fps = int(pricing_config.get('fps', 24) or 24)
            width, height = self._dimensions_for_resolution(resolution)
            if resolution == '720p' and int(duration_seconds) == 5:
                return float(pricing_config.get('base720p5sUsd', 0.18) or 0.18), {'fps': fps, 'frames': fps * int(duration_seconds)}
            tokens = (height * width * fps * int(duration_seconds)) / 1024
            cost = (tokens / 1_000_000) * float(pricing_config.get('costPerMillionTokensUsd', 1.8) or 1.8)
            return cost, {'fps': fps, 'frames': fps * int(duration_seconds)}

        if pricing_type == 'perSecond':
            rates = dict((pricing_config.get('ratesUsdPerSecond') or {}).get(quality, {}) or {})
            key = 'audioOn' if audio_mode == 'auto_scene_sound' else 'audioOff'
            cost = float(rates.get(key, 0) or 0) * int(duration_seconds)
            return cost, {'fps': 0, 'frames': 0}

        return 0.0, {'fps': 0, 'frames': 0}

    def _normalize_family_quality(self, quality: str) -> str:
        normalized = str(quality or '').strip().lower()
        if normalized in {'high', 'high_quality', 'pro'}:
            return 'high'
        if normalized in {'premium', 'ultra_premium'}:
            return 'premium'
        return 'standard'

    def _dimensions_for_resolution(self, resolution: str) -> tuple[int, int]:
        normalized = str(resolution or '').strip()
        matrix = {
            '360p': (640, 360),
            '540p': (960, 540),
            '480p': (854, 480),
            '720p': (1280, 720),
            '1080p': (1920, 1080),
            '1440p': (2560, 1440),
            '2160p': (3840, 2160),
            '4K': (3840, 2160),
        }
        return matrix.get(normalized, (1280, 720))

    def _normalize_avatar_product_quality(self, value: str) -> str:
        normalized = str(value or '').strip().lower()
        aliases = {
            'affordable': 'affordable',
            'standard': 'standard',
            'high': 'high',
            'high_quality': 'high',
            'premium': 'premium',
        }
        resolved = aliases.get(normalized)
        if not resolved:
            raise ValueError(f'Unsupported avatar product quality profile: {value}')
        return resolved

    def _duration_bucket_str(self, value: Any) -> str:
        duration = int(value or 0)
        if duration <= 5:
            return '5'
        if duration <= 10:
            return '10'
        return '15'

    def _duration_add_on_value(self, key: str, duration_key: str) -> int:
        section = self.video_add_ons.get(key) or {}
        return int(section.get(duration_key, 0) or 0)

    def _estimate_gemini_tts_narration_add_on(self, text: str) -> int:
        section = self.video_add_ons.get('geminiTtsNarration') or {}
        per_1000 = int(section.get('per1000Chars', 0) or 0)
        minimum = int(section.get('minimum', 0) or 0)
        if per_1000 <= 0:
            return 0
        chars = max(1, len(str(text or '').strip()))
        return max(minimum, math.ceil(chars / 1000) * per_1000)

    def _estimate_script_enhance(self) -> CreditEstimate:
        return self._sum([self._item('script_enhance'), self._item('auto_tag')])

    def _estimate_video_retry(self, payload: dict[str, Any]) -> CreditEstimate:
        voice_provider = self._resolve_voice_provider(
            voice=str(payload.get('voice') or ''),
            provider=payload.get('provider'),
        )
        sample_rate = str(int(payload.get('sample_rate_hz') or payload.get('sampleRateHz') or 22050))
        total, voice_items = self._calculate_voice_credits_with_breakdown(
            provider=voice_provider,
            sample_rate=sample_rate,
        )
        retry_items = [self._item('voice_retry')] if total > 0 else []
        return self._sum([*voice_items, *retry_items], base_total=total)

    def _item(self, key: str) -> CreditCostItem:
        return CreditCostItem(component=key, label=self._label_for_key(key), value=int(self.credit_costs[key]))

    def _sum(self, items: list[CreditCostItem], *, base_total: int = 0, metadata: dict[str, Any] | None = None) -> CreditEstimate:
        total = base_total + sum(int(item.value) for item in items)
        return CreditEstimate(required_credits=total, breakdown=items, premium=total > 0, metadata=metadata or {})

    def _calculate_video_credits_with_breakdown(
        self,
        *,
        model: str,
        resolution: str,
        duration_seconds: int,
        quality: str,
    ) -> tuple[int, list[CreditCostItem]]:
        config = self.credit_multipliers['video']
        normalized_model = self._normalize_video_model(model)
        normalized_resolution = self._validate_multiplier_key('video resolution', resolution, config['resolution_multiplier'])
        normalized_quality = self._validate_multiplier_key('video quality', quality.lower(), config['quality_multiplier'])
        base_credits = int(config['base_credits'])
        base_duration = int(config['base_duration'])
        duration_factor = max(duration_seconds, 1) / base_duration
        model_multiplier = float(config['model_multiplier'][normalized_model])
        resolution_multiplier = float(config['resolution_multiplier'][normalized_resolution])
        quality_multiplier = float(config['quality_multiplier'][normalized_quality])
        raw_total = base_credits * model_multiplier * resolution_multiplier * duration_factor * quality_multiplier
        total = max(1, math.ceil(raw_total))
        self._ensure_within_cap(total, int(config['max_credits_cap']), 'video')
        breakdown = [
            CreditCostItem(component='base', label='Base video credits', value=base_credits),
            CreditCostItem(component='model_multiplier', label=f'{normalized_model.title()} model multiplier', value=model_multiplier),
            CreditCostItem(component='resolution_multiplier', label=f'{normalized_resolution} resolution multiplier', value=resolution_multiplier),
            CreditCostItem(component='duration_factor', label=f'Duration factor ({duration_seconds}s / {base_duration}s)', value=round(duration_factor, 4)),
            CreditCostItem(component='quality_multiplier', label=f'{normalized_quality.title()} quality multiplier', value=quality_multiplier),
        ]
        return total, breakdown

    def _calculate_image_credits_with_breakdown(
        self,
        *,
        resolution: str,
        model: str,
        model_key: str | None = None,
    ) -> tuple[int, list[CreditCostItem]]:
        config = self.credit_multipliers['image']
        normalized_resolution = self._validate_multiplier_key('image resolution', str(resolution), config['resolution_multiplier'])
        resolved_model_key = self._resolve_image_model_key(str(model_key or model))
        explicit_pricing = (config.get('model_pricing') or {}).get(resolved_model_key)
        if explicit_pricing:
            if normalized_resolution not in explicit_pricing:
                raise ValueError('Unsupported image resolution for pricing')
            total = int(explicit_pricing[normalized_resolution])
            if total < 0:
                raise ValueError('Invalid image pricing configuration')
            self._ensure_within_cap(total, int(config['max_credits_cap']), 'image')
            breakdown = [
                CreditCostItem(component='model_price', label=f'{resolved_model_key} {normalized_resolution} pricing', value=float(total)),
            ]
            return total, breakdown

        normalized_model = self._validate_multiplier_key('image model tier', model, config['model_multiplier'])
        base_credits = int(config['base_credits'])
        resolution_override_map = (config.get('resolution_multiplier_overrides') or {}).get(resolved_model_key, {})
        resolution_multiplier = float(
            resolution_override_map.get(normalized_resolution, config['resolution_multiplier'][normalized_resolution])
        )
        model_multiplier = float(config['model_multiplier'][normalized_model])
        raw_total = base_credits * resolution_multiplier * model_multiplier
        total = max(1, math.ceil(raw_total))
        self._ensure_within_cap(total, int(config['max_credits_cap']), 'image')
        breakdown = [
            CreditCostItem(component='base', label='Base image credits', value=base_credits),
            CreditCostItem(component='resolution_multiplier', label=f'{normalized_resolution} resolution multiplier', value=resolution_multiplier),
            CreditCostItem(component='model_multiplier', label=f'{normalized_model.title()} model multiplier', value=model_multiplier),
        ]
        return total, breakdown

    def _calculate_voice_credits_with_breakdown(
        self,
        *,
        provider: str,
        sample_rate: str,
    ) -> tuple[int, list[CreditCostItem]]:
        config = self.credit_multipliers['voice']
        normalized_provider = self._normalize_voice_provider(provider)
        if normalized_provider == 'free':
            return 0, [CreditCostItem(component='provider_multiplier', label='Free provider', value=0.0)]
        normalized_sample_rate = '22050' if str(sample_rate) == '8000' else str(sample_rate)
        normalized_sample_rate = self._validate_multiplier_key('voice sample rate', normalized_sample_rate, config['sample_rate_multiplier'])
        base_credits = int(config['base_credits'])
        provider_multiplier = float(config['provider_multiplier'][normalized_provider])
        sample_rate_multiplier = float(config['sample_rate_multiplier'][normalized_sample_rate])
        raw_total = base_credits * provider_multiplier * sample_rate_multiplier
        total = max(1, math.ceil(raw_total))
        self._ensure_within_cap(total, int(config['max_credits_cap']), 'voice')
        breakdown = [
            CreditCostItem(component='base', label='Base voice credits', value=base_credits),
            CreditCostItem(component='provider_multiplier', label=f'{normalized_provider.title()} provider multiplier', value=provider_multiplier),
            CreditCostItem(component='sample_rate_multiplier', label=f'{normalized_sample_rate} sample rate multiplier', value=sample_rate_multiplier),
        ]
        return total, breakdown

    def _normalize_video_model(self, value: str) -> str:
        key = value.strip().lower()

        if not key:
            raise ValueError('Missing video model for credit calculation')

        runtime_aliases = {
            'fal_ltx23_i2v': 'fal_ltx23_i2v',
            'ltx23_i2v': 'fal_ltx23_i2v',
            'fal-ai/ltx-2.3/image-to-video': 'fal_ltx23_i2v',
            'seedance_v1_lite_reference': 'seedance_v1_lite_reference',
            'seedance_lite_reference': 'seedance_v1_lite_reference',
            'seedance_v1_lite': 'seedance_v1_lite_reference',
            'fal-ai/bytedance/seedance/v1/lite/reference-to-video': 'seedance_v1_lite_reference',
            'sora_2': 'sora2',
            'ltx_benchmark': 'ltx',
            'kling_v16_standard_i2v': 'kling_v16_standard_i2v',
            'kling_v16_pro_i2v': 'kling_v16_pro_i2v',
            'kling_o1_reference': 'kling_o1_reference',
            'kling_standard': 'kling_v16_standard_i2v',
            'kling_pro': 'kling_v16_pro_i2v',
            'kling_o1': 'kling_o1_reference',
        }

        if key in runtime_aliases:
            return runtime_aliases[key]

        normalized = self.video_model_aliases.get(key)
        if not normalized:
            raise ValueError(f'Unsupported video model for credit calculation: {value}')
        return normalized

    def _resolve_image_model_tier(self, model_key: str) -> str:
        return self.image_model_tiers.get(self._resolve_image_model_key(model_key), 'premium')

    def _resolve_image_model_key(self, model_key: str) -> str:
        return self.image_model_aliases.get(model_key, model_key)

    def _resolve_voice_provider(self, *, voice: str, provider: Any | None) -> str:
        if provider:
            normalized = self._normalize_voice_provider(str(provider))
            if normalized == 'free' or voice in self.free_voice_keys:
                return 'free'
            return normalized
        return 'free' if voice in self.free_voice_keys else 'sarvam'

    def _normalize_voice_provider(self, value: str) -> str:
        normalized = self.VOICE_PROVIDER_ALIASES.get(value.strip().lower())
        if not normalized:
            raise ValueError('Unsupported voice provider for credit calculation')
        return normalized

    def _validate_multiplier_key(self, label: str, value: str, mapping: dict[str, Any]) -> str:
        normalized = str(value).strip()
        if normalized not in mapping:
            raise ValueError(f'Unsupported {label}')
        return normalized

    def _ensure_within_cap(self, requested: int, allowed: int, feature: str) -> None:
        if requested > allowed:
            raise CreditCapExceededError(requested=requested, allowed=allowed, feature=feature)

    def _label_for_key(self, key: str) -> str:
        labels = {
            'activation_bonus': 'Activation bonus',
            'premium_voice': 'Premium voice generation',
            'premium_voice_preview': 'Premium voice preview',
            'voice_retry': 'Voice retry',
            'premium_image': 'Premium image generation',
            'image_upscale': 'Image upscale',
            'premium_video_720p_15s': 'Premium video generation (720p)',
            'premium_video_1080p_15s': 'Premium video generation (1080p)',
            'character_consistency': 'Character consistency add-on',
            'script_enhance': 'Script enhance',
            'auto_caption': 'Auto captions',
            'auto_tag': 'Auto tagging',
            'audio_quality_48khz_modifier': '48 kHz audio quality',
            'base': 'Base cost',
            'model_multiplier': 'Model multiplier',
            'resolution_multiplier': 'Resolution multiplier',
            'duration_factor': 'Duration factor',
            'quality_multiplier': 'Quality multiplier',
            'provider_multiplier': 'Provider multiplier',
            'sample_rate_multiplier': 'Sample rate multiplier',
        }
        return labels.get(key, key)

    def _apply_monthly_reset_if_due(self, wallet: FirestoreCreditWallet) -> bool:
        now = datetime.now(UTC)
        self._normalize_wallet_entitlement(wallet)
        last_reset = wallet.last_reset
        if last_reset is None:
            wallet.last_reset = now
            return True
        if last_reset.tzinfo is None:
            last_reset = last_reset.replace(tzinfo=UTC)
        if last_reset.year == now.year and last_reset.month == now.month:
            return False
        wallet.current_credits += wallet.recurring_monthly_credits
        wallet.last_reset = now
        wallet.free_usage_count = 0
        wallet.premium_usage_count = 0
        reset_key = self._stable_key(
            'monthly_reset',
            {'user_id': wallet.user_id, 'year': now.year, 'month': now.month},
        )
        if not self.repo.get_transaction_by_idempotency_key(reset_key):
            self.repo.add_transaction(
                user_id=wallet.user_id,
                feature_key='monthly_reset',
                amount=wallet.recurring_monthly_credits,
                balance_after=wallet.current_credits,
                transaction_type='credit',
                source='reset',
                metadata_json=json.dumps({'plan_type': wallet.recurring_plan_type}),
                idempotency_key=reset_key,
            )
        return True

    def _ensure_wallet_locked(self, user_id: str) -> FirestoreCreditWallet:
        wallet = self.repo.get_wallet(user_id)
        if wallet:
            return wallet
        plan = 'free'
        monthly_credits = self.FREE_PLAN_MONTHLY_CREDITS
        return self.repo.create_wallet(
            user_id=user_id,
            current_credits=monthly_credits,
            plan_type=plan,
            monthly_credits=monthly_credits,
        )

    def _topup_mutation(
        self,
        wallet: FirestoreCreditWallet,
        credits: int,
        metadata: dict[str, Any],
        idempotency_key: str,
    ) -> tuple[FirestoreCreditWallet, dict[str, Any]]:
        self._apply_monthly_reset_if_due(wallet)
        # One-time purchases increase spendable balance only. Recurring entitlement
        # is normalized separately so top-ups cannot alter future monthly resets.
        wallet.current_credits += credits
        wallet.lifetime_purchased += credits
        tx_id = self.repo._new_int_id()
        feature_key, source = self._resolve_credit_transaction_labels(metadata)
        return wallet, {
            'id': tx_id,
            'user_id': wallet.user_id,
            'feature_key': feature_key,
            'amount': credits,
            'balance_after': wallet.current_credits,
            'transaction_type': 'credit',
            'source': source,
            'metadata_json': json.dumps(metadata),
            'idempotency_key': idempotency_key,
            'created_at': datetime.now(UTC),
        }

    def _resolve_credit_transaction_labels(self, metadata: dict[str, Any]) -> tuple[str, str]:
        explicit_feature_key = str(metadata.get('transaction_feature_key') or '').strip()
        explicit_source = str(metadata.get('transaction_source') or '').strip()
        if explicit_feature_key:
            return explicit_feature_key, explicit_source or 'system'

        refund_for = str(metadata.get('refund_for') or '').strip()
        if refund_for:
            return refund_for, 'refund'

        return 'topup', 'topup'

    def _normalize_wallet_entitlement(self, wallet: FirestoreCreditWallet) -> None:
        recurring_plan = str(getattr(wallet, 'recurring_plan_type', None) or '').strip().lower() or self.DEFAULT_RECURRING_PLAN
        recurring_monthly = int(getattr(wallet, 'recurring_monthly_credits', 0) or 0)

        # Current product behavior provides a monthly free refill plus optional one-time top-ups.
        # Older wallets may have had one-time top-up plan data written into recurring fields.
        if recurring_plan != self.DEFAULT_RECURRING_PLAN:
            recurring_plan = self.DEFAULT_RECURRING_PLAN
        if recurring_monthly < self.FREE_PLAN_MONTHLY_CREDITS:
            recurring_monthly = self.FREE_PLAN_MONTHLY_CREDITS

        wallet.recurring_plan_type = recurring_plan
        wallet.recurring_monthly_credits = recurring_monthly

        # Keep legacy fields aligned for API compatibility and synced read models.
        wallet.plan_type = recurring_plan
        wallet.monthly_credits = recurring_monthly

    def _wallet_signature(self, wallet: FirestoreCreditWallet) -> tuple[Any, ...]:
        return (
            wallet.current_credits,
            wallet.plan_type,
            wallet.monthly_credits,
            wallet.last_reset,
            wallet.premium_usage_count,
            wallet.free_usage_count,
            wallet.lifetime_purchased,
            wallet.lifetime_used,
            wallet.recurring_plan_type,
            wallet.recurring_monthly_credits,
        )

    def _deduction_mutation(
        self,
        *,
        wallet: FirestoreCreditWallet,
        amount: int,
        feature_key: str,
        metadata: dict[str, Any],
        source: str,
        idempotency_key: str,
    ) -> tuple[FirestoreCreditWallet, dict[str, Any]]:
        self._apply_monthly_reset_if_due(wallet)
        if amount > 0 and wallet.current_credits < amount:
            raise InsufficientCreditsError(required=amount, available=wallet.current_credits)
        wallet.current_credits -= amount
        if amount > 0:
            wallet.premium_usage_count += 1
        else:
            wallet.free_usage_count += 1
        tx_id = self.repo._new_int_id()
        return wallet, {
            'id': tx_id,
            'user_id': wallet.user_id,
            'feature_key': feature_key,
            'amount': amount,
            'balance_after': wallet.current_credits,
            'transaction_type': 'debit',
            'source': source,
            'metadata_json': json.dumps(metadata),
            'idempotency_key': idempotency_key,
            'created_at': datetime.now(UTC),
        }

    def _stable_key(self, prefix: str, metadata: dict[str, Any]) -> str:
        normalized = json.dumps(metadata, sort_keys=True, separators=(',', ':'), default=str)
        digest = hashlib.sha256(normalized.encode('utf-8')).hexdigest()
        return f'{prefix}:{digest}'

    def _create_razorpay_topup_order(self, user_id: str, selection: CheckoutPlanSelection) -> CreditTopUpOrderResult:
        if not self.settings.razorpay_key_id or not self.settings.razorpay_key_secret:
            raise RuntimeError('Razorpay is not configured')

        payload = {
            'amount': selection.amount_minor,
            'currency': selection.currency,
            'receipt': f'rangmanch-{user_id[:8]}-{selection.plan_name}-{int(datetime.now(UTC).timestamp())}',
            'notes': {
                'user_id': user_id,
                'plan_name': selection.plan_name,
                'pricing_region': selection.region,
            },
        }

        logger.info(
            'razorpay_topup_order_started',
            extra={
                'user_id': user_id,
                'plan_name': selection.plan_name,
                'amount_minor': selection.amount_minor,
                'currency': selection.currency,
                'credits': selection.allocated_credits,
                'pricing_region': selection.region,
                'pricing_country': selection.country,
            },
        )

        try:
            response = httpx.post(
                f'{self.settings.razorpay_api_base}/orders',
                auth=(self.settings.razorpay_key_id, self.settings.razorpay_key_secret),
                json=payload,
                timeout=20.0,
            )
        except httpx.RequestError as exc:
            logger.exception(
                'topup_razorpay_network_error',
                extra={
                    'user_id': user_id,
                    'plan_name': selection.plan_name,
                    'amount_minor': selection.amount_minor,
                    'currency': selection.currency,
                },
            )
            raise RuntimeError(f'Razorpay network error: {exc}') from exc

        if response.status_code >= 400:
            logger.error(
                'topup_razorpay_http_error',
                extra={
                    'user_id': user_id,
                    'plan_name': selection.plan_name,
                    'status_code': response.status_code,
                    'response_text': response.text,
                },
            )
            raise RuntimeError(f'Razorpay order create failed ({response.status_code}): {response.text}')

        data = response.json()
        provider_order_id = str(data.get('id') or '')

        logger.info(
            'razorpay_topup_order_provider_success',
            extra={
                'user_id': user_id,
                'plan_name': selection.plan_name,
                'provider_order_id': provider_order_id,
                'provider_amount': data.get('amount'),
                'provider_currency': data.get('currency'),
                'provider_status': data.get('status'),
            },
        )

        if not provider_order_id:
            raise RuntimeError('Razorpay order create failed: provider did not return an order id')

        try:
            logger.info(
                'topup_order_firestore_persist_started',
                extra={
                    'user_id': user_id,
                    'plan_name': selection.plan_name,
                    'provider': 'razorpay',
                    'provider_order_id': provider_order_id,
                },
            )
            self.repo.create_topup_order(
                user_id=user_id,
                provider='razorpay',
                plan_name=selection.plan_name,
                pricing_region=selection.region,
                country=selection.country,
                credits=selection.allocated_credits,
                amount_paise=selection.amount_minor,
                currency=selection.currency,
                provider_order_id=provider_order_id,
                provider_checkout_id=None,
                metadata_json=json.dumps({'provider_response': data}),
                idempotency_key=self._stable_key(
                    'topup_order',
                    {
                        'user_id': user_id,
                        'provider': 'razorpay',
                        'plan_name': selection.plan_name,
                        'provider_order_id': provider_order_id,
                    },
                ),
            )
            logger.info(
                'topup_order_firestore_persist_success',
                extra={
                    'user_id': user_id,
                    'plan_name': selection.plan_name,
                    'provider': 'razorpay',
                    'provider_order_id': provider_order_id,
                },
            )

        except Exception:
            logger.exception(
                'topup_order_firestore_persist_failed',
                extra={
                    'user_id': user_id,
                    'plan_name': selection.plan_name,
                    'provider_order_id': provider_order_id,
                    'credits': selection.allocated_credits,
                    'amount_minor': selection.amount_minor,
                    'currency': selection.currency,
                    'pricing_region': selection.region,
                },
            )
            raise

        return CreditTopUpOrderResult(
            provider='razorpay',
            region=selection.region,
            country=selection.country,
            plan_name=selection.plan_name,
            order_id=provider_order_id,
            key_id=self.settings.razorpay_key_id,
            checkout_session_id=None,
            checkout_url=None,
            amount_minor=selection.amount_minor,
            currency=selection.currency,
            credits=selection.allocated_credits,
        )

    def _create_stripe_placeholder_topup_order(self, user_id: str, selection: CheckoutPlanSelection) -> CreditTopUpOrderResult:
        provider_order_id = self.pricing_service.make_stripe_placeholder_session_id()
        logger.info(
            'topup_order_firestore_persist_started',
            extra={
                'user_id': user_id,
                'plan_name': selection.plan_name,
                'provider': 'stripe',
                'provider_order_id': provider_order_id,
            },
        )
        self.repo.create_topup_order(
            user_id=user_id,
            provider='stripe',
            plan_name=selection.plan_name,
            pricing_region=selection.region,
            country=selection.country,
            credits=selection.allocated_credits,
            amount_paise=selection.amount_minor,
            currency=selection.currency,
            provider_order_id=provider_order_id,
            provider_checkout_id=provider_order_id,
            metadata_json=json.dumps({'provider': 'stripe', 'mode': 'placeholder'}),
            idempotency_key=self._stable_key(
                'topup_order',
                {
                    'user_id': user_id,
                    'provider': 'stripe',
                    'plan_name': selection.plan_name,
                    'provider_order_id': provider_order_id,
                },
            ),
        )
        logger.info(
            'topup_order_firestore_persist_success',
            extra={
                'user_id': user_id,
                'plan_name': selection.plan_name,
                'provider': 'stripe',
                'provider_order_id': provider_order_id,
            },
        )
        return CreditTopUpOrderResult(
            provider='stripe',
            region=selection.region,
            country=selection.country,
            plan_name=selection.plan_name,
            order_id=None,
            key_id=self.settings.stripe_publishable_key,
            checkout_session_id=provider_order_id,
            checkout_url=None,
            amount_minor=selection.amount_minor,
            currency=selection.currency,
            credits=selection.allocated_credits,
            message='Stripe checkout structure is prepared but not enabled yet for global users.',
        )
@lru_cache(maxsize=8)
def _load_json_config(filename: str) -> dict[str, Any]:
    config_path = Path(__file__).resolve().parents[1] / 'core' / filename
    return json.loads(config_path.read_text())
