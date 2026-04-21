from __future__ import annotations

from app.services.avatar_preview_service import AvatarPreviewService
from app.services.avatar_service import AvatarService


def test_avatar_service_returns_preset_actor_details() -> None:
    service = AvatarService()
    actor = service.get_actor_details('av-priya')
    assert actor is not None
    assert actor['name'] == 'Priya'
    assert actor['primary_image']
    assert actor['recommended_voice'] == 'Priya'


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
