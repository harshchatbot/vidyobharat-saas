from __future__ import annotations

from pathlib import Path

import pytest

import app.services.avatar_service as avatar_service_module
from app.services.avatar_preview_service import AvatarPreviewService
from app.services.avatar_service import AvatarService, resolve_avatar_reference_variants, selectBestAvatarReferenceImage
from app.services.persona_voice_service import PersonaVoiceService


def test_avatar_service_returns_preset_avatar_response() -> None:
    service = AvatarService()
    actor = service._preset_records[0]
    response = service._to_avatar_response(actor)
    assert response.name == 'Priya'
    assert response.primary_image
    assert response.reference_image_variants
    assert response.recommended_voice == 'Priya'
    assert response.voice_profile['speaker'] == 'priya'


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
    with pytest.raises(ValueError, match='scope must be either "own" or "public"'):
        service._validate_scope('team')


def test_avatar_service_validates_catalog_voice_keys() -> None:
    service = AvatarService()
    assert service._validate_voice('Priya') == 'Priya'
    with pytest.raises(ValueError, match='recommended_voice'):
        service._validate_voice('missing-voice')


def test_avatar_service_builds_consistent_voice_profile_defaults() -> None:
    service = AvatarService()
    profile = service.resolve_default_voice_profile(voice_key='Priya', gender='female')
    assert profile['speaker'] == 'priya'
    assert profile['tone'] == 'friendly_confident'
    assert profile['base_speed'] == 1.08


def test_avatar_service_falls_back_for_non_catalog_provider_voice_ids() -> None:
    service = AvatarService()
    profile = service.resolve_default_voice_profile(
        voice_key='9799f1ba6acd4b2b993fe813a18f9a91',
        gender='female',
    )
    assert profile['speaker'] == 'priya'
    assert service._resolve_catalog_voice_key('9799f1ba6acd4b2b993fe813a18f9a91', 'female') == 'Priya'


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
            if name == 'avatars':
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
            if name == 'preset_avatars':
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


def test_avatar_service_filters_retired_heygen_avatars(monkeypatch: pytest.MonkeyPatch) -> None:
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
            if name == 'avatars':
                return FakeCollection(
                    [
                        FakeSnap('fal-1', {'id': 'fal-1', 'name': 'Reusable Avatar', 'provider': 'reference_image', 'thumbnail_url': 'https://example.com/avatar.jpg', 'reference_images': ['https://example.com/avatar.jpg'], 'status': 'ready', 'scope': 'public'}),
                        FakeSnap('heygen-1', {'id': 'heygen-1', 'name': 'Legacy HeyGen Avatar', 'provider': 'heygen', 'thumbnail_url': 'https://example.com/heygen.jpg', 'reference_images': ['https://example.com/heygen.jpg'], 'status': 'ready', 'scope': 'public'}),
                    ]
                )
            raise AssertionError(f'unexpected collection {name}')

    monkeypatch.setattr(avatar_service_module, 'get_firestore_client', lambda: FakeDB())
    service = AvatarService()
    items = service.list_avatars(user_id='qa-user')
    assert [item.id for item in items] == ['fal-1']


def test_resolve_avatar_reference_variants_normalizes_structured_reference_images() -> None:
    primary_image, reference_images, variants = resolve_avatar_reference_variants(
        avatar_id='av-test',
        base_url='https://cdn.example.com/static',
        primary_image=None,
        raw_reference_images=[
            {'id': 'front', 'url': 'https://example.com/front.png', 'tags': ['front', 'neutral', 'talking']},
            {'id': 'smile', 'url': 'https://example.com/smile.png', 'tags': ['smile', 'friendly', 'beauty']},
        ],
        fallback_reference_image_url=None,
    )

    assert primary_image == 'https://example.com/front.png'
    assert reference_images == ['https://example.com/front.png', 'https://example.com/smile.png']
    assert [item.id for item in variants] == ['front', 'smile']
    assert variants[1].tags == ['smile', 'friendly', 'beauty']


def test_resolve_avatar_reference_variants_merges_curated_filesystem_pack(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    avatar_dir = tmp_path / 'data' / 'uploads' / 'avatars' / 'av-curated'
    avatar_dir.mkdir(parents=True)
    for filename in ('front.png', 'desk.png'):
        (avatar_dir / filename).write_bytes(b'fake')

    monkeypatch.setattr(avatar_service_module, 'Path', lambda value='': Path(tmp_path / value) if str(value) == 'data/uploads/avatars' else Path(value))

    primary_image, reference_images, variants = resolve_avatar_reference_variants(
        avatar_id='av-curated',
        base_url='https://cdn.example.com/static',
        primary_image='https://example.com/original.png',
        raw_reference_images=['https://example.com/original.png'],
        fallback_reference_image_url='https://example.com/original.png',
    )

    assert primary_image == 'https://example.com/original.png'
    assert 'https://cdn.example.com/static/uploads/avatars/av-curated/front.png' in reference_images
    assert 'https://cdn.example.com/static/uploads/avatars/av-curated/desk.png' in reference_images
    assert any(item.id == 'desk' and 'office' in item.tags for item in variants)


def test_select_best_avatar_reference_image_prefers_beauty_friendly_variant() -> None:
    selection = selectBestAvatarReferenceImage(
        avatar={
            'primary_image': 'https://example.com/front.png',
            'reference_images': ['https://example.com/front.png', 'https://example.com/smile.png'],
            'reference_image_variants': [
                {'id': 'front', 'url': 'https://example.com/front.png', 'tags': ['front', 'neutral', 'talking']},
                {'id': 'smile', 'url': 'https://example.com/smile.png', 'tags': ['smile', 'friendly', 'beauty']},
            ],
        },
        recipe_id='avatar_product',
        product_category='skincare',
        prompt_text='A glowing skincare routine that feels warm and personal.',
    )

    assert selection.selected_id == 'smile'
    assert selection.reason == 'beauty_match'


def test_select_best_avatar_reference_image_prefers_office_variant_for_saas() -> None:
    selection = selectBestAvatarReferenceImage(
        avatar={
            'primary_image': 'https://example.com/front.png',
            'reference_images': ['https://example.com/front.png', 'https://example.com/desk.png'],
            'reference_image_variants': [
                {'id': 'front', 'url': 'https://example.com/front.png', 'tags': ['front', 'neutral', 'talking']},
                {'id': 'desk', 'url': 'https://example.com/desk.png', 'tags': ['desk', 'office', 'ai']},
            ],
        },
        recipe_id='avatar_product',
        product_category='AI SaaS',
        prompt_text='A founder-style office product walkthrough for our software.',
    )

    assert selection.selected_id == 'desk'
    assert selection.reason == 'office_match'


def test_select_best_avatar_reference_image_falls_back_to_primary_for_generic_prompt() -> None:
    selection = selectBestAvatarReferenceImage(
        avatar={
            'primary_image': 'https://example.com/front.png',
            'reference_images': ['https://example.com/front.png'],
            'reference_image_variants': [
                {'id': 'front', 'url': 'https://example.com/front.png', 'tags': ['front', 'neutral', 'talking']},
            ],
        },
        recipe_id='avatar_product',
        product_category='generic',
        prompt_text='A simple creator recommendation.',
    )

    assert selection.selected_url == 'https://example.com/front.png'
    assert selection.reason in {'generic_safe_fallback', 'primary_image_fallback'}


def test_select_best_avatar_reference_image_supports_legacy_single_image() -> None:
    selection = selectBestAvatarReferenceImage(
        avatar={
            'primary_image': 'https://example.com/front.png',
            'reference_images': ['https://example.com/front.png'],
        },
        recipe_id='avatar_product',
        product_category='jewellery',
        prompt_text='A luxury jewellery recommendation.',
    )

    assert selection.selected_url == 'https://example.com/front.png'
    assert selection.fallback_mode == 'legacy'
