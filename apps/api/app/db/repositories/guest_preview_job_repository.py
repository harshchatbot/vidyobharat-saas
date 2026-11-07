"""Durable, guest-scoped HarshVerse preview jobs and atomic quota accounting.

Firestore is authoritative; broker messages are advisory. Preview jobs share the
guest session quota counters with timeline exports but do NOT consume export
allowances. Concurrency is acquired on claim, not while queued.
"""
from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timedelta
from typing import Any

from google.cloud import firestore

from app.db.repositories.guest_session_repository import GuestQuotaLimits, GuestQuotaReservation
from app.services.guest_session_errors import quota_exceeded, session_expired, session_invalid, session_revoked


class PreviewJobConflict(ValueError):
    pass


class PreviewJobFenceError(RuntimeError):
    pass


class GuestPreviewJobRepository:
    collection = 'harshverse_previews'

    def __init__(self, firestore_client) -> None:
        self.firestore = firestore_client
        self.sessions = firestore_client.collection('editor_guest_sessions')

    def _refs(self, guest_id: str, job_id: str):
        session = self.sessions.document(guest_id)
        job = session.collection(self.collection).document(job_id)
        reservation = session.collection('reservations').document(f'hv-{job_id}')
        return session, job, reservation

    @staticmethod
    def _require_session(snapshot, now: datetime) -> dict:
        if not snapshot.exists:
            raise session_invalid()
        session = snapshot.to_dict() or {}
        if session.get('status') != 'active':
            raise session_revoked()
        if not isinstance(session.get('expires_at'), datetime) or session['expires_at'] <= now:
            raise session_expired()
        return session

    @staticmethod
    def _require_fence(job: dict, worker_id: str, fence: str, now: datetime) -> None:
        if (job.get('status') != 'running' or job.get('worker_id') != worker_id
                or job.get('fence_token') != fence
                or not isinstance(job.get('lease_expires_at'), datetime)
                or job['lease_expires_at'] <= now):
            raise PreviewJobFenceError('HarshVerse worker lease is stale')

    def create_or_get(self, *, guest_id: str, job_id: str, payload: dict,
                      digest: str, media_hashes: dict[str, str],
                      processing_seconds: float, limits: GuestQuotaLimits,
                      now: datetime, network_subject: str | None) -> tuple[dict, bool]:
        session_ref, job_ref, reservation_ref = self._refs(guest_id, job_id)
        txn = self.firestore.transaction(max_attempts=10)

        @firestore.transactional
        def run(transaction):
            ss = session_ref.get(transaction=transaction)
            js = job_ref.get(transaction=transaction)
            media = {
                media_id: session_ref.collection('media').document(media_id).get(transaction=transaction)
                for media_id in media_hashes
            }
            session = self._require_session(ss, now)
            if js.exists:
                old = js.to_dict() or {}
                if old.get('digest') != digest:
                    raise PreviewJobConflict('Idempotency-Key already used for different preview inputs')
                return old, False
            for media_id, snapshot in media.items():
                record = snapshot.to_dict() or {}
                if (not snapshot.exists or record.get('guest_id') != guest_id
                        or record.get('status') != 'active'
                        or record.get('media_type') != 'video'
                        or record.get('content_sha256') != media_hashes[media_id]
                        or record.get('storage_object_path') != f'guest-editor/{guest_id}/sources/{media_id}/original'):
                    raise PreviewJobConflict('A verified input video is unavailable')
            if (float(session.get('processing_seconds', 0))
                    + float(session.get('reserved_processing_seconds', 0))
                    + processing_seconds > limits.processing_seconds):
                raise quota_exceeded('processing_seconds')
            transaction.update(session_ref, {
                'reserved_processing_seconds': float(session.get('reserved_processing_seconds', 0)) + processing_seconds,
                'updated_at': now,
            })
            reservation = GuestQuotaReservation(processing_seconds=processing_seconds)
            transaction.create(reservation_ref, {
                **asdict(reservation),
                'reservation_id': f'hv-{job_id}',
                'kind': 'harshverse_preview',
                'status': 'active',
                'requested_concurrent_processing': 1,
                'created_at': now,
                'lease_expires_at': session['expires_at'],
            })
            job = {
                'job_id': job_id, 'guest_id': guest_id,
                'status': 'queued', 'progress_stage': 'queued',
                'created_at': now, 'updated_at': now,
                'expires_at': session['expires_at'],
                'digest': digest, 'payload': payload,
                'reservation_id': f'hv-{job_id}',
                'network_subject': network_subject,
                'worker_id': None, 'fence_token': None,
                'lease_expires_at': None, 'retry_at': now, 'attempt_count': 0,
                'output': None, 'storage_object_path': None,
                'error_code': None, 'cleanup_generation': None,
            }
            transaction.create(job_ref, job)
            return job, True

        return run(txn)

    def get(self, guest_id: str, job_id: str) -> dict | None:
        _, ref, _ = self._refs(guest_id, job_id)
        snap = ref.get()
        return (snap.to_dict() or {}) if snap.exists else None

    def claim(self, *, guest_id: str, job_id: str, worker_id: str, fence: str,
              now: datetime, lease_duration: timedelta, concurrency_limit: int,
              max_attempts: int) -> dict | None:
        session_ref, job_ref, reservation_ref = self._refs(guest_id, job_id)
        txn = self.firestore.transaction(max_attempts=10)

        @firestore.transactional
        def run(transaction):
            ss = session_ref.get(transaction=transaction)
            js = job_ref.get(transaction=transaction)
            rs = reservation_ref.get(transaction=transaction)
            if not ss.exists or not js.exists or not rs.exists:
                return None
            session = ss.to_dict() or {}
            job = js.to_dict() or {}
            reservation = rs.to_dict() or {}
            if (session.get('status') != 'active' or session.get('expires_at') <= now
                    or job.get('expires_at') <= now
                    or reservation.get('status') != 'active'):
                return None
            running = job.get('status') == 'running'
            lease = job.get('lease_expires_at')
            if job.get('status') not in {'queued', 'running'} or (running and (not isinstance(lease, datetime) or lease > now)):
                return None
            if int(job.get('attempt_count', 0)) >= max_attempts or job.get('retry_at') > now:
                return None
            slot = int(reservation.get('concurrent_processing', 0))
            if not slot:
                used = int(session.get('active_processing', 0))
                if used + 1 > concurrency_limit:
                    return None
                transaction.update(session_ref, {'active_processing': used + 1, 'updated_at': now})
                transaction.update(reservation_ref, {'concurrent_processing': 1})
            updates = {
                'status': 'running', 'progress_stage': 'resolving_sources',
                'worker_id': worker_id, 'fence_token': fence,
                'lease_expires_at': min(job['expires_at'], now + lease_duration),
                'attempt_count': int(job.get('attempt_count', 0)) + 1,
                'updated_at': now,
            }
            transaction.update(job_ref, updates)
            return {**job, **updates}

        return run(txn)

    def renew(self, *, guest_id: str, job_id: str, worker_id: str,
              fence: str, now: datetime, lease_duration: timedelta, stage: str) -> None:
        _, job_ref, _ = self._refs(guest_id, job_id)
        txn = self.firestore.transaction(max_attempts=10)

        @firestore.transactional
        def run(transaction):
            js = job_ref.get(transaction=transaction)
            job = js.to_dict() or {}
            self._require_fence(job, worker_id, fence, now)
            if job.get('expires_at') <= now:
                raise session_expired()
            transaction.update(job_ref, {'lease_expires_at': min(job['expires_at'], now + lease_duration),
                                         'updated_at': now, 'progress_stage': stage})
        run(txn)

    def reserve_storage(self, *, guest_id: str, job_id: str, worker_id: str,
                        fence: str, bytes_needed: int, limits: GuestQuotaLimits, now: datetime) -> None:
        if bytes_needed <= 0:
            raise ValueError('preview output must be nonempty')
        sr, jr, rr = self._refs(guest_id, job_id)
        txn = self.firestore.transaction(max_attempts=10)

        @firestore.transactional
        def run(transaction):
            ss, js, rs = (ref.get(transaction=transaction) for ref in (sr, jr, rr))
            session = self._require_session(ss, now)
            job = js.to_dict() or {}
            reservation = rs.to_dict() or {}
            self._require_fence(job, worker_id, fence, now)
            if reservation.get('status') != 'active':
                raise PreviewJobFenceError('Preview reservation is inactive')
            previous = int(reservation.get('storage_bytes', 0))
            delta = bytes_needed - previous
            if (int(session.get('storage_bytes', 0))
                    + int(session.get('reserved_storage_bytes', 0))
                    + delta > limits.storage_bytes):
                raise quota_exceeded('storage_bytes')
            transaction.update(sr, {'reserved_storage_bytes': int(session.get('reserved_storage_bytes', 0)) + delta,
                                    'updated_at': now})
            transaction.update(rr, {'storage_bytes': previous + delta})
            transaction.update(jr, {'progress_stage': 'uploading', 'updated_at': now})
        run(txn)

    @staticmethod
    def _release(session: dict, reservation: dict, *, commit: bool, now: datetime) -> dict:
        result = {'updated_at': now}
        for field, reserved_field, used_field in (
            ('processing_seconds', 'reserved_processing_seconds', 'processing_seconds'),
            ('storage_bytes', 'reserved_storage_bytes', 'storage_bytes'),
            ('concurrent_processing', 'active_processing', None),
        ):
            value = reservation.get(field, 0)
            result[reserved_field] = max(0, session.get(reserved_field, 0) - value)
            if commit and used_field:
                result[used_field] = session.get(used_field, 0) + value
        return result

    def complete(self, *, guest_id: str, job_id: str, worker_id: str, fence: str,
                 output: dict, object_path: str, now: datetime) -> dict:
        sr, jr, rr = self._refs(guest_id, job_id)
        txn = self.firestore.transaction(max_attempts=10)

        @firestore.transactional
        def run(transaction):
            ss, js, rs = (ref.get(transaction=transaction) for ref in (sr, jr, rr))
            session = self._require_session(ss, now)
            job = js.to_dict() or {}
            reservation = rs.to_dict() or {}
            self._require_fence(job, worker_id, fence, now)
            if reservation.get('status') != 'active':
                raise PreviewJobFenceError('Reservation is not active')
            if int(reservation.get('storage_bytes', 0)) != int(output['file_size']):
                raise PreviewJobFenceError('Output size did not match reserved storage')
            if output['duration_seconds'] > float(reservation['processing_seconds']) + 0.12:
                raise PreviewJobFenceError('Preview duration exceeds reserved processing time')
            transaction.update(sr, self._release(session, reservation, commit=True, now=now))
            transaction.update(rr, {'status': 'committed', 'released_at': now})
            updates = {'status': 'completed', 'progress_stage': 'completed',
                       'output': output, 'storage_object_path': object_path,
                       'worker_id': None, 'fence_token': None,
                       'lease_expires_at': None, 'updated_at': now, 'error_code': None}
            transaction.update(jr, updates)
            return {**job, **updates}
        return run(txn)

    def fail(self, *, guest_id: str, job_id: str, worker_id: str, fence: str,
             now: datetime, error_code: str, transient: bool, max_attempts: int,
             retry_delay: timedelta, cleanup_generation: str | None = None) -> str:
        sr, jr, rr = self._refs(guest_id, job_id)
        txn = self.firestore.transaction(max_attempts=10)

        @firestore.transactional
        def run(transaction):
            ss, js, rs = (ref.get(transaction=transaction) for ref in (sr, jr, rr))
            session = ss.to_dict() or {}
            job = js.to_dict() or {}
            reservation = rs.to_dict() or {}
            self._require_fence(job, worker_id, fence, now)
            if reservation.get('status') != 'active':
                raise PreviewJobFenceError('Reservation is not active')
            can_retry = (transient and cleanup_generation is None
                         and int(job['attempt_count']) < max_attempts
                         and session.get('status') == 'active'
                         and session.get('expires_at') > now)
            # Every retried attempt releases its capacity slot and any
            # temporary output-byte reservation, not the processing budget.
            slot = int(reservation.get('concurrent_processing', 0))
            storage = int(reservation.get('storage_bytes', 0))
            updates = {
                'active_processing': max(0, int(session.get('active_processing', 0)) - slot),
                'reserved_storage_bytes': (int(session.get('reserved_storage_bytes', 0))
                                           if cleanup_generation is not None else
                                           max(0, int(session.get('reserved_storage_bytes', 0)) - storage)),
                'updated_at': now,
            }
            if can_retry:
                transaction.update(sr, updates)
                transaction.update(rr, {'concurrent_processing': 0, 'storage_bytes': 0})
                transaction.update(jr, {
                    'status': 'queued', 'progress_stage': 'retry_wait', 'updated_at': now,
                    'retry_at': now + retry_delay, 'worker_id': None, 'fence_token': None,
                    'lease_expires_at': None, 'error_code': error_code,
                })
                return 'queued'
            # Never free storage quota while a failed upload still exists.
            if cleanup_generation is None:
                updates['reserved_processing_seconds'] = max(
                    0, float(session.get('reserved_processing_seconds', 0))
                    - float(reservation.get('processing_seconds', 0)))
            transaction.update(sr, updates)
            transaction.update(rr, {
                'status': 'cleanup_pending' if cleanup_generation else 'released',
                'concurrent_processing': 0, 'released_at': now,
            })
            status = 'cleanup_pending' if cleanup_generation else 'failed'
            transaction.update(jr, {
                'status': status, 'progress_stage': status,
                'updated_at': now, 'worker_id': None, 'fence_token': None,
                'lease_expires_at': None, 'error_code': error_code,
                'cleanup_generation': cleanup_generation,
            })
            return status
        return run(txn)

    def finish_cleanup(self, *, guest_id: str, job_id: str, now: datetime) -> None:
        """Release stranded quota after the private object has been deleted."""
        sr, jr, rr = self._refs(guest_id, job_id)
        txn = self.firestore.transaction(max_attempts=10)

        @firestore.transactional
        def run(transaction):
            ss, js, rs = (ref.get(transaction=transaction) for ref in (sr, jr, rr))
            job = js.to_dict() or {}
            reservation = rs.to_dict() or {}
            if job.get('status') != 'cleanup_pending' or reservation.get('status') != 'cleanup_pending':
                return
            session = ss.to_dict() or {}
            transaction.update(sr, {
                'reserved_storage_bytes': max(0, int(session.get('reserved_storage_bytes', 0)) - int(reservation.get('storage_bytes', 0))),
                'reserved_processing_seconds': max(0, float(session.get('reserved_processing_seconds', 0)) - float(reservation.get('processing_seconds', 0))),
                'updated_at': now,
            })
            transaction.update(rr, {'status': 'released', 'released_at': now, 'storage_bytes': 0})
            transaction.update(jr, {'status': 'failed', 'progress_stage': 'failed',
                                    'cleanup_generation': None, 'updated_at': now})
        run(txn)

    def expire_abandoned(self, *, guest_id: str, job_id: str, now: datetime, max_attempts: int) -> bool:
        """Reap inactive/exhausted jobs so their durable quota does not leak."""
        sr, jr, rr = self._refs(guest_id, job_id)
        txn = self.firestore.transaction(max_attempts=10)

        @firestore.transactional
        def run(transaction):
            ss, js, rs = (ref.get(transaction=transaction) for ref in (sr, jr, rr))
            if not ss.exists or not js.exists or not rs.exists:
                return False
            session = ss.to_dict() or {}
            job = js.to_dict() or {}
            reservation = rs.to_dict() or {}
            lease = job.get('lease_expires_at')
            if not (job.get('status') == 'queued' or (
                job.get('status') == 'running' and isinstance(lease, datetime) and lease <= now
            )):
                return False
            expired = (session.get('status') != 'active' or session.get('expires_at') <= now
                       or job.get('expires_at') <= now)
            exhausted = int(job.get('attempt_count', 0)) >= max_attempts
            if not expired and not exhausted:
                return False
            has_orphaned_output = (
                reservation.get('status') == 'active'
                and int(reservation.get('storage_bytes', 0)) > 0
            )
            if reservation.get('status') == 'active':
                if has_orphaned_output:
                    # A crashed worker may have uploaded the private preview
                    # before losing its completion lease. Keep both storage
                    # and processing reservations until object cleanup succeeds.
                    released_slot = int(reservation.get('concurrent_processing', 0))
                    transaction.update(sr, {
                        'active_processing': max(0, int(session.get('active_processing', 0)) - released_slot),
                        'updated_at': now,
                    })
                    transaction.update(rr, {
                        'status': 'cleanup_pending', 'concurrent_processing': 0,
                        'released_at': now,
                    })
                else:
                    transaction.update(sr, self._release(session, reservation, commit=False, now=now))
                    transaction.update(rr, {'status': 'released', 'released_at': now})
            status = 'cleanup_pending' if has_orphaned_output else ('expired' if expired else 'failed')
            transaction.update(jr, {'status': status, 'progress_stage': status,
                                    'worker_id': None, 'fence_token': None, 'lease_expires_at': None,
                                    'cleanup_generation': 'unknown' if has_orphaned_output else None,
                                    'error_code': 'guest_session_expired' if expired else 'attempts_exhausted',
                                    'updated_at': now})
            return True
        return bool(run(txn))

    def recoverable_jobs(self, *, now: datetime, max_attempts: int):
        """Bound this scan with a dedicated reconciler; not a request path."""
        for session in self.sessions.stream():
            for snapshot in session.reference.collection(self.collection).stream():
                job = snapshot.to_dict() or {}
                if job.get('status') == 'cleanup_pending':
                    yield session.id, snapshot.id, 'cleanup'
                    continue
                if job.get('status') not in {'queued', 'running'}:
                    continue
                lease = job.get('lease_expires_at')
                if job.get('status') == 'running' and (not isinstance(lease, datetime) or lease > now):
                    continue
                if self.expire_abandoned(guest_id=session.id, job_id=snapshot.id, now=now,
                                         max_attempts=max_attempts):
                    yield session.id, snapshot.id, 'expired'
                elif not isinstance(job.get('retry_at'), datetime) or job['retry_at'] <= now:
                    yield session.id, snapshot.id, 'queued'
