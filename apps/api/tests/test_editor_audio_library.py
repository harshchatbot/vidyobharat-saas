from app.services import editor_audio_library


def test_empty_catalog_is_safe_until_licensed_assets_are_configured(monkeypatch) -> None:
    class EmptyRepository:
        def list(self, *, include_unpublished=False):
            return []

    monkeypatch.setattr(editor_audio_library, 'build_audio_library_repository', lambda: EmptyRepository())
    assert editor_audio_library.list_audio_library() == []
    assert editor_audio_library.list_audio_library(category='music', query='anything') == []
