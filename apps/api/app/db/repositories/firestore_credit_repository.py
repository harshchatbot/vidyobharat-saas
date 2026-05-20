from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime
import json
from typing import Any, Callable

from google.cloud import firestore

from app.db.firestore_utils import coerce_datetime, utcnow
from app.providers.firebase import get_firestore_client


@dataclass
class FirestoreCreditWallet:
    user_id: str
    current_credits: int
    plan_type: str
    monthly_credits: int
    last_reset: datetime
    premium_usage_count: int
    free_usage_count: int
    lifetime_purchased: int = 0
    lifetime_used: int = 0
    recurring_plan_type: str = 'free'
    recurring_monthly_credits: int = 40
    created_at: datetime | None = None
    updated_at: datetime | None = None
    credits_expires_at: datetime | None = None
    plan_name: str | None = None
    billing_cycle: str | None = None
    plan_activated_at: datetime | None = None


@dataclass
class FirestoreCreditTransaction:
    id: int
    user_id: str
    feature_key: str
    amount: int
    balance_after: int
    transaction_type: str
    source: str
    metadata_json: str
    idempotency_key: str
    created_at: datetime


@dataclass
class FirestoreCreditTopUpOrder:
    id: str
    user_id: str
    provider: str
    plan_name: str
    pricing_region: str
    country: str
    credits: int
    amount_paise: int
    currency: str
    provider_order_id: str | None
    provider_checkout_id: str | None
    provider_payment_id: str | None
    provider_signature: str | None
    status: str
    metadata_json: str
    idempotency_key: str
    created_at: datetime
    updated_at: datetime
    verified_at: datetime | None = None


class FirestoreCreditRepository:
    def __init__(self) -> None:
        self.firestore = get_firestore_client()
        self.wallets = self.firestore.collection('credit_wallets')
        self.transactions = self.firestore.collection('credit_transactions')
        self.topup_orders = self.firestore.collection('topup_orders')

    def get_wallet(self, user_id: str) -> FirestoreCreditWallet | None:
        snapshot = self.wallets.document(user_id).get()
        if not snapshot.exists:
            return None
        return self._to_wallet(snapshot.to_dict() or {})

    def list_wallets(self) -> list[FirestoreCreditWallet]:
        return [self._to_wallet(doc.to_dict() or {}) for doc in self.wallets.stream()]

    def list_history(self, user_id: str, limit: int = 100) -> list[FirestoreCreditTransaction]:
        rows = list(self.transactions.where('user_id', '==', user_id).stream())
        items = [self._to_transaction(doc.to_dict() or {}) for doc in rows]
        items.sort(key=lambda item: item.created_at, reverse=True)
        return items[:limit]

    def get_transaction_by_idempotency_key(self, idempotency_key: str) -> FirestoreCreditTransaction | None:
        rows = list(self.transactions.where('idempotency_key', '==', idempotency_key).limit(1).stream())
        if not rows:
            return None
        return self._to_transaction(rows[0].to_dict() or {})

    def create_wallet(
        self,
        *,
        user_id: str,
        current_credits: int,
        plan_type: str,
        monthly_credits: int,
    ) -> FirestoreCreditWallet:
        now = utcnow()
        payload = {
            'user_id': user_id,
            'userId': user_id,
            'balance': current_credits,
            'current_credits': current_credits,
            'plan_type': plan_type,
            'monthly_credits': monthly_credits,
            'recurring_plan_type': plan_type,
            'recurring_monthly_credits': monthly_credits,
            'last_reset': now,
            'premium_usage_count': 0,
            'free_usage_count': 0,
            'lifetime_purchased': current_credits if plan_type != 'free' else 0,
            'lifetime_used': 0,
            'created_at': now,
            'updated_at': now,
        }
        self.wallets.document(user_id).set(payload, merge=True)
        return self._to_wallet(payload)

    def update_wallet(self, wallet: FirestoreCreditWallet) -> FirestoreCreditWallet:
        payload = self._wallet_payload(wallet)
        self.wallets.document(wallet.user_id).set(payload, merge=True)
        return self._to_wallet(payload)

    def add_transaction(
        self,
        *,
        user_id: str,
        feature_key: str,
        amount: int,
        balance_after: int,
        transaction_type: str,
        source: str,
        metadata_json: str,
        idempotency_key: str,
    ) -> FirestoreCreditTransaction:
        transaction_id = self._new_int_id()
        payload = {
            'id': transaction_id,
            'user_id': user_id,
            'userId': user_id,
            'feature_key': feature_key,
            'amount': amount,
            'creditsDelta': amount if transaction_type == 'credit' else -abs(amount),
            'balance_after': balance_after,
            'transaction_type': transaction_type,
            'type': feature_key,
            'status': 'posted',
            'source': source,
            'sourceRef': None,
            'metadata_json': metadata_json,
            'metadata': metadata_json,
            'idempotency_key': idempotency_key,
            'created_at': utcnow(),
        }
        self.transactions.document(str(transaction_id)).set(payload)
        return self._to_transaction(payload)

    def create_topup_order(
        self,
        *,
        user_id: str,
        provider: str,
        plan_name: str,
        pricing_region: str,
        country: str,
        credits: int,
        amount_paise: int,
        currency: str,
        provider_order_id: str | None,
        provider_checkout_id: str | None,
        metadata_json: str,
        idempotency_key: str,
    ) -> FirestoreCreditTopUpOrder:
        now = utcnow()
        internal_id = f'topup_{self._new_int_id()}'
        payload = {
            'id': internal_id,
            'user_id': user_id,
            'userId': user_id,
            'provider': provider,
            'plan_name': plan_name,
            'planName': plan_name,
            'pricing_region': pricing_region,
            'region': pricing_region,
            'country': country,
            'credits': credits,
            'allocatedCredits': credits,
            'amount_paise': amount_paise,
            'amountMinor': amount_paise,
            'currency': currency,
            'provider_order_id': provider_order_id,
            'providerOrderId': provider_order_id,
            'provider_checkout_id': provider_checkout_id,
            'providerCheckoutId': provider_checkout_id,
            'provider_payment_id': None,
            'providerPaymentId': None,
            'provider_signature': None,
            'providerSignature': None,
            'status': 'created',
            'metadata_json': metadata_json,
            'idempotency_key': idempotency_key,
            'created_at': now,
            'updated_at': now,
            'verified_at': None,
        }
        self.topup_orders.document(internal_id).set(payload)
        return self._to_topup_order(payload)

    def get_topup_order_by_provider_order_id(self, provider_order_id: str) -> FirestoreCreditTopUpOrder | None:
        rows = list(self.topup_orders.where('provider_order_id', '==', provider_order_id).limit(1).stream())
        if not rows:
            rows = list(self.topup_orders.where('providerOrderId', '==', provider_order_id).limit(1).stream())
        if not rows:
            return None
        return self._to_topup_order(rows[0].to_dict() or {})

    def get_topup_order_by_id(self, order_id: str) -> FirestoreCreditTopUpOrder | None:
        snapshot = self.topup_orders.document(order_id).get()
        if not snapshot.exists:
            return None
        return self._to_topup_order(snapshot.to_dict() or {})

    def save_all(self, items: Iterable[object]) -> None:
        for item in items:
            if isinstance(item, FirestoreCreditWallet):
                self.update_wallet(item)
            elif isinstance(item, FirestoreCreditTopUpOrder):
                payload = self._topup_order_payload(item)
                self.topup_orders.document(item.id).set(payload, merge=True)

    def run_wallet_mutation(
        self,
        *,
        user_id: str,
        create_defaults: dict[str, Any],
        idempotency_key: str,
        mutate: Callable[[FirestoreCreditWallet], tuple[FirestoreCreditWallet, dict[str, Any]]],
    ) -> tuple[FirestoreCreditWallet, FirestoreCreditTransaction | None, bool]:
        transaction = self.firestore.transaction()
        wallet_ref = self.wallets.document(user_id)

        @firestore.transactional
        def _apply(txn):
            existing_docs = list(self.transactions.where('idempotency_key', '==', idempotency_key).limit(1).stream(transaction=txn))
            if existing_docs:
                wallet_snapshot = wallet_ref.get(transaction=txn)
                wallet_data = wallet_snapshot.to_dict() or self._wallet_defaults(user_id, create_defaults)
                return self._to_wallet(wallet_data), self._to_transaction(existing_docs[0].to_dict() or {}), True

            wallet_snapshot = wallet_ref.get(transaction=txn)
            if wallet_snapshot.exists:
                wallet = self._to_wallet(wallet_snapshot.to_dict() or {})
            else:
                payload = self._wallet_defaults(user_id, create_defaults)
                txn.set(wallet_ref, payload)
                wallet = self._to_wallet(payload)

            wallet, tx_payload = mutate(wallet)
            txn.set(wallet_ref, self._wallet_payload(wallet), merge=True)
            tx_model = None
            if tx_payload:
                txn.set(self.transactions.document(str(tx_payload['id'])), tx_payload)
                tx_model = self._to_transaction(tx_payload)
            return wallet, tx_model, False

        return _apply(transaction)

    def complete_topup_order(
        self,
        *,
        provider_order_id: str,
        user_id: str,
        payment_id: str,
        signature: str,
        credit_metadata: dict[str, Any],
    ) -> tuple[FirestoreCreditWallet, FirestoreCreditTopUpOrder, bool]:
        transaction = self.firestore.transaction()

        @firestore.transactional
        def _apply(txn):
            order_docs = list(self.topup_orders.where('provider_order_id', '==', provider_order_id).limit(1).stream(transaction=txn))
            if not order_docs:
                order_docs = list(self.topup_orders.where('providerOrderId', '==', provider_order_id).limit(1).stream(transaction=txn))
            if not order_docs:
                raise RuntimeError('Top-up order not found')

            order_ref = order_docs[0].reference
            order_data = order_docs[0].to_dict() or {}
            order = self._to_topup_order(order_data)
            if order.user_id != user_id:
                raise RuntimeError('Top-up order not found')

            wallet_ref = self.wallets.document(user_id)
            wallet_snapshot = wallet_ref.get(transaction=txn)
            if wallet_snapshot.exists:
                wallet = self._to_wallet(wallet_snapshot.to_dict() or {})
            else:
                payload = self._wallet_defaults(user_id, {'current_credits': 0, 'plan_type': 'free', 'monthly_credits': 0})
                txn.set(wallet_ref, payload, merge=True)
                wallet = self._to_wallet(payload)

            if order.status == 'paid':
                return wallet, order, True

            idempotency_key = f"topup:{order.id}"
            existing_credit = list(self.transactions.where('idempotency_key', '==', idempotency_key).limit(1).stream(transaction=txn))
            if existing_credit:
                updated_order = self._to_topup_order({**order_data, 'status': 'paid', 'provider_payment_id': payment_id, 'provider_signature': signature})
                return wallet, updated_order, True

            wallet.current_credits += order.credits
            wallet.lifetime_purchased += order.credits
            wallet.updated_at = utcnow()

            now = utcnow()
            order.status = 'paid'
            order.provider_payment_id = payment_id
            order.provider_signature = signature
            order.verified_at = now
            order.updated_at = now

            tx_payload = {
                'id': self._new_int_id(),
                'user_id': user_id,
                'userId': user_id,
                'feature_key': 'topup',
                'amount': order.credits,
                'creditsDelta': order.credits,
                'balance_after': wallet.current_credits,
                'transaction_type': 'credit',
                'type': 'topup_credit',
                'status': 'posted',
                'source': order.provider,
                'sourceRef': provider_order_id,
                'metadata_json': json.dumps(credit_metadata),
                'metadata': json.dumps(credit_metadata),
                'idempotency_key': idempotency_key,
                'created_at': now,
            }

            txn.set(wallet_ref, self._wallet_payload(wallet), merge=True)
            txn.set(order_ref, self._topup_order_payload(order), merge=True)
            txn.set(self.transactions.document(str(tx_payload['id'])), tx_payload)
            return wallet, order, False

        return _apply(transaction)

    def _wallet_defaults(self, user_id: str, create_defaults: dict[str, Any]) -> dict[str, Any]:
        now = utcnow()
        current = int(create_defaults.get('current_credits') or 0)
        return {
            'user_id': user_id,
            'userId': user_id,
            'balance': current,
            'current_credits': current,
            'plan_type': create_defaults.get('plan_type') or 'free',
            'monthly_credits': int(create_defaults.get('monthly_credits') or 0),
            'recurring_plan_type': create_defaults.get('recurring_plan_type') or create_defaults.get('plan_type') or 'free',
            'recurring_monthly_credits': int(
                create_defaults.get('recurring_monthly_credits')
                or create_defaults.get('monthly_credits')
                or 0
            ),
            'last_reset': now,
            'premium_usage_count': 0,
            'free_usage_count': 0,
            'lifetime_purchased': 0,
            'lifetime_used': 0,
            'created_at': now,
            'updated_at': now,
        }

    def _wallet_payload(self, wallet: FirestoreCreditWallet) -> dict[str, Any]:
        return {
            'user_id': wallet.user_id,
            'userId': wallet.user_id,
            'balance': wallet.current_credits,
            'current_credits': wallet.current_credits,
            'plan_type': wallet.plan_type,
            'monthly_credits': wallet.monthly_credits,
            'recurring_plan_type': wallet.recurring_plan_type,
            'recurring_monthly_credits': wallet.recurring_monthly_credits,
            'last_reset': wallet.last_reset or utcnow(),
            'premium_usage_count': wallet.premium_usage_count,
            'free_usage_count': wallet.free_usage_count,
            'lifetime_purchased': wallet.lifetime_purchased,
            'lifetime_used': wallet.lifetime_used,
            'created_at': wallet.created_at or utcnow(),
            'updated_at': utcnow(),
        }

    def _topup_order_payload(self, order: FirestoreCreditTopUpOrder) -> dict[str, Any]:
        return {
            'id': order.id,
            'user_id': order.user_id,
            'userId': order.user_id,
            'provider': order.provider,
            'plan_name': order.plan_name,
            'planName': order.plan_name,
            'pricing_region': order.pricing_region,
            'region': order.pricing_region,
            'country': order.country,
            'credits': order.credits,
            'allocatedCredits': order.credits,
            'amount_paise': order.amount_paise,
            'amountMinor': order.amount_paise,
            'currency': order.currency,
            'provider_order_id': order.provider_order_id,
            'providerOrderId': order.provider_order_id,
            'provider_checkout_id': order.provider_checkout_id,
            'providerCheckoutId': order.provider_checkout_id,
            'provider_payment_id': order.provider_payment_id,
            'providerPaymentId': order.provider_payment_id,
            'provider_signature': order.provider_signature,
            'providerSignature': order.provider_signature,
            'status': order.status,
            'metadata_json': order.metadata_json,
            'idempotency_key': order.idempotency_key,
            'created_at': order.created_at,
            'updated_at': order.updated_at,
            'verified_at': order.verified_at,
        }

    def _to_wallet(self, data: dict[str, Any]) -> FirestoreCreditWallet:
        current_credits_raw = data.get('current_credits', data.get('currentCredits', data.get('balance')))
        legacy_plan_type = data.get('plan_type', data.get('planType')) or 'free'
        legacy_monthly_credits = int(data.get('monthly_credits', data.get('monthlyCredits')) or 0)
        recurring_plan_type = data.get('recurring_plan_type', data.get('recurringPlanType'))
        recurring_monthly_credits = data.get('recurring_monthly_credits', data.get('recurringMonthlyCredits'))
        return FirestoreCreditWallet(
            user_id=data.get('user_id') or data.get('userId'),
            current_credits=int(current_credits_raw or 0),
            plan_type=legacy_plan_type,
            monthly_credits=legacy_monthly_credits,
            last_reset=coerce_datetime(data.get('last_reset', data.get('lastReset'))),
            premium_usage_count=int(data.get('premium_usage_count', data.get('premiumUsageCount')) or 0),
            free_usage_count=int(data.get('free_usage_count', data.get('freeUsageCount')) or 0),
            lifetime_purchased=int(data.get('lifetime_purchased', data.get('lifetimePurchased')) or 0),
            lifetime_used=int(data.get('lifetime_used', data.get('lifetimeUsed')) or 0),
            recurring_plan_type=str(recurring_plan_type or (legacy_plan_type if legacy_plan_type == 'free' else 'free')),
            recurring_monthly_credits=int(
                recurring_monthly_credits
                if recurring_monthly_credits is not None
                else (legacy_monthly_credits if legacy_plan_type == 'free' else 40)
            ),
            created_at=coerce_datetime(data.get('created_at', data.get('createdAt'))) if data.get('created_at', data.get('createdAt')) else None,
            updated_at=coerce_datetime(data.get('updated_at', data.get('updatedAt'))) if data.get('updated_at', data.get('updatedAt')) else None,
        )

    def _to_transaction(self, data: dict[str, Any]) -> FirestoreCreditTransaction:
        metadata = data.get('metadata_json')
        if metadata is None and isinstance(data.get('metadata'), str):
            metadata = data.get('metadata')
        elif metadata is None and data.get('metadata') is not None:
            metadata = json.dumps(data.get('metadata'))
        return FirestoreCreditTransaction(
            id=int(data.get('id') or self._new_int_id()),
            user_id=data.get('user_id') or data.get('userId'),
            feature_key=data.get('feature_key') or data.get('featureKey') or data.get('type') or 'topup',
            amount=int(data.get('amount') or abs(int(data.get('creditsDelta') or 0))),
            balance_after=int(data.get('balance_after', data.get('balanceAfter')) or 0),
            transaction_type=data.get('transaction_type', data.get('transactionType')) or 'debit',
            source=data.get('source') or 'system',
            metadata_json=metadata or '{}',
            idempotency_key=data.get('idempotency_key') or '',
            created_at=coerce_datetime(data.get('created_at', data.get('createdAt'))),
        )

    def _to_topup_order(self, data: dict[str, Any]) -> FirestoreCreditTopUpOrder:
        return FirestoreCreditTopUpOrder(
            id=str(data.get('id') or f"topup_{self._new_int_id()}"),
            user_id=data.get('user_id') or data.get('userId'),
            provider=data.get('provider') or 'razorpay',
            plan_name=data.get('plan_name', data.get('planName')) or 'starter',
            pricing_region=data.get('pricing_region', data.get('region')) or 'south_asia',
            country=data.get('country') or 'IN',
            credits=int(data.get('credits', data.get('allocatedCredits')) or 0),
            amount_paise=int(data.get('amount_paise', data.get('amountMinor')) or 0),
            currency=data.get('currency') or 'INR',
            provider_order_id=data.get('provider_order_id', data.get('providerOrderId')),
            provider_checkout_id=data.get('provider_checkout_id', data.get('providerCheckoutId')),
            provider_payment_id=data.get('provider_payment_id', data.get('providerPaymentId')),
            provider_signature=data.get('provider_signature', data.get('providerSignature')),
            status=data.get('status') or 'created',
            metadata_json=data.get('metadata_json') or '{}',
            idempotency_key=data.get('idempotency_key') or '',
            created_at=coerce_datetime(data.get('created_at', data.get('createdAt'))),
            updated_at=coerce_datetime(data.get('updated_at', data.get('updatedAt'))),
            verified_at=coerce_datetime(data.get('verified_at', data.get('verifiedAt'))) if data.get('verified_at', data.get('verifiedAt')) else None,
        )

    def _new_int_id(self) -> int:
        return int(datetime.now(UTC).timestamp() * 1_000_000)
