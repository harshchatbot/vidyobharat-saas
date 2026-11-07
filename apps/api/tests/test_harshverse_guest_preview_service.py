"""Tests for HarshVerse preview registration using guest-scoped media."""
import hashlib
from pathlib import Path

import pytest

from app.services.harshverse.composition_adapter import AnimationPlate, HarshVerseDraft
from app.services.harshverse.guest_preview_service import GuestHarshVersePreviewService
from app.services.harshverse.scene_plan import Scene, ScenePlan

GUEST = 'guest-001'
SOURCE = 'a' * 32
ANIMATION = 'b' * 32


def item(media_id, contents, guest=GUEST, duration=6):
    return {
        'media_id': media_id, 'guest_id': guest, 'status': 'active',
        'media_type': 'video', 'file_size': len(contents),
        'content_sha256': hashlib.sha256(contents).hexdigest(),
        'storage_object_path': f'guest-editor/{guest}/sources/{media_id}/original',
        'duration_seconds': duration,
    }


class Sessions:
    def validate_mutating_request(self, request):
        if request != 'valid-request':
            raise PermissionError('CSRF')
    def get_session(self, token):
        if token != 'valid-token':
            raise PermissionError('session')
        return {'guest_id': GUEST}


class Storage:
    def __init__(self, data):
        self.data = data
    def download_to_path(self, key, path, *, expected_size):
        data = self.data[key]
        assert len(data) == expected_size
        path.write_bytes(data)


class Repo:
    def __init__(self, records):
        self.records = records
    def get_for_guest(self, guest, media_id):
        data = self.records.get(media_id)
        return data if data and data['guest_id'] == guest else None


class Media:
    max_file_bytes = 128
    def __init__(self):
        self.records = {SOURCE: item(SOURCE, b'presenter'), ANIMATION: item(ANIMATION, b'animation')}
        self.sessions = Sessions()
        self.repository = Repo(self.records)
        self.storage = Storage({
            self.records[SOURCE]['storage_object_path']: b'presenter',
            self.records[ANIMATION]['storage_object_path']: b'animation',
        })
        self.uploads = 0
    def get_media(self, token, media_id):
        self.sessions.get_session(token)
        result = self.repository.get_for_guest(GUEST, media_id)
        if result is None:
            raise PermissionError('owner')
        return result
    @staticmethod
    def _media_id(guest, key):
        return hashlib.sha256(f'{guest}\0{key}'.encode()).hexdigest()[:32]
    def _stored_size(self, object_name):
        return len(self.storage.data[object_name])
    def upload(self, request, token, upload, key):
        self.sessions.validate_mutating_request(request)
        self.sessions.get_session(token)
        data = upload.file.read()
        assert upload.content_type == 'video/mp4'
        media_id = self._media_id(GUEST, key)
        self.records[media_id] = item(media_id, data)
        self.storage.data[self.records[media_id]['storage_object_path']] = data
        self.uploads += 1
        return self.records[media_id]


def draft(animation=True):
    if not animation:
        return HarshVerseDraft(ScenePlan(6, (Scene('presenter_hook', 0, 6),)), None, ())
    return HarshVerseDraft(ScenePlan(6, (
        Scene('presenter_hook', 0, 2),
        Scene('presenter_split', 2, 4, 0, 'keyword_card'),
        Scene('presenter_outro', 4, 6),
    )), ANIMATION, ('type-1',))


def verified_plate(media):
    return AnimationPlate(ANIMATION, 6, media.records[ANIMATION]['content_sha256'])


def service(media):
    calls = []
    def renderer(plan, source: Path, animation: Path, output: Path):
        assert source.read_bytes() == b'presenter'
        assert animation.read_bytes() == b'animation'
        calls.append(plan)
        output.write_bytes(b'preview-mp4')
    return GuestHarshVersePreviewService(media_service=media, renderer=renderer), calls


def test_register_and_reuse_same_preview_without_second_render():
    media = Media()
    preview, calls = service(media)
    a = preview.prepare_preview('valid-request', 'valid-token',
                                presenter_media_id=SOURCE, draft=draft(), plate=verified_plate(media))
    b = preview.prepare_preview('valid-request', 'valid-token',
                                presenter_media_id=SOURCE, draft=draft(), plate=verified_plate(media))
    assert a.media_id == b.media_id
    assert a.deferred_beat_ids == ('type-1',)
    assert media.uploads == 1 and len(calls) == 1


def test_source_only_reuses_original():
    media = Media()
    preview, calls = service(media)
    result = preview.prepare_preview('valid-request', 'valid-token',
                                      presenter_media_id=SOURCE, draft=draft(False))
    assert result.media_id == SOURCE and result.reused_original
    assert not calls and not media.uploads


def test_rejects_cross_guest_media():
    media = Media()
    media.records[SOURCE]['guest_id'] = 'other-guest'
    preview, calls = service(media)
    with pytest.raises(PermissionError):
        preview.prepare_preview('valid-request', 'valid-token',
                                presenter_media_id=SOURCE, draft=draft(), plate=verified_plate(media))
    assert not calls


def test_rejects_bad_request():
    media = Media()
    preview, calls = service(media)
    with pytest.raises(PermissionError, match='CSRF'):
        preview.prepare_preview('bad-request', 'valid-token',
                                presenter_media_id=SOURCE, draft=draft(), plate=verified_plate(media))
    assert not calls


def test_rejects_corrupted_source_download():
    media = Media()
    media.storage.data[media.records[SOURCE]['storage_object_path']] = b'corrupted'
    preview, calls = service(media)
    with pytest.raises((ValueError, AssertionError)):
        preview.prepare_preview('valid-request', 'valid-token',
                                presenter_media_id=SOURCE, draft=draft(), plate=verified_plate(media))
    assert not calls and not media.uploads


def test_rejects_wrong_animation_checksum():
    media = Media()
    preview, calls = service(media)
    with pytest.raises(ValueError, match='metadata differs'):
        preview.prepare_preview('valid-request', 'valid-token',
                                presenter_media_id=SOURCE, draft=draft(),
                                plate=AnimationPlate(ANIMATION, 6, 'f'*64))
    assert not calls


def test_rejects_missing_animation_plate():
    media = Media()
    preview, calls = service(media)
    with pytest.raises(ValueError, match='plate does not match'):
        preview.prepare_preview('valid-request', 'valid-token',
                                presenter_media_id=SOURCE, draft=draft())
    assert not calls


def test_rejects_overlong_render_output():
    media = Media()
    def huge(plan, source, animation, output):
        output.write_bytes(b'x' * 129)
    preview = GuestHarshVersePreviewService(media_service=media, renderer=huge)
    with pytest.raises(ValueError, match='upload limit'):
        preview.prepare_preview('valid-request', 'valid-token',
                                presenter_media_id=SOURCE, draft=draft(), plate=verified_plate(media))
    assert not media.uploads


def test_cannot_treat_stale_cache_as_available():
    media = Media()
    preview, calls = service(media)
    result = preview.prepare_preview('valid-request', 'valid-token',
                                     presenter_media_id=SOURCE, draft=draft(), plate=verified_plate(media))
    cached_path = media.records[result.media_id]['storage_object_path']
    media.storage.data[cached_path] = b'x'
    with pytest.raises(ValueError, match='incomplete'):
        preview.prepare_preview('valid-request', 'valid-token',
                                presenter_media_id=SOURCE, draft=draft(), plate=verified_plate(media))
    assert len(calls) == 1


def test_deleted_source_during_render_is_not_registered():
    media = Media()
    def deleted(plan, source, animation, output):
        del media.records[SOURCE]
        output.write_bytes(b'preview-mp4')
    preview = GuestHarshVersePreviewService(media_service=media, renderer=deleted)
    with pytest.raises(PermissionError, match='owner'):
        preview.prepare_preview('valid-request', 'valid-token',
                                presenter_media_id=SOURCE, draft=draft(), plate=verified_plate(media))
    assert not media.uploads
