"""Tokenless, lease-fenced worker for private HarshVerse preview rendering."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
import logging
from pathlib import Path
import secrets
import tempfile
import threading

from app.core.config import get_settings
from app.db.repositories.guest_preview_job_repository import GuestPreviewJobRepository, PreviewJobFenceError
from app.providers.firebase import get_firestore_client
from app.services.guest_media_service import build_guest_media_service
from app.services.harshverse.guest_preview_service import _require_video, _sha256
from app.services.harshverse.render_adapter import _probe, _duration, render
from app.services.harshverse.scene_plan import Scene, ScenePlan

logger = logging.getLogger(__name__)


class GuestHarshVerseWorker:
    def __init__(self, *, media, repository, settings=None, renderer=render):
        self.media = media
        self.repository = repository
        self.settings = settings or get_settings()
        self.renderer = renderer
        self.worker_id = f'hv-{secrets.token_hex(8)}'
        self.lease = timedelta(seconds=self.settings.editor_export_worker_lease_seconds)

    def run_job(self, guest_id: str, job_id: str) -> bool:
        fence = secrets.token_hex(16)
        job = self.repository.claim(
            guest_id=guest_id, job_id=job_id, worker_id=self.worker_id, fence=fence,
            now=datetime.now(UTC), lease_duration=self.lease,
            concurrency_limit=self.media.sessions.limits.concurrent_processing,
            max_attempts=self.settings.editor_export_worker_max_attempts,
        )
        if not job:
            return False
        self._execute(job, fence)
        return True

    def _execute(self, job: dict, fence: str) -> None:
        guest_id, job_id = job['guest_id'], job['job_id']
        destination = f'guest-editor/{guest_id}/harshverse-previews/{job_id}/preview.mp4'
        heartbeat_stop = threading.Event()
        lease_lost = threading.Event()
        generation = None
        uploaded = False

        def heartbeat():
            while not heartbeat_stop.wait(max(1.0, self.lease.total_seconds() / 3)):
                try:
                    self.repository.renew(
                        guest_id=guest_id, job_id=job_id, worker_id=self.worker_id,
                        fence=fence, now=datetime.now(UTC),
                        lease_duration=self.lease, stage='rendering',
                    )
                except Exception:
                    lease_lost.set()
                    return

        thread = threading.Thread(target=heartbeat, daemon=True, name=f'hv-heartbeat-{job_id}')
        thread.start()
        try:
            # A previous worker can crash after reserving output storage and
            # uploading a private object, but before committing the Firestore
            # completion record. Only the newly fenced owner may remove that
            # stale per-job object before another upload-if-absent attempt.
            if int(job.get('attempt_count', 0)) > 1:
                self.repository.renew(
                    guest_id=guest_id, job_id=job_id, worker_id=self.worker_id,
                    fence=fence, now=datetime.now(UTC),
                    lease_duration=self.lease, stage='cleaning_stale_output',
                )
                self.media.storage.delete(destination)
            raw = job['payload']
            if raw['version'] != 1:
                raise ValueError('unsupported preview job version')
            info = raw['scene_plan']
            scene_plan = ScenePlan(
                duration=info['duration'],
                fps=info['fps'], width=info['width'], height=info['height'],
                scenes=tuple(Scene(**scene) for scene in info['scenes']),
            )
            source_id, animation_id = raw['presenter_media_id'], raw['animation_media_id']
            if source_id == animation_id:
                raise ValueError('source and animation must be different')
            if set(raw['media_hashes']) != {source_id, animation_id}:
                raise ValueError('unexpected preview source records')
            records = {}
            for media_id in (source_id, animation_id):
                record = self.media.repository.get_for_guest(guest_id, media_id)
                if not record:
                    raise ValueError('source media is no longer available')
                _require_video(record, media_id, guest_id, self.media.max_file_bytes)
                if record['content_sha256'] != raw['media_hashes'][media_id]:
                    raise ValueError('source checksum changed')
                records[media_id] = record
            scene_plan.validate(asset_duration=float(records[animation_id]['duration_seconds']))
            if scene_plan.duration > float(records[source_id]['duration_seconds']) + 0.05:
                raise ValueError('presenter too short')
            if not any(s.recipe in {'presenter_split', 'animated_explainer'} for s in scene_plan.scenes):
                raise ValueError('no animation scenes')
            if lease_lost.is_set():
                raise PreviewJobFenceError('Worker lease lost')
            self.repository.renew(
                guest_id=guest_id, job_id=job_id, worker_id=self.worker_id,
                fence=fence, now=datetime.now(UTC),
                lease_duration=self.lease, stage='rendering',
            )
            with tempfile.TemporaryDirectory(prefix='rangmanch-hv-worker-') as temp:
                root = Path(temp)
                presenter = root / 'presenter.bin'
                animation = root / 'animation.bin'
                output = root / 'preview.mp4'
                for media_id, target in ((source_id, presenter), (animation_id, animation)):
                    record = records[media_id]
                    self.media.storage.download_to_path(
                        record['storage_object_path'], target,
                        expected_size=int(record['file_size']),
                    )
                    if _sha256(target) != record['content_sha256']:
                        raise ValueError('Downloaded media checksum mismatch')
                self.renderer(scene_plan, presenter, animation, output)
                if not output.is_file() or not 0 < output.stat().st_size <= self.media.max_file_bytes:
                    raise ValueError('Preview output is missing or too large')
                metadata = _probe(output)
                if not any(s.get('codec_type') == 'video' for s in metadata.get('streams', [])):
                    raise ValueError('Preview has no video stream')
                if not any(s.get('codec_type') == 'audio' for s in metadata.get('streams', [])):
                    raise ValueError('Preview has no original narration stream')
                duration = _duration(metadata)
                if abs(duration - scene_plan.duration) > 0.12:
                    raise ValueError('Preview duration mismatch')
                for media_id, original in records.items():
                    latest = self.media.repository.get_for_guest(guest_id, media_id)
                    if not latest:
                        raise ValueError('Preview input was deleted during rendering')
                    _require_video(latest, media_id, guest_id, self.media.max_file_bytes)
                    if latest['content_sha256'] != original['content_sha256']:
                        raise ValueError('Preview input was replaced')
                if lease_lost.is_set():
                    raise PreviewJobFenceError('Worker lease lost')
                self.repository.reserve_storage(
                    guest_id=guest_id, job_id=job_id, worker_id=self.worker_id,
                    fence=fence, bytes_needed=output.stat().st_size,
                    limits=self.media.sessions.limits, now=datetime.now(UTC),
                )
                self.repository.renew(
                    guest_id=guest_id, job_id=job_id, worker_id=self.worker_id,
                    fence=fence, now=datetime.now(UTC),
                    lease_duration=self.lease, stage='uploading',
                )
                if lease_lost.is_set():
                    raise PreviewJobFenceError('Worker lease lost')
                generation = self.media.storage.upload_file_if_absent(
                    destination, output, content_type='video/mp4',
                    timeout_seconds=float(self.settings.editor_guest_upload_timeout_seconds),
                )
                uploaded = True
                if lease_lost.is_set():
                    raise PreviewJobFenceError('Worker lease lost')
                completed = self.repository.complete(
                    guest_id=guest_id, job_id=job_id, worker_id=self.worker_id,
                    fence=fence, now=datetime.now(UTC),
                    output={
                        'file_size': output.stat().st_size,
                        'duration_seconds': duration,
                        'width': scene_plan.width, 'height': scene_plan.height,
                        'sha256': _sha256(output),
                        'content_type': 'video/mp4',
                        'deferred_beat_ids': raw['deferred_beat_ids'],
                    },
                    object_path=destination,
                    now=datetime.now(UTC),
                )
                uploaded = False
                try:
                    self.media.sessions.finish_network_quota(
                        subject=completed.get('network_subject'),
                        reservation_id=completed['reservation_id'], commit=True,
                    )
                except Exception:
                    logger.exception('harshverse_network_quota_commit_failed', extra={'job_id': job_id})
        except Exception as exc:
            logger.exception('harshverse_job_failed', extra={'job_id': job_id, 'error': type(exc).__name__})
            cleanup_generation = None
            if uploaded:
                try:
                    self.media.storage.delete_generation(destination, generation)
                    uploaded = False
                except Exception:
                    cleanup_generation = generation or 'unknown'
                    logger.exception('harshverse_preview_cleanup_failed', extra={'job_id': job_id})
            try:
                transient = not isinstance(exc, (ValueError, PreviewJobFenceError))
                delay = timedelta(seconds=min(
                    self.settings.editor_export_worker_retry_max_seconds,
                    self.settings.editor_export_worker_retry_base_seconds *
                    2 ** max(0, int(job.get('attempt_count', 1)) - 1),
                ))
                status = self.repository.fail(
                    guest_id=guest_id, job_id=job_id,
                    worker_id=self.worker_id, fence=fence,
                    now=datetime.now(UTC),
                    error_code='preview_render_failed' if transient else 'preview_invalid_input',
                    transient=transient,
                    max_attempts=self.settings.editor_export_worker_max_attempts,
                    retry_delay=delay,
                    cleanup_generation=cleanup_generation,
                )
                if status not in {'queued', 'cleanup_pending'}:
                    try:
                        self.media.sessions.finish_network_quota(
                            subject=job.get('network_subject'),
                            reservation_id=job['reservation_id'], commit=False,
                        )
                    except Exception:
                        logger.exception('harshverse_network_quota_release_failed')
            except PreviewJobFenceError:
                logger.warning('harshverse_stale_worker_ignored', extra={'job_id': job_id})
        finally:
            heartbeat_stop.set()
            thread.join(timeout=2)

    def reconcile(self, limit: int = 8) -> int:
        processed = 0
        for guest_id, job_id, action in self.repository.recoverable_jobs(
            now=datetime.now(UTC),
            max_attempts=self.settings.editor_export_worker_max_attempts,
        ):
            if processed >= min(max(int(limit), 1), 32):
                break
            if action == 'cleanup':
                job = self.repository.get(guest_id, job_id)
                if not job:
                    continue
                dest = f'guest-editor/{guest_id}/harshverse-previews/{job_id}/preview.mp4'
                try:
                    generation = job.get('cleanup_generation')
                    if generation and generation != 'unknown':
                        self.media.storage.delete_generation(dest, generation)
                    else:
                        self.media.storage.delete(dest)
                    self.repository.finish_cleanup(guest_id=guest_id, job_id=job_id, now=datetime.now(UTC))
                    self.media.sessions.finish_network_quota(
                        subject=job.get('network_subject'),
                        reservation_id=job['reservation_id'], commit=False,
                    )
                except Exception:
                    logger.exception('harshverse_cleanup_retry_failed', extra={'job_id': job_id})
            elif action == 'expired':
                # Session reservation already released by the repository.
                job = self.repository.get(guest_id, job_id)
                if job:
                    try:
                        self.media.sessions.finish_network_quota(
                            subject=job.get('network_subject'),
                            reservation_id=job['reservation_id'], commit=False,
                        )
                    except Exception:
                        logger.exception('harshverse_network_release_failed')
            else:
                self.run_job(guest_id, job_id)
            processed += 1
        return processed


def build_harshverse_worker() -> GuestHarshVerseWorker:
    return GuestHarshVerseWorker(
        media=build_guest_media_service(),
        repository=GuestPreviewJobRepository(get_firestore_client()),
    )
