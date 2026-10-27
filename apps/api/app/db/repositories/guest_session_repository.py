from __future__ import annotations

import math
import re
from dataclasses import asdict, dataclass
from datetime import datetime
from typing import Any

from google.cloud import firestore
from google.cloud.firestore_v1 import FieldFilter

from app.providers.firebase import get_firestore_client
from app.services.guest_session_errors import (
    quota_exceeded,
    quota_transaction_busy,
    reservation_conflict,
    session_expired,
    session_invalid,
    session_revoked,
)


@dataclass(frozen=True)
class GuestQuotaLimits:
    uploads: int
    exports: int
    uploaded_bytes: int
    storage_bytes: int
    processing_seconds: float
    concurrent_processing: int

    def validate(self) -> None:
        _validate_quota_values(asdict(self), allow_zero=False)


@dataclass(frozen=True)
class GuestQuotaReservation:
    uploads: int = 0
    exports: int = 0
    uploaded_bytes: int = 0
    storage_bytes: int = 0
    processing_seconds: float = 0.0
    concurrent_processing: int = 0

    def validate(self) -> None:
        values = asdict(self)
        _validate_quota_values(values, allow_zero=True)
        if not any(values.values()):
            raise ValueError('Quota reservation must reserve at least one resource.')


_INTEGER_QUOTAS = {
    'uploads',
    'exports',
    'uploaded_bytes',
    'storage_bytes',
    'concurrent_processing',
}
_RESERVATION_ID_PATTERN = re.compile(r'^[A-Za-z0-9_-]{1,128}$')


def _validate_quota_values(values: dict[str, int | float], *, allow_zero: bool) -> None:
    for name, value in values.items():
        if isinstance(value, bool):
            raise ValueError(f'{name} must be a finite number.')
        if name in _INTEGER_QUOTAS and not isinstance(value, int):
            raise ValueError(f'{name} must be an integer.')
        if not isinstance(value, (int, float)) or not math.isfinite(float(value)):
            raise ValueError(f'{name} must be a finite number.')
        if value < 0 or (not allow_zero and value == 0):
            comparison = 'non-negative' if allow_zero else 'positive'
            raise ValueError(f'{name} must be {comparison}.')


class GuestSessionRepository:
    collection_name = 'editor_guest_sessions'
    rate_limits_collection_name = 'editor_guest_rate_limits'

    def __init__(self, firestore_client=None) -> None:
        self.firestore = firestore_client or get_firestore_client()
        self.sessions = self.firestore.collection(self.collection_name)
        self.rate_limits = self.firestore.collection(self.rate_limits_collection_name)

    def create(self, *, guest_id: str, token_hash: str, now: datetime, expires_at: datetime) -> dict[str, Any]:
        payload = {
            'guest_id': guest_id,
            'token_hash': token_hash,
            'created_at': now,
            'updated_at': now,
            'expires_at': expires_at,
            'status': 'active',
            'uploads_count': 0,
            'exports_count': 0,
            'uploaded_bytes': 0,
            'storage_bytes': 0,
            'processing_seconds': 0.0,
            'reserved_uploads_count': 0,
            'reserved_exports_count': 0,
            'reserved_uploaded_bytes': 0,
            'reserved_storage_bytes': 0,
            'reserved_processing_seconds': 0.0,
            'active_processing': 0,
            'cleanup_state': 'not_due',
            'cleanup_attempts': 0,
            'cleanup_updated_at': None,
        }
        self.sessions.document(guest_id).create(payload)
        return payload

    def find_by_token_hash(self, token_hash: str) -> dict[str, Any] | None:
        rows = list(
            self.sessions.where(filter=FieldFilter('token_hash', '==', token_hash)).limit(1).stream()
        )
        if not rows:
            return None
        data = rows[0].to_dict() or {}
        data.setdefault('guest_id', rows[0].id)
        return data

    def get(self, guest_id: str) -> dict[str, Any] | None:
        snapshot = self.sessions.document(guest_id).get()
        if not snapshot.exists:
            return None
        data = snapshot.to_dict() or {}
        data.setdefault('guest_id', snapshot.id)
        return data

    def consume_session_creation_rate_limit(
        self,
        *,
        key: str,
        now: datetime,
        window_started_at: datetime,
        expires_at: datetime,
        limit: int,
    ) -> int:
        reference = self.rate_limits.document(key)
        transaction = self.firestore.transaction(max_attempts=10)

        @firestore.transactional
        def _consume(txn):
            snapshot = reference.get(transaction=txn)
            count = int((snapshot.to_dict() or {}).get('count', 0)) if snapshot.exists else 0
            if count >= limit:
                raise quota_exceeded('session creation rate')
            next_count = count + 1
            txn.set(
                reference,
                {
                    'count': next_count,
                    'window_started_at': window_started_at,
                    'updated_at': now,
                    'expires_at': expires_at,
                },
                merge=True,
            )
            return next_count

        try:
            return int(_consume(transaction))
        except ValueError as exc:
            if 'Failed to commit transaction' in str(exc):
                raise quota_transaction_busy() from exc
            raise

    def reserve_quota(
        self,
        *,
        guest_id: str,
        reservation_id: str,
        reservation: GuestQuotaReservation,
        limits: GuestQuotaLimits,
        now: datetime,
        lease_expires_at: datetime,
    ) -> dict[str, Any]:
        reservation.validate()
        limits.validate()
        if not _RESERVATION_ID_PATTERN.fullmatch(reservation_id):
            raise ValueError('Reservation ID must contain only letters, numbers, underscores, or hyphens.')
        if lease_expires_at <= now:
            raise ValueError('Quota reservation lease must expire in the future.')
        session_ref = self.sessions.document(guest_id)
        reservation_ref = session_ref.collection('reservations').document(reservation_id)
        transaction = self.firestore.transaction(max_attempts=10)

        @firestore.transactional
        def _reserve(txn):
            session_snapshot = session_ref.get(transaction=txn)
            reservation_snapshot = reservation_ref.get(transaction=txn)
            session = self._require_active(session_snapshot, now)
            if reservation_snapshot.exists:
                existing = reservation_snapshot.to_dict() or {}
                expected = asdict(reservation)
                if existing.get('status') == 'active' and all(
                    existing.get(key) == value for key, value in expected.items()
                ):
                    return session
                raise reservation_conflict()

            checks = (
                ('uploads', 'uploads_count', 'reserved_uploads_count'),
                ('exports', 'exports_count', 'reserved_exports_count'),
                ('uploaded_bytes', 'uploaded_bytes', 'reserved_uploaded_bytes'),
                ('storage_bytes', 'storage_bytes', 'reserved_storage_bytes'),
                ('processing_seconds', 'processing_seconds', 'reserved_processing_seconds'),
                ('concurrent_processing', None, 'active_processing'),
            )
            updates: dict[str, int | float | datetime] = {'updated_at': now}
            for quota_name, used_field, reserved_field in checks:
                delta = getattr(reservation, quota_name)
                used = float(session.get(used_field, 0)) if used_field else 0.0
                reserved = float(session.get(reserved_field, 0))
                if used + reserved + delta > getattr(limits, quota_name):
                    raise quota_exceeded(quota_name)
                updates[reserved_field] = session.get(reserved_field, 0) + delta

            txn.update(session_ref, updates)
            txn.create(
                reservation_ref,
                {
                    'reservation_id': reservation_id,
                    'status': 'active',
                    'created_at': now,
                    'lease_expires_at': lease_expires_at,
                    **asdict(reservation),
                },
            )
            return {**session, **updates}

        try:
            return _reserve(transaction)
        except ValueError as exc:
            if 'Failed to commit transaction' in str(exc):
                raise quota_transaction_busy() from exc
            raise

    def release_expired_reservations(self, *, guest_id: str, now: datetime) -> int:
        released = 0
        reservations = self.sessions.document(guest_id).collection('reservations')
        for snapshot in reservations.stream():
            data = snapshot.to_dict() or {}
            lease_expires_at = data.get('lease_expires_at')
            if (
                data.get('status') == 'active'
                and isinstance(lease_expires_at, datetime)
                and lease_expires_at <= now
            ):
                self.release_quota(
                    guest_id=guest_id,
                    reservation_id=snapshot.id,
                    now=now,
                    commit=False,
                )
                released += 1
        return released

    def release_quota(
        self,
        *,
        guest_id: str,
        reservation_id: str,
        now: datetime,
        commit: bool = False,
    ) -> dict[str, Any]:
        session_ref = self.sessions.document(guest_id)
        reservation_ref = session_ref.collection('reservations').document(reservation_id)
        transaction = self.firestore.transaction(max_attempts=10)

        @firestore.transactional
        def _release(txn):
            session_snapshot = session_ref.get(transaction=txn)
            reservation_snapshot = reservation_ref.get(transaction=txn)
            session = self._require_active(session_snapshot, now)
            if not reservation_snapshot.exists:
                return session
            reservation_data = reservation_snapshot.to_dict() or {}
            if reservation_data.get('status') != 'active':
                return session

            mappings = (
                ('uploads', 'uploads_count', 'reserved_uploads_count'),
                ('exports', 'exports_count', 'reserved_exports_count'),
                ('uploaded_bytes', 'uploaded_bytes', 'reserved_uploaded_bytes'),
                ('storage_bytes', 'storage_bytes', 'reserved_storage_bytes'),
                ('processing_seconds', 'processing_seconds', 'reserved_processing_seconds'),
                ('concurrent_processing', None, 'active_processing'),
            )
            updates: dict[str, int | float | datetime] = {'updated_at': now}
            for quota_name, used_field, reserved_field in mappings:
                delta = reservation_data.get(quota_name, 0)
                updates[reserved_field] = max(0, session.get(reserved_field, 0) - delta)
                if commit and used_field:
                    updates[used_field] = session.get(used_field, 0) + delta

            txn.update(session_ref, updates)
            txn.update(
                reservation_ref,
                {
                    'status': 'committed' if commit else 'released',
                    'released_at': now,
                },
            )
            return {**session, **updates}

        try:
            return _release(transaction)
        except ValueError as exc:
            if 'Failed to commit transaction' in str(exc):
                raise quota_transaction_busy() from exc
            raise

    @staticmethod
    def _require_active(snapshot, now: datetime) -> dict[str, Any]:
        if not snapshot.exists:
            raise session_invalid()
        data = snapshot.to_dict() or {}
        expires_at = data.get('expires_at')
        if not isinstance(expires_at, datetime) or expires_at <= now:
            raise session_expired()
        if data.get('status') != 'active':
            raise session_revoked()
        return data
