from __future__ import annotations

from app.services.credit_service import CreditService


def test_avatar_product_affordable_5s_pricing() -> None:
    service = CreditService(None)

    estimate = service.estimate(
        'video_create',
        {
            'recipeId': 'avatar_product',
            'durationSeconds': 5,
            'inputs': {
                'quality_profile': 'affordable',
                'duration_seconds': '5',
            },
        },
    )

    assert estimate.required_credits == 49
    assert estimate.metadata['pricing_mode'] == 'avatar_product_fixed'


def test_avatar_product_affordable_10s_pricing() -> None:
    service = CreditService(None)

    estimate = service.estimate(
        'video_create',
        {
            'recipeId': 'avatar_product',
            'durationSeconds': 10,
            'inputs': {
                'quality_profile': 'affordable',
                'duration_seconds': '10',
            },
        },
    )

    assert estimate.required_credits == 99


def test_avatar_product_standard_5s_pricing() -> None:
    service = CreditService(None)

    estimate = service.estimate(
        'video_create',
        {
            'recipeId': 'avatar_product',
            'durationSeconds': 5,
            'inputs': {
                'quality_profile': 'standard',
                'duration_seconds': '5',
            },
        },
    )

    assert estimate.required_credits == 79


def test_avatar_product_high_10s_pricing() -> None:
    service = CreditService(None)

    estimate = service.estimate(
        'video_create',
        {
            'recipeId': 'avatar_product',
            'durationSeconds': 10,
            'inputs': {
                'quality_profile': 'high_quality',
                'duration_seconds': '10',
            },
        },
    )

    assert estimate.required_credits == 189


def test_normal_kling_o3_standard_5s_silent_is_cheaper_than_avatar_product_standard_5s() -> None:
    service = CreditService(None)

    normal_estimate = service.estimate(
        'video_create',
        {
            'modelKey': 'kling_o3_standard_reference',
            'resolution': '720p',
            'durationSeconds': 5,
            'quality': 'high',
            'audioMode': 'silent',
            'captionsEnabled': False,
            'narrationEnabled': False,
            'imageUrls': [],
        },
    )
    avatar_estimate = service.estimate(
        'video_create',
        {
            'recipeId': 'avatar_product',
            'durationSeconds': 5,
            'inputs': {
                'quality_profile': 'standard',
                'duration_seconds': '5',
            },
        },
    )

    assert normal_estimate.required_credits < avatar_estimate.required_credits
    assert normal_estimate.required_credits == 62


def test_normal_kling_o3_standard_5s_auto_scene_sound_adds_15() -> None:
    service = CreditService(None)

    silent_estimate = service.estimate(
        'video_create',
        {
            'modelKey': 'kling_o3_standard_reference',
            'resolution': '720p',
            'durationSeconds': 5,
            'quality': 'high',
            'audioMode': 'silent',
            'captionsEnabled': False,
            'narrationEnabled': False,
            'imageUrls': [],
        },
    )
    auto_estimate = service.estimate(
        'video_create',
        {
            'modelKey': 'kling_o3_standard_reference',
            'resolution': '720p',
            'durationSeconds': 5,
            'quality': 'high',
            'audioMode': 'auto_scene_sound',
            'captionsEnabled': False,
            'narrationEnabled': False,
            'imageUrls': [],
        },
    )

    assert auto_estimate.required_credits - silent_estimate.required_credits == 15


def test_seedance_silent_pricing_ignores_native_audio() -> None:
    service = CreditService(None)

    estimate = service.estimate(
        'video_create',
        {
            'modelKey': 'seedance_v1_lite_reference',
            'resolution': '720p',
            'durationSeconds': 5,
            'quality': 'standard',
            'audioMode': 'silent',
            'audioSettings': {'nativeAudioEnabled': False},
            'captionsEnabled': False,
            'narrationEnabled': False,
            'imageUrls': [],
        },
    )

    assert estimate.required_credits == 32
    assert 'native_auto_scene_sound' not in estimate.metadata['applied_add_ons']


def test_captions_do_not_add_credits_for_fixed_video_pricing() -> None:
    service = CreditService(None)

    without_captions = service.estimate(
        'video_create',
        {
            'modelKey': 'fal_ltx23_i2v',
            'resolution': '1080p',
            'durationSeconds': 5,
            'quality': 'standard',
            'audioMode': 'silent',
            'captionsEnabled': False,
            'narrationEnabled': False,
            'imageUrls': [],
        },
    )
    with_captions = service.estimate(
        'video_create',
        {
            'modelKey': 'fal_ltx23_i2v',
            'resolution': '1080p',
            'durationSeconds': 5,
            'quality': 'standard',
            'audioMode': 'silent',
            'captionsEnabled': True,
            'narrationEnabled': False,
            'imageUrls': [],
        },
    )

    assert without_captions.required_credits == with_captions.required_credits == 28
