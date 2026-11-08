"""Presenter-only grade isolation and CLI contract tests (no FFmpeg needed)."""
from pathlib import Path

import pytest

from app.services.harshverse.color_grade import presenter_grade_filter, resolve_color_grade


def test_warm_style_gets_automatic_warm_grade_without_affecting_classic():
    assert resolve_color_grade("harshverse_warm") == "warm_editorial"
    assert resolve_color_grade("classic") == "off"
    assert resolve_color_grade("harshverse_warm", "off") == "off"
    assert resolve_color_grade("classic", "warm_editorial") == "warm_editorial"
    assert presenter_grade_filter("off") == ""
    assert "colorbalance=" in presenter_grade_filter("warm_editorial")
    assert "saturation=1.07" in presenter_grade_filter("warm_editorial")


def test_invalid_grade_and_style_fail_closed():
    with pytest.raises(ValueError):
        resolve_color_grade("harshverse_warm", "cinematic_teal")
    with pytest.raises(ValueError):
        resolve_color_grade("nonexistent")
    with pytest.raises(ValueError):
        presenter_grade_filter("unrecognized")


def test_grade_runs_only_on_source_video_before_graphics(monkeypatch, tmp_path):
    from scripts import render_harshverse_creative_local as local

    original = tmp_path / "original.mp4"
    original.write_bytes(b"original")
    destination = tmp_path / "graded.mp4"
    commands = []

    def fake_run(cmd, **kwargs):
        commands.append(cmd)
        destination.write_bytes(b"graded")

    monkeypatch.setattr(local.subprocess, "run", fake_run)
    monkeypatch.setattr(local, "_probe", lambda path: {"format":{"duration":"15.7333"}})
    local._apply_presenter_grade(original, destination, "warm_editorial")

    assert original.read_bytes() == b"original"
    command = commands.pop()
    assert command[command.index("-i")+1] == str(original)
    assert command[command.index("-vf")+1] == presenter_grade_filter("warm_editorial")
    assert command[command.index("-c:a")+1] == "copy"
    assert command[-1] == str(destination)


def test_no_grade_does_not_run_extra_encoding(monkeypatch, tmp_path):
    from scripts import render_harshverse_creative_local as local
    monkeypatch.setattr(local.subprocess, "run",
                        lambda *a,**kw: pytest.fail("Should not run FFmpeg"))
    with pytest.raises(ValueError, match="disabled"):
        local._apply_presenter_grade(tmp_path/"input.mp4",tmp_path/"graded.mp4","off")
