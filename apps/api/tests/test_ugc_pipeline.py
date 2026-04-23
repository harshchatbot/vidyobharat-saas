from __future__ import annotations

from app.pipeline.pipeline_engine import (
    _apply_avatar_product_enhancer_to_scenes,
    _avatar_product_enhancer_metadata,
    _compose_avatar_product_narration_script,
    _extract_ugc_talking_excerpt,
    clean_ugc_script,
    generate_ugc_raw_script,
)
from app.pipeline.scene_planner import build_ugc_ad_scene_plan
from app.recipes.recipe_registry import get_recipe
from app.services.hf_qwen_enhancer_service import HFQwenEnhancerInput, HFQwenEnhancerResult


def test_clean_ugc_script_removes_labels_and_bullets() -> None:
    raw = """
    Hook: This actually surprised me.
    - Problem: My routine was taking forever.
    - Solution: I tried this once and it felt easier.
    CTA: You should check it out.
    """
    cleaned = clean_ugc_script(raw)
    assert "Hook:" not in cleaned
    assert "CTA:" not in cleaned
    assert cleaned.startswith("This actually surprised me.")
    assert "You should check it out." in cleaned


def test_extract_ugc_talking_excerpt_uses_opening_sentences() -> None:
    script = (
        "I honestly did not expect this to help so quickly. "
        "My old setup felt messy and slow every single day. "
        "This one change made everything simpler."
    )
    excerpt = _extract_ugc_talking_excerpt(script)
    assert "I honestly did not expect this to help so quickly." in excerpt
    assert "My old setup felt messy and slow every single day." in excerpt
    assert "This one change made everything simpler." not in excerpt


def test_generate_ugc_raw_script_uses_complete_text(monkeypatch) -> None:
    calls: dict[str, object] = {}

    class FakeQwenService:
        def __init__(self, _settings) -> None:
            pass

        def complete_text(self, **kwargs):
            calls.update(kwargs)
            return "This is a raw creator script."

    monkeypatch.setattr("app.pipeline.pipeline_engine.QwenService", FakeQwenService)
    result = generate_ugc_raw_script(topic="Hair serum", ugc_style="creator_casual")

    assert result == "This is a raw creator script."
    assert calls["task_type"] == "ugc_raw_script"
    assert "Output ONLY spoken script" in str(calls["system_prompt"])
    assert "Topic: Hair serum" in str(calls["user_prompt"])
    assert "Style: creator_casual" in str(calls["user_prompt"])


def test_build_ugc_scene_plan_does_not_require_narration_beats() -> None:
    recipe = get_recipe("ugc_ad")
    scenes = build_ugc_ad_scene_plan(
        recipe=recipe,
        topic="Local daycare for toddlers in Jaipur",
        ugc_style="creator_casual",
    )
    assert scenes
    first_scene = scenes[0]
    assert "beat_summary" not in first_scene
    assert "local_narration_context" not in first_scene
    assert "hook_plan" not in first_scene


def test_avatar_product_narration_script_uses_enhancer_lines() -> None:
    result = HFQwenEnhancerResult(
        hook_line="My mornings were always rushed.",
        showcase_line="This one is ready in under a minute.",
        cta_line="Worth trying if breakfast gets skipped.",
        showcase_visual_prompt="Avatar holding the breakfast cup in a bright kitchen.",
        voice_tone="friendly_confident",
        notes=["Keep the pack visible"],
    )

    narration = _compose_avatar_product_narration_script(result)

    assert narration == (
        "My mornings were always rushed. "
        "This one is ready in under a minute. "
        "Worth trying if breakfast gets skipped."
    )


def test_apply_avatar_product_enhancer_to_scenes_maps_scene_fields() -> None:
    enhancer_result = HFQwenEnhancerResult(
        hook_line="My mornings were always rushed.",
        showcase_line="This one is ready in under a minute.",
        cta_line="Worth trying if breakfast gets skipped.",
        showcase_visual_prompt="Avatar opens the cup beside a sunny hostel window.",
        voice_tone="friendly_confident",
        notes=["Keep the product label visible", "Use natural morning light"],
    )
    scenes = [
        {"scene_id": "hook", "stage_name": "hook", "visual_objective": "old"},
        {"scene_id": "showcase", "stage_name": "showcase", "visual_objective": "old showcase"},
        {"scene_id": "cta", "stage_name": "cta", "visual_objective": "old cta"},
    ]

    mapped = _apply_avatar_product_enhancer_to_scenes(scenes=scenes, enhancer_result=enhancer_result)

    assert mapped[0]["spoken_line"] == enhancer_result.hook_line
    assert mapped[1]["spoken_line"] == enhancer_result.showcase_line
    assert mapped[1]["showcase_visual_prompt"] == enhancer_result.showcase_visual_prompt
    assert mapped[1]["visual_objective"] == enhancer_result.showcase_visual_prompt
    assert mapped[1]["enhancer_notes"] == enhancer_result.notes
    assert "Use natural morning light" in mapped[1]["extra_avoid_guidance"]
    assert mapped[2]["spoken_line"] == enhancer_result.cta_line


def test_avatar_product_enhancer_metadata_tracks_success() -> None:
    enhancer_input = HFQwenEnhancerInput(
        product_name="Protein oats cup",
        product_type="breakfast",
        target_audience="college students",
        avatar_style="friendly creator",
        brand_tone="creator_casual",
        brief="Quick breakfast for busy mornings",
        recommended_voice="priya",
        has_product_image=True,
        reference_image_count=2,
    )
    enhancer_result = HFQwenEnhancerResult(
        hook_line="My mornings were always rushed.",
        showcase_line="This one is ready in under a minute.",
        cta_line="Worth trying if breakfast gets skipped.",
        showcase_visual_prompt="Avatar opens the cup beside a sunny hostel window.",
        voice_tone="friendly_confident",
        notes=["Keep the product label visible"],
        model="Qwen/Test",
        provider="hf_qwen",
    )

    metadata = _avatar_product_enhancer_metadata(
        enhancer_result=enhancer_result,
        enhancer_input=enhancer_input,
    )

    assert metadata["status"] == "success"
    assert metadata["provider"] == "hf_qwen"
    assert metadata["model"] == "Qwen/Test"
    assert metadata["hook_line"] == enhancer_result.hook_line
    assert metadata["avatar_product_input_summary"]["product_name"] == "Protein oats cup"


def test_avatar_product_enhancer_metadata_tracks_failure() -> None:
    enhancer_input = HFQwenEnhancerInput(product_name="Protein oats cup")

    metadata = _avatar_product_enhancer_metadata(
        enhancer_result=None,
        enhancer_input=enhancer_input,
        error="timeout",
    )

    assert metadata["status"] == "failed"
    assert metadata["error"] == "timeout"
    assert metadata["avatar_product_input_summary"]["product_name"] == "Protein oats cup"
