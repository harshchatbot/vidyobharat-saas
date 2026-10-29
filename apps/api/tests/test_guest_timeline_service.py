from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.schemas.editor import TimelineClip, TimelineComposition
from app.services.guest_session_errors import GuestSessionError, media_error
from app.services.guest_timeline_service import GuestTimelineService
from app.services.timeline_render_service import TimelineRenderService, TimelineValidationError


MEDIA_ID = 'd' * 32


class FakeStorage:
    def __init__(self, objects: dict[str, bytes]) -> None:
        self.objects = objects
        self.requested: list[str] = []

    def iter_content(self, object_name: str, *, start: int, end: int):
        self.requested.append(object_name)
        content = self.objects[object_name][start:end + 1]
        for offset in range(0, len(content), 37):
            yield content[offset:offset + 37]


class FakeSessions:
    def __init__(self, token: str) -> None:
        self.token = token
        self.calls = 0
        self.fail_after: int | None = None

    def get_session(self, raw_token: str | None) -> dict:
        self.calls += 1
        if self.fail_after is not None and self.calls > self.fail_after:
            raise media_error('guest_session_expired', 'The guest editor session has expired.', status_code=401)
        if raw_token == 'different-guest-token':
            return {'guest_id': 'different-guest', 'status': 'active'}
        if raw_token != self.token:
            raise media_error('guest_session_invalid', 'The guest editor session is invalid.', status_code=401)
        return {'guest_id': 'owner-guest', 'status': 'active'}


class FakeMediaService:
    def __init__(self, *, token: str, record: dict, content: bytes) -> None:
        self.token = token
        self.record = record
        self.storage = FakeStorage({record['storage_object_path']: content})
        self.sessions = FakeSessions(token)

    def get_media(self, raw_token: str | None, media_id: str) -> dict:
        if raw_token != self.token or media_id != self.record['media_id']:
            raise media_error('guest_media_not_found', 'The requested media was not found.', status_code=404)
        return self.record


def _image(path: Path) -> bytes:
    subprocess.run(
        [
            'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
            '-f', 'lavfi', '-i', 'color=c=purple:s=80x120',
            '-frames:v', '1', str(path),
        ],
        check=True,
        capture_output=True,
    )
    return path.read_bytes()


def _timeline() -> TimelineComposition:
    return TimelineComposition(
        width=180,
        height=320,
        fps=10,
        clips=[TimelineClip(media_id=MEDIA_ID, order=0, duration_seconds=0.4)],
    )


def _service(tmp_path: Path) -> tuple[GuestTimelineService, FakeMediaService]:
    content = _image(tmp_path / 'source.png')
    object_name = f'guest-editor/owner-guest/sources/{MEDIA_ID}/original'
    record = {
        'media_id': MEDIA_ID,
        'guest_id': 'owner-guest',
        'media_type': 'image',
        'file_size': len(content),
        'storage_object_path': object_name,
        'status': 'active',
    }
    media = FakeMediaService(token='owner-token', record=record, content=content)
    return GuestTimelineService(media_service=media, renderer=TimelineRenderService()), media


def test_guest_timeline_streams_canonical_private_object_and_cleans_sources(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service, media = _service(tmp_path)
    created: list[Path] = []
    original = tempfile.TemporaryDirectory

    class TrackingTemporaryDirectory(original):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            created.append(Path(self.name))

    monkeypatch.setattr(tempfile, 'TemporaryDirectory', TrackingTemporaryDirectory)
    result = service.render('owner-token', _timeline())

    assert result.path.is_file()
    assert media.storage.requested == [f'guest-editor/owner-guest/sources/{MEDIA_ID}/original']
    source_workspaces = [path for path in created if 'timeline-sources' in path.name]
    assert source_workspaces and all(not path.exists() for path in source_workspaces)
    render_workspace = result.path.parent
    result.close()
    assert not render_workspace.exists()


def test_guest_timeline_rejects_cross_guest_media_before_storage_access(tmp_path: Path) -> None:
    service, media = _service(tmp_path)

    with pytest.raises(GuestSessionError) as captured:
        service.render('different-guest-token', _timeline())

    assert captured.value.status_code == 404
    assert media.storage.requested == []


def test_guest_timeline_rejects_storage_size_mismatch_and_cleans_workspace(tmp_path: Path) -> None:
    service, media = _service(tmp_path)
    media.record['file_size'] += 1

    with pytest.raises(TimelineValidationError, match='does not match'):
        service.render('owner-token', _timeline())


def test_guest_timeline_rechecks_session_after_render_and_cleans_output(tmp_path: Path) -> None:
    service, media = _service(tmp_path)
    media.sessions.fail_after = 1
    render_roots: list[Path] = []
    original_render = service.renderer.render

    def tracking_render(*args, **kwargs):
        result = original_render(*args, **kwargs)
        render_roots.append(result.path.parent)
        return result

    service.renderer.render = tracking_render  # type: ignore[method-assign]

    with pytest.raises(GuestSessionError):
        service.render('owner-token', _timeline())

    assert render_roots and all(not path.exists() for path in render_roots)


def test_guest_timeline_rejects_noncanonical_private_object_path(tmp_path: Path) -> None:
    service, media = _service(tmp_path)
    content = next(iter(media.storage.objects.values()))
    media.record['storage_object_path'] = f'guest-editor/other-guest/sources/{MEDIA_ID}/original'
    media.storage.objects[media.record['storage_object_path']] = content

    with pytest.raises(TimelineValidationError, match='ownership'):
        service.render('owner-token', _timeline())

    assert media.storage.requested == []


def test_dynamic_limits_apply_to_new_requests_but_not_accepted_worker_jobs(tmp_path: Path) -> None:
    service, media = _service(tmp_path)

    class RestrictiveConfig:
        def get(self):
            return SimpleNamespace(editor=SimpleNamespace(max_clips=1, max_duration_seconds=0.2))

    media.sessions.app_config = RestrictiveConfig()  # type: ignore[attr-defined]
    with pytest.raises(TimelineValidationError, match='current 0.2-second limit'):
        service.validate_sources('owner-token', _timeline())

    service._require_worker_session = lambda guest_id: {'guest_id': guest_id}  # type: ignore[method-assign]
    service._resolve_records = lambda *args, **kwargs: [media.record]  # type: ignore[method-assign]
    result = service.render_for_worker('owner-guest', _timeline())
    assert result.metadata.duration_seconds == pytest.approx(0.4, abs=0.1)
    result.close()
