"""Local end-to-end orchestration tests without Whisper, FFmpeg or OpenAI calls."""
from __future__ import annotations

import asyncio
import json

from scripts import render_harshverse_creative_local as local
from test_video_creative_context import fixture_report


def test_local_pipeline_reuses_existing_engines(monkeypatch, tmp_path):
    source = tmp_path / "presenter.mp4"
    source.write_bytes(b"video-with-audio-fixture")
    transcript = tmp_path / "words.json"
    transcript.write_text(json.dumps({
        "language": "en",
        "words": [{"text": w.text, "start": w.start, "end": w.end}
                  for w in fixture_report().speech.words],
    }))
    monkeypatch.setattr(local, "_probe", lambda path: {
        "format": {"duration": "15.733"},
        "streams": [{"codec_type": "video"}, {"codec_type": "audio"}],
    })
    monkeypatch.setattr(local, "build_video_analysis_report",
                        lambda path, media_id, *, transcript, style: fixture_report())
    output_calls = []
    def burn(input_path, captions, output_path):
        assert input_path == source.resolve()
        assert captions.read_text(encoding="utf-8").count("Dialogue:") >= 2
        output_calls.append(input_path)
        output_path.write_bytes(b"preview-output")
    monkeypatch.setattr(local, "_burn_captions", burn)
    output_dir = tmp_path / "preview"
    result = asyncio.run(local.build_local_creative_preview(
        source, output_dir, transcript_path=transcript, api_key=None,
    ))
    assert result["status"] == "preview_requires_review"
    assert result["captions"] == 2
    assert result["highlighted_words"] == 6
    assert result["director_mode"] == "existing_deterministic_fallback"
    assert output_calls == [source.resolve()]
    assert (output_dir / "harshverse_creative_preview.mp4").read_bytes() == b"preview-output"
    assert (output_dir / "visual_analysis_v2.json").exists()
    assert (output_dir / "creative_context.json").exists()
    assert (output_dir / "creative_director_v2.json").exists()
    assert (output_dir / "creative_director_v21.json").exists()
    assert json.loads((output_dir / "local_preview_report.json").read_text())["status"] == "preview_requires_review"


def test_does_not_clobber_existing_preview(tmp_path):
    source = tmp_path / "presenter.mp4"
    source.write_bytes(b"recording")
    output_dir = tmp_path / "preview"
    output_dir.mkdir()
    (output_dir / "harshverse_creative_preview.mp4").write_bytes(b"original-result")
    try:
        asyncio.run(local.build_local_creative_preview(source, output_dir))
    except FileExistsError:
        pass
    else:
        raise AssertionError("Existing render was overwritten")
    assert (output_dir / "harshverse_creative_preview.mp4").read_bytes() == b"original-result"


def test_load_local_environment_uses_api_dotenv_without_overwriting_shell(monkeypatch, tmp_path):
    env = tmp_path / ".env"
    env.write_text("OPENAI_API_KEY=from-dotenv-test\n", encoding="utf-8")
    monkeypatch.setattr(local, "ENV_FILE", env)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    assert local.load_local_environment() == "from-dotenv-test"


def test_load_local_environment_preserves_shell_key(monkeypatch, tmp_path):
    env = tmp_path / ".env"
    env.write_text("OPENAI_API_KEY=from-dotenv-test\n", encoding="utf-8")
    monkeypatch.setattr(local, "ENV_FILE", env)
    monkeypatch.setenv("OPENAI_API_KEY", "shell-test-key")
    assert local.load_local_environment() == "shell-test-key"


def test_missing_openai_key_with_require_flag_fails_before_analysis(monkeypatch, tmp_path, capsys):
    env = tmp_path / ".env"
    env.write_text("OTHER_SETTING=ok\n", encoding="utf-8")
    monkeypatch.setattr(local, "ENV_FILE", env)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    status = local.main(["--require-openai"])
    assert status == 2
    assert "OPENAI_API_KEY was not found" in capsys.readouterr().err



def test_local_creative_pipeline_executes_v21_graphic_without_claiming_broll(monkeypatch, tmp_path):
    from app.services.video_creative_director_v2 import ScenePlanV2
    from app.services.video_creative_context import build_creative_context
    from app.services.harshverse.local_motion_plate import MotionPlateResult
    from test_video_creative_director_v2 import sample

    source = tmp_path / "presenter.mp4"
    source.write_bytes(b"video-with-audio")
    transcript = tmp_path / "words.json"
    transcript.write_text(json.dumps({
        "language": "en",
        "words": [{"text": w.text, "start": w.start, "end": w.end}
                  for w in fixture_report().speech.words],
    }), encoding="utf-8")
    monkeypatch.setattr(local, "_probe", lambda path: {
        "format": {"duration": "15.733"},
        "streams": [{"codec_type": "video"}, {"codec_type": "audio"}],
    })
    monkeypatch.setattr(local, "build_video_analysis_report",
                        lambda path, media_id, *, transcript, style: fixture_report())

    async def fake_director(context, *, api_key, model, local_graphics_only):
        assert local_graphics_only is True
        assert api_key == "test-key"
        return ScenePlanV2.model_validate(sample(context))
    monkeypatch.setattr(local, "generate_openai_scene_plan", fake_director)

    def fake_plate(composition, context, path):
        graphics = [b for b in composition.beats if b.kind == "motion_graphic"]
        assert graphics
        path.write_bytes(b"local-animation")
        return MotionPlateResult(path, tuple(b.id for b in graphics), ())
    monkeypatch.setattr(local, "render_motion_plate", fake_plate)

    called = []
    def fake_render(plan, presenter, plate, output):
        assert presenter == source.resolve()
        assert plate.read_bytes() == b"local-animation"
        assert any(s.recipe == "presenter_split" for s in plan.scenes)
        output.write_bytes(b"composited")
        called.append("motion")
    monkeypatch.setattr(local, "render_harshverse", fake_render)

    def fake_captions(render_source, captions, output):
        assert render_source.read_bytes() == b"composited"
        assert "Dialogue:" in captions.read_text(encoding="utf-8")
        output.write_bytes(b"final-mp4")
        called.append("captions")
    monkeypatch.setattr(local, "_burn_captions", fake_captions)

    result = asyncio.run(local.build_local_creative_preview(
        source, tmp_path / "result", transcript_path=transcript,
        api_key="test-key",
    ))
    assert called == ["motion", "captions"]
    assert result["director_mode"] == "creative_director_v2_openai"
    assert len(result["rendered_motion_beat_ids"]) == 1
    assert not any(beat.startswith("graphic-") for beat in result["deferred_beat_ids"])
    assert (tmp_path / "result" / "harshverse_creative_preview.mp4").read_bytes() == b"final-mp4"
