from __future__ import annotations

from collections.abc import Iterable

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.models.entities import CreditTopUpOrder, CreditTransaction, CreditWallet


class CreditRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_wallet(self, user_id: str) -> CreditWallet | None:
        return self.db.get(CreditWallet, user_id)

    def list_history(self, user_id: str, limit: int = 100) -> list[CreditTransaction]:
        stmt = (
            select(CreditTransaction)
            .where(CreditTransaction.user_id == user_id)
            .order_by(desc(CreditTransaction.created_at), desc(CreditTransaction.id))
            .limit(limit)
        )
        return list(self.db.scalars(stmt).all())

    def get_transaction_by_idempotency_key(self, idempotency_key: str) -> CreditTransaction | None:
        stmt = select(CreditTransaction).where(CreditTransaction.idempotency_key == idempotency_key)
        return self.db.scalar(stmt)

    def create_wallet(
        self,
        *,
        user_id: str,
        current_credits: int,
        plan_type: str,
        monthly_credits: int,
    ) -> CreditWallet:
        wallet = CreditWallet(
            user_id=user_id,
            current_credits=current_credits,
            plan_type=plan_type,
            monthly_credits=monthly_credits,
        )
        self.db.add(wallet)
        self.db.flush()
        return wallet

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
        transaction = CreditTransaction(
            user_id=user_id,
            feature_key=feature_key,
            amount=amount,
            balance_after=balance_after,
            transaction_type=transaction_type,
            source=source,
            metadata_json=metadata_json,
            idempotency_key=idempotency_key,
        )
        self.db.add(transaction)
        self.db.flush()
        return transaction

    def create_topup_order(
        self,
        *,
        user_id: str,
        credits: int,
        amount_paise: int,
        currency: str,
        provider_order_id: str,
        metadata_json: str,
        provider: str = 'razorpay',
    ) -> CreditTopUpOrder:
        order = CreditTopUpOrder(
            user_id=user_id,
            provider=provider,
            credits=credits,
            amount_paise=amount_paise,
            currency=currency,
            provider_order_id=provider_order_id,
            metadata_json=metadata_json,
        )
        self.db.add(order)
        self.db.flush()
        return order

    def get_topup_order_by_provider_order_id(self, provider_order_id: str) -> CreditTopUpOrder | None:
        stmt = select(CreditTopUpOrder).where(CreditTopUpOrder.provider_order_id == provider_order_id)
        return self.db.scalar(stmt)

    def save_all(self, items: Iterable[object]) -> None:
        for item in items:
            self.db.add(item)
