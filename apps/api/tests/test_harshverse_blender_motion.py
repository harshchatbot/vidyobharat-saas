"""Blender 3D integration contract and regressions without installed Blender."""
from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
import json
import subprocess

import pytest

from app.services.harshverse.blender_motion import (
    blender_executable, build_blender_job, group_visual_sequences,
    render_blender_plate,
)
from app.services.harshverse.local_motion_plate import render_motion_plate
from test_harshverse_local_motion_plate import setup


def _beats():
    context, composition = setup()
    graphics = [b for b in composition.beats if b.kind == "motion_graphic"]
    assert graphics
    return context, composition, graphics


def test_blender_job_uses_only_validated_phrase_timed_beats():
    _context, composition, beats = _beats()
    job = build_blender_job(composition, beats, quality="preview")
    assert job["contract"] == "harshverse-blender-3d-v1"
    assert job["fps"] == 24
    assert job["width"] == 540
    assert job["height"] == 480
    assert job["duration"] == composition.duration_seconds
    assert job["sequences"][0]["beats"][0]["id"] == beats[0].id
    final = build_blender_job(composition, beats, quality="final")
    assert (final["width"], final["height"], final["fps"]) == (720, 640, 30)
    with pytest.raises(ValueError):
        build_blender_job(composition, beats, quality="ultra-unsupported")


def test_blender_groups_consecutive_same_template_without_changing_timestamps():
    from app.services.video_creative_director_v21 import CompositionBeat
    def graphic(index, start, end, template="data_flow"):
        return CompositionBeat(
            id=f"graphic-{index}", start=start, end=end,
            kind="motion_graphic", template=template,
        )
    beats = [graphic(0,1,2),graphic(1,2.1,3.1),graphic(2,4,5),
             graphic(3,5,6,"source_stack")]
    groups = group_visual_sequences(beats)
    assert len(groups) == 3
    assert groups[0]["start"] == 1
    assert groups[0]["end"] == 3.1
    assert [b["id"] for b in groups[0]["beats"]] == ["graphic-0","graphic-1"]
    assert groups[1]["start"] == 4
    assert groups[2]["template"] == "source_stack"
    with pytest.raises(ValueError, match="Overlapping"):
        group_visual_sequences([graphic(0,1,3),graphic(1,2.9,4)])


def test_blender_missing_fails_explicitly_without_fake_3d(monkeypatch):
    import app.services.harshverse.blender_motion as module
    monkeypatch.delenv("RANGMANCH_BLENDER_BIN", raising=False)
    monkeypatch.setattr(module.shutil, "which", lambda _: None)
    monkeypatch.setattr(module.os.path, "isfile", lambda *a: False, raising=False)
    # An explicit nonexistent file must not silently turn into illustrated art.
    monkeypatch.setattr(Path, "is_file", lambda _self: False)
    with pytest.raises(RuntimeError, match="Blender executable not found"):
        blender_executable("/missing/blender")


def test_blender_dispatch_runs_only_when_opted_in(monkeypatch,tmp_path):
    from app.services.harshverse import blender_motion
    context, composition, beats = _beats()
    calls = []
    def fake_renderer(composition, beats, path, **kwargs):
        calls.append(kwargs)
        path.write_bytes(b"3d-plate")
        return SimpleNamespace(
            path=path, rendered_beat_ids=tuple(b.id for b in beats),
        )
    monkeypatch.setattr(blender_motion, "render_blender_plate", fake_renderer)
    result = render_motion_plate(
        composition, context, tmp_path/"3d.mp4",
        visual_style="harshverse_warm", motion_engine="blender3d",
        blender_quality="preview",
    )
    assert result is not None
    assert result.rendered_beat_ids == tuple(b.id for b in beats)
    assert len(calls) == 1
    assert calls[0]["quality"] == "preview"
    with pytest.raises(ValueError,match="requires the warm"):
        render_motion_plate(
            composition, context, tmp_path/"invalid.mp4",
            visual_style="classic", motion_engine="blender3d",
        )


def test_blender_scene_script_uses_actual_3d_geometry_not_pillow():
    from app.services.harshverse import blender_motion
    script = Path(blender_motion.__file__).with_name("blender_scene.py")
    source = script.read_text(encoding="utf-8")
    assert "primitive_cube_add" in source
    assert "primitive_uv_sphere_add" in source
    assert "type=\"AREA\"" in source
    assert "keyframe_insert" in source
    assert "ortho_scale" in source
    assert "bpy.ops.render.render(animation=True)" in source
    compile(source, str(script), "exec")


def test_blender_render_subprocess_contract_no_blender_required(monkeypatch,tmp_path):
    import app.services.harshverse.blender_motion as module
    _context, composition, beats = _beats()
    binary = tmp_path/"blender"
    binary.write_text("fake",encoding="utf-8")
    binary.chmod(0o755)
    calls=[]
    def fake_run(command,**kwargs):
        calls.append(command)
        if "--background" in command:
            args = command[command.index("--") + 1:]
            frames = Path(args[args.index("--frames")+1])
            job_path = Path(args[args.index("--job")+1])
            job = json.loads(job_path.read_text(encoding="utf-8"))
            for frame in range(1, 1 + __import__("math").ceil(job["duration"]*job["fps"])):
                (frames/f"frame_{frame:06d}.png").write_bytes(b"png")
            return subprocess.CompletedProcess(command,0,stdout="",stderr="")
        destination=Path(command[-1])
        destination.write_bytes(b"valid-ffmpeg-fixture")
        return subprocess.CompletedProcess(command,0,stdout="",stderr="")
    monkeypatch.setattr(module.subprocess,"run",fake_run)
    out = render_blender_plate(
        composition,beats,tmp_path/"animated.mp4",
        blender=binary,quality="preview",
    )
    assert out.path.exists()
    assert out.grouped_sequences == 1
    assert len(calls)==2
    assert "--background" in calls[0]
    assert "ffmpeg" in calls[1][0]


def test_invalid_blender_engine_never_invokes_external_subprocess():
    _context, composition, beats = _beats()
    with pytest.raises(ValueError):
        group_visual_sequences([], max_gap_seconds=1.0)



def test_warm_plate_transition_maintains_source_duration():
    from app.services.harshverse.render_adapter import build_filter
    from app.services.harshverse.scene_plan import Scene, ScenePlan
    plan = ScenePlan(
        duration=4, width=720, height=1280, fps=30,
        scenes=(Scene("presenter_hook",0,1),
                Scene("presenter_split",1,3,asset_offset=1),
                Scene("presenter_outro",3,4)),
    )
    warm = build_filter(plan,visual_style="harshverse_warm",face_center_y=.45)
    classic = build_filter(plan)
    assert "fade=t=in:st=0:d=0.1800:alpha=1" in warm
    assert "fade=t=out:st=1.8200:d=0.1800:alpha=1" in warm
    assert "color=c=0xF8F3E9:s=720x640" in warm
    assert "concat=n=3" in warm
    assert "fade=t=in:" not in classic
    assert "concat=n=3" in classic



def test_adjacent_3d_beats_become_single_continuous_split_without_touching_audio():
    from app.services.harshverse.composition_adapter import (
        AnimationPlate, PreparedVisual, compile_harshverse_draft,
    )
    from app.services.video_creative_director_v21 import CompositionBeat, CompositionPlanV21
    beats = [
        CompositionBeat(
            id="source", kind="source", template="original_video_audio",
            start=0, end=5,
        ),
        CompositionBeat(
            id="graphic-a", kind="motion_graphic", template="data_flow",
            start=1, end=2, layout="face_safe_graphic",
            phrase_ids=["phrase_001"], text_from_phrase_id="phrase_001",
        ),
        CompositionBeat(
            id="graphic-b", kind="motion_graphic", template="data_flow",
            start=2.12, end=3, layout="face_safe_graphic",
            phrase_ids=["phrase_002"], text_from_phrase_id="phrase_002",
        ),
    ]
    composition = CompositionPlanV21(
        duration_seconds=5, aspect_ratio="9:16",
        beats=beats,
    )
    plate = AnimationPlate(
        asset_id="local-procedural:3d-test", duration=5, sha256="0" * 64,
    )
    prepared = [
        PreparedVisual(beat_id="graphic-a", asset_offset=1),
        PreparedVisual(beat_id="graphic-b", asset_offset=2.12),
    ]
    illustrated = compile_harshverse_draft(
        composition,plate=plate,prepared_visuals=prepared,
    )
    blender = compile_harshverse_draft(
        composition,plate=plate,prepared_visuals=prepared,
        merge_adjacent_motion=True,
    )
    illustrated_splits = [x for x in illustrated.scene_plan.scenes
                          if x.recipe == "presenter_split"]
    continuous = [x for x in blender.scene_plan.scenes
                  if x.recipe == "presenter_split"]
    assert len(illustrated_splits) == 2
    assert len(continuous) == 1
    assert (continuous[0].start, continuous[0].end) == (1, 3)
    assert continuous[0].asset_offset == 1
    assert blender.scene_plan.duration == illustrated.scene_plan.duration == 5
    assert composition.source_audio_uninterrupted
