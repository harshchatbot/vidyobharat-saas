"""Safe, optional voice cleanup: preserve narration, no effect on SFX."""
from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from app.services.harshverse.voice_enhance import voice_enhance_filter


def test_voice_presets_are_bounded_and_do_not_use_models_or_network():
    assert voice_enhance_filter("off") == ""
    assert "highpass=f=72" in voice_enhance_filter("natural")
    studio = voice_enhance_filter("studio")
    for name in ("aresample=48000", "afftdn=", "equalizer=", "deesser=", "acompressor="):
        assert name in studio
    assert "loudnorm" not in studio  # final mastering remains separate
    with pytest.raises(ValueError, match="Unknown voice enhancement"):
        voice_enhance_filter("deepfake_voice")


def test_studio_preset_is_before_sfx_mix_and_one_final_master(monkeypatch, tmp_path):
    from scripts import render_harshverse_creative_local as local
    src = tmp_path / "src.mp4"
    subs = tmp_path / "captions.ass"
    sfx = tmp_path / "sfx.wav"
    buddy = tmp_path / "buddy.png"
    for path in (src, subs, sfx, buddy):
        path.write_bytes(b"fixture")
    commands = []

    def fake_run(command, **kw):
        commands.append(command)
        return subprocess.CompletedProcess(command, 0)
    monkeypatch.setattr(local.subprocess, "run", fake_run)
    local._burn_captions(
        src, subs, tmp_path / "out.mp4",
        buddy_path=buddy, buddy_windows=((0.3, 1.2),),
        sfx_path=sfx, voice_enhance="studio", finish_audio=True,
    )
    command = commands[0]
    graph = command[command.index("-filter_complex") + 1]
    assert "[0:a:0]aresample=48000" in graph
    assert "acompressor=" in graph
    assert "[voice][2:a:0]amix=" in graph
    assert "[mixed]loudnorm=I=-17:TP=-1.5:LRA=11[aout]" in graph
    assert graph.count("loudnorm=") == 1
    assert graph.index("afftdn=") < graph.index("amix=")
    assert command[command.index("-ar") + 1] == "48000"


def test_natural_clean_without_sfx_then_master(monkeypatch, tmp_path):
    from scripts import render_harshverse_creative_local as local
    src = tmp_path / "src.mp4"
    subs = tmp_path / "captions.ass"
    src.write_bytes(b"fixture")
    subs.write_text("fixture")
    commands = []
    monkeypatch.setattr(local.subprocess, "run", lambda cmd, **kw: commands.append(cmd))
    local._burn_captions(src,subs,tmp_path/"out.mp4",
                          voice_enhance="natural",finish_audio=True)
    graph = commands[0][commands[0].index("-filter_complex") + 1]
    assert "[0:a:0]aresample=48000" in graph
    assert "[voice]loudnorm=" in graph
    assert "amix=" not in graph


def test_voice_off_keeps_original_mix_path(monkeypatch, tmp_path):
    from scripts import render_harshverse_creative_local as local
    src, subs = tmp_path/"source.mp4", tmp_path/"captions.ass"
    src.write_bytes(b"fake")
    subs.write_text("fake")
    commands=[]
    monkeypatch.setattr(local.subprocess, "run", lambda cmd, **kw: commands.append(cmd))
    local._burn_captions(src,subs,tmp_path/"out.mp4")
    command=commands[0]
    graph=command[command.index("-filter_complex")+1]
    assert "afftdn=" not in graph
    assert "acompressor=" not in graph
    assert "loudnorm=" not in graph
    assert "0:a:0" in command
