from __future__ import annotations

import pytest

from app.services.structured_video_prompt_service import normalize_structured_video_prompt


def test_normalize_structured_video_prompt_supports_nested_object_shape() -> None:
    normalized = normalize_structured_video_prompt(
        {
            "shot": {
                "composition": "POV time-freeze with hands moving through frozen environment",
                "lens": "ultra-wide cinematic lens with subtle distortion",
                "camera_movement": "slow walk, precise hand movements, sudden time release burst",
            },
            "subject": {
                "description": "person moving while everything else is frozen mid-action",
                "wardrobe": "hands visible",
                "props": "frozen people, objects mid-air",
            },
            "scene": {
                "location": "busy city street",
                "time_of_day": "day",
                "environment": "people frozen mid-motion",
            },
            "visual_details": {
                "action": "walk through frozen crowd",
                "special_effects": "time freeze particles",
            },
            "cinematography": {
                "lighting": "clean daylight with sharp shadows",
                "color_palette": "natural tones with crisp contrast",
                "tone": "mind-bending, cinematic",
            },
            "audio": {
                "music": "slow ambient then explosive drop",
                "ambient": "silence then sudden chaos",
            },
        }
    )

    assert normalized["shape"] == "object"
    assert normalized["shot_count"] == 1
    assert "POV time-freeze" in normalized["provider_safe_prompt"]
    assert normalized["shots"][0]["lens"] == "ultra-wide cinematic lens with subtle distortion"
    assert normalized["shots"][0]["effects"] == "time freeze particles"


def test_normalize_structured_video_prompt_supports_shot_arrays_and_aliases() -> None:
    normalized = normalize_structured_video_prompt(
        [
            {
                "shot_type": "Extreme long shot transitioning to orbital spiral",
                "camera_movement": "360-degree barrel roll",
                "lens_spec": "22mm wide-angle prime",
                "lighting": "Harsh unshielded solar radiation",
                "subject_details": "Squadron of chrome-plated solar-sail gliders",
                "environment_details": "Golden rings of a gas giant",
                "vfx_elements": "Solar wind diffraction spikes",
                "color_palette": "Molten gold and deep violet",
                "framing": "Planet curvature with orbital debris",
            }
        ]
    )

    assert normalized["shape"] == "array"
    assert normalized["shot_count"] == 1
    shot = normalized["shots"][0]
    assert shot["composition"] == "Extreme long shot transitioning to orbital spiral"
    assert shot["lens"] == "22mm wide-angle prime"
    assert shot["effects"] == "Solar wind diffraction spikes"
    assert "Camera movement: 360-degree barrel roll" in normalized["summary"]


def test_normalize_structured_video_prompt_collects_https_assets() -> None:
    normalized = normalize_structured_video_prompt(
        {
            "shot": {
                "composition": "Hero product reveal",
            },
            "subject": {
                "reference_images": [
                    "https://example.com/reference.png",
                ],
                "reference_video": "https://example.com/motion.mp4",
            },
        }
    )

    assert normalized["reference_image_urls"] == ["https://example.com/reference.png"]
    assert [asset["kind"] for asset in normalized["assets"]] == ["image", "video"]


def test_normalize_structured_video_prompt_rejects_private_asset_uris() -> None:
    with pytest.raises(ValueError, match="public https URLs"):
        normalize_structured_video_prompt(
            {
                "shot": {"composition": "Hero reveal"},
                "subject": {"reference_image": "gs://bucket/private.png"},
            }
        )
