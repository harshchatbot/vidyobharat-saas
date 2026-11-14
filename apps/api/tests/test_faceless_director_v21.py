"""Contract tests for script-first faceless Creative Director V2.1."""
from __future__ import annotations

import pytest

from scripts.render_faceless_director_v21 import _normalized_plan, checked_assets


def _assets() -> dict:
    return {
        "money": {"kind": "video", "path": "/tmp/money.mp4"},
        "graph": {"kind": "greenscreen", "path": "/tmp/graph.mp4"},
        "pop": {"kind": "sfx", "path": "/tmp/pop.wav"},
    }


def test_director_scene_count_and_frame_timing() -> None:
    raw = {
        "creative_thesis": "Explain how careful savings support growth",
        "scenes": [
            {"asset_id": "money", "headline": "Start with savings",
             "motion": "hold", "weight": 2, "sfx_id": None},
            {"asset_id": "graph", "headline": "Grow over time",
             "motion": "push_in", "weight": 3, "sfx_id": "pop"},
        ],
    }
    plan = _normalized_plan(raw, _assets(), 12, brief="Money growth")
    assert len(plan["scenes"]) == 2
    assert sum(s["duration_frames"] for s in plan["scenes"]) == 360
    assert plan["scenes"][0]["start_frame"] == 0
    assert plan["scenes"][-1]["end_frame"] == 360
    assert plan["ready_to_publish"] is False


def test_director_rejects_invented_asset() -> None:
    raw = {"creative_thesis": "Tell a grounded financial story",
           "scenes": [
               {"asset_id": "fake", "headline": "First idea",
                "motion": "hold", "weight": 1, "sfx_id": None},
               {"asset_id": "money", "headline": "Second idea",
                "motion": "hold", "weight": 1, "sfx_id": None},
           ]}
    with pytest.raises(ValueError, match="unknown video asset"):
        _normalized_plan(raw, _assets(), 12, brief="Money growth")


def test_unlicensed_asset_rejected_without_private_preview(tmp_path) -> None:
    video = tmp_path / "test.mp4"
    video.write_bytes(b"not a real video but a valid test file")
    catalog = tmp_path / "assets.json"
    catalog.write_text(__import__("json").dumps({"assets": [
        {"id": "test", "path": str(video), "kind": "video",
         "commercial_use_verified": False, "license_reference": ""},
    ]}))
    with pytest.raises(ValueError, match="Commercial license"):
        checked_assets(catalog, private_preview=False)
    result, warnings = checked_assets(catalog, private_preview=True)
    assert "test" in result
    assert warnings and "PRIVATE PREVIEW ONLY" in warnings[0]
