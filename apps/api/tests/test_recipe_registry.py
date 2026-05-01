from __future__ import annotations

import pytest

from app.recipes.recipe_registry import (
    RECIPES,
    build_normalized_video_payload,
    build_pixverse_anime_lofi_prompt,
    recipe_pipeline_metadata,
    validate_recipe_inputs,
)


def test_build_pixverse_anime_lofi_prompt_uses_controlled_template() -> None:
    prompt = build_pixverse_anime_lofi_prompt(
        motion='ride',
        scene='coastal',
        vibe='lofi',
    )

    assert prompt.startswith('@character rides a skateboard downhill')
    assert 'coastal road with ocean, waves, seaside houses, electric poles, palm trees' in prompt
    assert 'warm sunlight, soft clouds, lofi calm vibe, hand-painted anime style.' in prompt
    assert prompt.endswith('Maintain exact character identity, no distortion.')


def test_anime_lofi_reel_builds_pixverse_payload() -> None:
    recipe = RECIPES['anime_lofi_reel']

    payload = build_normalized_video_payload(
        recipe,
        {
            'character_image': 'https://example.com/character.png',
            'motion': 'fly',
            'scene': 'fantasy',
            'vibe': 'dreamy',
            'duration_seconds': '10',
            'quality_profile': 'premium',
            'audio_mode': 'auto_scene_sound',
        },
    )

    assert payload['modelKey'] == 'pixverse_c1_reference'
    assert payload['resolution'] == '720p'
    assert payload['durationSeconds'] == 10
    assert payload['audioMode'] == 'auto_scene_sound'
    assert payload['audioSettings']['nativeAudioEnabled'] is True
    assert payload['imageReferences'] == [
        {
            'ref_name': 'character',
            'type': 'subject',
            'image_url': 'https://example.com/character.png',
        }
    ]
    assert payload['script'].startswith('@character flies smoothly through the air')


def test_reference_video_generator_advanced_requires_prompt_refs() -> None:
    recipe = RECIPES['reference_video_generator_advanced']

    with pytest.raises(ValueError, match='must include @subject'):
        validate_recipe_inputs(
            recipe,
            {
                'subject_image': 'https://example.com/subject.png',
                'custom_prompt': 'A neon alley with dramatic lighting.',
                'duration_seconds': '5',
                'quality_profile': 'standard',
            },
        )


def test_reference_video_generator_advanced_builds_two_reference_payload() -> None:
    recipe = RECIPES['reference_video_generator_advanced']

    payload = build_normalized_video_payload(
        recipe,
        {
            'subject_image': 'https://example.com/subject.png',
            'background_image': 'https://example.com/background.png',
            'custom_prompt': '@subject walks through a neon alley while @background anchors the city lights.',
            'duration_seconds': '5',
            'quality_profile': 'high',
            'audio_mode': 'silent',
        },
    )

    assert payload['modelKey'] == 'pixverse_c1_reference'
    assert payload['resolution'] == '540p'
    assert payload['durationSeconds'] == 5
    assert payload['imageReferences'] == [
        {
            'ref_name': 'subject',
            'type': 'subject',
            'image_url': 'https://example.com/subject.png',
        },
        {
            'ref_name': 'background',
            'type': 'background',
            'image_url': 'https://example.com/background.png',
        },
    ]


def test_pixverse_recipe_pipeline_metadata_tracks_limits() -> None:
    recipe = RECIPES['anime_lofi_reel']

    metadata = recipe_pipeline_metadata(
        recipe,
        {
            'character_image': 'https://example.com/character.png',
            'motion': 'walk',
            'scene': 'city',
            'vibe': 'cinematic',
            'quality_profile': 'standard',
            'duration_seconds': '5',
            'audio_mode': 'silent',
        },
    )

    assert metadata['metadata']['pixverse_mode'] == 'recipe'
    assert metadata['metadata']['resolution'] == '360p'
    assert metadata['metadata']['max_retries'] == 2
