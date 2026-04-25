from __future__ import annotations

from pathlib import Path

from app.services.audio_service import RecipeAudioService


def test_add_audio_uses_provided_narration_path_without_regenerating(monkeypatch) -> None:
    service = RecipeAudioService()
    input_video = Path("data/renders/test-input.mp4")
    narration_path = Path("data/renders/test-narration.wav")

    def fail_generate_narration_track(**kwargs):
        raise AssertionError("narration should not be regenerated when narration_path is provided")

    def fake_mux_narration_only(**kwargs):
        assert kwargs["narration_path"] == narration_path
        return Path("data/renders/test-output.mp4")

    monkeypatch.setattr(service, "_generate_narration_track", fail_generate_narration_track)
    monkeypatch.setattr(service, "_mux_narration_only", fake_mux_narration_only)

    output = service.add_audio(
        video_path=input_video,
        recipe_music=None,
        render_id="render-1",
        narration_path=narration_path,
        narration_text="This should be ignored because narration_path is provided.",
    )

    assert output == Path("data/renders/test-output.mp4")
