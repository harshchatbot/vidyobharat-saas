from app.services import editor_audio_library


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
