from __future__ import annotations

import os
import subprocess
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routers.editor_routes import (
    get_guest_export_service,
    get_guest_media_service,
    get_guest_session_service,
    router,
)
from app.core.config import Settings
from app.db.repositories.guest_export_repository import ExportFenceError, GuestExportRepository
from app.db.repositories.guest_media_repository import GuestMediaRepository
from app.db.repositories.guest_session_repository import GuestQuotaLimits, GuestSessionRepository
from app.providers.firebase import get_firestore_client
from app.providers.firebase_emulator import validate_firebase_emulator_environment
from app.services.guest_export_service import GuestExportService
from app.services.guest_export_worker import GuestExportWorker
from app.services.guest_media_service import GuestMediaService
from app.services.guest_media_storage import EmulatorGuestMediaStorage
from app.services.guest_media_storage import GuestMediaStorage
from app.services.guest_session_service import GuestSessionConfig, GuestSessionService
from app.services.guest_timeline_service import GuestTimelineService
from app.services.timeline_render_service import TimelineRenderLimits, TimelineRenderService


pytestmark = pytest.mark.skipif(
    os.environ.get('RUN_FIREBASE_EMULATOR_TESTS') != '1',
    reason='Guest export tests require guarded Firebase emulators.',
)
ORIGIN = 'http://localhost:3000'
MUTATING = {'Origin': ORIGIN, 'X-RangManch-Editor-CSRF': '1'}


def _clear(client, storage) -> None:
    for session in client.collection('editor_guest_sessions').stream():
        for name in ('media', 'reservations', 'exports'):
            for item in session.reference.collection(name).stream():
                data = item.to_dict() or {}
                object_name = data.get('storage_object_path') or data.get('cleanup_object_path')
                if object_name:
                    try:
                        storage.delete(object_name)
                    except Exception:
                        pass
                item.reference.delete()
        session.reference.delete()
    for row in client.collection('editor_guest_rate_limits').stream():
        row.reference.delete()


@pytest.fixture()
def export_environment(tmp_path: Path):
    validate_firebase_emulator_environment()
    firestore = get_firestore_client()
    storage = EmulatorGuestMediaStorage(timeout_seconds=30)
    _clear(firestore, storage)
    config = GuestSessionConfig(
        cookie_name='rangmanch_export_test', cookie_secure=False, cookie_samesite='lax',
        lifetime=timedelta(hours=24), csrf_header='X-RangManch-Editor-CSRF', csrf_value='1',
        allowed_origins=frozenset({ORIGIN}),
        limits=GuestQuotaLimits(
            uploads=5, exports=3, uploaded_bytes=8 * 1024 * 1024,
            storage_bytes=16 * 1024 * 1024, processing_seconds=60, concurrent_processing=1,
        ),
        creation_rate_limit=20, creation_rate_window=timedelta(hours=1),
        reservation_lease=timedelta(minutes=2), rate_limit_secret=b'export-tests-secret-at-least-32-bytes',
    )
    sessions = GuestSessionService(repository=GuestSessionRepository(firestore), config=config)
    settings = Settings(
        _env_file=None, env='development', allowed_origins=ORIGIN,
        firebase_project_id='demo-rangmanch-editor',
        firebase_storage_bucket='demo-rangmanch-editor.appspot.com',
        editor_guest_max_file_bytes=2 * 1024 * 1024,
        editor_guest_max_video_duration_seconds=10,
        editor_guest_max_image_pixels=2_000_000,
        editor_guest_upload_timeout_seconds=30,
        editor_export_worker_lease_seconds=10,
        editor_export_worker_poll_seconds=0.05,
        editor_export_worker_retry_base_seconds=1,
    )
    media = GuestMediaService(
        settings=settings, sessions=sessions,
        repository=GuestMediaRepository(firestore), storage=storage,
    )
    renderer = TimelineRenderService(limits=TimelineRenderLimits(
        max_clips=4, max_total_duration_seconds=5, max_source_bytes=4 * 1024 * 1024,
        max_workspace_bytes=32 * 1024 * 1024, max_output_bytes=8 * 1024 * 1024,
        max_source_pixels=2_000_000, max_output_width=180, max_output_height=320,
        max_fps=10, ffmpeg_timeout_seconds=30, max_concurrent_renders=1,
    ))
    timeline = GuestTimelineService(media_service=media, renderer=renderer)
    repository = GuestExportRepository(firestore)
    exports = GuestExportService(
        settings=settings, sessions=sessions, timeline=timeline,
        repository=repository, storage=storage,
    )
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_guest_session_service] = lambda: sessions
    app.dependency_overrides[get_guest_media_service] = lambda: media
    app.dependency_overrides[get_guest_export_service] = lambda: exports
    with TestClient(app) as client:
        yield client, sessions, media, exports, repository, timeline, storage, settings, firestore, tmp_path
    _clear(firestore, storage)


def _image(path: Path) -> bytes:
    subprocess.run(
        ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi',
         '-i', 'color=c=red:s=80x120', '-frames:v', '1', str(path)],
        check=True, capture_output=True,
    )
    return path.read_bytes()


def _create_and_upload(client: TestClient, tmp_path: Path) -> str:
    assert client.post('/api/editor/guest/session', headers=MUTATING).status_code == 200
    response = client.post(
        '/api/editor/media/upload',
        headers={**MUTATING, 'Idempotency-Key': f'upload-{uuid4().hex}'},
        files={'file': ('source.png', _image(tmp_path / f'{uuid4().hex}.png'), 'image/png')},
    )
    assert response.status_code == 201
    return response.json()['media_id']


def _timeline(media_id: str, duration: float = 0.4) -> dict:
    return {
        'aspect_ratio': '9:16', 'width': 180, 'height': 320, 'fps': 10,
        'clips': [{'media_id': media_id, 'order': 0, 'start_seconds': 0.0,
                   'duration_seconds': duration, 'crop_mode': 'cover'}],
    }


def test_submit_is_durable_idempotent_and_worker_completes_after_reconnect(export_environment) -> None:
    client, sessions, _, exports, repository, timeline, storage, settings, _, tmp_path = export_environment
    media_id = _create_and_upload(client, tmp_path)
    headers = {**MUTATING, 'Idempotency-Key': 'export-idempotency-one'}
    submitted = client.post('/api/editor/exports', headers=headers, json=_timeline(media_id))
    assert submitted.status_code == 202
    assert submitted.json()['status'] == 'queued'
    repeated = client.post('/api/editor/exports', headers=headers, json=_timeline(media_id))
    assert repeated.status_code == 202
    assert repeated.json()['job_id'] == submitted.json()['job_id']
    assert client.get('/api/editor/guest/usage').json()['reserved']['exports'] == 1

    worker = GuestExportWorker(
        settings=settings, repository=repository, timeline=timeline,
        storage=storage, worker_id='test-worker',
    )
    assert worker.run_once() is True

    token = client.cookies.get(sessions.config.cookie_name)
    with TestClient(client.app) as reopened:
        reopened.cookies.set(sessions.config.cookie_name, token)
        status = reopened.get(submitted.json()['status_url'])
        assert status.status_code == 200
        assert status.json()['status'] == 'completed'
        ranged = reopened.get(
            f"/api/editor/exports/{submitted.json()['job_id']}/content",
            headers={'Range': 'bytes=0-31'},
        )
        assert ranged.status_code == 206
        assert len(ranged.content) == 32
        assert ranged.headers['content-type'].startswith('video/mp4')
        assert ranged.headers['cache-control'] == 'private,no-store,max-age=0'
    usage = sessions.usage(token)
    assert usage['used']['exports'] == 1
    assert usage['used']['processing_seconds'] == pytest.approx(0.4, abs=0.2)
    assert usage['reserved']['concurrent_processing'] == 0


def test_conflicting_idempotency_and_cross_guest_access(export_environment) -> None:
    client, sessions, _, _, _, _, _, _, _, tmp_path = export_environment
    media_id = _create_and_upload(client, tmp_path)
    headers = {**MUTATING, 'Idempotency-Key': 'export-conflict-key'}
    first = client.post('/api/editor/exports', headers=headers, json=_timeline(media_id, 0.4))
    conflict = client.post('/api/editor/exports', headers=headers, json=_timeline(media_id, 0.5))
    assert first.status_code == 202
    assert conflict.status_code == 409

    client.cookies.clear()
    assert client.post('/api/editor/guest/session', headers=MUTATING).status_code == 200
    assert client.get(first.json()['status_url']).status_code == 404
    assert client.get(f"{first.json()['status_url']}/content").status_code == 404


def test_worker_lease_recovery_and_stale_fencing(export_environment) -> None:
    client, _, _, _, repository, _, _, _, _, tmp_path = export_environment
    media_id = _create_and_upload(client, tmp_path)
    response = client.post(
        '/api/editor/exports',
        headers={**MUTATING, 'Idempotency-Key': 'lease-recovery-key'},
        json=_timeline(media_id),
    )
    job_id = response.json()['job_id']
    guest_id = response.json()['status_url'] and client.get('/api/editor/guest/session').json()['guest_id']
    now = datetime.now(UTC)
    first = repository.claim_next(
        worker_id='worker-a', fence_token='fence-a', now=now,
        lease_duration=timedelta(seconds=1),
    )
    assert first and first['job_id'] == job_id
    assert repository.claim_next(
        worker_id='worker-b', fence_token='fence-b', now=now,
        lease_duration=timedelta(seconds=1),
    ) is None
    recovered = repository.claim_next(
        worker_id='worker-b', fence_token='fence-b', now=now + timedelta(seconds=2),
        lease_duration=timedelta(seconds=10),
    )
    assert recovered and recovered['attempt_count'] == 2
    with pytest.raises(ExportFenceError):
        repository.renew(
            guest_id=guest_id, job_id=job_id, worker_id='worker-a', fence_token='fence-a',
            now=now + timedelta(seconds=2), lease_duration=timedelta(seconds=10), stage='stale',
        )


def test_expired_queued_job_releases_quota(export_environment) -> None:
    client, sessions, _, _, repository, timeline, storage, settings, firestore, tmp_path = export_environment
    media_id = _create_and_upload(client, tmp_path)
    submitted = client.post(
        '/api/editor/exports',
        headers={**MUTATING, 'Idempotency-Key': 'expired-queued-key'},
        json=_timeline(media_id),
    ).json()
    guest_id = client.get('/api/editor/guest/session').json()['guest_id']
    firestore.collection('editor_guest_sessions').document(guest_id).update(
        {'expires_at': datetime.now(UTC) - timedelta(seconds=1)}
    )
    worker = GuestExportWorker(
        settings=settings, repository=repository, timeline=timeline,
        storage=storage, worker_id='expiry-worker',
    )

    assert worker.run_once() is False
    job = repository.get(guest_id, submitted['job_id'])
    assert job and job['status'] == 'expired'
    session = sessions.repository.get(guest_id)
    assert session['reserved_exports_count'] == 0
    assert session['active_processing'] == 0


def test_permanent_storage_failure_releases_export_reservation(export_environment) -> None:
    client, sessions, _, _, repository, timeline, storage, settings, _, tmp_path = export_environment
    media_id = _create_and_upload(client, tmp_path)
    submitted = client.post(
        '/api/editor/exports',
        headers={**MUTATING, 'Idempotency-Key': 'storage-failure-key'},
        json=_timeline(media_id),
    ).json()

    class FailingOutputStorage(GuestMediaStorage):
        def upload_file(self, object_name, path, *, content_type, timeout_seconds):
            raise AssertionError

        def upload_file_if_absent(self, object_name, path, *, content_type, timeout_seconds):
            raise OSError('simulated output upload failure')

        def read_range(self, object_name, *, start, end):
            return storage.read_range(object_name, start=start, end=end)

        def delete(self, object_name):
            storage.delete(object_name)

    one_attempt = settings.model_copy(update={'editor_export_worker_max_attempts': 1})
    worker = GuestExportWorker(
        settings=one_attempt, repository=repository, timeline=timeline,
        storage=FailingOutputStorage(), worker_id='failure-worker',
    )
    assert worker.run_once() is True

    guest_id = client.get('/api/editor/guest/session').json()['guest_id']
    job = repository.get(guest_id, submitted['job_id'])
    assert job and job['status'] == 'failed'
    token = client.cookies.get(sessions.config.cookie_name)
    usage = sessions.usage(token)
    assert usage['used']['exports'] == 0
    assert usage['reserved']['exports'] == 0
    assert usage['reserved']['concurrent_processing'] == 0


def test_cleanup_pending_retains_storage_accounting_until_retry_succeeds(export_environment) -> None:
    client, sessions, _, _, repository, timeline, storage, settings, _, tmp_path = export_environment
    media_id = _create_and_upload(client, tmp_path)
    submitted = client.post(
        '/api/editor/exports',
        headers={**MUTATING, 'Idempotency-Key': 'cleanup-accounting-key'},
        json=_timeline(media_id),
    ).json()
    guest_id = client.get('/api/editor/guest/session').json()['guest_id']
    now = datetime.now(UTC)
    claimed = repository.claim_next(
        worker_id='cleanup-owner', fence_token='cleanup-fence', now=now,
        lease_duration=timedelta(seconds=30),
    )
    assert claimed
    repository.reserve_storage(
        guest_id=guest_id, job_id=submitted['job_id'], worker_id='cleanup-owner',
        fence_token='cleanup-fence', output_bytes=1234, limits=sessions.config.limits, now=now,
    )
    repository.fail_or_retry(
        guest_id=guest_id, job_id=submitted['job_id'], worker_id='cleanup-owner',
        fence_token='cleanup-fence', error_code='output_cleanup_failed', transient=False,
        max_attempts=1, retry_delay=timedelta(seconds=1), now=now,
        cleanup_object_path=f'guest-editor/{guest_id}/outputs/{submitted["job_id"]}/final.mp4',
    )
    session = sessions.repository.get(guest_id)
    assert session['reserved_storage_bytes'] == 1234
    assert session['reserved_exports_count'] == 0

    worker = GuestExportWorker(
        settings=settings, repository=repository, timeline=timeline,
        storage=storage, worker_id='cleanup-worker',
    )
    assert worker.run_once() is True
    session = sessions.repository.get(guest_id)
    assert session['reserved_storage_bytes'] == 0
    assert repository.get(guest_id, submitted['job_id'])['status'] == 'failed'


def test_stale_generation_cleanup_cannot_delete_replacement_output(export_environment) -> None:
    _, _, _, _, _, _, storage, _, _, tmp_path = export_environment
    object_name = f'guest-editor/test/outputs/{uuid4().hex}/final.mp4'
    first = tmp_path / 'first.mp4'
    second = tmp_path / 'second.mp4'
    first.write_bytes(b'first-attempt')
    second.write_bytes(b'replacement-attempt')

    first_generation = storage.upload_file_if_absent(
        object_name, first, content_type='video/mp4', timeout_seconds=10,
    )
    storage.delete_generation(object_name, first_generation)
    storage.upload_file_if_absent(
        object_name, second, content_type='video/mp4', timeout_seconds=10,
    )

    storage.delete_generation(object_name, first_generation)
    assert storage.read_range(object_name, start=0, end=18) == b'replacement-attempt'
