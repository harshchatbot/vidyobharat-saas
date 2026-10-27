from __future__ import annotations

import argparse
import logging
import secrets
import signal
import threading
import time
from dataclasses import asdict
from datetime import UTC, datetime, timedelta

from app.core.config import Settings, get_settings
from app.db.repositories.guest_export_repository import ExportFenceError, GuestExportRepository
from app.providers.firebase import get_firestore_client
from app.schemas.editor import TimelineComposition
from app.services.guest_media_storage import GuestMediaStorage, build_guest_media_storage
from app.services.guest_session_errors import GuestSessionError
from app.services.guest_timeline_service import GuestTimelineService, build_guest_timeline_service
from app.services.timeline_render_service import TimelineRenderError, TimelineValidationError


logger = logging.getLogger(__name__)


class GuestExportWorker:
    def __init__(self, *, settings: Settings, repository: GuestExportRepository, timeline: GuestTimelineService, storage: GuestMediaStorage, worker_id: str | None = None) -> None:
        self.settings = settings
        self.repository = repository
        self.timeline = timeline
        self.storage = storage
        self.worker_id = worker_id or f'worker-{secrets.token_hex(8)}'
        self.lease_duration = timedelta(seconds=settings.editor_export_worker_lease_seconds)
        self.stop_event = threading.Event()
        if self.lease_duration.total_seconds() <= 0 or settings.editor_export_worker_max_attempts <= 0:
            raise RuntimeError('Export worker lease and attempt settings must be positive.')

    def run_once(self) -> bool:
        fence = secrets.token_hex(16)
        cleanup = self.repository.claim_cleanup(
            worker_id=self.worker_id,
            fence_token=fence,
            now=datetime.now(UTC),
            lease_duration=self.lease_duration,
        )
        if cleanup:
            succeeded = False
            try:
                generation = cleanup.get('cleanup_object_generation')
                if generation:
                    self.storage.delete_generation(cleanup['cleanup_object_path'], generation)
                else:
                    self.storage.delete(cleanup['cleanup_object_path'])
                succeeded = True
            except Exception:
                logger.exception('guest_export_cleanup_retry_failed', extra={'job_id': cleanup['job_id']})
            finally:
                self.repository.finish_cleanup(
                    guest_id=cleanup['guest_id'], job_id=cleanup['job_id'],
                    worker_id=self.worker_id, fence_token=fence,
                    now=datetime.now(UTC), succeeded=succeeded,
                )
            return True
        fence = secrets.token_hex(16)
        job = self.repository.claim_next(
            worker_id=self.worker_id,
            fence_token=fence,
            now=datetime.now(UTC),
            lease_duration=self.lease_duration,
        )
        if not job:
            return False
        self._execute(job, fence)
        return True

    def run_forever(self) -> None:
        while not self.stop_event.is_set():
            worked = self.run_once()
            if not worked:
                self.stop_event.wait(self.settings.editor_export_worker_poll_seconds)

    def stop(self, *_: object) -> None:
        self.stop_event.set()

    def _execute(self, job: dict, fence: str) -> None:
        guest_id = job['guest_id']
        job_id = job['job_id']
        output_path = f'guest-editor/{guest_id}/outputs/{job_id}/final.mp4'
        heartbeat_stop = threading.Event()
        lease_lost = threading.Event()

        def heartbeat() -> None:
            interval = max(1.0, self.lease_duration.total_seconds() / 3)
            while not heartbeat_stop.wait(interval):
                try:
                    self.repository.renew(
                        guest_id=guest_id,
                        job_id=job_id,
                        worker_id=self.worker_id,
                        fence_token=fence,
                        now=datetime.now(UTC),
                        lease_duration=self.lease_duration,
                        stage='rendering',
                    )
                except Exception:
                    lease_lost.set()
                    return

        thread = threading.Thread(target=heartbeat, name=f'export-heartbeat-{job_id}', daemon=True)
        thread.start()
        uploaded = False
        uploaded_generation: str | None = None
        cleanup_failed = False
        try:
            if int(job.get('attempt_count', 0)) > 1:
                self.storage.delete(output_path)
            composition = TimelineComposition.model_validate(job['timeline'])
            self.repository.renew(
                guest_id=guest_id, job_id=job_id, worker_id=self.worker_id, fence_token=fence,
                now=datetime.now(UTC), lease_duration=self.lease_duration, stage='rendering',
            )
            with self.timeline.render_for_worker(guest_id, composition) as rendered:
                if lease_lost.is_set() or self.stop_event.is_set():
                    raise ExportFenceError('Export worker lease was lost during rendering.')
                self.repository.reserve_storage(
                    guest_id=guest_id,
                    job_id=job_id,
                    worker_id=self.worker_id,
                    fence_token=fence,
                    output_bytes=rendered.metadata.file_size,
                    limits=self.timeline.media_service.sessions.limits,
                    now=datetime.now(UTC),
                )
                self.repository.renew(
                    guest_id=guest_id, job_id=job_id, worker_id=self.worker_id, fence_token=fence,
                    now=datetime.now(UTC), lease_duration=self.lease_duration, stage='uploading',
                )
                uploaded_generation = self.storage.upload_file_if_absent(
                    output_path,
                    rendered.path,
                    content_type='video/mp4',
                    timeout_seconds=float(self.settings.editor_guest_upload_timeout_seconds),
                )
                uploaded = True
                if lease_lost.is_set():
                    raise ExportFenceError('Export worker lease was lost during upload.')
                self.repository.complete(
                    guest_id=guest_id,
                    job_id=job_id,
                    worker_id=self.worker_id,
                    fence_token=fence,
                    output=asdict(rendered.metadata),
                    object_path=output_path,
                    actual_processing_seconds=rendered.metadata.duration_seconds,
                    now=datetime.now(UTC),
                )
                uploaded = False
        except Exception as exc:
            if uploaded:
                try:
                    if uploaded_generation:
                        self.storage.delete_generation(output_path, uploaded_generation)
                    else:
                        self.storage.delete(output_path)
                    uploaded = False
                except Exception:
                    cleanup_failed = True
                    logger.exception('guest_export_output_cleanup_failed')
            transient = not isinstance(exc, (TimelineValidationError, GuestSessionError, ExportFenceError))
            error_code = self._error_code(exc, cleanup_failed)
            try:
                attempt = int(job.get('attempt_count', 1))
                delay = timedelta(seconds=self.settings.editor_export_worker_retry_base_seconds * (2 ** max(0, attempt - 1)))
                self.repository.fail_or_retry(
                    guest_id=guest_id,
                    job_id=job_id,
                    worker_id=self.worker_id,
                    fence_token=fence,
                    error_code=error_code,
                    transient=transient and not cleanup_failed,
                    max_attempts=self.settings.editor_export_worker_max_attempts,
                    retry_delay=delay,
                    now=datetime.now(UTC),
                    cleanup_object_path=output_path if cleanup_failed else None,
                    cleanup_object_generation=uploaded_generation if cleanup_failed else None,
                )
            except ExportFenceError:
                logger.warning('guest_export_stale_worker_discarded', extra={'job_id': job_id})
        finally:
            heartbeat_stop.set()
            thread.join(timeout=2)

    @staticmethod
    def _error_code(exc: Exception, cleanup_failed: bool) -> str:
        if cleanup_failed:
            return 'output_cleanup_failed'
        if isinstance(exc, GuestSessionError):
            return exc.error
        if isinstance(exc, TimelineValidationError):
            return 'invalid_timeline_media'
        if isinstance(exc, ExportFenceError):
            return 'worker_lease_lost'
        if isinstance(exc, TimelineRenderError):
            return 'render_failed'
        return 'export_transient_failure'


def build_guest_export_worker(settings: Settings | None = None) -> GuestExportWorker:
    current = settings or get_settings()
    return GuestExportWorker(
        settings=current,
        repository=GuestExportRepository(get_firestore_client()),
        timeline=build_guest_timeline_service(current),
        storage=build_guest_media_storage(current),
    )


def main() -> None:
    parser = argparse.ArgumentParser(description='Run the RangManch durable guest export worker.')
    parser.parse_args()
    worker = build_guest_export_worker()
    signal.signal(signal.SIGTERM, worker.stop)
    signal.signal(signal.SIGINT, worker.stop)
    worker.run_forever()


if __name__ == '__main__':
    main()
