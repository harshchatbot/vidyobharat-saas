from __future__ import annotations

from collections.abc import Iterable
from datetime import UTC, datetime
from typing import Any

from google.cloud import firestore
from sqlalchemy.orm import Session

from app.db.firestore_utils import coerce_datetime, model_from_fields, utcnow
from app.models.entities import CreditTopUpOrder, CreditTransaction, CreditWallet
from app.providers.firebase import get_firestore_client


class CreditRepository:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.firestore = get_firestore_client()
        self.wallets = self.firestore.collection('credit_wallets')
        self.transactions = self.firestore.collection('credit_transactions')
        self.topup_orders = self.firestore.collection('credit_topup_orders')

    def get_wallet(self, user_id: str) -> CreditWallet | None:
        snapshot = self.wallets.document(user_id).get()
        if not snapshot.exists:
            return None
        return self._to_wallet(snapshot.to_dict() or {})

    def list_wallets(self) -> list[CreditWallet]:
        return [self._to_wallet(doc.to_dict() or {}) for doc in self.wallets.stream()]

    def list_history(self, user_id: str, limit: int = 100) -> list[CreditTransaction]:
        items: list[CreditTransaction] = []
        for doc in self.transactions.stream():
            data = doc.to_dict() or {}
            if data.get('user_id') != user_id:
                continue
            try:
                items.append(self._to_transaction(data))
            except Exception:
                continue
        items.sort(key=lambda item: item.created_at or datetime.now(UTC), reverse=True)
        return items[:limit]

    def get_transaction_by_idempotency_key(self, idempotency_key: str) -> CreditTransaction | None:
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
    ) -> CreditWallet:
        payload = {
            'user_id': user_id,
            'current_credits': current_credits,
            'plan_type': plan_type,
            'monthly_credits': monthly_credits,
            'last_reset': utcnow(),
            'premium_usage_count': 0,
            'free_usage_count': 0,
        }
        self.wallets.document(user_id).set(payload, merge=True)
        return self._to_wallet(payload)

    def update_wallet(self, wallet: CreditWallet) -> CreditWallet:
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
    ) -> CreditTransaction:
        transaction_id = self._new_int_id()
        payload = {
            'id': transaction_id,
            'user_id': user_id,
            'feature_key': feature_key,
            'amount': amount,
            'balance_after': balance_after,
            'transaction_type': transaction_type,
            'source': source,
            'metadata_json': metadata_json,
            'idempotency_key': idempotency_key,
            'created_at': utcnow(),
        }
        self.transactions.document(str(transaction_id)).set(payload)
        return self._to_transaction(payload)

    def create_topup_order(
        self,
        *,
        user_id: str,
        plan_name: str,
        pricing_region: str,
        credits: int,
        amount_paise: int,
        currency: str,
        provider_order_id: str,
        provider_checkout_id: str | None,
        metadata_json: str,
        provider: str,
    ) -> CreditTopUpOrder:
        payload = {
            'id': self._new_int_id(),
            'user_id': user_id,
            'provider': provider,
            'plan_name': plan_name,
            'pricing_region': pricing_region,
            'credits': credits,
            'amount_paise': amount_paise,
            'currency': currency,
            'provider_order_id': provider_order_id,
            'provider_checkout_id': provider_checkout_id,
            'provider_payment_id': None,
            'provider_signature': None,
            'status': 'created',
            'metadata_json': metadata_json,
            'created_at': utcnow(),
            'verified_at': None,
        }
        self.topup_orders.document(provider_order_id).set(payload)
        return self._to_topup_order(payload)

    def get_topup_order_by_provider_order_id(self, provider_order_id: str) -> CreditTopUpOrder | None:
        snapshot = self.topup_orders.document(provider_order_id).get()
        if not snapshot.exists:
            return None
        return self._to_topup_order(snapshot.to_dict() or {})

    def save_all(self, items: Iterable[object]) -> None:
        for item in items:
            if isinstance(item, CreditWallet):
                self.update_wallet(item)
            elif isinstance(item, CreditTopUpOrder):
                self.topup_orders.document(item.provider_order_id).set(self._topup_order_payload(item), merge=True)

    def run_wallet_mutation(
        self,
        *,
        user_id: str,
        create_defaults: dict[str, Any],
        idempotency_key: str,
        mutate: callable,
    ) -> tuple[CreditWallet, CreditTransaction | None, bool]:
        transaction = self.firestore.transaction()
        wallet_ref = self.wallets.document(user_id)

        @firestore.transactional
        def _apply(txn):
            existing_query = self.transactions.where('idempotency_key', '==', idempotency_key).limit(1)
            existing_docs = list(existing_query.stream(transaction=txn))
            if existing_docs:
                wallet_snapshot = wallet_ref.get(transaction=txn)
                wallet_data = wallet_snapshot.to_dict() or create_defaults
                return self._to_wallet(wallet_data), self._to_transaction(existing_docs[0].to_dict() or {}), True

            wallet_snapshot = wallet_ref.get(transaction=txn)
            if wallet_snapshot.exists:
                wallet = self._to_wallet(wallet_snapshot.to_dict() or {})
            else:
                payload = {
                    'user_id': user_id,
                    'current_credits': create_defaults['current_credits'],
                    'plan_type': create_defaults['plan_type'],
                    'monthly_credits': create_defaults['monthly_credits'],
                    'last_reset': utcnow(),
                    'premium_usage_count': 0,
                    'free_usage_count': 0,
                }
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

    def _wallet_payload(self, wallet: CreditWallet) -> dict[str, Any]:
        return {
            'user_id': wallet.user_id,
            'current_credits': wallet.current_credits,
            'plan_type': wallet.plan_type,
            'monthly_credits': wallet.monthly_credits,
            'last_reset': wallet.last_reset or utcnow(),
            'premium_usage_count': wallet.premium_usage_count,
            'free_usage_count': wallet.free_usage_count,
        }

    def _topup_order_payload(self, order: CreditTopUpOrder) -> dict[str, Any]:
        return {
            'id': order.id,
            'user_id': order.user_id,
            'provider': order.provider,
            'plan_name': order.plan_name,
            'pricing_region': order.pricing_region,
            'credits': order.credits,
            'amount_paise': order.amount_paise,
            'currency': order.currency,
            'provider_order_id': order.provider_order_id,
            'provider_checkout_id': order.provider_checkout_id,
            'provider_payment_id': order.provider_payment_id,
            'provider_signature': order.provider_signature,
            'status': order.status,
            'metadata_json': order.metadata_json,
            'created_at': order.created_at or utcnow(),
            'verified_at': order.verified_at,
        }

    def _to_wallet(self, data: dict[str, Any]) -> CreditWallet:
        # Support both snake_case and camelCase documents during migration/ops edits.
        current_credits_raw = data.get('current_credits', data.get('currentCredits'))
        monthly_credits_raw = data.get('monthly_credits', data.get('monthlyCredits'))
        plan_type_raw = data.get('plan_type', data.get('planType'))
        last_reset_raw = data.get('last_reset', data.get('lastReset'))
        premium_usage_raw = data.get('premium_usage_count', data.get('premiumUsageCount'))
        free_usage_raw = data.get('free_usage_count', data.get('freeUsageCount'))
        return model_from_fields(
            CreditWallet,
            user_id=data.get('user_id'),
            current_credits=int(current_credits_raw or 0),
            plan_type=plan_type_raw or 'free',
            monthly_credits=int(monthly_credits_raw or 0),
            last_reset=coerce_datetime(last_reset_raw),
            premium_usage_count=int(premium_usage_raw or 0),
            free_usage_count=int(free_usage_raw or 0),
        )

    def _to_transaction(self, data: dict[str, Any]) -> CreditTransaction:
        return model_from_fields(
            CreditTransaction,
            id=int(data.get('id') or self._new_int_id()),
            user_id=data.get('user_id'),
            feature_key=data.get('feature_key'),
            amount=int(data.get('amount') or 0),
            balance_after=int(data.get('balance_after') or 0),
            transaction_type=data.get('transaction_type') or 'debit',
            source=data.get('source') or 'premium',
            metadata_json=data.get('metadata_json') or '{}',
            idempotency_key=data.get('idempotency_key'),
            created_at=coerce_datetime(data.get('created_at')),
        )

    def _to_topup_order(self, data: dict[str, Any]) -> CreditTopUpOrder:
        return model_from_fields(
            CreditTopUpOrder,
            id=int(data.get('id') or self._new_int_id()),
            user_id=data.get('user_id'),
            provider=data.get('provider') or 'razorpay',
            plan_name=data.get('plan_name') or 'starter',
            pricing_region=data.get('pricing_region') or 'south_asia',
            credits=int(data.get('credits') or 0),
            amount_paise=int(data.get('amount_paise') or 0),
            currency=data.get('currency') or 'INR',
            provider_order_id=data.get('provider_order_id'),
            provider_checkout_id=data.get('provider_checkout_id'),
            provider_payment_id=data.get('provider_payment_id'),
            provider_signature=data.get('provider_signature'),
            status=data.get('status') or 'created',
            metadata_json=data.get('metadata_json') or '{}',
            created_at=coerce_datetime(data.get('created_at')),
            verified_at=coerce_datetime(data.get('verified_at')) if data.get('verified_at') else None,
        )

    def _new_int_id(self) -> int:
        return int(datetime.now(UTC).timestamp() * 1_000_000)
