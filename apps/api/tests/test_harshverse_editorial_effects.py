"""Foundational camera FX: validated zooms run, not merely deferred.

All unit tests use the existing director's review-only plans; no new
timestamps are guessed and source narration remains untouched.
"""
from __future__ import annotations

import subprocess
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.services.harshverse.editorial_effects import (
    CameraMove, camera_moves_from_composition,
    camera_effect_filter, render_camera_effects,
)
from app.services.video_creative_context import build_creative_context
from app.services.video_creative_director_v2 import ScenePlanV2, validate_scene_plan
from app.services.video_creative_director_v21 import compile_composition_v21
from test_video_creative_context import fixture_report
from test_video_creative_director_v2 import sample


def _composition():
    context = build_creative_context(fixture_report())
    scene = validate_scene_plan(context, sample(context))
    return compile_composition_v21(context, scene)


def test_v21_zoom_is_now_a_validated_executable_camera_move():
    plan = _composition()
    expected = [beat.id for beat in plan.beats if beat.kind == "zoom"]
    assert expected
    moves = camera_moves_from_composition(plan)
    assert [m.beat_id for m in moves] == expected
    assert all(1 < m.peak_scale <= 1.15 for m in moves)


def test_camera_zoom_is_smooth_and_bounded():
    moves = (CameraMove("zoom-1",1,3,1.08),)
    graph = camera_effect_filter(moves)
    assert "zoompan=" in graph
    assert "sin(PI*(on-30)/60)" in graph
    assert "d=1:s=720x1280:fps=30" in graph
    assert "iw*0.50000" in graph
    assert "ih*0.40000" in graph
    with pytest.raises(ValueError,match="Invalid face-center"):
        camera_effect_filter(moves,face_center_y=1.6)


def test_unsupported_keyframes_fail_closed_not_fake_zoom():
    plan = _composition()
    b = next(item for item in plan.beats if item.kind == "zoom")
    broken = b.model_copy(update={"template":"spin"})
    modified = plan.model_copy(deep=True)
    modified.beats = [broken if i.id == b.id else i for i in modified.beats]
    with pytest.raises(ValueError,match="Unsupported"):
        camera_moves_from_composition(modified)


def test_camera_effects_preserves_audio_mapping_and_duration(monkeypatch,tmp_path):
    source=tmp_path/"source.mp4"
    source.write_bytes(b"original")
    output=tmp_path/"zoom.mp4"
    calls=[]
    import app.services.harshverse.editorial_effects as effects
    def fake_run(cmd,**kwargs):
        calls.append(cmd)
        output.write_bytes(b"video")
        return subprocess.CompletedProcess(cmd,0,stdout="",stderr="")
    monkeypatch.setattr(effects.subprocess,"run",fake_run)
    result=render_camera_effects(
        source,output,(CameraMove("zoom-a",1,2.5,1.075),),
        duration=5.0,face_center_y=.38,
    )
    assert result.rendered_beat_ids == ("zoom-a",)
    assert result.duration_seconds == 5.0
    assert source.read_bytes() == b"original"
    cmd=calls[0]
    assert cmd[cmd.index("-t")+1] == "5.000000"
    assert cmd[cmd.index("-c:a")+1] == "copy"
    assert "zoompan=" in cmd[cmd.index("-vf")+1]
    assert [cmd[i+1] for i,arg in enumerate(cmd) if arg == "-map"] == [
        "0:v:0","0:a:0",
    ]


def test_short_requested_zoom_remains_deferred():
    plan = _composition()
    zoom = next(b for b in plan.beats if b.kind == "zoom")
    shorter = zoom.model_copy(update={"end":zoom.start+.21})
    changed=plan.model_copy(deep=True)
    changed.beats=[shorter if b.id == zoom.id else b for b in plan.beats]
    assert camera_moves_from_composition(changed) == ()



def test_final_fade_covers_all_visual_layers_but_preserves_voice(monkeypatch,tmp_path):
    from app.services.harshverse.video_fades import (
        render_video_fades, video_fade_filter,
    )
    assert "fade=t=in:st=0:d=0.350" in video_fade_filter(
        duration=15.733, fade_seconds=.35,
    )
    assert "fade=t=out:st=15.383:d=0.350" in video_fade_filter(
        duration=15.733, fade_seconds=.35,
    )
    with pytest.raises(ValueError,match="entire video"):
        video_fade_filter(duration=.6,fade_seconds=.35)
    original = tmp_path / "composited.mp4"
    original.write_bytes(b"fixture")
    output = tmp_path / "faded.mp4"
    import app.services.harshverse.video_fades as module
    calls = []
    def fake_run(cmd,**kwargs):
        calls.append(cmd)
        output.write_bytes(b"faded")
        return subprocess.CompletedProcess(cmd,0,stdout="",stderr="")
    monkeypatch.setattr(module.subprocess,"run",fake_run)
    render_video_fades(original,output,duration=15.733,fade_seconds=.35)
    command=calls[0]
    assert "fade=t=in:" in command[command.index("-vf")+1]
    assert command[command.index("-c:a")+1] == "copy"
    assert original.read_bytes() == b"fixture"
    assert output.read_bytes() == b"faded"


def test_render_camera_composition_keeps_non_zoom_beats_deferred():
    plan = _composition()
    moves = camera_moves_from_composition(plan)
    assert moves
    assert all(move.beat_id.startswith("zoom-") for move in moves)
    # Sound, B-roll, and source events do not become fake camera effects.
    assert not any(b.kind == "motion_graphic" and b.id in
                   {m.beat_id for m in moves} for b in plan.beats)
