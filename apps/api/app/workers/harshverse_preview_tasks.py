"""Celery dispatch and recovery for durable HarshVerse preview jobs."""
from __future__ import annotations

import logging

from google.api_core.exceptions import Aborted

from app.services.render_service import celery_app
from app.services.harshverse.guest_preview_worker import build_harshverse_worker

logger = logging.getLogger(__name__)


@celery_app.task(
    bind=True,
    name='editor.process_harshverse_preview',
    acks_late=True,
    reject_on_worker_lost=True,
    autoretry_for=(Aborted,),
    retry_backoff=2,
    retry_backoff_max=30,
    retry_jitter=True,
    retry_kwargs={'max_retries': 4},
)
def render_harshverse_preview(self, guest_id: str, job_id: str) -> bool:
    """Only opaque job identifiers are brokered; no guest session tokens."""
    logger.info('harshverse_preview_task_started', extra={'job_id': job_id, 'task_id': self.request.id})
    return build_harshverse_worker().run_job(guest_id, job_id)


@celery_app.task(
    bind=True,
    name='editor.reconcile_harshverse_previews',
    acks_late=True,
    reject_on_worker_lost=True,
)
def reconcile_harshverse_previews(self, max_jobs: int = 8) -> int:
    return build_harshverse_worker().reconcile(max_jobs)
