from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

import pytest

from app.services.guest_timeline_service import GuestTimelineMediaUnavailableError, GuestTimelineService


def make_service(tmp_path: Path):
    storage = Mock()
    storage.object_size.return_value = 4
    storage.iter_content.return_value = iter([b'test'])
    media_service = SimpleNamespace(storage=storage)
    renderer = SimpleNamespace(limits=SimpleNamespace(max_source_bytes=100, max_workspace_bytes=200, max_output_bytes=50))
    service = GuestTimelineService(media_service=media_service, renderer=renderer)
    composition = SimpleNamespace(audio_items=[SimpleNamespace(media_id='catalog:approved')])
    return service, composition, storage


def test_catalog_audio_is_resolved_and_downloaded(tmp_path):
    service, composition, storage = make_service(tmp_path)
    repository = Mock()
    repository.get.return_value = SimpleNamespace(status='published', storage_path='audio-library/sfx/approved.wav')
    with patch('app.services.guest_timeline_service.build_audio_library_repository', return_value=repository):
        resolved = service._download_catalog_audio(composition, tmp_path, existing=[])
    assert len(resolved) == 1
    assert resolved[0].media_id == 'catalog:approved'
    assert resolved[0].media_type == 'audio'
    assert resolved[0].path.read_bytes() == b'test'
    storage.iter_content.assert_called_once_with('audio-library/sfx/approved.wav', start=0, end=3)


@pytest.mark.parametrize('entry', [None, SimpleNamespace(status='draft', storage_path='audio-library/sfx/a.wav'), SimpleNamespace(status='published', storage_path=None)])
def test_catalog_audio_rejects_unpublished_or_missing_storage(tmp_path, entry):
    service, composition, storage = make_service(tmp_path)
    repository = Mock()
    repository.get.return_value = entry
    with patch('app.services.guest_timeline_service.build_audio_library_repository', return_value=repository):
        with pytest.raises(GuestTimelineMediaUnavailableError):
            service._resolve_catalog_audio(composition)
    storage.iter_content.assert_not_called()


def test_catalog_audio_respects_total_source_byte_limit(tmp_path):
    service, composition, storage = make_service(tmp_path)
    repository = Mock()
    repository.get.return_value = SimpleNamespace(status='published', storage_path='audio-library/sfx/approved.wav')
    with patch('app.services.guest_timeline_service.build_audio_library_repository', return_value=repository):
        with pytest.raises(Exception, match='configured byte limit'):
            service._resolve_catalog_audio(composition, uploaded_bytes=99)
