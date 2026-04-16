from __future__ import annotations

import logging

from app.services.render_service import celery_app
from app.services.avatar_preview_service import AvatarPreviewService

logger = logging.getLogger(__name__)


@celery_app.task(name='avatar.process_preview_job', bind=True)
def process_avatar_preview_job(self, job_id: str) -> dict:
    try:
        service = AvatarPreviewService()
        result = service.process_preview_job(job_id=job_id)
        return {
            'job_id': job_id,
            'status': result.get('status'),
            'video_url': result.get('video_url'),
            'audio_url': result.get('audio_url'),
        }
    except Exception as exc:
        logger.exception(
            'avatar_preview_task_failed',
            extra={
                'job_id': job_id,
                'error': str(exc),
            },
        )
        raise