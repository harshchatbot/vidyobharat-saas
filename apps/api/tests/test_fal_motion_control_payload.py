from app.services.fal_video_service import FalVideoService


def test_motion_control_payload_in_generate_path_includes_required_fields() -> None:
    svc = FalVideoService()
    payload = svc._build_video_payload(
        model_key="kling_v26_standard_motion_control",
        prompt="test prompt",
        aspect_ratio="9:16",
        resolution="720p",
        duration_seconds=10,
        image_url="https://example.com/image.png",
        video_url="https://example.com/dance.mp4",
        character_orientation="video",
        keep_original_sound=True,
        image_references=None,
        multi_prompt=None,
        generate_audio=None,
    )
    assert payload["image_url"] == "https://example.com/image.png"
    assert payload["video_url"] == "https://example.com/dance.mp4"
    assert payload["character_orientation"] == "video"
    assert payload["keep_original_sound"] is True
    assert "duration" not in payload
    assert "resolution" not in payload

