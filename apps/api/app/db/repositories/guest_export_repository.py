from __future__ import annotations

from dataclasses import asdict
from datetime import UTC, datetime, timedelta
from typing import Any

from google.cloud import firestore

from app.db.repositories.guest_session_repository import GuestQuotaLimits, GuestQuotaReservation
from app.services.guest_session_errors import quota_exceeded, session_expired, session_invalid, session_revoked


class ExportConflictError(RuntimeError):
    pass


class ExportMediaUnavailableError(RuntimeError):
    pass


class ExportFenceError(RuntimeError):
    pass


class GuestExportRepository:
    def __init__(self, firestore_client) -> None:
        self.firestore = firestore_client
        self.sessions = firestore_client.collection('editor_guest_sessions')

    def create_or_get(
        self,
        *,
        guest_id: str,
        job_id: str,
        timeline: dict[str, Any],
        timeline_digest: str,
        media_ids: list[str],
        reservation: GuestQuotaReservation,
        limits: GuestQuotaLimits,
        now: datetime,
        expires_at: datetime,
    ) -> tuple[dict[str, Any], bool]:
        session_ref = self.sessions.document(guest_id)
        job_ref = session_ref.collection('exports').document(job_id)
        reservation_id = f'export-{job_id}'
        reservation_ref = session_ref.collection('reservations').document(reservation_id)
        transaction = self.firestore.transaction(max_attempts=10)

        @firestore.transactional
        def _create(txn):
            session_snapshot = session_ref.get(transaction=txn)
            job_snapshot = job_ref.get(transaction=txn)
            media_snapshots = [
                session_ref.collection('media').document(media_id).get(transaction=txn)
                for media_id in media_ids
            ]
            session = self._require_active(session_snapshot, now)
            if job_snapshot.exists:
                existing = job_snapshot.to_dict() or {}
                if existing.get('timeline_digest') != timeline_digest:
                    raise ExportConflictError('Idempotency-Key was already used for a different timeline.')
                return existing, False

            for media_id, media_snapshot in zip(media_ids, media_snapshots, strict=True):
                media = media_snapshot.to_dict() or {}
                expected_path = f'guest-editor/{guest_id}/sources/{media_id}/original'
                if (
                    not media_snapshot.exists
                    or media.get('guest_id') != guest_id
                    or media.get('status') != 'active'
                    or media.get('storage_object_path') != expected_path
                ):
                    raise ExportMediaUnavailableError('A timeline source is unavailable or being deleted.')

            checks = (
                ('exports', 'exports_count', 'reserved_exports_count'),
                ('processing_seconds', 'processing_seconds', 'reserved_processing_seconds'),
            )
            updates: dict[str, Any] = {'updated_at': now}
            for quota_name, used_field, reserved_field in checks:
                delta = getattr(reservation, quota_name)
                used = float(session.get(used_field, 0)) if used_field else 0.0
                reserved = float(session.get(reserved_field, 0))
                if used + reserved + delta > getattr(limits, quota_name):
                    raise quota_exceeded(quota_name)
                updates[reserved_field] = session.get(reserved_field, 0) + delta

            payload = {
                'job_id': job_id,
                'guest_id': guest_id,
                'timeline': timeline,
                'timeline_digest': timeline_digest,
                'media_ids': media_ids,
                'created_at': now,
                'updated_at': now,
                'expires_at': expires_at,
                'status': 'queued',
                'attempt_count': 0,
                'worker_id': None,
                'fence_token': None,
                'lease_expires_at': None,
                'retry_at': now,
                'progress_stage': 'queued',
                'output': None,
                'storage_object_path': None,
                'reservation_id': reservation_id,
                'error_code': None,
                'cleanup_object_path': None,
                'cleanup_object_generation': None,
            }
            txn.update(session_ref, updates)
            txn.create(
                reservation_ref,
                {
                    'reservation_id': reservation_id,
                    'kind': 'export_job',
                    'status': 'active',
                    'created_at': now,
                    'lease_expires_at': expires_at,
                    **asdict(reservation),
                    # A queued export reserves durable usage, but it is not
                    # actively consuming render capacity until a worker claims it.
                    'concurrent_processing': 0,
                    'requested_concurrent_processing': reservation.concurrent_processing,
                },
            )
            txn.create(job_ref, payload)
            return payload, True

        return _create(transaction)

    def get(self, guest_id: str, job_id: str) -> dict[str, Any] | None:
        snapshot = self.sessions.document(guest_id).collection('exports').document(job_id).get()
        if not snapshot.exists:
            return None
        data = snapshot.to_dict() or {}
        data.setdefault('job_id', snapshot.id)
        return data

    def list_for_guest(self, guest_id: str, *, limit: int) -> list[dict[str, Any]]:
        rows = []
        for snapshot in self.sessions.document(guest_id).collection('exports').stream():
            data = snapshot.to_dict() or {}
            data.setdefault('job_id', snapshot.id)
            rows.append(data)
        rows.sort(key=lambda item: item.get('created_at') or datetime.min.replace(tzinfo=UTC), reverse=True)
        return rows[:limit]

    def claim_next(
        self,
        *,
        worker_id: str,
        fence_token: str,
        now: datetime,
        lease_duration: timedelta,
        concurrent_processing_limit: int,
        max_attempts: int = 3,
    ) -> dict[str, Any] | None:
        candidates: list[tuple[str, str]] = []
        for session in self.sessions.stream():
            session_data = session.to_dict() or {}
            for job in session.reference.collection('exports').stream():
                data = job.to_dict() or {}
                lease = data.get('lease_expires_at')
                exhausted = int(data.get('attempt_count', 0)) >= max_attempts
                abandoned_running = (
                    data.get('status') == 'running'
                    and isinstance(lease, datetime)
                    and lease <= now
                )
                if (
                    (data.get('status') == 'queued' or abandoned_running)
                    and (
                        not isinstance(session_data.get('expires_at'), datetime)
                        or session_data.get('expires_at') <= now
                        or not isinstance(data.get('expires_at'), datetime)
                        or data.get('expires_at') <= now
                        or session_data.get('status') != 'active'
                    )
                ):
                    self._expire_inactive(session.id, job.id, now)
                    continue
                if exhausted and (data.get('status') == 'queued' or abandoned_running):
                    self._fail_exhausted(session.id, job.id, now)
                    continue
                retry_at = data.get('retry_at')
                recoverable = data.get('status') == 'queued' or (
                    data.get('status') == 'running'
                    and isinstance(lease, datetime)
                    and lease <= now
                )
                if recoverable and (not isinstance(retry_at, datetime) or retry_at <= now):
                    candidates.append((session.id, job.id))
        candidates.sort()
        for guest_id, job_id in candidates:
            claimed = self._claim(
                guest_id=guest_id,
                job_id=job_id,
                worker_id=worker_id,
                fence_token=fence_token,
                now=now,
                lease_duration=lease_duration,
                concurrent_processing_limit=concurrent_processing_limit,
            )
            if claimed:
                return claimed
        return None

    def _fail_exhausted(self, guest_id: str, job_id: str, now: datetime) -> None:
        session_ref = self.sessions.document(guest_id)
        job_ref = session_ref.collection('exports').document(job_id)
        transaction = self.firestore.transaction(max_attempts=10)

        @firestore.transactional
        def _finish(txn):
            session_snapshot = session_ref.get(transaction=txn)
            job_snapshot = job_ref.get(transaction=txn)
            if not session_snapshot.exists or not job_snapshot.exists:
                return
            session = session_snapshot.to_dict() or {}
            job = job_snapshot.to_dict() or {}
            lease = job.get('lease_expires_at')
            abandoned_running = (
                job.get('status') == 'running'
                and isinstance(lease, datetime)
                and lease <= now
            )
            if job.get('status') != 'queued' and not abandoned_running:
                return
            reservation_ref = session_ref.collection('reservations').document(job['reservation_id'])
            reservation_snapshot = reservation_ref.get(transaction=txn)
            reservation = reservation_snapshot.to_dict() or {}
            if reservation.get('status') == 'active':
                txn.update(session_ref, self._quota_release_updates(session, reservation, commit=False))
                txn.update(reservation_ref, {'status': 'released', 'released_at': now})
            txn.update(
                job_ref,
                {
                    'status': 'failed',
                    'progress_stage': 'failed',
                    'updated_at': now,
                    'lease_expires_at': None,
                    'worker_id': None,
                    'fence_token': None,
                    'terminal_reason': 'attempts_exhausted',
                    'error_code': job.get('error_code') or 'export_attempts_exhausted',
                },
            )

        _finish(transaction)

    def claim_cleanup(self, *, worker_id: str, fence_token: str, now: datetime, lease_duration: timedelta) -> dict[str, Any] | None:
        for session in self.sessions.stream():
            for snapshot in session.reference.collection('exports').stream():
                data = snapshot.to_dict() or {}
                lease = data.get('lease_expires_at')
                if data.get('status') == 'cleanup_pending' or (
                    data.get('status') == 'cleanup_running'
                    and isinstance(lease, datetime)
                    and lease <= now
                ):
                    ref = snapshot.reference
                    transaction = self.firestore.transaction(max_attempts=10)

                    @firestore.transactional
                    def _claim(txn):
                        current_snapshot = ref.get(transaction=txn)
                        current = current_snapshot.to_dict() or {}
                        current_lease = current.get('lease_expires_at')
                        if current.get('status') == 'cleanup_running' and (
                            not isinstance(current_lease, datetime) or current_lease > now
                        ):
                            return None
                        if current.get('status') not in {'cleanup_pending', 'cleanup_running'}:
                            return None
                        updates = {
                            'status': 'cleanup_running', 'worker_id': worker_id,
                            'fence_token': fence_token, 'lease_expires_at': now + lease_duration,
                            'updated_at': now, 'progress_stage': 'cleanup',
                        }
                        txn.update(ref, updates)
                        return {**current, **updates}

                    claimed = _claim(transaction)
                    if claimed:
                        return claimed
        return None

    def finish_cleanup(self, *, guest_id: str, job_id: str, worker_id: str, fence_token: str, now: datetime, succeeded: bool) -> None:
        session_ref = self.sessions.document(guest_id)
        ref = session_ref.collection('exports').document(job_id)
        transaction = self.firestore.transaction(max_attempts=10)

        @firestore.transactional
        def _finish(txn):
            session_snapshot = session_ref.get(transaction=txn)
            snapshot = ref.get(transaction=txn)
            job = snapshot.to_dict() or {}
            if (
                not snapshot.exists or job.get('status') != 'cleanup_running'
                or job.get('worker_id') != worker_id or job.get('fence_token') != fence_token
            ):
                raise ExportFenceError('Export cleanup lease is stale.')
            reservation_ref = session_ref.collection('reservations').document(job['reservation_id'])
            reservation_snapshot = reservation_ref.get(transaction=txn)
            reservation = reservation_snapshot.to_dict() or {}
            if succeeded and session_snapshot.exists and reservation.get('status') == 'cleanup_pending':
                session = session_snapshot.to_dict() or {}
                storage_bytes = int(reservation.get('storage_bytes', 0))
                txn.update(session_ref, {
                    'reserved_storage_bytes': max(0, int(session.get('reserved_storage_bytes', 0)) - storage_bytes),
                    'updated_at': now,
                })
                txn.update(reservation_ref, {'status': 'released', 'released_at': now})
            status = 'failed' if succeeded else 'cleanup_pending'
            txn.update(ref, {
                'status': status, 'progress_stage': status, 'updated_at': now,
                'worker_id': None, 'fence_token': None, 'lease_expires_at': None,
                'cleanup_object_path': None if succeeded else job.get('cleanup_object_path'),
                'cleanup_object_generation': None if succeeded else job.get('cleanup_object_generation'),
            })

        _finish(transaction)

    def _expire_inactive(self, guest_id: str, job_id: str, now: datetime) -> None:
        session_ref = self.sessions.document(guest_id)
        job_ref = session_ref.collection('exports').document(job_id)
        transaction = self.firestore.transaction(max_attempts=10)

        @firestore.transactional
        def _expire(txn):
            session_snapshot = session_ref.get(transaction=txn)
            job_snapshot = job_ref.get(transaction=txn)
            if not session_snapshot.exists or not job_snapshot.exists:
                return
            session = session_snapshot.to_dict() or {}
            job = job_snapshot.to_dict() or {}
            lease = job.get('lease_expires_at')
            abandoned_running = (
                job.get('status') == 'running'
                and isinstance(lease, datetime)
                and lease <= now
            )
            if job.get('status') != 'queued' and not abandoned_running:
                return
            reservation_ref = session_ref.collection('reservations').document(job['reservation_id'])
            reservation_snapshot = reservation_ref.get(transaction=txn)
            reservation = reservation_snapshot.to_dict() or {}
            if reservation.get('status') == 'active':
                txn.update(session_ref, self._quota_release_updates(session, reservation, commit=False))
                txn.update(reservation_ref, {'status': 'released', 'released_at': now})
            txn.update(job_ref, {
                'status': 'expired', 'progress_stage': 'expired', 'updated_at': now,
                'error_code': 'guest_session_expired', 'lease_expires_at': None,
            })

        _expire(transaction)

    def _claim(self, *, guest_id: str, job_id: str, worker_id: str, fence_token: str, now: datetime, lease_duration: timedelta, concurrent_processing_limit: int) -> dict[str, Any] | None:
        session_ref = self.sessions.document(guest_id)
        job_ref = session_ref.collection('exports').document(job_id)
        transaction = self.firestore.transaction(max_attempts=10)

        @firestore.transactional
        def _claim_txn(txn):
            session_snapshot = session_ref.get(transaction=txn)
            job_snapshot = job_ref.get(transaction=txn)
            if not session_snapshot.exists or not job_snapshot.exists:
                return None
            session = session_snapshot.to_dict() or {}
            job = job_snapshot.to_dict() or {}
            if session.get('status') != 'active' or session.get('expires_at') <= now or job.get('expires_at') <= now:
                return None
            lease = job.get('lease_expires_at')
            if job.get('status') == 'running' and (not isinstance(lease, datetime) or lease > now):
                return None
            if job.get('status') not in {'queued', 'running'}:
                return None
            reservation_ref = session_ref.collection('reservations').document(job['reservation_id'])
            reservation_snapshot = reservation_ref.get(transaction=txn)
            reservation = reservation_snapshot.to_dict() or {}
            if reservation.get('status') != 'active':
                return None
            held_slots = int(reservation.get('concurrent_processing', 0))
            requested_slots = int(reservation.get('requested_concurrent_processing', 1))
            if requested_slots <= 0:
                requested_slots = 1
            if held_slots == 0:
                active_processing = int(session.get('active_processing', 0))
                if active_processing + requested_slots > concurrent_processing_limit:
                    return None
                txn.update(session_ref, {
                    'active_processing': active_processing + requested_slots,
                    'updated_at': now,
                })
                txn.update(reservation_ref, {'concurrent_processing': requested_slots})
            updates = {
                'status': 'running',
                'worker_id': worker_id,
                'fence_token': fence_token,
                'attempt_count': int(job.get('attempt_count', 0)) + 1,
                'lease_expires_at': min(job['expires_at'], now + lease_duration),
                'updated_at': now,
                'progress_stage': 'resolving_sources',
            }
            txn.update(job_ref, updates)
            return {**job, **updates}

        return _claim_txn(transaction)

    def renew(self, *, guest_id: str, job_id: str, worker_id: str, fence_token: str, now: datetime, lease_duration: timedelta, stage: str) -> None:
        ref = self.sessions.document(guest_id).collection('exports').document(job_id)
        transaction = self.firestore.transaction(max_attempts=10)

        @firestore.transactional
        def _renew(txn):
            snapshot = ref.get(transaction=txn)
            job = snapshot.to_dict() or {}
            self._require_fence(snapshot.exists, job, worker_id, fence_token)
            if job.get('expires_at') <= now:
                raise session_expired()
            txn.update(ref, {
                'lease_expires_at': min(job['expires_at'], now + lease_duration),
                'updated_at': now,
                'progress_stage': stage,
            })

        _renew(transaction)

    def reserve_storage(self, *, guest_id: str, job_id: str, worker_id: str, fence_token: str, output_bytes: int, limits: GuestQuotaLimits, now: datetime) -> None:
        session_ref = self.sessions.document(guest_id)
        job_ref = session_ref.collection('exports').document(job_id)
        transaction = self.firestore.transaction(max_attempts=10)

        @firestore.transactional
        def _reserve(txn):
            session_snapshot = session_ref.get(transaction=txn)
            job_snapshot = job_ref.get(transaction=txn)
            session = self._require_active(session_snapshot, now)
            job = job_snapshot.to_dict() or {}
            self._require_fence(job_snapshot.exists, job, worker_id, fence_token)
            reservation_ref = session_ref.collection('reservations').document(job['reservation_id'])
            reservation_snapshot = reservation_ref.get(transaction=txn)
            reservation = reservation_snapshot.to_dict() or {}
            if reservation.get('status') != 'active':
                raise ExportFenceError('Export reservation is not active.')
            previous = int(reservation.get('storage_bytes', 0))
            delta = output_bytes - previous
            if delta < 0:
                delta = 0
            if int(session.get('storage_bytes', 0)) + int(session.get('reserved_storage_bytes', 0)) + delta > limits.storage_bytes:
                raise quota_exceeded('storage_bytes')
            txn.update(session_ref, {
                'reserved_storage_bytes': int(session.get('reserved_storage_bytes', 0)) + delta,
                'updated_at': now,
            })
            txn.update(reservation_ref, {'storage_bytes': previous + delta})
            txn.update(job_ref, {'progress_stage': 'uploading', 'updated_at': now})

        _reserve(transaction)

    def complete(self, *, guest_id: str, job_id: str, worker_id: str, fence_token: str, output: dict[str, Any], object_path: str, actual_processing_seconds: float, now: datetime) -> dict[str, Any]:
        session_ref = self.sessions.document(guest_id)
        job_ref = session_ref.collection('exports').document(job_id)
        transaction = self.firestore.transaction(max_attempts=10)

        @firestore.transactional
        def _complete(txn):
            session_snapshot = session_ref.get(transaction=txn)
            job_snapshot = job_ref.get(transaction=txn)
            if not session_snapshot.exists or not job_snapshot.exists:
                raise ExportFenceError('Export job no longer exists.')
            session = session_snapshot.to_dict() or {}
            job = job_snapshot.to_dict() or {}
            self._require_fence(True, job, worker_id, fence_token)
            if session.get('status') != 'active' or session.get('expires_at') <= now or job.get('expires_at') <= now:
                raise session_expired()
            reservation_ref = session_ref.collection('reservations').document(job['reservation_id'])
            reservation_snapshot = reservation_ref.get(transaction=txn)
            reservation = reservation_snapshot.to_dict() or {}
            if reservation.get('status') != 'active' or actual_processing_seconds > float(reservation.get('processing_seconds', 0)) + 1e-6:
                raise ExportFenceError('Export reservation cannot be committed.')
            updates = self._quota_release_updates(session, reservation, commit=True)
            updates['processing_seconds'] = float(session.get('processing_seconds', 0)) + actual_processing_seconds
            txn.update(session_ref, updates)
            txn.update(reservation_ref, {'status': 'committed', 'released_at': now})
            job_updates = {
                'status': 'completed',
                'updated_at': now,
                'progress_stage': 'completed',
                'output': output,
                'storage_object_path': object_path,
                'lease_expires_at': None,
                'worker_id': None,
                'fence_token': None,
                'error_code': None,
            }
            txn.update(job_ref, job_updates)
            return {**job, **job_updates}

        return _complete(transaction)

    def fail_or_retry(self, *, guest_id: str, job_id: str, worker_id: str, fence_token: str, error_code: str, transient: bool, max_attempts: int, retry_delay: timedelta, now: datetime, cleanup_object_path: str | None = None, cleanup_object_generation: str | None = None) -> str:
        session_ref = self.sessions.document(guest_id)
        job_ref = session_ref.collection('exports').document(job_id)
        transaction = self.firestore.transaction(max_attempts=10)

        @firestore.transactional
        def _finish(txn):
            session_snapshot = session_ref.get(transaction=txn)
            job_snapshot = job_ref.get(transaction=txn)
            if not session_snapshot.exists or not job_snapshot.exists:
                raise ExportFenceError('Export job no longer exists.')
            session = session_snapshot.to_dict() or {}
            job = job_snapshot.to_dict() or {}
            self._require_fence(True, job, worker_id, fence_token)
            can_retry = transient and int(job.get('attempt_count', 0)) < max_attempts and session.get('status') == 'active' and session.get('expires_at') > now
            if can_retry:
                reservation_ref = session_ref.collection('reservations').document(job['reservation_id'])
                reservation_snapshot = reservation_ref.get(transaction=txn)
                reservation = reservation_snapshot.to_dict() or {}
                held_slots = int(reservation.get('concurrent_processing', 0))
                if reservation.get('status') == 'active' and held_slots:
                    txn.update(session_ref, {
                        'active_processing': max(0, int(session.get('active_processing', 0)) - held_slots),
                        'updated_at': now,
                    })
                    txn.update(reservation_ref, {'concurrent_processing': 0})
                txn.update(job_ref, {
                    'status': 'queued', 'updated_at': now, 'retry_at': now + retry_delay,
                    'lease_expires_at': None, 'worker_id': None, 'fence_token': None,
                    'progress_stage': 'retry_wait', 'error_code': error_code,
                })
                return 'queued'
            reservation_ref = session_ref.collection('reservations').document(job['reservation_id'])
            reservation_snapshot = reservation_ref.get(transaction=txn)
            reservation = reservation_snapshot.to_dict() or {}
            if reservation.get('status') == 'active':
                updates = self._quota_release_updates(session, reservation, commit=False)
                if cleanup_object_path:
                    updates['reserved_storage_bytes'] = session.get('reserved_storage_bytes', 0)
                    txn.update(reservation_ref, {'status': 'cleanup_pending', 'released_at': now})
                else:
                    txn.update(reservation_ref, {'status': 'released', 'released_at': now})
                txn.update(session_ref, updates)
            status = 'cleanup_pending' if cleanup_object_path else ('expired' if session.get('expires_at') <= now else 'failed')
            txn.update(job_ref, {
                'status': status, 'updated_at': now, 'lease_expires_at': None,
                'worker_id': None, 'fence_token': None,
                'progress_stage': status, 'error_code': error_code,
                'cleanup_object_path': cleanup_object_path,
                'cleanup_object_generation': cleanup_object_generation,
            })
            return status

        return str(_finish(transaction))

    @staticmethod
    def _quota_release_updates(session: dict[str, Any], reservation: dict[str, Any], *, commit: bool) -> dict[str, Any]:
        now = datetime.now(UTC)
        updates: dict[str, Any] = {'updated_at': now}
        mappings = (
            ('exports', 'exports_count', 'reserved_exports_count'),
            ('processing_seconds', None, 'reserved_processing_seconds'),
            ('storage_bytes', 'storage_bytes', 'reserved_storage_bytes'),
            ('concurrent_processing', None, 'active_processing'),
        )
        for quota, used_field, reserved_field in mappings:
            value = reservation.get(quota, 0)
            updates[reserved_field] = max(0, session.get(reserved_field, 0) - value)
            if commit and used_field:
                updates[used_field] = session.get(used_field, 0) + value
        return updates

    @staticmethod
    def _require_active(snapshot, now: datetime) -> dict[str, Any]:
        if not snapshot.exists:
            raise session_invalid()
        session = snapshot.to_dict() or {}
        if session.get('expires_at') <= now:
            raise session_expired()
        if session.get('status') != 'active':
            raise session_revoked()
        return session

    @staticmethod
    def _require_fence(exists: bool, job: dict[str, Any], worker_id: str, fence_token: str) -> None:
        if not exists or job.get('status') != 'running' or job.get('worker_id') != worker_id or job.get('fence_token') != fence_token:
            raise ExportFenceError('Export worker lease is stale.')
