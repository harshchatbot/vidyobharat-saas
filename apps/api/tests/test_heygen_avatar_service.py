from __future__ import annotations

from app.core.config import Settings
from app.services.heygen_avatar_service import HeygenAvatarService


def test_resolve_heygen_voice_id_prefers_real_provider_voice() -> None:
    settings = Settings(heygen_default_voice_id='default-voice')
    service = HeygenAvatarService(settings)

    assert service._resolve_heygen_voice_id('provider-voice-123') == 'provider-voice-123'


def test_resolve_heygen_voice_id_ignores_internal_voice_labels_and_uses_default() -> None:
    settings = Settings(heygen_default_voice_id='default-voice')
    service = HeygenAvatarService(settings)

    assert service._resolve_heygen_voice_id('Shubh') == 'default-voice'
    assert service._resolve_heygen_voice_id('Priya') == 'default-voice'


def test_generate_avatar_video_requires_configured_heygen_voice_id() -> None:
    settings = Settings(heygen_default_voice_id=None)
    service = HeygenAvatarService(settings)

    try:
        service.generate_avatar_video(
            avatar_id='avatar-1',
            script='Hello there',
            voice_id='Shubh',
            aspect_ratio='9:16',
            resolution='720p',
            voice_provider='heygen',
        )
    except ValueError as exc:
        assert 'HEYGEN_DEFAULT_VOICE_ID' in str(exc)
    else:
        raise AssertionError('expected ValueError when no valid HeyGen voice id is available')


def test_generate_video_agent_avatar_video_requires_product_image() -> None:
    settings = Settings(heygen_default_voice_id='default-voice')
    service = HeygenAvatarService(settings)

    try:
        service.generate_video_agent_avatar_video(
            avatar_id='avatar-1',
            prompt='Promote the product naturally.',
            voice_id='provider-voice-123',
            aspect_ratio='9:16',
            product_image_url='',
        )
    except ValueError as exc:
        assert 'product_image_url is required' in str(exc)
    else:
        raise AssertionError('expected ValueError when product image is missing')


def test_generate_video_agent_avatar_video_submits_prompt_avatar_and_files(monkeypatch) -> None:
    settings = Settings(heygen_default_voice_id='default-voice')
    service = HeygenAvatarService(settings)
    calls: list[tuple[str, str, dict | None]] = []

    class _FakeClient:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    monkeypatch.setattr(service, '_client', lambda: _FakeClient())

    def fake_request_json(*, client, method, path, json=None, params=None):
        calls.append((method, path, json))
        if method == 'POST' and path == '/v3/video-agents':
            return {'data': {'session_id': 'session-1'}}
        if method == 'GET' and path == '/v3/video-agents/session-1':
            return {'data': {'status': 'completed', 'video_url': 'https://cdn.example.com/agent.mp4'}}
        raise AssertionError(f'unexpected request {method} {path}')

    monkeypatch.setattr(service, '_request_json', fake_request_json)

    video_url, metadata = service.generate_video_agent_avatar_video(
        avatar_id='avatar-1',
        prompt='Promote the uploaded product naturally.',
        voice_id='provider-voice-123',
        aspect_ratio='9:16',
        product_image_url='https://cdn.example.com/product.png',
    )

    assert video_url == 'https://cdn.example.com/agent.mp4'
    assert metadata['video_agent_session_id'] == 'session-1'
    assert metadata['attached_product_files'] == ['https://cdn.example.com/product.png']
    assert calls[0][1] == '/v3/video-agents'
    assert calls[0][2]['avatar_id'] == 'avatar-1'
    assert calls[0][2]['voice_id'] == 'provider-voice-123'
    assert calls[0][2]['files'] == ['https://cdn.example.com/product.png']


def test_normalize_supported_avatar_item_marks_avatar_iv_support() -> None:
    service = HeygenAvatarService(Settings())

    normalized = service._normalize_supported_avatar_item(
        {
            'id': 'avatar-photo-1',
            'name': 'Adriana',
            'preview_image_url': 'https://cdn.example.com/adriana.png',
        },
        avatar_type='photo_avatar',
        ownership='public',
    )

    assert normalized['provider'] == 'heygen'
    assert normalized['provider_api_version'] == 'v3'
    assert normalized['avatar_family'] == 'avatar_iv'
    assert normalized['avatar_type'] == 'photo_avatar'
    assert normalized['ownership'] == 'public'
    assert normalized['supports_avatar_video_generation'] is True


def test_extract_avatar_items_accepts_v3_looks_payload() -> None:
    service = HeygenAvatarService(Settings())

    items = service._extract_avatar_items(
        {
            'data': {
                'looks': [
                    {'id': 'look-1'},
                    {'id': 'look-2'},
                ]
            }
        }
    )

    assert [item['id'] for item in items] == ['look-1', 'look-2']


def test_list_avatar_library_filters_user_avatars_to_heygen_avatar_iv(monkeypatch) -> None:
    service = HeygenAvatarService(Settings())

    class _FakeSnapshot:
        def __init__(self, doc_id: str, data: dict):
            self.id = doc_id
            self._data = data

        def to_dict(self):
            return dict(self._data)

    class _FakeQuery:
        def __init__(self, docs: list[_FakeSnapshot]):
            self._docs = docs

        def stream(self):
            return list(self._docs)

    class _FakeCollection:
        def __init__(self, docs: list[_FakeSnapshot]):
            self._docs = docs

        def where(self, *_args, **_kwargs):
            return _FakeQuery(self._docs)

    class _FakeDb:
        def __init__(self, docs: list[_FakeSnapshot]):
            self._docs = docs

        def collection(self, name: str):
            assert name == 'avatars'
            return _FakeCollection(self._docs)

    docs = [
        _FakeSnapshot('good-1', {'id': 'good-1', 'provider': 'heygen', 'supports_avatar_video_generation': True, 'provider_avatar_id': 'provider-good-1'}),
        _FakeSnapshot('legacy-1', {'id': 'legacy-1', 'provider': 'fal', 'supports_avatar_video_generation': True, 'provider_avatar_id': 'provider-legacy-1'}),
        _FakeSnapshot('legacy-2', {'id': 'legacy-2', 'provider': 'heygen', 'supports_avatar_video_generation': None, 'provider_avatar_id': 'provider-legacy-2'}),
    ]

    monkeypatch.setattr('app.services.heygen_avatar_service.get_firestore_client', lambda: _FakeDb(docs))
    monkeypatch.setattr(service, 'list_avatars', lambda refresh=False: [{'id': 'preset-1'}])

    library = service.list_avatar_library(user_id='user-1', refresh_presets=False)

    assert library['preset_avatars'] == [{'id': 'preset-1'}]
    assert [item['id'] for item in library['user_avatars']] == ['good-1']
    assert library['user_avatars'][0]['avatar_id'] == 'provider-good-1'
