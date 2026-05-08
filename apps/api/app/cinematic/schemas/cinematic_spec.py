from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass(frozen=True)
class SceneSpec:
    location: str
    environment: str
    atmosphere: str
    time_of_day: str | None = None
    background_details: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class TalentSpec:
    creator_description: str
    identity_reference_rule: str
    product_reference_rule: str
    product_name: str
    product_category: str
    wardrobe: str | None = None
    expression: str | None = None


@dataclass(frozen=True)
class ActionSpec:
    opening_action: str
    product_interaction: str
    hero_reveal: str
    ending_action: str
    duration_seconds: int


@dataclass(frozen=True)
class RenderingSpec:
    aspect_ratio: str
    camera_style: str
    shot_size: str
    camera_motion: str
    lighting: str
    visual_style: str
    motion_intensity: str
    lipsync_safety: str | None = None


@dataclass(frozen=True)
class ConstraintSpec:
    must_do: list[str] = field(default_factory=list)
    must_avoid: list[str] = field(default_factory=list)
    negative_prompt: str | None = None


@dataclass(frozen=True)
class CinematicSpec:
    recipe_family: str
    recipe_version: str
    scene: SceneSpec
    talent: TalentSpec
    action: ActionSpec
    rendering: RenderingSpec
    constraints: ConstraintSpec
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
