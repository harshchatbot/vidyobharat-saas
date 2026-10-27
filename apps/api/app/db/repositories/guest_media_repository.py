from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from google.cloud import firestore

from app.db.repositories.guest_session_repository import GuestQuotaReservation
from app.services.guest_session_errors import (
    media_error,
    quota_transaction_busy,
    session_expired,
    session_invalid,
    session_revoked,
)


class GuestMediaRepository:
    def __init__(self, firestore_client) -> None:
        self.firestore = firestore_client
        self.sessions = firestore_client.collection('editor_guest_sessions')

    def list_for_guest(self, guest_id: str) -> list[dict[str, Any]]:
        rows = []
        for snapshot in self.sessions.document(guest_id).collection('media').stream():
            data = snapshot.to_dict() or {}
            data.setdefault('media_id', snapshot.id)
            rows.append(data)
        return sorted(rows, key=lambda row: row.get('created_at') or datetime.min, reverse=True)

    def get_for_guest(self, guest_id: str, media_id: str) -> dict[str, Any] | None:
        snapshot = self.sessions.document(guest_id).collection('media').document(media_id).get()
        if not snapshot.exists:
            return None
        data = snapshot.to_dict() or {}
        data.setdefault('media_id', snapshot.id)
        return data

    def get_reservation(self, *, guest_id: str, reservation_id: str) -> dict[str, Any] | None:
        snapshot = (
            self.sessions.document(guest_id)
            .collection('reservations')
            .document(reservation_id)
            .get()
        )
        return snapshot.to_dict() if snapshot.exists else None

    def claim_upload(
        self,
        *,
        guest_id: str,
        media_id: str,
        reservation_id: str,
        content_sha256: str,
        storage_object_path: str,
        expires_at: datetime,
        now: datetime,
    ) -> bool:
        reference = self.sessions.document(guest_id).collection('media').document(media_id)
        new_reservation_ref = (
            self.sessions.document(guest_id)
            .collection('reservations')
            .document(reservation_id)
        )
        transaction = self.firestore.transaction(max_attempts=10)

        @firestore.transactional
        def _claim(txn):
            snapshot = reference.get(transaction=txn)
            new_reservation_snapshot = new_reservation_ref.get(transaction=txn)
            new_reservation = new_reservation_snapshot.to_dict() or {}
            if not new_reservation_snapshot.exists or new_reservation.get('status') != 'active':
                raise media_error(
                    'guest_upload_reservation_missing',
                    'The upload quota reservation is no longer active.',
                    status_code=409,
                    recoverable=True,
                )
            existing = snapshot.to_dict() or {}
            if snapshot.exists:
                if existing.get('content_sha256') != content_sha256:
                    raise media_error(
                        'guest_idempotency_conflict',
                        'This Idempotency-Key was already used for different media content.',
                        status_code=409,
                    )
                if existing.get('status') != 'uploading':
                    return False
                old_reservation_id = existing.get('reservation_id')
                if not isinstance(old_reservation_id, str):
                    return False
                old_reservation_ref = (
                    self.sessions.document(guest_id)
                    .collection('reservations')
                    .document(old_reservation_id)
                )
                old_reservation_snapshot = old_reservation_ref.get(transaction=txn)
                old_reservation = old_reservation_snapshot.to_dict() or {}
                lease_expires_at = old_reservation.get('lease_expires_at')
                if (
                    old_reservation_snapshot.exists
                    and old_reservation.get('status') == 'active'
                    and isinstance(lease_expires_at, datetime)
                    and lease_expires_at > now
                ):
                    return False

            payload = {
                'media_id': media_id,
                'guest_id': guest_id,
                'reservation_id': reservation_id,
                'content_sha256': content_sha256,
                'storage_object_path': storage_object_path,
                'status': 'uploading',
                'created_at': now,
                'expires_at': expires_at,
            }
            txn.update(new_reservation_ref, {'kind': 'media_upload'})
            txn.set(reference, payload)
            return True

        return bool(_claim(transaction))

    def delete_upload_claim(self, *, guest_id: str, media_id: str, reservation_id: str) -> None:
        reference = self.sessions.document(guest_id).collection('media').document(media_id)
        transaction = self.firestore.transaction(max_attempts=10)

        @firestore.transactional
        def _delete(txn):
            snapshot = reference.get(transaction=txn)
            data = snapshot.to_dict() or {}
            if snapshot.exists and data.get('status') == 'uploading' and data.get('reservation_id') == reservation_id:
                txn.delete(reference)

        _delete(transaction)

    def mark_cleanup_pending(
        self,
        *,
        guest_id: str,
        media_id: str,
        reservation_id: str,
        storage_object_path: str,
        orphaned_storage_bytes: int,
        now: datetime,
    ) -> None:
        reference = self.sessions.document(guest_id).collection('media').document(media_id)
        session_ref = self.sessions.document(guest_id)
        reservation_ref = session_ref.collection('reservations').document(reservation_id)
        transaction = self.firestore.transaction(max_attempts=10)

        @firestore.transactional
        def _mark(txn):
            session_snapshot = session_ref.get(transaction=txn)
            reservation_snapshot = reservation_ref.get(transaction=txn)
            media_snapshot = reference.get(transaction=txn)
            session = session_snapshot.to_dict() or {}
            reservation = reservation_snapshot.to_dict() or {}
            media = media_snapshot.to_dict() or {}
            if (
                not session_snapshot.exists
                or not reservation_snapshot.exists
                or reservation.get('status') != 'active'
                or not media_snapshot.exists
                or media.get('status') != 'uploading'
                or media.get('reservation_id') != reservation_id
            ):
                return
            reserved_storage = int(reservation.get('storage_bytes', 0))
            if orphaned_storage_bytes < 0 or orphaned_storage_bytes > reserved_storage:
                raise ValueError('Orphaned storage bytes exceed the upload reservation.')
            mappings = (
                ('uploads', 'reserved_uploads_count'),
                ('exports', 'reserved_exports_count'),
                ('uploaded_bytes', 'reserved_uploaded_bytes'),
                ('storage_bytes', 'reserved_storage_bytes'),
                ('processing_seconds', 'reserved_processing_seconds'),
                ('concurrent_processing', 'active_processing'),
            )
            session_updates: dict[str, Any] = {
                'updated_at': now,
                'storage_bytes': int(session.get('storage_bytes', 0)) + orphaned_storage_bytes,
            }
            for quota_name, reserved_field in mappings:
                session_updates[reserved_field] = max(
                    0,
                    session.get(reserved_field, 0) - reservation.get(quota_name, 0),
                )
            txn.update(session_ref, session_updates)
            txn.update(reservation_ref, {'status': 'cleanup_pending', 'released_at': now})
            txn.update(
                reference,
                {
                    'status': 'cleanup_pending',
                    'storage_object_path': storage_object_path,
                    'orphaned_storage_bytes': orphaned_storage_bytes,
                    'cleanup_updated_at': now,
                },
            )

        _mark(transaction)

    def delete_cleanup_pending(self, *, guest_id: str, media_id: str) -> None:
        reference = self.sessions.document(guest_id).collection('media').document(media_id)
        session_ref = self.sessions.document(guest_id)
        transaction = self.firestore.transaction(max_attempts=10)

        @firestore.transactional
        def _delete(txn):
            session_snapshot = session_ref.get(transaction=txn)
            snapshot = reference.get(transaction=txn)
            data = snapshot.to_dict() or {}
            session = session_snapshot.to_dict() or {}
            if session_snapshot.exists and snapshot.exists and data.get('status') == 'cleanup_pending':
                orphaned_bytes = int(data.get('orphaned_storage_bytes', 0))
                txn.update(
                    session_ref,
                    {
                        'storage_bytes': max(0, int(session.get('storage_bytes', 0)) - orphaned_bytes),
                        'updated_at': datetime.now(UTC),
                    },
                )
                txn.delete(reference)

        _delete(transaction)

    def commit_upload(
        self,
        *,
        guest_id: str,
        reservation_id: str,
        actual: GuestQuotaReservation,
        media: dict[str, Any],
        now: datetime,
    ) -> dict[str, Any]:
        actual.validate()
        session_ref = self.sessions.document(guest_id)
        reservation_ref = session_ref.collection('reservations').document(reservation_id)
        media_ref = session_ref.collection('media').document(media['media_id'])
        transaction = self.firestore.transaction(max_attempts=10)

        @firestore.transactional
        def _commit(txn):
            session_snapshot = session_ref.get(transaction=txn)
            reservation_snapshot = reservation_ref.get(transaction=txn)
            media_snapshot = media_ref.get(transaction=txn)
            session = self._require_active(session_snapshot, now)
            existing_media = media_snapshot.to_dict() or {}
            if (
                not media_snapshot.exists
                or existing_media.get('status') != 'uploading'
                or existing_media.get('reservation_id') != reservation_id
            ):
                raise media_error(
                    'guest_media_conflict',
                    'This media upload is no longer owned by the current request.',
                    status_code=409,
                )
            if not reservation_snapshot.exists:
                raise media_error(
                    'guest_upload_reservation_missing',
                    'The upload quota reservation no longer exists.',
                    status_code=409,
                    recoverable=True,
                )
            reserved = reservation_snapshot.to_dict() or {}
            if reserved.get('status') != 'active':
                raise media_error(
                    'guest_upload_reservation_expired',
                    'The upload quota reservation is no longer active.',
                    status_code=409,
                    recoverable=True,
                )

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
                reserved_delta = reserved.get(quota_name, 0)
                actual_delta = getattr(actual, quota_name)
                if actual_delta > reserved_delta:
                    raise media_error(
                        'guest_upload_reservation_exceeded',
                        'The upload exceeded its reserved quota.',
                        status_code=409,
                    )
                updates[reserved_field] = max(0, session.get(reserved_field, 0) - reserved_delta)
                if used_field:
                    updates[used_field] = session.get(used_field, 0) + actual_delta

            txn.update(session_ref, updates)
            txn.update(reservation_ref, {'status': 'committed', 'released_at': now})
            txn.set(media_ref, media)
            return media

        try:
            return _commit(transaction)
        except ValueError as exc:
            if 'Failed to commit transaction' in str(exc):
                raise quota_transaction_busy() from exc
            raise

    def delete(self, *, guest_id: str, media_id: str) -> None:
        self.sessions.document(guest_id).collection('media').document(media_id).delete()

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
