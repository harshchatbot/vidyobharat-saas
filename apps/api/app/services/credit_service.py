from __future__ import annotations

import hashlib
import hmac
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.repositories.credit_repository import CreditRepository
from app.models.entities import CreditTopUpOrder, CreditTransaction, CreditWallet


class InsufficientCreditsError(RuntimeError):
    def __init__(self, required: int, available: int) -> None:
        super().__init__(f'Insufficient credits. Required {required}, available {available}.')
        self.required = required
        self.available = available


@dataclass
class CreditCostItem:
    key: str
    label: str
    amount: int


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
    order_id: str
    key_id: str
    amount_paise: int
    currency: str
    credits: int


class CreditService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = CreditRepository(db)
        self.config = self._load_config()
        self.settings = get_settings()

    def _load_config(self) -> dict[str, Any]:
        config_path = Path(__file__).resolve().parents[1] / 'core' / 'credit_pricing.json'
        return json.loads(config_path.read_text())

    def ensure_wallet(self, user_id: str) -> CreditWallet:
        wallet = self.repo.get_wallet(user_id)
        if wallet:
            self._apply_monthly_reset_if_due(wallet)
            self.db.commit()
            self.db.refresh(wallet)
            return wallet

        plan = 'free'
        monthly_credits = int(self.config['plans'][plan]['monthly_credits'])
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

    def estimate_for_user(self, user_id: str, action: str, payload: dict[str, Any]) -> tuple[CreditWallet, CreditEstimate]:
        wallet = self.ensure_wallet(user_id)
        estimate = self.estimate(action, payload)
        return wallet, estimate

    def make_idempotency_key(self, prefix: str, metadata: dict[str, Any]) -> str:
        return self._stable_key(prefix, metadata)

    def top_up_credits(self, user_id: str, credits: int, metadata: dict[str, Any] | None = None) -> CreditWallet:
        idempotency_key = self._stable_key(
            'topup',
            {
                'user_id': user_id,
                'credits': credits,
                'metadata': metadata or {},
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
            wallet.current_credits += credits
            self.repo.add_transaction(
                user_id=user_id,
                feature_key='topup',
                amount=credits,
                balance_after=wallet.current_credits,
                transaction_type='credit',
                source='topup',
                metadata_json=json.dumps(metadata or {}),
                idempotency_key=idempotency_key,
            )
            self.repo.save_all([wallet])
        wallet = self.ensure_wallet(user_id)
        return wallet

    def create_razorpay_topup_order(self, user_id: str, credits: int) -> CreditTopUpOrderResult:
        if not self.settings.razorpay_key_id or not self.settings.razorpay_key_secret:
            raise RuntimeError('Razorpay is not configured')

        amount_paise = self._credits_to_paise(credits)
        payload = {
            'amount': amount_paise,
            'currency': 'INR',
            'receipt': f'rangmanch-{user_id[:8]}-{credits}-{int(datetime.now(UTC).timestamp())}',
            'notes': {
                'user_id': user_id,
                'credits': str(credits),
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
                credits=credits,
                amount_paise=amount_paise,
                currency='INR',
                provider_order_id=provider_order_id,
                metadata_json=json.dumps({'provider_response': data}),
            )
        return CreditTopUpOrderResult(
            provider='razorpay',
            order_id=provider_order_id,
            key_id=self.settings.razorpay_key_id,
            amount_paise=amount_paise,
            currency='INR',
            credits=credits,
        )

    def verify_razorpay_topup(
        self,
        *,
        user_id: str,
        credits: int,
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
                        'credits': credits,
                        'provider': 'razorpay',
                    }
                )
                self.repo.save_all([order_locked])

        wallet = self.top_up_credits(
            user_id=user_id,
            credits=credits,
            metadata={
                'provider': 'razorpay',
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
        voice = str(payload.get('voice') or '')
        sample_rate = int(payload.get('sample_rate_hz') or payload.get('sampleRateHz') or 22050)
        free_voices = set(self.config.get('free_voice_keys', []))
        items: list[CreditCostItem] = []
        if voice and voice not in free_voices:
            items.append(self._item('PremiumVoicePreview'))
        if sample_rate == 48000:
            items.append(self._item('AudioQuality48kHzModifier'))
        return self._sum(items)

    def _estimate_image_generate(self, payload: dict[str, Any]) -> CreditEstimate:
        model_key = str(payload.get('model_key') or payload.get('modelKey') or '')
        resolution = str(payload.get('resolution') or '')
        reference_urls = payload.get('reference_urls') or payload.get('referenceUrls') or []
        items: list[CreditCostItem] = []
        free_models = set(self.config.get('free_image_models', []))
        free_resolutions = set(self.config.get('free_image_resolutions', []))
        if model_key not in free_models or resolution not in free_resolutions:
            items.append(self._item('PremiumImageGen'))
        if isinstance(reference_urls, list) and len(reference_urls) > 0:
            items.append(self._item('CharacterConsistencyAddOn'))
        return self._sum(items)

    def _estimate_image_action(self, payload: dict[str, Any]) -> CreditEstimate:
        action = str(payload.get('action_type') or payload.get('action') or '')
        items: list[CreditCostItem] = []
        if action == 'upscale':
            items.append(self._item('ImageUpscale'))
        return self._sum(items)

    def _estimate_video_create(self, payload: dict[str, Any]) -> CreditEstimate:
        model_key = str(payload.get('modelKey') or payload.get('selected_model') or payload.get('selectedModel') or '')
        resolution = str(payload.get('resolution') or '720p')
        duration_seconds = int(payload.get('durationSeconds') or 15)
        captions_enabled = bool(payload.get('captionsEnabled') if 'captionsEnabled' in payload else payload.get('captions_enabled'))
        voice = str(payload.get('voice') or '')
        image_urls = payload.get('imageUrls') or payload.get('image_urls') or payload.get('reference_images') or []
        sample_rate = int(payload.get('sampleRateHz') or ((payload.get('audioSettings') or {}).get('sampleRateHz') if isinstance(payload.get('audioSettings'), dict) else 22050) or 22050)
        items: list[CreditCostItem] = []
        premium_video_models = set(self.config.get('premium_video_models', []))
        if model_key in premium_video_models:
            base_key = 'PremiumVideo1080p15s' if resolution == '1080p' else 'PremiumVideo720p15s'
            base_amount = self.config['pricing'][base_key]
            scaled_amount = max(1, round((base_amount * duration_seconds) / int(self.config['credit_modifiers']['video_base_seconds'])))
            items.append(CreditCostItem(key=base_key, label=self._label_for_key(base_key), amount=scaled_amount))
        if voice and voice not in set(self.config.get('free_voice_keys', [])):
            items.append(self._item('PremiumVoiceGen'))
        if captions_enabled:
            items.append(self._item('AutoCaption'))
        if sample_rate == 48000:
            items.append(self._item('AudioQuality48kHzModifier'))
        if isinstance(image_urls, list) and len(image_urls) > 0:
            items.append(self._item('CharacterConsistencyAddOn'))
        items.append(self._item('AutoTag'))
        return self._sum(items)

    def _estimate_script_enhance(self) -> CreditEstimate:
        return self._sum([self._item('ScriptEnhance'), self._item('AutoTag')])

    def _estimate_video_retry(self, payload: dict[str, Any]) -> CreditEstimate:
        voice = str(payload.get('voice') or '')
        items: list[CreditCostItem] = []
        if voice and voice not in set(self.config.get('free_voice_keys', [])):
            items.append(self._item('VoiceRetry'))
        return self._sum(items)

    def _item(self, key: str) -> CreditCostItem:
        return CreditCostItem(key=key, label=self._label_for_key(key), amount=int(self.config['pricing'][key]))

    def _sum(self, items: list[CreditCostItem]) -> CreditEstimate:
        total = sum(item.amount for item in items)
        return CreditEstimate(required_credits=total, breakdown=items, premium=total > 0)

    def _credits_to_paise(self, credits: int) -> int:
        # MVP pricing: 1 credit = INR 1.
        return int(credits) * 100

    def _label_for_key(self, key: str) -> str:
        labels = {
            'PremiumVoiceGen': 'Premium voice generation',
            'PremiumVoicePreview': 'Premium voice preview',
            'VoiceRetry': 'Voice retry',
            'PremiumImageGen': 'Premium image generation',
            'ImageUpscale': 'Image upscale',
            'PremiumVideo720p15s': 'Premium video generation (720p)',
            'PremiumVideo1080p15s': 'Premium video generation (1080p)',
            'CharacterConsistencyAddOn': 'Character consistency add-on',
            'ScriptEnhance': 'Script enhance',
            'AutoCaption': 'Auto captions',
            'AutoTag': 'Auto tagging',
            'AudioQuality48kHzModifier': '48 kHz audio quality',
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
        monthly_credits = int(self.config['plans'][plan]['monthly_credits'])
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
