from __future__ import annotations

import hashlib
import json
import math
import re
from datetime import UTC, datetime
from typing import Any

from app.core.config import Settings, get_settings
from app.db.repositories.guest_export_repository import ExportConflictError, GuestExportRepository
from app.db.repositories.guest_session_repository import GuestQuotaReservation
from app.providers.firebase import get_firestore_client
from app.schemas.editor import TimelineComposition
from app.services.guest_media_storage import GuestMediaStorage, build_guest_media_storage
from app.services.guest_session_errors import GuestSessionError, media_error
from app.services.guest_session_service import GuestSessionService, build_guest_session_service
from app.services.guest_timeline_service import GuestTimelineService, build_guest_timeline_service


_IDEMPOTENCY_PATTERN = re.compile(r'^[A-Za-z0-9._:-]{8,128}$')
_JOB_ID_PATTERN = re.compile(r'^[a-f0-9]{32}$')


class GuestExportService:
    def __init__(self, *, settings: Settings, sessions: GuestSessionService, timeline: GuestTimelineService, repository: GuestExportRepository, storage: GuestMediaStorage) -> None:
        self.settings = settings
        self.sessions = sessions
        self.timeline = timeline
        self.repository = repository
        self.storage = storage

    def submit(self, request, raw_token: str | None, composition: TimelineComposition, idempotency_key: str | None) -> tuple[dict[str, Any], bool]:
        self.sessions.validate_mutating_request(request)
        self.validate_idempotency_key(idempotency_key)
        session = self.sessions.get_session(raw_token)
        assert idempotency_key is not None
        job_id = hashlib.sha256(f"{session['guest_id']}\0{idempotency_key}".encode()).hexdigest()[:32]
        timeline_payload = composition.model_dump(mode='json')
        digest = hashlib.sha256(json.dumps(timeline_payload, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
        existing = self.repository.get(session['guest_id'], job_id)
        if existing:
            if existing.get('timeline_digest') != digest:
                raise media_error(
                    'guest_export_idempotency_conflict',
                    'Idempotency-Key was already used for a different timeline.',
                    status_code=409,
                )
            return existing, False
        self.timeline.validate_sources(raw_token, composition)
        now = datetime.now(UTC)
        reserved_processing = math.fsum(
            math.ceil(clip.duration_seconds * composition.fps - 1e-9) / composition.fps
            for clip in composition.clips
        )
        try:
            return self.repository.create_or_get(
                guest_id=session['guest_id'],
                job_id=job_id,
                timeline=timeline_payload,
                timeline_digest=digest,
                reservation=GuestQuotaReservation(
                    exports=1,
                    processing_seconds=reserved_processing,
                    concurrent_processing=1,
                ),
                limits=self.sessions.limits,
                now=now,
                expires_at=session['expires_at'],
            )
        except ExportConflictError as exc:
            raise media_error('guest_export_idempotency_conflict', str(exc), status_code=409) from exc

    def list_jobs(self, raw_token: str | None) -> list[dict[str, Any]]:
        session = self.sessions.get_session(raw_token)
        limit = (
            self.sessions.app_config.get().export.list_limit
            if self.sessions.app_config is not None
            else self.settings.editor_export_list_limit
        )
        return self.repository.list_for_guest(session['guest_id'], limit=limit)

    def get_job(self, raw_token: str | None, job_id: str) -> dict[str, Any]:
        if not _JOB_ID_PATTERN.fullmatch(job_id):
            raise self._not_found()
        session = self.sessions.get_session(raw_token)
        job = self.repository.get(session['guest_id'], job_id)
        if not job or job.get('guest_id') != session['guest_id']:
            raise self._not_found()
        return job

    def content_range(self, raw_token: str | None, job_id: str, range_header: str | None) -> tuple[dict[str, Any], int, int, int]:
        job = self.get_job(raw_token, job_id)
        if job.get('status') != 'completed' or not isinstance(job.get('output'), dict):
            raise media_error('guest_export_not_ready', 'The export is not ready for download.', status_code=409, recoverable=True)
        expected = f"guest-editor/{job['guest_id']}/outputs/{job_id}/final.mp4"
        if job.get('storage_object_path') != expected:
            raise media_error('guest_export_invalid_record', 'The export record is invalid.', status_code=500)
        size = int(job['output']['file_size'])
        start, end = self._parse_range(range_header, size)
        return job, start, end, size

    @staticmethod
    def public_payload(job: dict[str, Any]) -> dict[str, Any]:
        return {
            'job_id': job['job_id'],
            'status': job['status'],
            'created_at': job['created_at'],
            'updated_at': job['updated_at'],
            'expires_at': job['expires_at'],
            'progress_stage': job.get('progress_stage', job['status']),
            'status_url': f"/api/editor/exports/{job['job_id']}",
            'output': job.get('output') if job.get('status') == 'completed' else None,
            'error_code': job.get('error_code'),
        }

    @staticmethod
    def validate_idempotency_key(value: str | None) -> None:
        if value is None or not _IDEMPOTENCY_PATTERN.fullmatch(value):
            raise media_error('guest_export_idempotency_key_invalid', 'Idempotency-Key must be 8-128 safe ASCII characters.', status_code=400)

    @staticmethod
    def _parse_range(value: str | None, size: int) -> tuple[int, int]:
        if not value:
            return 0, size - 1
        match = re.fullmatch(r'bytes=(\d*)-(\d*)', value.strip()) if len(value) <= 128 else None
        if not match or (not match.group(1) and not match.group(2)):
            raise media_error('guest_export_range_invalid', 'The requested byte range is invalid.', status_code=416)
        first = int(match.group(1)) if match.group(1) else None
        second = int(match.group(2)) if match.group(2) else None
        if first is None:
            if not second or second <= 0:
                raise media_error('guest_export_range_invalid', 'The requested byte range is invalid.', status_code=416)
            return max(0, size - second), size - 1
        end = second if second is not None else size - 1
        if first >= size or end < first:
            raise media_error('guest_export_range_invalid', 'The requested byte range is invalid.', status_code=416)
        return first, min(end, size - 1)

    @staticmethod
    def _not_found() -> GuestSessionError:
        return media_error('guest_export_not_found', 'The requested export was not found.', status_code=404)


def build_guest_export_service(settings: Settings | None = None) -> GuestExportService:
    current = settings or get_settings()
    return GuestExportService(
        settings=current,
        sessions=build_guest_session_service(),
        timeline=build_guest_timeline_service(current),
        repository=GuestExportRepository(get_firestore_client()),
        storage=build_guest_media_storage(current),
    )
