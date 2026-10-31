import asyncio
import io
import json

import pytest
from fastapi import HTTPException, UploadFile
from starlette.datastructures import Headers

from app.api.routers import admin_routes, editor_routes
from app.services import editor_audio_library
from app.services.editor_audio_library import AudioLibraryEntry


class EntryRepository:
    def __init__(self, entries: list[AudioLibraryEntry] | None = None):
        self.entries = {entry.id: entry for entry in entries or []}

    def get(self, asset_id: str):
        return self.entries.get(asset_id)

    def save(self, entry):
        self.entries[entry.id] = entry
        return entry

    def list(self, *, include_unpublished=False):
        values = list(self.entries.values())
        return values if include_unpublished else [entry for entry in values if entry.status == 'published']

    def find_by_storage_path(self, storage_path):
        return next((entry for entry in self.entries.values() if entry.storage_path == storage_path), None)


def test_empty_catalog_is_safe_until_licensed_assets_are_configured(monkeypatch) -> None:
    class EmptyRepository:
        def list(self, *, include_unpublished=False):
            return []

    monkeypatch.setattr(editor_audio_library, 'build_audio_library_repository', lambda: EmptyRepository())
    assert editor_audio_library.list_audio_library() == []
    assert editor_audio_library.list_audio_library(category='music', query='anything') == []


def test_existing_storage_registration_is_idempotent_and_draft(monkeypatch) -> None:
    class EntryRepo:
        def __init__(self): self.saved = None
        def find_by_storage_path(self, path): return self.saved
        def save(self, entry): self.saved = entry; return entry
    class Storage:
        bucket_name = 'demo.appspot.com'
        def inspect_object(self, path):
            return type('Meta', (), {'content_type': 'audio/mpeg', 'metadata': {'firebaseStorageDownloadTokens': 'token'}})()
    repo = EntryRepo()
    monkeypatch.setattr(editor_audio_library, 'build_audio_library_repository', lambda: repo)
    monkeypatch.setattr(editor_audio_library, 'build_storage_provider', lambda: Storage())
    args = dict(storage_path='audio-library/music/existing.mp3', title='Existing', category='ambient', kind='music', duration_seconds=12, content_type='audio/mpeg', tags=[], license_name='CC0', attribution=None, source='https://example.test', evidence_reference='private://license', redistribution_confirmed=True)
    first = editor_audio_library.register_existing_audio_asset(**args)
    second = editor_audio_library.register_existing_audio_asset(**args)
    assert first.id == second.id
    assert first.status == 'draft'
    assert first.playback_url.startswith('https://firebasestorage.googleapis.com/')


def test_existing_storage_registration_rejects_untrusted_paths(monkeypatch) -> None:
    monkeypatch.setattr(editor_audio_library, 'build_audio_library_repository', lambda: object())
    try:
        editor_audio_library.register_existing_audio_asset(
            storage_path='uploads/private.mp3', title='Bad', category='x', kind='music', duration_seconds=1,
            content_type='audio/mpeg', tags=[], license_name='CC0', attribution=None, source='https://example.test',
            evidence_reference='private://license', redistribution_confirmed=True,
        )
    except ValueError as exc:
        assert 'namespace' in str(exc)
    else:
        raise AssertionError('untrusted storage path was accepted')


def test_admin_upload_persists_storage_playback_url(monkeypatch) -> None:
    repository = EntryRepository()
    monkeypatch.setattr(admin_routes, 'build_audio_library_repository', lambda: repository)
    monkeypatch.setattr(
        admin_routes,
        'upload_audio_library_asset',
        lambda *_: ('audio-library/music/new-track.mp3', 'https://firebasestorage.googleapis.com/tokenized-track', 12.5),
    )
    metadata = {
        'title': 'New track', 'category': 'ambient', 'type': 'music', 'tags': ['calm'],
        'license': 'CC0', 'attribution': None, 'source': 'https://example.test/source',
        'evidence_reference': 'private://license', 'redistribution_confirmed': True,
    }
    file = UploadFile(file=io.BytesIO(b'ID3test-audio'), filename='new-track.mp3', headers=Headers({'content-type': 'audio/mpeg'}))

    result = asyncio.run(admin_routes.admin_upload_audio_library(metadata=json.dumps(metadata), file=file, _=None))

    assert result['playback_url'] == 'https://firebasestorage.googleapis.com/tokenized-track'
    assert repository.get('new-track').playback_url == result['playback_url']


def test_published_asset_lists_public_route_and_redirects_to_stored_token(monkeypatch) -> None:
    entry = AudioLibraryEntry(
        id='published', title='Published', category='ambient', type='music', duration_seconds=12,
        content_type='audio/mpeg', license='CC0', source='https://example.test',
        evidence_reference='private://license', playback_url='https://firebasestorage.googleapis.com/tokenized', status='draft',
    )
    repository = EntryRepository([entry])
    monkeypatch.setattr(editor_audio_library, 'build_audio_library_repository', lambda: repository)
    monkeypatch.setattr(editor_routes, 'build_audio_library_repository', lambda: repository)
    monkeypatch.setattr(admin_routes, 'build_audio_library_repository', lambda: repository)

    admin_routes.admin_publish_audio_library('published', _=None)
    listed = editor_audio_library.list_audio_library()
    assert listed == [{**entry.public()}]
    assert listed[0]['playback_url'] == '/api/editor/audio-library/published/content'
    response = editor_routes.get_audio_library_content('published')
    assert response.status_code == 307
    assert response.headers['location'] == entry.playback_url


@pytest.mark.parametrize('entry', [
    None,
    AudioLibraryEntry(id='draft', title='Draft', category='ambient', type='music', duration_seconds=1, content_type='audio/mpeg', license='CC0', source='https://example.test', evidence_reference='private://license', playback_url='https://storage.test/token', status='draft'),
    AudioLibraryEntry(id='retired', title='Retired', category='ambient', type='music', duration_seconds=1, content_type='audio/mpeg', license='CC0', source='https://example.test', evidence_reference='private://license', playback_url='https://storage.test/token', status='retired'),
    AudioLibraryEntry(id='blank', title='Blank', category='ambient', type='music', duration_seconds=1, content_type='audio/mpeg', license='CC0', source='https://example.test', evidence_reference='private://license', playback_url='', status='published'),
])
def test_unavailable_assets_never_redirect(monkeypatch, entry) -> None:
    repository = EntryRepository([entry] if entry else [])
    monkeypatch.setattr(editor_routes, 'build_audio_library_repository', lambda: repository)
    asset_id = entry.id if entry else 'missing'
    with pytest.raises(HTTPException) as error:
        editor_routes.get_audio_library_content(asset_id)
    assert error.value.status_code == 404
