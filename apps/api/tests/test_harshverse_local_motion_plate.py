"""Local procedural motion execution from *existing* validated V2.1 beats."""
from __future__ import annotations

from pathlib import Path
import subprocess

import pytest

from app.services.harshverse.local_motion_plate import (
    _ass_safe, build_motion_render_composition, render_motion_plate,
)
from app.services.harshverse.composition_adapter import (
    AnimationPlate, PreparedVisual, compile_harshverse_draft,
)
from app.services.video_creative_context import build_creative_context
from app.services.video_creative_director_v2 import ScenePlanV2
from app.services.video_creative_director_v21 import compile_composition_v21
from test_video_creative_context import fixture_report
from test_video_creative_director_v2 import sample


def setup():
    context = build_creative_context(fixture_report())
    raw = sample(context)
    raw["scenes"][0]["emphasis_phrase_id"] = None
    raw["scenes"][0]["motion_template"] = "data_flow"
    composition = compile_composition_v21(context, ScenePlanV2.model_validate(raw))
    return context, composition


def test_motion_uses_original_v21_phrase_references_only():
    context, composition = setup()
    derived, graphics, skipped = build_motion_render_composition(composition, context)
    assert len(graphics) == 1
    assert graphics[0].template == "data_flow"
    assert graphics[0].text_from_phrase_id == context.phrases[0].id
    assert not skipped
    assert derived.ready_to_render is False
    assert derived.source_audio_uninterrupted
    assert all(b.kind != "broll_intent" for b in derived.beats)


def test_motion_plate_and_existing_scene_adapter_work_together(monkeypatch, tmp_path):
    context, composition = setup()
    def fake_ffmpeg(command, **kwargs):
        destination = Path(command[-1])
        subtitles = destination.with_suffix(".ass")
        text = subtitles.read_text(encoding="utf-8")
        assert context.phrases[0].text in text
        assert "THE LAYERS" not in text
        assert "HOW IT WORKS" in text
        destination.write_bytes(b"generated-procedural-preview")
        return subprocess.CompletedProcess(command, 0)
    monkeypatch.setattr("app.services.harshverse.local_motion_plate.subprocess.run", fake_ffmpeg)
    result = render_motion_plate(composition, context, tmp_path / "motion.mp4")
    assert result is not None
    assert len(result.rendered_beat_ids) == 1
    derived, graphics, _ = build_motion_render_composition(composition, context)
    plate = AnimationPlate("local-procedural:test", composition.duration_seconds, "a" * 64)
    prepared = [PreparedVisual(beat_id=b.id, asset_offset=b.start) for b in graphics]
    draft = compile_harshverse_draft(derived, plate=plate, prepared_visuals=prepared)
    assert any(s.recipe == "presenter_split" for s in draft.scene_plan.scenes)
    assert draft.needs_review and not draft.ready_to_render


def test_unresolved_broll_is_not_faked():
    context, composition = setup()
    raw = sample(context)
    raw["scenes"][0].update(
        visual_mode="broll_overlay",
        motion_template="none", emphasis_phrase_id=None,
        broll_query="licensed documentary computer room",
    )
    broll = compile_composition_v21(context, ScenePlanV2.model_validate(raw))
    derived, graphics, skipped = build_motion_render_composition(broll, context)
    assert not graphics
    assert all(b.kind != "broll_intent" for b in derived.beats)
    assert any(b.kind == "broll_intent" for b in broll.beats)
    assert render_motion_plate(broll, context, tmp_path_for_no_render()) is None


def tmp_path_for_no_render():
    # No file is created if no renderable graphics exist.
    return Path("/nonexistent/harshverse-motion-test.mp4")


def test_unsafe_unknown_phrase_rejected():
    context, composition = setup()
    graphic = next(b for b in composition.beats if b.kind == "motion_graphic")
    graphic.text_from_phrase_id = "phrase_999"
    with pytest.raises(ValueError, match="validated phrase timing"):
        build_motion_render_composition(composition, context)


def test_escape_untrusted_source_text():
    value = _ass_safe(r"{\pos(5,5)} hello" + "\n" + "world")
    assert r"\pos" not in value
    assert "｛" in value
    assert "hello world" in value
