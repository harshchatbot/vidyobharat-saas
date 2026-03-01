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
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.repositories.credit_repository import CreditRepository
from app.models.entities import CreditTransaction, CreditWallet
from app.services.pricing_service import CheckoutPlanSelection, PricingService


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


@dataclass
class CreditDeductionResult:
    wallet: CreditWallet
    transaction: CreditTransaction
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
    FREE_PLAN_MONTHLY_CREDITS = 25
    FREE_VOICE_KEYS = {'Aarav', 'Mira', 'Dev', 'Shubh', 'Priya'}
    FREE_IMAGE_MODELS = {'nano_banana'}
    FREE_IMAGE_RESOLUTIONS = {'1024'}
    VIDEO_MODEL_ALIASES = {
        'kling3': 'kling',
        'kling': 'kling',
        'veo3': 'veo',
        'veo': 'veo',
        'sora2': 'sora',
        'sora': 'sora',
    }
    IMAGE_MODEL_TIERS = {
        'nano_banana': 'standard',
        'openai_image': 'premium',
        'seedream': 'premium',
        'flux_spark': 'premium',
        'recraft_studio': 'premium',
    }
    VOICE_PROVIDER_ALIASES = {
        'sarvam ai': 'sarvam',
        'sarvam': 'sarvam',
        'elevenlabs': 'elevenlabs',
        'free': 'free',
        'fallback tts': 'free',
    }

    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = CreditRepository(db)
        self.settings = get_settings()
        self.pricing_service = PricingService()
        self.credit_costs = _load_json_config('credit_pricing.json')
        self.credit_plans = _load_json_config('credit_plans.json')
        self.credit_multipliers = _load_json_config('credit_multipliers.json')

    def ensure_wallet(self, user_id: str) -> CreditWallet:
        wallet = self.repo.get_wallet(user_id)
        if wallet:
            self._apply_monthly_reset_if_due(wallet)
            self.db.commit()
            self.db.refresh(wallet)
            return wallet

        plan = 'free'
        monthly_credits = self.FREE_PLAN_MONTHLY_CREDITS
        wallet = self.repo.create_wallet(
            user_id=user_id,
            current_credits=monthly_credits,
            plan_type=plan,
            monthly_credits=monthly_credits,
        )
        self.db.commit()
        self.db.refresh(wallet)
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
        return CreditEstimate(required_credits=0, breakdown=[], premium=False)

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
        total, _ = self._calculate_image_credits_with_breakdown(resolution=resolution, model=model)
        return total

    def calculate_voice_credits(
        self,
        *,
        provider: str,
        sample_rate: str,
    ) -> int:
        total, _ = self._calculate_voice_credits_with_breakdown(provider=provider, sample_rate=sample_rate)
        return total

    def estimate_for_user(self, user_id: str, action: str, payload: dict[str, Any]) -> tuple[CreditWallet, CreditEstimate]:
        wallet = self.ensure_wallet(user_id)
        estimate = self.estimate(action, payload)
        return wallet, estimate

    def make_idempotency_key(self, prefix: str, metadata: dict[str, Any]) -> str:
        return self._stable_key(prefix, metadata)

    def top_up_credits(self, user_id: str, credits: int, metadata: dict[str, Any] | None = None) -> CreditWallet:
        metadata = metadata or {}
        idempotency_key = self._stable_key(
            'topup',
            {
                'user_id': user_id,
                'credits': credits,
                'metadata': metadata,
            },
        )
        with self._transaction():
            existing = self.repo.get_transaction_by_idempotency_key(idempotency_key)
            if existing:
                wallet = self.repo.get_wallet(user_id)
                assert wallet is not None
                return wallet
            wallet = self._ensure_wallet_locked(user_id)
            self._apply_monthly_reset_if_due(wallet)
            plan_name = str(metadata.get('plan_name') or '').strip().lower()
            plan_credits = int(metadata.get('plan_credits') or 0)
            if plan_name and plan_credits > 0:
                wallet.plan_type = plan_name
                wallet.monthly_credits = plan_credits
            wallet.current_credits += credits
            self.repo.add_transaction(
                user_id=user_id,
                feature_key='topup',
                amount=credits,
                balance_after=wallet.current_credits,
                transaction_type='credit',
                source='topup',
                metadata_json=json.dumps(metadata),
                idempotency_key=idempotency_key,
            )
            self.repo.save_all([wallet])
        wallet = self.ensure_wallet(user_id)
        return wallet

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
    ) -> CreditWallet:
        if not self.settings.razorpay_key_secret:
            raise RuntimeError('Razorpay is not configured')
        topup_order = self.repo.get_topup_order_by_provider_order_id(razorpay_order_id)
        if not topup_order or topup_order.user_id != user_id:
            raise RuntimeError('Top-up order not found')
        if topup_order.status == 'paid':
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

        with self._transaction():
            order_locked = self.repo.get_topup_order_by_provider_order_id(razorpay_order_id)
            if order_locked is None or order_locked.user_id != user_id:
                raise RuntimeError('Top-up order not found')
            if order_locked.status != 'paid':
                order_locked.status = 'paid'
                order_locked.provider_payment_id = razorpay_payment_id
                order_locked.provider_signature = razorpay_signature
                order_locked.verified_at = datetime.now(UTC)
                order_locked.metadata_json = json.dumps(
                    {
                        'plan_name': order_locked.plan_name,
                        'provider': 'razorpay',
                    }
                )
                self.repo.save_all([order_locked])

        wallet = self.top_up_credits(
            user_id=user_id,
            credits=topup_order.credits,
            metadata={
                'provider': 'razorpay',
                'plan_name': topup_order.plan_name,
                'plan_credits': topup_order.credits,
                'pricing_region': topup_order.pricing_region,
                'razorpay_order_id': razorpay_order_id,
                'razorpay_payment_id': razorpay_payment_id,
            },
        )
        return wallet

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
        with self._transaction():
            existing = self.repo.get_transaction_by_idempotency_key(idempotency_key)
            if existing:
                wallet = self._ensure_wallet_locked(user_id)
                return CreditDeductionResult(wallet=wallet, transaction=existing, already_processed=True)

            wallet = self._ensure_wallet_locked(user_id)
            self._apply_monthly_reset_if_due(wallet)
            if amount > 0 and wallet.current_credits < amount:
                raise InsufficientCreditsError(required=amount, available=wallet.current_credits)

            wallet.current_credits -= amount
            if amount > 0:
                wallet.premium_usage_count += 1
            else:
                wallet.free_usage_count += 1

            transaction = self.repo.add_transaction(
                user_id=user_id,
                feature_key=feature_key,
                amount=amount,
                balance_after=wallet.current_credits,
                transaction_type='debit',
                source=source,
                metadata_json=json.dumps(metadata),
                idempotency_key=idempotency_key,
            )
            self.repo.save_all([wallet])
            self.db.flush()
            return CreditDeductionResult(wallet=wallet, transaction=transaction, already_processed=False)

    def list_history(self, user_id: str, limit: int = 100) -> list[CreditTransaction]:
        self.ensure_wallet(user_id)
        return self.repo.list_history(user_id, limit=limit)

    def run_monthly_reset(self) -> int:
        count = 0
        for wallet in self.db.query(CreditWallet).all():
            if self._apply_monthly_reset_if_due(wallet):
                count += 1
        self.db.commit()
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
        model_key = str(payload.get('model_key') or payload.get('modelKey') or '')
        resolution = str(payload.get('resolution') or '')
        reference_urls = payload.get('reference_urls') or payload.get('referenceUrls') or []
        items: list[CreditCostItem] = []
        if model_key not in self.FREE_IMAGE_MODELS or resolution not in self.FREE_IMAGE_RESOLUTIONS:
            dynamic_total, dynamic_items = self._calculate_image_credits_with_breakdown(
                resolution=resolution,
                model=self._resolve_image_model_tier(model_key),
            )
            items.extend(dynamic_items)
        else:
            dynamic_total = 0
        if isinstance(reference_urls, list) and len(reference_urls) > 0:
            items.append(self._item('character_consistency'))
        return self._sum(items, base_total=dynamic_total)

    def _estimate_image_action(self, payload: dict[str, Any]) -> CreditEstimate:
        action = str(payload.get('action_type') or payload.get('action') or '')
        items: list[CreditCostItem] = []
        if action == 'upscale':
            items.append(self._item('image_upscale'))
        return self._sum(items)

    def _estimate_video_create(self, payload: dict[str, Any]) -> CreditEstimate:
        model_key = str(payload.get('modelKey') or payload.get('selected_model') or payload.get('selectedModel') or '')
        resolution = str(payload.get('resolution') or '720p')
        duration_seconds = int(payload.get('durationSeconds') or 15)
        quality = str(payload.get('quality') or 'standard')
        captions_enabled = bool(payload.get('captionsEnabled') if 'captionsEnabled' in payload else payload.get('captions_enabled'))
        voice = str(payload.get('voice') or '')
        image_urls = payload.get('imageUrls') or payload.get('image_urls') or payload.get('reference_images') or []
        sample_rate = int(payload.get('sampleRateHz') or ((payload.get('audioSettings') or {}).get('sampleRateHz') if isinstance(payload.get('audioSettings'), dict) else 22050) or 22050)
        video_total, items = self._calculate_video_credits_with_breakdown(
            model=model_key,
            resolution=resolution,
            duration_seconds=duration_seconds,
            quality=quality,
        )
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
        return self._sum(items, base_total=video_total + voice_total)

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

    def _sum(self, items: list[CreditCostItem], *, base_total: int = 0) -> CreditEstimate:
        total = base_total + sum(int(item.value) for item in items)
        return CreditEstimate(required_credits=total, breakdown=items, premium=total > 0)

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
    ) -> tuple[int, list[CreditCostItem]]:
        config = self.credit_multipliers['image']
        normalized_resolution = '2048' if str(resolution) == '1536' else str(resolution)
        normalized_resolution = self._validate_multiplier_key('image resolution', normalized_resolution, config['resolution_multiplier'])
        normalized_model = self._validate_multiplier_key('image model tier', model, config['model_multiplier'])
        base_credits = int(config['base_credits'])
        resolution_multiplier = float(config['resolution_multiplier'][normalized_resolution])
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
        normalized = self.VIDEO_MODEL_ALIASES.get(value.strip().lower())
        if not normalized:
            raise ValueError('Unsupported video model for credit calculation')
        return normalized

    def _resolve_image_model_tier(self, model_key: str) -> str:
        return self.IMAGE_MODEL_TIERS.get(model_key, 'premium')

    def _resolve_voice_provider(self, *, voice: str, provider: Any | None) -> str:
        if provider:
            normalized = self._normalize_voice_provider(str(provider))
            if normalized == 'free' or voice in self.FREE_VOICE_KEYS:
                return 'free'
            return normalized
        return 'free' if voice in self.FREE_VOICE_KEYS else 'sarvam'

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

    def _apply_monthly_reset_if_due(self, wallet: CreditWallet) -> bool:
        now = datetime.now(UTC)
        last_reset = wallet.last_reset
        if last_reset is None:
            wallet.last_reset = now
            return True
        if last_reset.tzinfo is None:
            last_reset = last_reset.replace(tzinfo=UTC)
        if last_reset.year == now.year and last_reset.month == now.month:
            return False
        wallet.current_credits += wallet.monthly_credits
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
                amount=wallet.monthly_credits,
                balance_after=wallet.current_credits,
                transaction_type='credit',
                source='reset',
                metadata_json=json.dumps({'plan_type': wallet.plan_type}),
                idempotency_key=reset_key,
            )
        return True

    def _ensure_wallet_locked(self, user_id: str) -> CreditWallet:
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
        response = httpx.post(
            f'{self.settings.razorpay_api_base}/orders',
            auth=(self.settings.razorpay_key_id, self.settings.razorpay_key_secret),
            json=payload,
            timeout=20.0,
        )
        if response.status_code >= 400:
            raise RuntimeError(f'Razorpay order create failed ({response.status_code}): {response.text}')
        data = response.json()
        provider_order_id = str(data['id'])
        with self._transaction():
            self.repo.create_topup_order(
                user_id=user_id,
                provider='razorpay',
                plan_name=selection.plan_name,
                pricing_region=selection.region,
                credits=selection.allocated_credits,
                amount_paise=selection.amount_minor,
                currency=selection.currency,
                provider_order_id=provider_order_id,
                provider_checkout_id=None,
                metadata_json=json.dumps({'provider_response': data}),
            )
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
        with self._transaction():
            self.repo.create_topup_order(
                user_id=user_id,
                provider='stripe',
                plan_name=selection.plan_name,
                pricing_region=selection.region,
                credits=selection.allocated_credits,
                amount_paise=selection.amount_minor,
                currency=selection.currency,
                provider_order_id=provider_order_id,
                provider_checkout_id=provider_order_id,
                metadata_json=json.dumps({'provider': 'stripe', 'mode': 'placeholder'}),
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

    def _transaction(self):
        return _CreditTransactionContext(self.db)


class _CreditTransactionContext:
    def __init__(self, db: Session) -> None:
        self.db = db

    def __enter__(self):
        self.db.rollback()
        connection = self.db.connection()
        if self.db.bind and self.db.bind.dialect.name == 'sqlite':
            connection.exec_driver_sql('BEGIN IMMEDIATE')
        else:
            self.db.begin()
        return self.db

    def __exit__(self, exc_type, exc, tb):
        if exc_type:
            self.db.rollback()
            return False
        self.db.commit()
        return False


@lru_cache(maxsize=8)
def _load_json_config(filename: str) -> dict[str, Any]:
    config_path = Path(__file__).resolve().parents[1] / 'core' / filename
    return json.loads(config_path.read_text())
