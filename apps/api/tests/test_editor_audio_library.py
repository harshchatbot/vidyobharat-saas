from app.services.editor_audio_library import list_audio_library


def test_empty_catalog_is_safe_until_licensed_assets_are_configured() -> None:
    assert list_audio_library() == []
    assert list_audio_library(category='music', query='anything') == []
