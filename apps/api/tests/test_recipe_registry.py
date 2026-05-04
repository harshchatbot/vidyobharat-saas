from __future__ import annotations

import random

import pytest

from app.recipes.recipe_registry import (
    AnimeLofiQwenExpansion,
    RECIPES,
    build_normalized_video_payload,
    build_pixverse_anime_lofi_prompt,
    build_pixverse_anime_lofi_prompt_package,
    recipe_pipeline_metadata,
    validate_recipe_inputs,
)


def test_build_pixverse_anime_lofi_prompt_uses_controlled_template() -> None:
    prompt = build_pixverse_anime_lofi_prompt(
        motion='ride',
        scene='coastal',
        vibe='lofi',
    )

    assert prompt.startswith('@character ')
    assert any(
        phrase in prompt
        for phrase in (
            'rides a skateboard downhill',
            'skates forward downhill with smooth control',
            'glides downhill on a skateboard with confident motion',
        )
    )
    assert 'through a coastal road with ocean waves, seaside houses, electric poles, and palm trees' in prompt
    assert any(
        phrase in prompt
        for phrase in (
            'tracking with smooth forward momentum',
            'steady travel motion and controlled downhill flow',
            'premium gliding track that keeps the skateboard motion readable',
        )
    )
    assert any(
        phrase in prompt
        for phrase in (
            'clear contact with the board',
            'skateboard readable',
            'clean board control',
        )
    )
    assert any(
        phrase in prompt
        for phrase in (
            'warm sunlight, soft clouds, lofi calm vibe, hand-painted anime style.',
            'golden light, airy clouds, mellow lofi energy, hand-painted anime style.',
            'gentle daylight, soft cloud texture, calm lofi atmosphere, hand-painted anime style.',
        )
    )
    assert prompt.endswith('Maintain exact character identity, no distortion.')


def test_build_pixverse_anime_lofi_prompt_uses_airborne_scene_for_fly() -> None:
    prompt = build_pixverse_anime_lofi_prompt(
        motion='fly',
        scene='mountains',
        vibe='dreamy',
    )

    assert prompt.startswith('@character ')
    assert 'through high mountain air above layered ridgelines, drifting mist, tall pines, and distant peaks' in prompt
    assert any(
        phrase in prompt
        for phrase in (
            'tracking smoothly through open air with gentle aerial motion and visible altitude',
            'graceful airborne trajectory above the environment below',
            'elegant aerial tracking, clear lift, and strong horizon separation',
        )
    )
    assert any(
        phrase in prompt
        for phrase in (
            'clear separation from the environment below, and no implied ground contact',
            'obvious lift away from the ground, and believable suspended posture',
            'clearly suspended in open space, and fully detached from the terrain beneath',
        )
    )
    assert 'mountain road' not in prompt
    assert any(
        phrase in prompt
        for phrase in (
            'mist layers drifting between ridgelines with strong altitude and deep sky separation',
            'open alpine air, distant peaks, and visible height above the mountain landscape below',
            'broad mountain sky depth with soft haze, elevated perspective, and clear spacing above the terrain',
        )
    )
    assert 'terrain-travel' not in prompt


def test_build_pixverse_anime_lofi_prompt_uses_aerial_city_language_for_fly() -> None:
    prompt = build_pixverse_anime_lofi_prompt(
        motion='fly',
        scene='city',
        vibe='cinematic',
    )

    assert 'through the open city skyline above rooftops, distant streets below, lights, and vertical urban depth' in prompt
    assert any(
        phrase in prompt
        for phrase in (
            'layered rooftop depth, distant streets below, and clean skyline spacing around the character',
            'open urban air above the city grid with visible height and soft light across the rooftops',
            'clear skyline separation with vertical city depth and the ground kept far below the subject',
        )
    )
    assert 'urban street' not in prompt
    assert 'street traversal' not in prompt


def test_build_pixverse_anime_lofi_prompt_uses_static_presence_for_stand() -> None:
    prompt = build_pixverse_anime_lofi_prompt(
        motion='stand',
        scene='city',
        vibe='cinematic',
    )

    assert prompt.startswith('@character ')
    assert 'through an urban spot with buildings, traffic lights, and subtle city movement' in prompt
    assert any(
        phrase in prompt
        for phrase in (
            'Camera holds a stable cinematic frame',
            'Camera stays mostly locked',
            'Camera keeps a composed hero frame',
        )
    )
    assert any(
        phrase in prompt
        for phrase in (
            'subtle motion in hair and clothing',
            'environment carries gentle ambient movement',
            'small natural motion in hair, fabric, and atmosphere',
        )
    )


def test_anime_lofi_prompt_package_adds_controlled_variation_metadata() -> None:
    package_a = build_pixverse_anime_lofi_prompt_package(
        motion='ride',
        scene='coastal',
        vibe='lofi',
        randomizer=random.Random(1),
    )
    package_b = build_pixverse_anime_lofi_prompt_package(
        motion='ride',
        scene='coastal',
        vibe='lofi',
        randomizer=random.Random(9),
    )

    assert package_a.prompt.startswith('@character ')
    assert package_b.prompt.startswith('@character ')
    assert package_a.prompt != package_b.prompt
    assert package_a.metadata['motion'] == 'ride'
    assert package_a.metadata['scene'] == 'coastal'
    assert package_a.metadata['vibe'] == 'lofi'
    assert package_a.metadata['qwen_expansion_used'] is False


def test_anime_lofi_prompt_package_uses_qwen_expansion_safely() -> None:
    package = build_pixverse_anime_lofi_prompt_package(
        motion='fly',
        scene='fantasy',
        vibe='dreamy',
        expansion=AnimeLofiQwenExpansion(
            environment_flavor='sparkling magical currents around distant floating ruins',
            atmosphere_flavor='soft moonlit haze with luminous particles',
            camera_texture='gentle floating lens feel with polished depth',
        ),
        randomizer=random.Random(2),
    )

    assert '@character' in package.prompt
    assert 'Maintain exact character identity, no distortion.' in package.prompt
    assert 'sparkling magical currents around distant floating ruins' in package.prompt
    assert package.metadata['qwen_expansion_used'] is True
    assert package.metadata['qwen_camera_texture'] == 'gentle floating lens feel with polished depth'


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
    assert payload['script'].startswith('@character ')
    assert 'through an elevated magical sky with floating glow, suspended fantasy elements, and surreal open-air depth' in payload['script']


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
    prompt_package = build_pixverse_anime_lofi_prompt_package(
        motion='walk',
        scene='city',
        vibe='cinematic',
        randomizer=random.Random(3),
    )

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
        anime_prompt_package=prompt_package,
    )

    assert metadata['metadata']['pixverse_mode'] == 'recipe'
    assert metadata['metadata']['resolution'] == '360p'
    assert metadata['metadata']['max_retries'] == 2
    assert metadata['metadata']['anime_prompt_package']['motion'] == 'walk'
    assert metadata['metadata']['anime_prompt_package']['scene'] == 'city'
