"""Offline bridge: ChatGPT-authored semantic choices -> review-only HarshVerse preview.

A render is an explicit local diagnostic, never automatic application or publication.
"""
from __future__ import annotations

from dataclasses import asdict
import math
from pathlib import Path

from app.services.video_creative_context import CreativeContext
from .scene_plan import Scene, ScenePlan
from .semantic_scene_planner import validate_semantic_choices


def compile_chat_preview(
    context: CreativeContext,
    choices: dict,
    *,
    reference_blueprint: dict | None = None,
    approved_module: str | None = None,
    animation_duration: float | None = None,
    fps: int = 30,
    width: int = 720,
    height: int = 1280,
) -> tuple[dict, ScenePlan | None]:
    """Validate exact quoted narration and optionally compile one explicitly matched plate.

    Never infer that a model-chosen visual asset exists. Only one approved
    scene and one user-supplied plate are supported by the V1 render adapter.
    """
    validated = validate_semantic_choices(
        context, choices, reference_blueprint=reference_blueprint,
        max_scenes=5,
    )
    if approved_module is None:
        if animation_duration is not None:
            raise ValueError("animation_duration requires explicitly approved_module")
        return validated, None
    if len(validated["proposals"]) != 1:
        raise ValueError("V1 physical preview needs exactly one selected proposal")
    proposal = validated["proposals"][0]
    if proposal["module"] != approved_module:
        raise ValueError("Animation plate module does not match validated narration proposal")
    if proposal["module"] in {"stat_chart", "day_counter", "before_after"}:
        raise ValueError("Data visual requires separately verified facts; preview blocked")
    if (not isinstance(animation_duration, (float, int)) or isinstance(animation_duration, bool)
        or not math.isfinite(animation_duration) or animation_duration <= 0):
        raise ValueError("Verified positive animation duration required")
    duration = context.media.duration_seconds
    if not 0 < duration <= 60:
        raise ValueError("Existing V1 renderer supports 60 seconds maximum")
    start, end = proposal["start_seconds"], proposal["end_seconds"]
    if end - start < 1 / fps or end - start > animation_duration + .001:
        raise ValueError("Animation must cover the entire selected phrase")
    # source narration is uninterrupted; no source cuts or invented timing
    scenes = []
    if start > 0:
        scenes.append(Scene("presenter_hook", 0, start))
    scenes.append(Scene("presenter_split", start, end, 0, approved_module))
    if end < duration:
        scenes.append(Scene("presenter_outro", end, duration))
    plan = ScenePlan(duration=duration, scenes=tuple(scenes),
                     fps=fps, width=width, height=height)
    plan.validate(asset_duration=animation_duration)
    return validated, plan


def render_chat_preview(
    context: CreativeContext, choices: dict, *,
    presenter: Path, animation: Path, output: Path,
    approved_module: str, reference_blueprint: dict | None = None,
    visual_style: str = "harshverse_warm",
) -> dict:
    """Opt-in local render using existing render_adapter: original source audio remains."""
    from .render_adapter import _duration, _probe, render
    presenter, animation, output = Path(presenter), Path(animation), Path(output)
    if not presenter.is_file() or not animation.is_file():
        raise FileNotFoundError("Real presenter and explicitly approved animation files required")
    if output.resolve() in {presenter.resolve(), animation.resolve()}:
        raise ValueError("Never overwrite source footage or animation plate")
    video_meta = _probe(presenter)
    asset_meta = _probe(animation)
    original_duration = _duration(video_meta)
    if abs(original_duration - context.media.duration_seconds) > 0.12:
        raise ValueError("Presenter duration does not match CreativeContext")
    validated, plan = compile_chat_preview(
        context, choices, reference_blueprint=reference_blueprint,
        approved_module=approved_module,
        animation_duration=_duration(asset_meta),
    )
    if plan is None:
        raise ValueError("No executable preview plan")
    render(plan, presenter, animation, output, visual_style=visual_style)
    return {
        "review_only": True, "video_path": str(output),
        "proposal": validated["proposals"][0],
        "scene_plan": asdict(plan),
        "rendered_from_user_supplied_plate": True,
        "approved_for_export": False,
    }
