"""Phase 1 HarshVerse warm pack safety and output smoke tests."""
from __future__ import annotations

from pathlib import Path
import subprocess
import wave

import pytest
from PIL import Image

from app.services.harshverse.warm_style import (
    PALETTE, STYLE_ID, draw_buddy, make_buddy_sticker, make_explainer_panel,
)
from app.services.harshverse.warm_sfx import synthesize_warm_sfx
from app.services.harshverse.render_adapter import build_filter
from app.services.harshverse.scene_plan import Scene, ScenePlan


@pytest.mark.parametrize("template", ["keyword_card", "data_flow", "human_vs_ai", "source_stack"])
def test_warm_templates_generate_original_standalone_panels(tmp_path, template):
    path = make_explainer_panel(tmp_path / (template + ".jpg"), template=template)
    assert path.is_file()
    with Image.open(path) as art:
        assert art.size == (720, 640)
        assert art.getpixel((710, 635)) != (0, 0, 0)
    assert STYLE_ID == "harshverse_warm"
    assert PALETTE["cream"] == "#F8F3E9"


def test_buddy_is_transparent_and_reused_without_external_assets(tmp_path):
    sticker = make_buddy_sticker(tmp_path / "buddy.png", mood="surprised")
    with Image.open(sticker) as image:
        assert image.mode == "RGBA"
        assert image.size == (165, 166)
        assert image.getpixel((160, 160))[3] == 0
        assert any(pixel[3] > 0 for pixel in image.getdata())


def test_invalid_templates_do_not_fallback_to_random_graphics(tmp_path):
    with pytest.raises(ValueError):
        make_explainer_panel(tmp_path / "bad.jpg", template="unknown")


def test_warm_crop_fills_presenter_panel_and_classic_is_unchanged():
    plan = ScenePlan(
        duration=2, width=720, height=1280,
        scenes=(Scene("presenter_split",0,2,asset_offset=0),),
    )
    classic = build_filter(plan)
    warm = build_filter(plan, visual_style="harshverse_warm", face_center_y=0.57)
    assert "force_original_aspect_ratio=decrease" in classic
    assert "pad=720:640" in classic
    assert "crop=720:640" in warm
    assert "pad=720:640" not in warm
    with pytest.raises(ValueError, match="Invalid detected face center"):
        build_filter(plan, visual_style="harshverse_warm", face_center_y=2)


def test_original_sfx_is_mono_48khz_bounded_and_throttled(tmp_path):
    path, count = synthesize_warm_sfx(tmp_path / "original.wav", 4.0, [
        (0.1,"whoosh"), (0.2,"pop"), (1.4,"click"), (2.9,"whoosh"),
    ])
    assert count == 3
    with wave.open(str(path), "rb") as audio:
        assert audio.getframerate() == 48000
        assert audio.getnchannels() == 1
        assert audio.getnframes() == 4 * 48000
    with pytest.raises(ValueError):
        synthesize_warm_sfx(tmp_path / "bad.wav",4.0,[(.2,"licensed_sample")])


def test_original_warm_motion_ffmpeg_filters_smoke(monkeypatch, tmp_path):
    from app.services.harshverse import local_motion_plate
    from test_harshverse_local_motion_plate import setup
    context, composition = setup()
    captured = []

    def fake_ffmpeg(command, **kwargs):
        captured.append(command)
        assert "-filter_complex" in command
        filter_complex = command[command.index("-filter_complex")+1]
        assert "overlay=x=" in filter_complex
        assert "gte(t" in filter_complex
        assert "shortest=1" in filter_complex
        destination = Path(command[-1])
        destination.write_bytes(b"fake-warm-mp4")
        return subprocess.CompletedProcess(command, 0)

    monkeypatch.setattr(local_motion_plate.subprocess, "run", fake_ffmpeg)
    result = local_motion_plate.render_motion_plate(
        composition,context,tmp_path / "warm.mp4",visual_style="harshverse_warm"
    )
    assert result is not None
    assert len(result.rendered_beat_ids)==1
    assert (tmp_path / "warm_warm_00_step1.png").is_file()
    assert (tmp_path / "warm_warm_00_step2.png").is_file()
    assert (tmp_path / "warm_warm_00_step3.png").is_file()
    assert captured


def test_captions_use_dedicated_warm_explainer_safe_strip():
    from app.services.harshverse.creative_caption_bridge import build_caption_overlays
    from test_harshverse_local_motion_plate import setup
    from test_video_creative_context import fixture_report
    context, composition = setup()
    overlays, _warnings = build_caption_overlays(
        fixture_report(), context, composition, visual_style="harshverse_warm",
    )
    assert overlays
    assert any(abs(item.y - .43)<.001 for item in overlays)
    assert all(item.font_size==39 for item in overlays)



def test_warm_burn_builds_single_combined_video_and_audio_graph(monkeypatch, tmp_path):
    from scripts import render_harshverse_creative_local as local

    source = tmp_path / "source.mp4"
    captions = tmp_path / "captions.ass"
    buddy = tmp_path / "buddy.png"
    sfx = tmp_path / "sfx.wav"
    for path in (source, captions, buddy, sfx):
        path.write_bytes(b"fixture")
    commands = []

    def fake_ffmpeg(command, **kwargs):
        commands.append(command)
        return subprocess.CompletedProcess(command, 0)

    monkeypatch.setattr(local.subprocess, "run", fake_ffmpeg)
    local._burn_captions(
        source, captions, tmp_path / "preview.mp4", buddy_path=buddy,
        buddy_windows=((.25, 1.3),), sfx_path=sfx,
    )
    command = commands.pop()
    assert command.count("-filter_complex") == 1
    graph = command[command.index("-filter_complex") + 1]
    assert "[0:v]" in graph
    assert "[cap][1:v]overlay=" in graph
    assert "[0:a:0][2:a:0]amix=" in graph
    assert command[command.index("-map") + 1] == "[vout]"
    assert "[aout]" in command


def test_classic_burn_uses_original_audio_and_no_buddy(monkeypatch, tmp_path):
    from scripts import render_harshverse_creative_local as local
    source, captions = tmp_path / "source.mp4", tmp_path / "captions.ass"
    source.write_bytes(b"fixture")
    captions.write_text("[Script Info]", encoding="utf-8")
    commands = []
    monkeypatch.setattr(
        local.subprocess, "run",
        lambda command, **kwargs: commands.append(command),
    )
    local._burn_captions(source, captions, tmp_path / "preview.mp4")
    command = commands.pop()
    assert "-filter_complex" in command
    assert "amix=" not in command[command.index("-filter_complex")+1]
    assert "0:a:0" in command



def test_warm_objects_are_drawn_in_three_distinct_stages(tmp_path):
    import hashlib
    from app.services.harshverse.warm_style import make_explainer_panel
    outputs = []
    for step in (1, 2, 3):
        file = make_explainer_panel(
            tmp_path / f"flow-{step}.jpg", template="data_flow",
            reveal_step=step,
        )
        outputs.append(hashlib.sha256(file.read_bytes()).hexdigest())
    assert len(set(outputs)) == 3
    with pytest.raises(ValueError, match="reveal_step"):
        make_explainer_panel(
            tmp_path / "bad.jpg", template="data_flow", reveal_step=4
        )


def test_extended_original_warm_sfx_vocab(tmp_path):
    from app.services.harshverse.warm_sfx import synthesize_warm_sfx
    wave, cues = synthesize_warm_sfx(tmp_path / "type-and-impact.wav",3.1,[
        (.15, "typewriter"), (1.3, "faahh"),
    ])
    assert wave.exists()
    assert cues == 2
