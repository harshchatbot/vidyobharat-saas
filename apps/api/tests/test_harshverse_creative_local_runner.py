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
    def burn(input_path, captions, output_path, *,
             voice_enhance, finish_audio, original_audio_source):
        assert input_path == source.resolve()
        assert voice_enhance == "off"
        assert finish_audio is False
        assert original_audio_source == source.resolve()
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

    # The validated talking-head zoom is now actually rendered before
    # motion composition. Keep this fake faithful to the new camera
    # adapter rather than leaving its input unmocked.
    def fake_camera(source_path, output_path, moves, **kwargs):
        assert moves and all(m.beat_id.startswith("zoom-") for m in moves)
        output_path.write_bytes(b"camera-zoom")
        from app.services.harshverse.editorial_effects import CameraEffectsResult
        return CameraEffectsResult(
            path=output_path,
            rendered_beat_ids=tuple(m.beat_id for m in moves),
            fps=30, duration_seconds=kwargs["duration"],
        )
    monkeypatch.setattr(local, "render_camera_effects", fake_camera)

    def fake_plate(composition, context, path):
        graphics = [b for b in composition.beats if b.kind == "motion_graphic"]
        assert graphics
        path.write_bytes(b"local-animation")
        return MotionPlateResult(path, tuple(b.id for b in graphics), ())
    monkeypatch.setattr(local, "render_motion_plate", fake_plate)

    called = []
    def fake_render(plan, presenter, plate, output):
        assert presenter.read_bytes() == b"camera-zoom"
        assert plate.read_bytes() == b"local-animation"
        assert any(s.recipe == "presenter_split" for s in plan.scenes)
        output.write_bytes(b"composited")
        called.append("motion")
    monkeypatch.setattr(local, "render_harshverse", fake_render)

    def fake_captions(render_source, captions, output, *,
                      voice_enhance, finish_audio, original_audio_source):
        assert render_source.read_bytes() == b"composited"
        assert voice_enhance == "off"
        assert finish_audio is False
        assert original_audio_source == source.resolve()
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
    assert result["rendered_camera_beat_ids"] == ["zoom-1"]
    assert "zoom-1" not in result["deferred_beat_ids"]
    assert not any(beat.startswith("graphic-") for beat in result["deferred_beat_ids"])
    assert (tmp_path / "result" / "harshverse_creative_preview.mp4").read_bytes() == b"final-mp4"



def test_explicit_motion_smoke_plan_is_valid_but_not_ai_generated():
    from app.services.video_creative_context import build_creative_context
    from app.services.video_creative_director_v2 import validate_scene_plan
    context = build_creative_context(fixture_report())
    # Two-phrase fixture intentionally cannot support a 3-scene diagnostic.
    import pytest
    with pytest.raises(ValueError, match="at least three"):
        local.build_motion_smoke_scene_plan(context)


def test_smoke_mode_requires_no_openai_and_keeps_explicit_provenance(monkeypatch, tmp_path):
    from app.services.video_creative_context import build_creative_context
    from app.services.harshverse.local_motion_plate import MotionPlateResult
    report = fixture_report()
    # Extend the existing fixture's source-faithful phrases by splitting its
    # first phrase into two real-word-aligned phrases; no new transcript.
    context = build_creative_context(report)
    first = context.phrases[0]
    second = context.phrases[1]
    from app.services.video_creative_context import Phrase
    from app.services.video_creative_director_v2 import validate_scene_plan
    context.phrases = [
        Phrase(id="phrase_001", segment_id=first.segment_id,
               start=first.start, end=report.speech.words[1].end,
               text=" ".join(w.text for w in report.speech.words[:2]),
               timing_status=first.timing_status),
        Phrase(id="phrase_002", segment_id=first.segment_id,
               start=report.speech.words[2].start, end=first.end,
               text=" ".join(w.text for w in report.speech.words[2:4]),
               timing_status=first.timing_status),
        Phrase(id="phrase_003", segment_id=second.segment_id,
               start=second.start, end=second.end,
               text=second.text, timing_status=second.timing_status),
    ]
    smoke = local.build_motion_smoke_scene_plan(context)
    assert len(smoke.scenes) == 3
    assert smoke.scenes[1].visual_mode == "graphic_overlay"
    assert smoke.scenes[1].motion_template == "keyword_card"
    assert smoke.scenes[1].first_phrase_id == "phrase_002"
    assert "Diagnostic" in smoke.warnings[0]
    assert validate_scene_plan(context, smoke.model_dump(mode="json")) == smoke
