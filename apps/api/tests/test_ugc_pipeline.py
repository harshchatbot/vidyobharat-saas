from __future__ import annotations

from app.pipeline.pipeline_engine import (
    _apply_avatar_product_enhancer_to_scenes,
    _apply_chitrakala_v1_scene_strategy,
    _avatar_product_enhancer_metadata,
    _avatar_product_hero_reveal_guidance,
    _build_avatar_product_seedance_lite_prompt,
    _build_avatar_product_single_shot_kling_prompt,
    _build_chitrakala_showcase_prompt,
    _compose_avatar_product_narration_script,
    _extract_ugc_talking_excerpt,
    _is_chitrakala_showcase_scene,
    _resolve_ugc_persona,
    _resolve_requested_avatar_id,
    _split_chitrakala_manual_script,
    _translate_avatar_product_narration_if_needed,
    clean_ugc_script,
    generate_ugc_raw_script,
)
from app.pipeline.scene_planner import AvatarProductBrief, build_avatar_product_scene_plan, build_ugc_ad_scene_plan
from app.recipes.recipe_registry import get_recipe
from app.services.hf_qwen_enhancer_service import HFQwenEnhancerInput, HFQwenEnhancerResult
from app.services.avatar_service import ActorRecord, AvatarReferenceImageVariant


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
        brand_name="FastFuel",
        product_type="breakfast",
        product_subcategory="oats",
        campaign_objective="drive_purchases",
        platform="Instagram Reels",
        target_audience="college students",
        avatar_style="friendly creator",
        brand_tone="creator_casual",
        main_benefit="protein breakfast",
        brief="Quick breakfast for busy mornings",
        recommended_voice="priya",
        has_product_image=True,
        reference_image_count=2,
        category_specific_details="Focus on convenience during rushed mornings.",
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
    assert metadata["avatar_product_input_summary"]["category_specific_details"] == "Focus on convenience during rushed mornings."


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


def test_avatar_product_scene_plan_routes_all_scenes_to_talking_avatar() -> None:
    recipe = get_recipe("avatar_product")

    scenes = build_avatar_product_scene_plan(
        recipe=recipe,
        topic="Cold cola creator ad",
        avatar_product_brief=AvatarProductBrief(
            avatar_name="Ritu",
            product_name="Amm Pespi",
            product_category="beverage",
            target_audience="young adults",
            key_promise="refreshing taste",
            cta="shop now",
        ),
    )

    assert [scene["stage_name"] for scene in scenes] == ["hook", "showcase", "cta"]
    assert all(scene["render_lane"] == "talking_avatar" for scene in scenes)
    assert all(scene["talking_mode"] == "lip_sync_required" for scene in scenes)
    assert all(scene["persona_required"] is True for scene in scenes)
    assert all(scene["use_locked_persona"] is True for scene in scenes)


def test_resolve_requested_avatar_id_prefers_persona_id_metadata() -> None:
    requested_avatar_id = _resolve_requested_avatar_id(
        initial_pipeline_metadata={"persona_id": "persona_123", "avatar_id": "legacy_avatar"},
        normalized_inputs={"avatar_id": "input_avatar"},
    )

    assert requested_avatar_id == "persona_123"


def test_resolve_requested_avatar_id_falls_back_to_legacy_avatar_id() -> None:
    requested_avatar_id = _resolve_requested_avatar_id(
        initial_pipeline_metadata={"avatar_id": "legacy_avatar"},
        normalized_inputs={"avatar_id": "input_avatar"},
    )

    assert requested_avatar_id == "legacy_avatar"


def test_translate_avatar_product_narration_if_needed_skips_english() -> None:
    translated, applied = _translate_avatar_product_narration_if_needed(
        "This wall clock is lightweight and easy to hang.",
        target_language="English (India)",
    )

    assert translated == "This wall clock is lightweight and easy to hang."
    assert applied is False


def test_translate_avatar_product_narration_if_needed_uses_qwen_for_non_english(monkeypatch) -> None:
    class FakeQwenService:
        def __init__(self, _settings) -> None:
            pass

        def complete_text(self, **_kwargs):
            return "यह वॉल क्लॉक हल्की है और आसानी से लग जाती है।"

    monkeypatch.setattr("app.pipeline.pipeline_engine.QwenService", FakeQwenService)

    translated, applied = _translate_avatar_product_narration_if_needed(
        "This wall clock is lightweight and easy to hang.",
        target_language="Hindi (India)",
    )

    assert translated == "यह वॉल क्लॉक हल्की है और आसानी से लग जाती है।"
    assert applied is True


def test_avatar_product_hero_reveal_guidance_for_non_clothing_avoids_garment_instructions() -> None:
    guidance = _avatar_product_hero_reveal_guidance("home_kitchen")

    assert "garment" not in guidance.lower()
    assert "kurti" not in guidance.lower()
    assert "bringing the product closer to camera" in guidance


def test_build_avatar_product_single_shot_kling_prompt_keeps_wall_clock_out_of_kurti_flow() -> None:
    prompt, _variant, _rules = _build_avatar_product_single_shot_kling_prompt(
        avatar_name="Chitrakala",
        product_name="wooden wall clock",
        product_category_hint="home_kitchen",
        narration_script="यह वॉल क्लॉक हल्की है और आसानी से लग जाती है।",
        video_id="qa-wall-clock",
    )

    lowered = prompt.lower()
    assert "kurti" not in lowered
    assert "garment" not in lowered
    assert "bringing the product closer to camera" in lowered


def test_build_avatar_product_seedance_lite_prompt_keeps_non_clothing_prompt_lipsync_friendly() -> None:
    prompt = _build_avatar_product_seedance_lite_prompt(
        base_prompt="Avatar product ad",
        product_category_hint="home_kitchen",
        narration_script="यह वॉल क्लॉक हल्की है और आसानी से लग जाती है।",
    )

    lowered = prompt.lower()
    assert "minimal head movement" in lowered
    assert "keep the face visible, frontal, and easy to track for later lip-sync replacement" in lowered
    assert "kurti" not in lowered
    assert "garment" not in lowered


def test_resolve_ugc_persona_prefers_actor_record_over_chitrakala_config(monkeypatch) -> None:
    actor = ActorRecord(
        id="av-chitrakala",
        name="Chitrakala",
        scope="public",
        style="creator",
        gender="female",
        language_tags=["Hindi (India)", "English (India)"],
        thumbnail_url="https://example.com/thumb.png",
        tags=["ugc"],
        category="ugc_influencer",
        reference_images=["https://example.com/chitrakala-front.png"],
        reference_image_variants=[
            AvatarReferenceImageVariant(
                id="front",
                url="https://example.com/chitrakala-front.png",
                tags=["front", "neutral", "talking"],
            )
        ],
        primary_image="https://example.com/chitrakala-front.png",
        preview_video_url=None,
        prompt_template=None,
        negative_prompt=None,
        recommended_voice="Priya",
        voice_profile=None,
        status="ready",
    )

    class FakeAvatarService:
        def get_actor_record(self, actor_id: str, user_id: str | None = None):
            return actor if actor_id == "av-chitrakala" else None

        def get_avatar(self, _avatar_id: str, user_id: str | None = None):
            return None

        def get_custom_avatar(self, _avatar_id: str, user_id: str):
            return None

    class FakeSettings:
        chitrakala_persona_id = "av-chitrakala"
        chitrakala_avatar_image_url = "https://example.com/wrong-config-image.png"
        chitrakala_avatar_thumbnail_url = "https://example.com/wrong-config-thumb.png"
        chitrakala_avatar_name = "Chitrakala"
        chitrakala_voice = "Priya"
        chitrakala_language = "en-IN"

    monkeypatch.setattr("app.pipeline.pipeline_engine.AvatarService", FakeAvatarService)
    monkeypatch.setattr("app.pipeline.pipeline_engine.get_settings", lambda: FakeSettings())

    resolved = _resolve_ugc_persona(
        persona_id="av-chitrakala",
        user_id="qa-user",
        voice_override=None,
        language_override="Hindi (India)",
    )

    assert resolved is not None
    assert resolved["image_url"] == "https://example.com/chitrakala-front.png"
    assert resolved["persona_source"] == "actor_library"


def test_resolve_requested_avatar_id_returns_none_when_missing() -> None:
    requested_avatar_id = _resolve_requested_avatar_id(
        initial_pipeline_metadata={},
        normalized_inputs={},
    )

    assert requested_avatar_id is None


def test_split_chitrakala_manual_script_normalizes_three_lines() -> None:
    split_lines = _split_chitrakala_manual_script(
        "Hook: Summer is brutal.\nShowcase: This drink stays refreshing and easy to grab.\nCTA: Try it today.",
        product_name="Amm Pespi",
        cta="Shop now",
    )

    assert split_lines["hook_line"] == "Summer is brutal."
    assert split_lines["showcase_line"] == "This drink stays refreshing and easy to grab."
    assert split_lines["cta_line"] == "Try it today."


def test_build_chitrakala_showcase_prompt_includes_required_details() -> None:
    prompt = _build_chitrakala_showcase_prompt(
        product_name="Amm Pespi",
        showcase_visual_prompt="Hero label reveal with chilled droplets.",
        must_show_elements=["logo", "blue label"],
    )

    assert "Amm Pespi" in prompt
    assert "Hero label reveal with chilled droplets." in prompt
    assert "logo, blue label" in prompt


def test_apply_chitrakala_v1_scene_strategy_routes_showcase_to_ltx() -> None:
    scenes = [
        {"scene_id": "scene_1_hook", "stage_name": "hook", "render_lane": "talking_avatar", "use_locked_persona": True},
        {"scene_id": "scene_2_showcase", "stage_name": "showcase", "render_lane": "talking_avatar", "use_locked_persona": True},
        {"scene_id": "scene_3_cta", "stage_name": "cta", "render_lane": "talking_avatar", "use_locked_persona": True},
    ]

    updated = _apply_chitrakala_v1_scene_strategy(
        scenes=scenes,
        showcase_visual_prompt="Close hero shot with one natural hand interaction.",
        product_name="Amm Pespi",
    )

    assert updated[0]["render_lane"] == "talking_avatar"
    assert updated[1]["render_lane"] == "cinematic_broll"
    assert updated[1]["model_key"] == "fal_ltx23_i2v"
    assert updated[1]["use_locked_persona"] is False
    assert updated[2]["render_lane"] == "talking_avatar"


def test_is_chitrakala_showcase_scene_only_matches_v1_showcase() -> None:
    assert _is_chitrakala_showcase_scene(
        recipe_id="avatar_product",
        initial_pipeline_metadata={"pipeline_version": "chitrakala_v1"},
        scene={"stage_name": "showcase"},
    )
    assert not _is_chitrakala_showcase_scene(
        recipe_id="avatar_product",
        initial_pipeline_metadata={"pipeline_version": "legacy"},
        scene={"stage_name": "showcase"},
    )
    assert not _is_chitrakala_showcase_scene(
        recipe_id="avatar_product",
        initial_pipeline_metadata={"pipeline_version": "chitrakala_v1"},
        scene={"stage_name": "hook"},
    )
