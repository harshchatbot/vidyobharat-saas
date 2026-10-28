from __future__ import annotations

import io
import hashlib
import os
import subprocess
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

import pytest
import httpx
from fastapi import FastAPI, UploadFile
from fastapi.testclient import TestClient
from starlette.requests import Request

from app.api.routers.editor_routes import (
    get_guest_media_service,
    get_guest_session_service,
    router,
)
from app.core.config import Settings
from app.db.repositories.guest_media_repository import GuestMediaRepository
from app.db.repositories.guest_session_repository import GuestQuotaLimits, GuestSessionRepository
from app.db.repositories.guest_session_repository import GuestQuotaReservation
from app.providers.firebase import get_firestore_client
from app.providers.firebase_emulator import validate_firebase_emulator_environment
from app.services.guest_media_service import GuestMediaService
from app.services.guest_media_storage import EmulatorGuestMediaStorage, GuestMediaStorage
from app.services.guest_session_errors import GuestSessionError, media_error
from app.services.guest_session_service import GuestSessionConfig, GuestSessionService


pytestmark = pytest.mark.skipif(
    os.environ.get('RUN_FIREBASE_EMULATOR_TESTS') != '1',
    reason='Guest media tests require the guarded Firebase emulators.',
)
ORIGIN = 'http://localhost:3000'
MUTATING_HEADERS = {'Origin': ORIGIN, 'X-RangManch-Editor-CSRF': '1'}


def _delete_guest_data(client) -> None:
    for session in client.collection('editor_guest_sessions').stream():
        for media in session.reference.collection('media').stream():
            media.reference.delete()
        for reservation in session.reference.collection('reservations').stream():
            reservation.reference.delete()
        session.reference.delete()
    for row in client.collection('editor_guest_rate_limits').stream():
        row.reference.delete()


@pytest.fixture()
def media_environment(tmp_path: Path):
    validate_firebase_emulator_environment()
    firestore = get_firestore_client()
    _delete_guest_data(firestore)
    session_config = GuestSessionConfig(
        cookie_name='rangmanch_guest_media_test',
        cookie_secure=False,
        cookie_samesite='lax',
        lifetime=timedelta(hours=24),
        csrf_header='X-RangManch-Editor-CSRF',
        csrf_value='1',
        allowed_origins=frozenset({ORIGIN}),
        limits=GuestQuotaLimits(
            uploads=2,
            exports=2,
            uploaded_bytes=4 * 1024 * 1024,
            storage_bytes=4 * 1024 * 1024,
            processing_seconds=60,
            concurrent_processing=1,
        ),
        creation_rate_limit=20,
        creation_rate_window=timedelta(hours=1),
        reservation_lease=timedelta(minutes=2),
        rate_limit_secret=b'test-media-rate-limit-secret-at-least-32-bytes',
    )
    sessions = GuestSessionService(
        repository=GuestSessionRepository(firestore),
        config=session_config,
    )
    settings = Settings(
        _env_file=None,
        env='development',
        firebase_project_id='demo-rangmanch-editor',
        firebase_storage_bucket='demo-rangmanch-editor.appspot.com',
        allowed_origins=ORIGIN,
        editor_guest_max_file_bytes=1024 * 1024,
        editor_guest_max_video_duration_seconds=10,
        editor_guest_max_image_pixels=2_000_000,
        editor_guest_upload_timeout_seconds=30,
    )
    storage = EmulatorGuestMediaStorage(timeout_seconds=30)
    media = GuestMediaService(
        settings=settings,
        sessions=sessions,
        repository=GuestMediaRepository(firestore),
        storage=storage,
    )
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_guest_session_service] = lambda: sessions
    app.dependency_overrides[get_guest_media_service] = lambda: media
    with TestClient(app) as client:
        yield client, sessions, media, firestore, tmp_path

    for session in firestore.collection('editor_guest_sessions').stream():
        for item in session.reference.collection('media').stream():
            data = item.to_dict() or {}
            object_name = data.get('storage_object_path')
            if object_name:
                try:
                    storage.delete(object_name)
                except Exception:
                    pass
    _delete_guest_data(firestore)


def _create_session(client: TestClient) -> dict:
    response = client.post('/api/editor/guest/session', headers=MUTATING_HEADERS)
    assert response.status_code == 200
    return response.json()


def _make_image(path: Path) -> bytes:
    subprocess.run(
        [
            'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
            '-f', 'lavfi', '-i', 'color=c=red:s=64x48',
            '-frames:v', '1', str(path),
        ],
        check=True,
    )
    return path.read_bytes()


def _make_video(path: Path) -> bytes:
    subprocess.run(
        [
            'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
            '-f', 'lavfi', '-i', 'testsrc=size=96x64:rate=12:duration=1',
            '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', str(path),
        ],
        check=True,
    )
    return path.read_bytes()


def _make_audio(path: Path) -> bytes:
    subprocess.run(
        [
            'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
            '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
            '-c:a', 'libmp3lame', str(path),
        ],
        check=True,
    )
    return path.read_bytes()


def _upload(
    client: TestClient,
    content: bytes,
    filename: str,
    content_type: str,
    *,
    idempotency_key: str | None = None,
):
    headers = dict(MUTATING_HEADERS)
    headers['Idempotency-Key'] = idempotency_key or f'test-upload-{uuid4().hex}'
    return client.post(
        '/api/editor/media/upload',
        headers=headers,
        files={'file': (filename, content, content_type)},
    )


def test_successful_image_upload_metadata_and_private_content(media_environment) -> None:
    client, sessions, media, _, tmp_path = media_environment
    _create_session(client)
    content = _make_image(tmp_path / 'sample.jpg')

    response = _upload(client, content, '../../unsafe\nname.jpg', 'image/jpeg')

    assert response.status_code == 201
    body = response.json()
    assert body['media_type'] == 'image'
    assert body['content_type'] == 'image/jpeg'
    assert body['width'] == 64
    assert body['height'] == 48
    assert body['original_filename'] == 'unsafename.jpg'
    assert 'storage_object_path' not in body
    assert 'guest_id' not in body
    listed = client.get('/api/editor/media').json()['items']
    assert [item['media_id'] for item in listed] == [body['media_id']]
    assert client.get(f"/api/editor/media/{body['media_id']}").json() == body

    downloaded = client.get(f"/api/editor/media/{body['media_id']}/content")
    assert downloaded.status_code == 200
    assert downloaded.content == content
    assert downloaded.headers['cache-control'] == 'private,no-store,max-age=0'
    assert downloaded.headers['accept-ranges'] == 'bytes'

    token = client.cookies.get(sessions.config.cookie_name)
    stored = media.get_media(token, body['media_id'])
    direct = httpx.get(
        media.storage.client._object_url(stored['storage_object_path']),
        params={'alt': 'media'},
        timeout=5,
    )
    assert direct.status_code in {401, 403}
    usage = sessions.usage(token)
    assert usage['used']['uploads'] == 1
    assert usage['used']['uploaded_bytes'] == len(content)
    assert usage['reserved']['concurrent_processing'] == 0


def test_successful_video_upload_and_range_preview(media_environment) -> None:
    client, _, _, _, tmp_path = media_environment
    _create_session(client)
    content = _make_video(tmp_path / 'sample.mp4')

    response = _upload(client, content, 'sample.mp4', 'video/mp4')

    assert response.status_code == 201
    body = response.json()
    assert body['media_type'] == 'video'
    assert body['duration_seconds'] == pytest.approx(1.0, abs=0.1)
    ranged = client.get(
        f"/api/editor/media/{body['media_id']}/content",
        headers={'Range': 'bytes=0-31'},
    )
    assert ranged.status_code == 206
    assert ranged.content == content[:32]
    assert ranged.headers['content-range'] == f'bytes 0-31/{len(content)}'


def test_successful_audio_upload_is_probed_and_private(media_environment) -> None:
    client, _, _, _, tmp_path = media_environment
    _create_session(client)
    content = _make_audio(tmp_path / 'music.mp3')

    response = _upload(client, content, 'music.mp3', 'audio/mpeg')

    assert response.status_code == 201
    body = response.json()
    assert body['media_type'] == 'audio'
    assert body['content_type'] == 'audio/mpeg'
    assert body['duration_seconds'] == pytest.approx(1.0, abs=0.1)
    assert body['width'] == 0
    assert body['height'] == 0
    downloaded = client.get(f"/api/editor/media/{body['media_id']}/content")
    assert downloaded.status_code == 200
    assert downloaded.content == content


def test_audio_mime_spoofing_is_rejected(media_environment, tmp_path: Path) -> None:
    client, _, _, _, _ = media_environment
    _create_session(client)
    content = _make_audio(tmp_path / 'spoofed.mp3')
    response = _upload(client, content, 'spoofed.mp4', 'video/mp4')
    assert response.status_code == 415
    assert response.json()['error'] == 'guest_media_type_mismatch'


@pytest.mark.parametrize(
    ('content', 'filename', 'content_type', 'expected_status', 'expected_error'),
    [
        (b'', 'empty.jpg', 'image/jpeg', 422, 'guest_media_empty'),
        (b'not-media', 'fake.jpg', 'image/jpeg', 415, 'guest_media_unsupported'),
    ],
)
def test_empty_and_invalid_media_rejected(
    media_environment,
    content: bytes,
    filename: str,
    content_type: str,
    expected_status: int,
    expected_error: str,
) -> None:
    client, _, _, _, _ = media_environment
    _create_session(client)
    response = _upload(client, content, filename, content_type)
    assert response.status_code == expected_status
    assert response.json()['error'] == expected_error
    assert client.get('/api/editor/guest/usage').json()['used']['uploads'] == 0


def test_oversized_upload_and_mime_spoofing_are_rejected(media_environment) -> None:
    client, _, media, _, tmp_path = media_environment
    _create_session(client)
    media._max_file_bytes = 8
    oversized = _upload(client, b'123456789', 'large.jpg', 'image/jpeg')
    assert oversized.status_code == 413
    assert oversized.json()['error'] == 'guest_media_too_large'

    media._max_file_bytes = 1024 * 1024
    image = _make_image(tmp_path / 'spoof.jpg')
    spoofed = _upload(client, image, 'spoof.mp4', 'video/mp4')
    assert spoofed.status_code == 415
    assert spoofed.json()['error'] == 'guest_media_type_mismatch'

    wrong_image_type = _upload(client, image, 'spoof.png', 'image/png')
    assert wrong_image_type.status_code == 415
    assert wrong_image_type.json()['error'] == 'guest_media_type_mismatch'


def test_cross_guest_isolation_and_expired_session(media_environment) -> None:
    client, sessions, _, _, tmp_path = media_environment
    first = _create_session(client)
    uploaded = _upload(client, _make_image(tmp_path / 'owned.png'), 'owned.png', 'image/png').json()

    client.cookies.clear()
    _create_session(client)
    assert client.get(f"/api/editor/media/{uploaded['media_id']}").status_code == 404
    assert client.get(f"/api/editor/media/{uploaded['media_id']}/content").status_code == 404

    second_token = client.cookies.get(sessions.config.cookie_name)
    second = sessions.get_session(second_token)
    sessions.repository.sessions.document(second['guest_id']).update(
        {'expires_at': datetime.now(UTC) - timedelta(seconds=1)}
    )
    expired = _upload(client, _make_image(tmp_path / 'expired.jpg'), 'expired.jpg', 'image/jpeg')
    assert expired.status_code == 401
    assert expired.json()['error'] == 'guest_session_expired'
    assert first['guest_id'] != second['guest_id']


def test_failed_storage_upload_rolls_back_quota_and_tempfile(media_environment, monkeypatch) -> None:
    client, sessions, media, _, tmp_path = media_environment
    _create_session(client)
    image = _make_image(tmp_path / 'failure.jpg')
    temporary_directories: list[Path] = []
    real_temporary_directory = tempfile.TemporaryDirectory

    class TrackingTemporaryDirectory(real_temporary_directory):
        def __enter__(self):
            result = super().__enter__()
            temporary_directories.append(Path(result))
            return result

    class FailingStorage(GuestMediaStorage):
        def upload_file(self, object_name, path, *, content_type, timeout_seconds):
            raise OSError('simulated storage failure')

        def read_range(self, object_name, *, start, end):
            raise AssertionError

        def delete(self, object_name):
            raise AssertionError

    monkeypatch.setattr('app.services.guest_media_service.tempfile.TemporaryDirectory', TrackingTemporaryDirectory)
    media.storage = FailingStorage()
    response = _upload(client, image, 'failure.jpg', 'image/jpeg')

    assert response.status_code == 503
    assert response.json()['error'] == 'guest_media_storage_failed'
    token = client.cookies.get(sessions.config.cookie_name)
    usage = sessions.usage(token)
    assert usage['used']['uploads'] == 0
    assert usage['reserved']['uploads'] == 0
    assert all(not path.exists() for path in temporary_directories)


def test_upload_reservation_lease_is_bounded_and_committed(media_environment) -> None:
    client, sessions, _, firestore, tmp_path = media_environment
    created = _create_session(client)
    response = _upload(client, _make_image(tmp_path / 'lease.jpg'), 'lease.jpg', 'image/jpeg')
    assert response.status_code == 201
    reservations = list(
        firestore.collection('editor_guest_sessions')
        .document(created['guest_id'])
        .collection('reservations')
        .stream()
    )
    assert len(reservations) == 1
    reservation = reservations[0].to_dict()
    assert reservation['status'] == 'committed'
    assert reservation['lease_expires_at'] > reservation['created_at']
    assert sessions.config.reservation_lease.total_seconds() > 30


def test_completed_upload_retry_is_idempotent(media_environment) -> None:
    client, sessions, _, _, tmp_path = media_environment
    _create_session(client)
    content = _make_image(tmp_path / 'retry.jpg')

    first = _upload(
        client,
        content,
        'retry.jpg',
        'image/jpeg',
        idempotency_key='retry-request-0001',
    )
    second = _upload(
        client,
        content,
        'retry.jpg',
        'image/jpeg',
        idempotency_key='retry-request-0001',
    )

    assert first.status_code == 201
    assert second.status_code == 201
    assert second.json()['media_id'] == first.json()['media_id']
    token = client.cookies.get(sessions.config.cookie_name)
    assert sessions.usage(token)['used']['uploads'] == 1


def test_idempotency_key_rejects_conflicting_content_without_charging(media_environment) -> None:
    client, sessions, _, _, tmp_path = media_environment
    _create_session(client)
    first_content = _make_image(tmp_path / 'first.jpg')
    second_content = _make_image(tmp_path / 'second.png')
    key = 'conflicting-request-0001'

    first = _upload(client, first_content, 'first.jpg', 'image/jpeg', idempotency_key=key)
    conflict = _upload(client, second_content, 'second.png', 'image/png', idempotency_key=key)

    assert first.status_code == 201
    assert conflict.status_code == 409
    assert conflict.json()['error'] == 'guest_idempotency_conflict'
    token = client.cookies.get(sessions.config.cookie_name)
    usage = sessions.usage(token)
    assert usage['used']['uploads'] == 1
    assert usage['used']['uploaded_bytes'] == len(first_content)
    assert usage['used']['storage_bytes'] == len(first_content)
    content = client.get(f"/api/editor/media/{first.json()['media_id']}/content")
    assert content.content == first_content


def test_upload_requires_idempotency_key(media_environment) -> None:
    client, _, _, _, tmp_path = media_environment
    _create_session(client)
    response = client.post(
        '/api/editor/media/upload',
        headers=MUTATING_HEADERS,
        files={'file': ('missing-key.jpg', _make_image(tmp_path / 'missing-key.jpg'), 'image/jpeg')},
    )
    assert response.status_code == 400
    assert response.json()['error'] == 'guest_idempotency_key_required'


def test_concurrent_uploads_cannot_exceed_guest_count_quota(media_environment) -> None:
    client, sessions, media, _, tmp_path = media_environment
    _create_session(client)
    token = client.cookies.get(sessions.config.cookie_name)
    content = _make_image(tmp_path / 'concurrent.jpg')

    def upload_one(index: int) -> str:
        request = Request(
            {
                'type': 'http',
                'method': 'POST',
                'path': '/api/editor/media/upload',
                'headers': [(key.lower().encode(), value.encode()) for key, value in MUTATING_HEADERS.items()],
                'client': ('198.51.100.10', 12345),
            }
        )
        upload = UploadFile(
            filename=f'concurrent-{index}.jpg',
            file=io.BytesIO(content),
            headers={'content-type': 'image/jpeg'},
        )
        try:
            media.upload(request, token, upload, f'concurrent-upload-{index:04d}')
            return 'created'
        except Exception as exc:
            return getattr(exc, 'error', type(exc).__name__)

    with ThreadPoolExecutor(max_workers=4) as executor:
        outcomes = list(executor.map(upload_one, range(4)))

    assert outcomes.count('created') == 1
    assert all(outcome in {'created', 'guest_quota_exceeded', 'guest_quota_busy'} for outcome in outcomes)
    usage = sessions.usage(token)
    assert usage['used']['uploads'] == 1
    assert usage['reserved']['uploads'] == 0


def test_dimension_limit_is_checked_before_decoder_runs(media_environment, monkeypatch) -> None:
    _, _, media, _, tmp_path = media_environment
    image_path = tmp_path / 'dimension.jpg'
    _make_image(image_path)
    monkeypatch.setattr(
        media,
        '_probe',
        lambda path, deadline: {
            'streams': [{'codec_type': 'video', 'codec_name': 'mjpeg', 'width': 5000, 'height': 5000}],
            'format': {},
        },
    )
    monkeypatch.setattr(
        media,
        '_decode_first_frame',
        lambda path, deadline: pytest.fail('decoder must not run for oversized dimensions'),
    )

    with pytest.raises(GuestSessionError) as rejected:
        media._validate_media(image_path, 'image/jpeg', time.monotonic() + 5)
    assert rejected.value.error == 'guest_image_too_large'


def test_duration_limit_is_checked_before_decoder_runs(media_environment, monkeypatch) -> None:
    _, _, media, _, tmp_path = media_environment
    video_path = tmp_path / 'duration.mp4'
    _make_video(video_path)
    monkeypatch.setattr(
        media,
        '_probe',
        lambda path, deadline: {
            'streams': [{'codec_type': 'video', 'codec_name': 'h264', 'width': 96, 'height': 64, 'duration': '999'}],
            'format': {'duration': '999'},
        },
    )
    monkeypatch.setattr(
        media,
        '_decode_first_frame',
        lambda path, deadline: pytest.fail('decoder must not run for excessive duration'),
    )

    with pytest.raises(GuestSessionError) as rejected:
        media._validate_media(video_path, 'video/mp4', time.monotonic() + 5)
    assert rejected.value.error == 'guest_video_too_long'


def test_failed_object_cleanup_is_recorded_and_retried(media_environment, monkeypatch) -> None:
    client, sessions, media, firestore, tmp_path = media_environment
    created = _create_session(client)
    content = _make_image(tmp_path / 'cleanup.jpg')
    key = 'cleanup-retry-request'
    real_storage = media.storage

    class DeleteFailingStorage(GuestMediaStorage):
        fail_delete = True

        def upload_file(self, object_name, path, *, content_type, timeout_seconds):
            return real_storage.upload_file(
                object_name,
                path,
                content_type=content_type,
                timeout_seconds=timeout_seconds,
            )

        def read_range(self, object_name, *, start, end):
            return real_storage.read_range(object_name, start=start, end=end)

        def delete(self, object_name):
            if self.fail_delete:
                raise OSError('simulated cleanup failure')
            return real_storage.delete(object_name)

    failing_storage = DeleteFailingStorage()
    media.storage = failing_storage
    original_commit = media.repository.commit_upload
    monkeypatch.setattr(
        media.repository,
        'commit_upload',
        lambda **kwargs: (_ for _ in ()).throw(
            media_error('guest_media_commit_failed', 'Simulated commit failure.', status_code=503, recoverable=True)
        ),
    )

    failed = _upload(client, content, 'cleanup.jpg', 'image/jpeg', idempotency_key=key)
    assert failed.status_code == 503
    media_rows = list(
        firestore.collection('editor_guest_sessions')
        .document(created['guest_id'])
        .collection('media')
        .stream()
    )
    assert len(media_rows) == 1
    assert media_rows[0].to_dict()['status'] == 'cleanup_pending'
    token = client.cookies.get(sessions.config.cookie_name)
    assert sessions.usage(token)['used']['storage_bytes'] == len(content)

    monkeypatch.setattr(media.repository, 'commit_upload', original_commit)
    failing_storage.fail_delete = False
    retried = _upload(client, content, 'cleanup.jpg', 'image/jpeg', idempotency_key=key)
    assert retried.status_code == 201
    usage = sessions.usage(token)
    assert usage['used']['uploads'] == 1
    assert usage['used']['uploaded_bytes'] == len(content)
    assert usage['used']['storage_bytes'] == len(content)


def test_missing_storage_object_fails_before_streaming_success(media_environment) -> None:
    client, sessions, media, _, tmp_path = media_environment
    _create_session(client)
    uploaded = _upload(client, _make_image(tmp_path / 'missing.jpg'), 'missing.jpg', 'image/jpeg').json()
    token = client.cookies.get(sessions.config.cookie_name)
    stored = media.get_media(token, uploaded['media_id'])
    media.storage.delete(stored['storage_object_path'])

    response = client.get(f"/api/editor/media/{uploaded['media_id']}/content")
    assert response.status_code == 503
    assert response.json()['error'] == 'guest_media_storage_unavailable'


def test_malformed_range_is_rejected_without_storage_read(media_environment) -> None:
    client, _, _, _, tmp_path = media_environment
    _create_session(client)
    uploaded = _upload(client, _make_video(tmp_path / 'range.mp4'), 'range.mp4', 'video/mp4').json()
    response = client.get(
        f"/api/editor/media/{uploaded['media_id']}/content",
        headers={'Range': 'bytes=' + '9' * 200 + '-'},
    )
    assert response.status_code == 416
    assert response.json()['error'] == 'guest_media_range_invalid'


def test_stale_crashed_upload_is_cleaned_before_new_quota_reservation(media_environment) -> None:
    client, sessions, media, _, tmp_path = media_environment
    created = _create_session(client)
    token = client.cookies.get(sessions.config.cookie_name)
    content = _make_image(tmp_path / 'crashed.jpg')
    media_id = 'a' * 32
    reservation_id = 'upload-crashed-request'
    object_name = media._object_name(created['guest_id'], media_id)
    sessions.reserve_quota(
        raw_token=token,
        reservation_id=reservation_id,
        reservation=GuestQuotaReservation(uploads=1, concurrent_processing=1),
    )
    assert media.repository.claim_upload(
        guest_id=created['guest_id'],
        media_id=media_id,
        reservation_id=reservation_id,
        content_sha256=hashlib.sha256(content).hexdigest(),
        storage_object_path=object_name,
        expires_at=datetime.now(UTC) + timedelta(hours=24),
        now=datetime.now(UTC),
    )
    sessions.increase_quota_reservation(
        raw_token=token,
        reservation_id=reservation_id,
        additional=GuestQuotaReservation(uploaded_bytes=len(content), storage_bytes=len(content)),
    )
    source = tmp_path / 'crashed-source.jpg'
    source.write_bytes(content)
    media.storage.upload_file(
        object_name,
        source,
        content_type='image/jpeg',
        timeout_seconds=5,
    )
    sessions.repository.sessions.document(created['guest_id']).collection('reservations').document(
        reservation_id
    ).update({'lease_expires_at': datetime.now(UTC) - timedelta(seconds=1)})

    replacement = _upload(client, content, 'replacement.jpg', 'image/jpeg')

    assert replacement.status_code == 201
    old_reservation = media.repository.get_reservation(
        guest_id=created['guest_id'],
        reservation_id=reservation_id,
    )
    assert old_reservation['status'] == 'released'
    assert media.repository.get_for_guest(created['guest_id'], media_id) is None
    usage = sessions.usage(token)
    assert usage['used']['uploads'] == 1
    assert usage['used']['storage_bytes'] == len(content)
    assert usage['reserved']['storage_bytes'] == 0


def test_malformed_multipart_and_x_user_id_without_cookie_are_rejected(media_environment, tmp_path) -> None:
    client, _, _, _, fixture_tmp_path = media_environment
    created = _create_session(client)
    rejected_origin = client.post(
        '/api/editor/media/upload',
        headers={'Idempotency-Key': 'missing-origin-request'},
        content=b'',
    )
    assert rejected_origin.status_code == 403
    assert rejected_origin.json()['error'] == 'guest_origin_rejected'
    rejected_csrf = client.post(
        '/api/editor/media/upload',
        headers={'Origin': ORIGIN, 'Idempotency-Key': 'missing-csrf-request'},
        content=b'',
    )
    assert rejected_csrf.status_code == 403
    assert rejected_csrf.json()['error'] == 'guest_csrf_rejected'
    malformed = client.post(
        '/api/editor/media/upload',
        headers={
            **MUTATING_HEADERS,
            'Idempotency-Key': 'malformed-request',
            'Content-Type': 'multipart/form-data',
        },
        content=b'not-a-valid-multipart-body',
    )
    assert malformed.status_code == 400
    assert malformed.json()['error'] == 'guest_media_multipart_invalid'

    uploaded = _upload(
        client,
        _make_image(fixture_tmp_path / 'private.jpg'),
        'private.jpg',
        'image/jpeg',
    ).json()
    client.cookies.clear()
    spoofed = client.get(
        f"/api/editor/media/{uploaded['media_id']}/content",
        headers={'X-User-ID': created['guest_id']},
    )
    assert spoofed.status_code == 401
    assert spoofed.json()['error'] == 'guest_session_required'
