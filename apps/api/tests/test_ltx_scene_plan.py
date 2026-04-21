from __future__ import annotations

from app.pipeline.scene_planner import build_ltx_cinematic_montage_scene_plan
from app.recipes.recipe_registry import get_recipe


def test_ltx_cinematic_montage_scene_plan_is_compressed_to_three_scenes() -> None:
    recipe = get_recipe("ltx_cinematic_montage_v1")
    scenes = build_ltx_cinematic_montage_scene_plan(recipe=recipe)

    assert len(scenes) == 3
    assert [scene["scene_role"] for scene in scenes] == [
        "establish",
        "hero_detail_main_proof",
        "closing_payoff",
    ]
    assert [int(scene["duration_seconds"]) for scene in scenes] == [8, 8, 10]
    assert all(bool(scene["stitch_safe_ending"]) for scene in scenes)
