from __future__ import annotations

import pytest

import app.services.avatar_service as avatar_service_module
from app.api.routes import _canonical_voice_key, _validate_voice_for_avatar_gender
from app.services.avatar_preview_service import AvatarPreviewService
from app.services.avatar_service import AvatarService
from app.services.persona_voice_service import PersonaVoiceService


def test_avatar_service_returns_preset_actor_details() -> None:
    service = AvatarService()
    actor = service.get_actor_details('av-priya')
    assert actor is not None
    assert actor['name'] == 'Priya'
    assert actor['primary_image']
    assert actor['recommended_voice'] == 'Priya'
    assert actor['voice_profile']['speaker'] == 'priya'


def test_avatar_preview_reference_images_prioritize_primary_and_front() -> None:
    service = AvatarPreviewService.__new__(AvatarPreviewService)
    selected, ordered = service._resolve_reference_images(
        {
            'primary_image': 'https://example.com/ref_front.jpg',
            'reference_images': [
                'https://example.com/ref_alt.jpg',
                'https://example.com/ref_front.jpg',
                'https://example.com/ref_side.jpg',
            ],
        }
    )
    assert selected == 'https://example.com/ref_front.jpg'
    assert ordered[0] == 'https://example.com/ref_front.jpg'
    assert 'https://example.com/ref_alt.jpg' in ordered


def test_avatar_service_validates_scope_values() -> None:
    service = AvatarService()
    assert service._validate_scope('public') == 'public'
    assert service._validate_scope('own') == 'own'
    try:
        service._validate_scope('team')
    except ValueError as exc:
        assert 'scope must be either "own" or "public"' in str(exc)
    else:
        raise AssertionError('Expected invalid actor scope to raise ValueError')


def test_avatar_voice_gender_validation() -> None:
    assert _canonical_voice_key('priya') == 'Priya'
    assert _validate_voice_for_avatar_gender(voice_key='Priya', gender='female') == 'Priya'
    with pytest.raises(ValueError, match='does not match avatar gender'):
        _validate_voice_for_avatar_gender(voice_key='Shubh', gender='female')


def test_avatar_service_builds_consistent_voice_profile_defaults() -> None:
    service = AvatarService()
    profile = service.resolve_default_voice_profile(voice_key='Priya', gender='female')
    assert profile['speaker'] == 'priya'
    assert profile['tone'] == 'friendly_confident'
    assert profile['base_speed'] == 1.08


def test_persona_voice_service_prepares_tts_input_consistently() -> None:
    service = PersonaVoiceService()
    prepared = service.prepare_tts_input(
        script='you should try this. it really helps.',
        voice_profile={
            'speaker': 'priya',
            'base_speed': 1.08,
            'tone': 'friendly_confident',
            'energy': 'medium_high',
        },
    )
    assert prepared['speaker'] == 'priya'
    assert prepared['voice_key'] == 'Priya'
    assert prepared['speech_rate'] >= 1.08
    assert 'you SHOULD' in prepared['text']


def test_avatar_service_skips_malformed_public_actor_records(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeSnap:
        def __init__(self, doc_id: str, data: dict | None) -> None:
            self.id = doc_id
            self._data = data or {}

        def to_dict(self) -> dict:
            return dict(self._data)

    class FakeCollection:
        def __init__(self, items: list[FakeSnap]) -> None:
            self._items = items

        def stream(self) -> list[FakeSnap]:
            return list(self._items)

    class FakeDB:
        def collection(self, name: str) -> FakeCollection:
            if name == 'actors':
                return FakeCollection(
                    [
                        FakeSnap(
                            'aarohi',
                            {
                                'id': 'aarohi',
                                'name': 'Aarohi',
                                'scope': 'public',
                                'category': 'ugc_influencer',
                                'thumbnail_url': 'https://example.com/thumb.jpg',
                                'reference_images': ['https://example.com/ref.jpg'],
                                'recommended_voice': 'Priya',
                                'gender': 'female',
                                'status': 'active',
                            },
                        ),
                        FakeSnap('broken-actor', {'id': 'broken-actor', 'scope': 'public', 'reference_images': 'not-a-list'}),
                    ]
                )
            if name == 'avatars':
                return FakeCollection([])
            raise AssertionError(f'unexpected collection {name}')

    monkeypatch.setattr(avatar_service_module, 'get_firestore_client', lambda: FakeDB())
    original_actor_from_firestore = AvatarService._actor_from_firestore

    def fake_actor_from_firestore(self: AvatarService, data: dict, actor_id: str):
        if actor_id == 'broken-actor':
            raise ValueError('malformed actor record')
        return original_actor_from_firestore(self, data, actor_id)

    monkeypatch.setattr(AvatarService, '_actor_from_firestore', fake_actor_from_firestore)

    service = AvatarService()
    items = service.list_avatars(user_id='qa-user')

    assert any(item.id == 'aarohi' for item in items)
    assert not any(item.id == 'broken-actor' for item in items)
