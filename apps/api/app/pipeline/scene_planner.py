from __future__ import annotations

from typing import Any

from app.recipes.recipe_registry import RecipeConfig


def plan_scenes(recipe: RecipeConfig) -> list[dict[str, Any]]:
    return [
        {
            'scene_id': scene.scene_id,
            'beat_names': list(scene.beat_names),
            'duration_seconds': int(scene.duration_seconds),
            'index': index,
        }
        for index, scene in enumerate(recipe.scene_strategy.render_scenes)
    ]
