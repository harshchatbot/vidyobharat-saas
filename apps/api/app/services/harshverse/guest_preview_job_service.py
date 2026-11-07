"""Authenticated submission and private status lookup for HarshVerse preview jobs.

Only trusted server-side callers may pass a HarshVerseDraft. Do not bind this
method directly to arbitrary client JSON; Creative Director validation and
asset provenance must happen before submission.
"""
from __future__ import annotations

from dataclasses import asdict
from datetime import UTC, datetime
import hashlib
import json
import logging
import re

from app.core.config import get_settings
from app.db.repositories.guest_preview_job_repository import GuestPreviewJobRepository, PreviewJobConflict
from app.db.repositories.guest_session_repository import GuestQuotaReservation
from app.providers.firebase import get_firestore_client
from app.services.guest_media_service import build_guest_media_service
from app.services.guest_session_errors import media_error
from .composition_adapter import AnimationPlate, HarshVerseDraft
from .guest_preview_service import _require_video

logger = logging.getLogger(__name__)
_KEY = re.compile(r'^[A-Za-z0-9._:-]{8,128}$')
_JOB_ID = re.compile(r'^[a-f0-9]{32}$')


class GuestHarshVerseJobService:
    def __init__(self, *, media, repository, settings=None):
        self.media = media
        self.sessions = media.sessions
        self.repository = repository
        self.settings = settings or get_settings()

    def submit(self, request, token: str | None, *, presenter_media_id: str,
               draft: HarshVerseDraft, plate: AnimationPlate,
               idempotency_key: str) -> tuple[dict, bool]:
        self.sessions.validate_mutating_request(request)
        if not _KEY.fullmatch(idempotency_key or ''):
            raise media_error('guest_preview_idempotency_invalid',
                              'Idempotency-Key must be 8-128 safe ASCII characters.', status_code=400)
        session = self.sessions.get_session(token)
        guest_id = session['guest_id']
        if not draft.needs_review or draft.ready_to_render:
            raise ValueError('HarshVerse preview must require review')
        if not draft.animation_asset_id or draft.animation_asset_id != plate.asset_id:
            raise ValueError('Renderable preview requires a verified animation plate')
        draft.scene_plan.validate(asset_duration=plate.duration)
        if not any(s.recipe in {'presenter_split', 'animated_explainer'} for s in draft.scene_plan.scenes):
            raise ValueError('Preview has no animation scenes')
        source = self.media.get_media(token, presenter_media_id)
        animation = self.media.get_media(token, plate.asset_id)
        for record, media_id in ((source, presenter_media_id), (animation, plate.asset_id)):
            _require_video(record, media_id, guest_id, self.media.max_file_bytes)
        if (animation['content_sha256'] != plate.sha256
                or abs(float(animation['duration_seconds']) - plate.duration) > 0.05):
            raise ValueError('Animation plate does not match owned media')
        if draft.scene_plan.duration > float(source['duration_seconds']) + 0.05:
            raise ValueError('Presenter media too short')

        media_hashes = {
            presenter_media_id: source['content_sha256'],
            plate.asset_id: animation['content_sha256'],
        }
        payload = {
            'version': 1,
            'presenter_media_id': presenter_media_id,
            'animation_media_id': plate.asset_id,
            'scene_plan': asdict(draft.scene_plan),
            'deferred_beat_ids': list(draft.deferred_beat_ids),
        }
        digest = hashlib.sha256(json.dumps(
            {'payload': payload, 'media_hashes': media_hashes},
            sort_keys=True, separators=(',', ':'),
        ).encode()).hexdigest()
        job_id = hashlib.sha256(f'{guest_id}\0hv\0{idempotency_key}'.encode()).hexdigest()[:32]
        existing = self.repository.get(guest_id, job_id)
        if existing:
            if existing.get('digest') != digest:
                raise media_error('guest_preview_idempotency_conflict',
                                  'Idempotency-Key already used for another preview.', status_code=409)
            return existing, False

        reservation_id = f'hv-{job_id}'
        subject = self.sessions.reserve_network_quota(
            request=request, guest_id=guest_id,
            reservation_id=reservation_id,
            reservation=GuestQuotaReservation(processing_seconds=draft.scene_plan.duration),
        )
        try:
            job, created = self.repository.create_or_get(
                guest_id=guest_id, job_id=job_id,
                payload=payload, digest=digest, media_hashes=media_hashes,
                processing_seconds=draft.scene_plan.duration,
                limits=self.sessions.limits, now=datetime.now(UTC),
                network_subject=subject,
            )
        except Exception:
            self.sessions.finish_network_quota(subject=subject, reservation_id=reservation_id, commit=False)
            raise
        if not created:
            self.sessions.finish_network_quota(subject=subject, reservation_id=reservation_id, commit=False)
        elif self.settings.editor_export_celery_enabled:
            try:
                from app.workers.harshverse_preview_tasks import render_harshverse_preview
                render_harshverse_preview.apply_async(
                    args=[guest_id, job_id],
                    queue=self.settings.editor_export_celery_queue,
                )
            except Exception:
                logger.exception('harshverse_preview_enqueue_failed', extra={'job_id': job_id})
        return job, created

    def get_job(self, token: str | None, job_id: str) -> dict:
        if not _JOB_ID.fullmatch(job_id):
            raise media_error('guest_preview_not_found', 'Preview job not found.', status_code=404)
        session = self.sessions.get_session(token)
        job = self.repository.get(session['guest_id'], job_id)
        if not job:
            raise media_error('guest_preview_not_found', 'Preview job not found.', status_code=404)
        return job

    @staticmethod
    def public_payload(job: dict) -> dict:
        return {
            'job_id': job['job_id'], 'status': job['status'],
            'progress_stage': job.get('progress_stage', job['status']),
            'created_at': job['created_at'], 'updated_at': job['updated_at'],
            'output_ready': job['status'] == 'completed',
            'error_code': job.get('error_code') if job['status'] in {'failed', 'expired'} else None,
        }


def build_harshverse_job_service() -> GuestHarshVerseJobService:
    return GuestHarshVerseJobService(
        media=build_guest_media_service(),
        repository=GuestPreviewJobRepository(get_firestore_client()),
    )
