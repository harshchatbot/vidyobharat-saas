from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timedelta
from typing import Any

from google.cloud import firestore

from app.db.repositories.guest_session_repository import GuestQuotaLimits, GuestQuotaReservation
from app.services.guest_session_errors import quota_exceeded, reservation_conflict


_ROLLING_FIELDS = ('uploads', 'exports', 'uploaded_bytes', 'processing_seconds')


class GuestNetworkQuotaRepository:
    collection_name = 'editor_guest_network_usage'

    def __init__(self, firestore_client) -> None:
        self.firestore = firestore_client
        self.collection = firestore_client.collection(self.collection_name)

    def reserve(
        self,
        *,
        subject: str,
        guest_id: str,
        reservation_id: str,
        reservation: GuestQuotaReservation,
        limits: GuestQuotaLimits,
        now: datetime,
    ) -> None:
        ref = self.collection.document(subject)
        transaction = self.firestore.transaction(max_attempts=10)

        @firestore.transactional
        def _reserve(txn):
            snapshot = ref.get(transaction=txn)
            data = snapshot.to_dict() or {}
            entries = self._active_entries(data, now)
            existing = entries.get(reservation_id)
            requested = self._values(reservation)
            if existing:
                if existing.get('guest_id') == guest_id and all(existing.get(key, 0) == value for key, value in requested.items()):
                    return
                raise reservation_conflict()
            totals = self._totals(entries)
            for field in _ROLLING_FIELDS:
                if totals[field] + requested[field] > getattr(limits, field):
                    raise quota_exceeded(f'network_{field}')
            entries[reservation_id] = {
                'guest_id': guest_id,
                'reservation_id': reservation_id,
                'status': 'active',
                'created_at': now,
                'expires_at': now + timedelta(hours=24),
                **requested,
            }
            txn.set(ref, {'entries': entries, 'updated_at': now}, merge=True)

        _reserve(transaction)

    def increase(
        self,
        *,
        subject: str,
        reservation_id: str,
        additional: GuestQuotaReservation,
        limits: GuestQuotaLimits,
        now: datetime,
    ) -> None:
        ref = self.collection.document(subject)
        transaction = self.firestore.transaction(max_attempts=10)

        @firestore.transactional
        def _increase(txn):
            snapshot = ref.get(transaction=txn)
            data = snapshot.to_dict() or {}
            entries = self._active_entries(data, now)
            entry = entries.get(reservation_id)
            if not entry or entry.get('status') != 'active':
                raise reservation_conflict()
            requested = self._values(additional)
            totals = self._totals(entries)
            for field in _ROLLING_FIELDS:
                if totals[field] + requested[field] > getattr(limits, field):
                    raise quota_exceeded(f'network_{field}')
                entry[field] = entry.get(field, 0) + requested[field]
            entries[reservation_id] = entry
            txn.set(ref, {'entries': entries, 'updated_at': now}, merge=True)

        _increase(transaction)

    def finish(self, *, subject: str, reservation_id: str, commit: bool, now: datetime) -> None:
        ref = self.collection.document(subject)
        transaction = self.firestore.transaction(max_attempts=10)

        @firestore.transactional
        def _finish(txn):
            snapshot = ref.get(transaction=txn)
            data = snapshot.to_dict() or {}
            entries = self._active_entries(data, now)
            entry = entries.get(reservation_id)
            if not entry:
                return
            if commit:
                entry['status'] = 'committed'
                entry['committed_at'] = now
                entries[reservation_id] = entry
            else:
                entries.pop(reservation_id, None)
            txn.set(ref, {'entries': entries, 'updated_at': now}, merge=True)

        _finish(transaction)

    def usage(self, *, subject: str, now: datetime) -> dict[str, int | float]:
        snapshot = self.collection.document(subject).get()
        return self._totals(self._active_entries(snapshot.to_dict() or {}, now))

    @staticmethod
    def _values(reservation: GuestQuotaReservation) -> dict[str, int | float]:
        values = asdict(reservation)
        return {field: values[field] for field in _ROLLING_FIELDS}

    @staticmethod
    def _active_entries(data: dict[str, Any], now: datetime) -> dict[str, dict[str, Any]]:
        raw = data.get('entries') or {}
        if not isinstance(raw, dict):
            return {}
        return {
            key: value
            for key, value in raw.items()
            if isinstance(value, dict)
            and isinstance(value.get('expires_at'), datetime)
            and value['expires_at'] > now
            and value.get('status') in {'active', 'committed'}
        }

    @staticmethod
    def _totals(entries: dict[str, dict[str, Any]]) -> dict[str, int | float]:
        return {
            field: sum(entry.get(field, 0) for entry in entries.values())
            for field in _ROLLING_FIELDS
        }
