"""Celery dispatch for durable guest timeline exports.

Firestore remains the authority for job state.  Each task invokes the same
lease/fence-aware worker used by the recovery daemon, so duplicate delivery,
worker loss, and broker retries cannot render a job twice concurrently.
"""

from __future__ import annotations

import logging

from app.services.guest_export_worker import build_guest_export_worker
from app.services.render_service import celery_app


logger = logging.getLogger(__name__)


@celery_app.task(
    bind=True,
    name='editor.process_guest_timeline_export',
    acks_late=True,
    reject_on_worker_lost=True,
)
def process_guest_timeline_export(self, guest_id: str, job_id: str) -> bool:
    """Claim and process one due durable export record.

    ``job_id`` is retained for traceability.  The worker claims through
    Firestore rather than trusting the broker message, which is essential for
    idempotency and recovery of jobs whose publish acknowledgement was lost.
    """
    worker = build_guest_export_worker()
    logger.info('guest_export_celery_task_started', extra={'job_id': job_id, 'task_id': self.request.id})
    return worker.run_job(guest_id=guest_id, job_id=job_id)


@celery_app.task(
    bind=True,
    name='editor.reconcile_guest_timeline_exports',
    acks_late=True,
    reject_on_worker_lost=True,
)
def reconcile_guest_timeline_exports(self, max_jobs: int = 8) -> int:
    """Recover queued or expired-lease jobs after broker/worker disruption."""
    worker = build_guest_export_worker()
    processed = 0
    for _ in range(max(1, min(int(max_jobs), 32))):
        if not worker.run_once():
            break
        processed += 1
    logger.info('guest_export_reconciliation_finished', extra={'task_id': self.request.id, 'processed': processed})
    return processed
