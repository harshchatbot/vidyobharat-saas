"""Validated, provider-neutral HarshVerse scene plan contract.

This contract intentionally does not change the RangManch timeline schema.
Generated scenes are video assets registered via the existing guest-media flow.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal
import math

RecipeId = Literal['presenter_hook', 'presenter_split', 'animated_explainer', 'presenter_outro']
RECIPE_IDS = frozenset({'presenter_hook', 'presenter_split', 'animated_explainer', 'presenter_outro'})


@dataclass(frozen=True)
class Scene:
    recipe: RecipeId
    start: float
    end: float
    asset_offset: float = 0.0
    title: str = ''


@dataclass(frozen=True)
class ScenePlan:
    duration: float
    scenes: tuple[Scene, ...]
    fps: int = 30
    width: int = 720
    height: int = 1280

    def validate(self, *, asset_duration: float | None = None) -> None:
        if not math.isfinite(self.duration) or not (0 < self.duration <= 60):
            raise ValueError('duration must be finite and in (0, 60]')
        if self.fps not in (24, 30, 60) or self.width < 2 or self.height < 2:
            raise ValueError('invalid export dimensions or fps')
        if self.width % 2 or self.height % 2 or self.width * 16 != self.height * 9:
            raise ValueError('V1 recipes require even 9:16 dimensions')
        if not self.scenes or len(self.scenes) > 30:
            raise ValueError('scene count must be 1..30')
        cursor = 0.0
        for i, scene in enumerate(self.scenes):
            if scene.recipe not in RECIPE_IDS:
                raise ValueError(f'unsupported recipe at scene {i}')
            if not all(math.isfinite(v) for v in (scene.start, scene.end, scene.asset_offset)):
                raise ValueError(f'non-finite timestamp at scene {i}')
            if scene.start < 0 or scene.end <= scene.start or scene.asset_offset < 0:
                raise ValueError(f'invalid interval at scene {i}')
            if abs(scene.start - cursor) > (1 / self.fps + 0.001):
                raise ValueError(f'gap/overlap before scene {i}')
            if scene.end - scene.start < 1 / self.fps - 0.001:
                raise ValueError(f'scene {i} is less than one output frame')
            if len(scene.title) > 120:
                raise ValueError('title too long')
            if scene.recipe in ('presenter_split', 'animated_explainer'):
                if asset_duration is not None and scene.asset_offset + scene.end - scene.start > asset_duration + 0.05:
                    raise ValueError(f'animation asset too short for scene {i}')
            cursor = scene.end
        if abs(cursor - self.duration) > (1 / self.fps + 0.001):
            raise ValueError('scenes do not cover the declared duration')


def demo_plan(duration: float, *, asset_duration: float = 10.0) -> ScenePlan:
    """Deterministic baseline ONLY, not a substitute for transcript-aware LLM planning."""
    if duration < 6 or asset_duration < 2:
        raise ValueError('demo requires >=6 seconds presenter and >=2 seconds animation')
    hook_end = round(duration * 0.26, 3)
    split_end = round(duration * 0.46, 3)
    outro_start = round(duration * 0.87, 3)
    # Reuse a single animation plate across split and cutaway, without exceeding its length.
    animation_total = outro_start - hook_end
    if animation_total > asset_duration:
        split_end = hook_end + min(2, asset_duration / 3)
        outro_start = min(duration - 1, hook_end + asset_duration)
    plan = ScenePlan(duration=duration, scenes=(
        Scene('presenter_hook', 0, hook_end),
        Scene('presenter_split', hook_end, split_end, 0),
        Scene('animated_explainer', split_end, outro_start, split_end - hook_end),
        Scene('presenter_outro', outro_start, duration),
    ))
    plan.validate(asset_duration=asset_duration)
    return plan
