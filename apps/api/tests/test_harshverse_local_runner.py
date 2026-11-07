"""No-cloud local HarshVerse runner tests."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts import render_harshverse_local as cli


def test_load_plan_accepts_valid_scene_plan(tmp_path):
    path = tmp_path / "plan.json"
    path.write_text(json.dumps({
        "duration": 6,
        "scenes": [
            {"recipe": "presenter_hook", "start": 0, "end": 2},
            {"recipe": "presenter_split", "start": 2, "end": 4},
            {"recipe": "presenter_outro", "start": 4, "end": 6},
        ],
    }))
    plan = cli.load_plan(path)
    plan.validate(asset_duration=6)
    assert len(plan.scenes) == 3


@pytest.mark.parametrize("invalid", [
    {"duration": 6, "scenes": [], "unexpected": True},
    {"duration": 6, "scenes": [{"recipe": "presenter_hook", "start": 0, "end": 6, "evil": "yes"}]},
    {"duration": 6, "scenes": {}},
    [],
])
def test_load_plan_rejects_invalid_json_contract(tmp_path, invalid):
    path = tmp_path / "plan.json"
    path.write_text(json.dumps(invalid))
    with pytest.raises(ValueError):
        cli.load_plan(path)


def test_render_local_calls_existing_renderer(monkeypatch, tmp_path):
    presenter = tmp_path / "source.mp4"
    animation = tmp_path / "plate.mp4"
    output = tmp_path / "preview.mp4"
    presenter.write_bytes(b"fake")
    animation.write_bytes(b"fake")
    calls = []

    def probe(path):
        return {"format": {"duration": "15.733" if path == presenter else "10.0"},
                "streams": [{"codec_type": "video"}, {"codec_type": "audio"}]}

    monkeypatch.setattr(cli, "_probe", probe)
    monkeypatch.setattr(cli, "render", lambda plan, src, plate, out: calls.append((plan, src, plate, out)))
    plan = cli.render_local(presenter=presenter, animation=animation, output=output, demo=True)
    assert len(calls) == 1
    assert calls[0][1:] == (presenter, animation, output)
    assert plan.duration == 15.733


def test_local_render_refuses_to_overwrite(monkeypatch, tmp_path):
    presenter = tmp_path / "source.mp4"
    animation = tmp_path / "plate.mp4"
    output = tmp_path / "preview.mp4"
    for path in (presenter, animation, output):
        path.write_bytes(b"fake")
    with pytest.raises(FileExistsError):
        cli.render_local(presenter=presenter, animation=animation, output=output, demo=True)


def test_local_render_refuses_source_as_output(tmp_path):
    presenter = tmp_path / "source.mp4"
    animation = tmp_path / "plate.mp4"
    for path in (presenter, animation):
        path.write_bytes(b"fake")
    with pytest.raises(ValueError, match="may not replace"):
        cli.render_local(presenter=presenter, animation=animation, output=presenter, demo=True)


def test_render_local_rejects_source_without_narration(monkeypatch, tmp_path):
    presenter = tmp_path / "source.mp4"
    animation = tmp_path / "plate.mp4"
    presenter.write_bytes(b"fake")
    animation.write_bytes(b"fake")
    monkeypatch.setattr(cli, "_probe", lambda p: {
        "format": {"duration": "8.0"}, "streams": [{"codec_type": "video"}],
    })
    with pytest.raises(ValueError, match="original audio"):
        cli.render_local(presenter=presenter, animation=animation,
                         output=tmp_path / "preview.mp4", demo=True)
