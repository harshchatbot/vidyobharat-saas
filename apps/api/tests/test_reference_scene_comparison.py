"""Offline scene comparison regression; style never authorizes rendering."""
from app.services.video_creative_context import ClipMetadata, CreativeContext, Phrase
from app.scripts.compare_reference_scene_plans import compare


def test_reference_text_style_changes_grounded_opening():
    context = CreativeContext(
        media=ClipMetadata(duration_seconds=10, aspect_ratio="9:16", style="energetic"),
        phrases=[Phrase(id="phrase_001", segment_id="seg_001", start=0, end=2,
                        text="How does this work?", timing_status="estimated")],
        review_required=False, allowed_actions=["caption_emphasis"],
    )
    blueprint = {
        "schema_version": "reference-style-blueprint/v0.13",
        "quality_gate": {"automatic_application_allowed": False},
        "recommended": {"advisory_editing_preferences": [{
            "technique": "progressive_text_emphasis",
            "strength": "soft_preference", "never_force": True
        }]},
    }
    result = compare(context.model_dump(), blueprint)
    assert result["baseline"]["proposals"][0]["module"] == "headline"
    assert result["reference_guided"]["proposals"][0]["module"] == "type_slam"
    assert result["comparison"]["changed_proposals"] is True
    assert result["render_ready"] is False
    assert result["automatic_application_allowed"] is False


def test_split_screen_is_advice_not_unlicensed_asset():
    context = CreativeContext(
        media=ClipMetadata(duration_seconds=10, aspect_ratio="9:16", style="elegant"),
        phrases=[Phrase(id="phrase_001", segment_id="seg_001", start=0, end=2,
                        text="Look at my dashboard", timing_status="estimated")],
        review_required=False, allowed_actions=["caption_emphasis"],
    )
    blueprint = {
        "schema_version": "reference-style-blueprint/v0.13",
        "quality_gate": {"automatic_application_allowed": False},
        "recommended": {"advisory_editing_preferences": [{
            "technique": "presenter_with_supporting_visual",
            "strength": "soft_preference", "never_force": True
        }]},
    }
    result = compare(context.model_dump(), blueprint)
    assert "presenter_with_supporting_visual" in result["comparison"]["style_preferences"]
    assert result["reference_guided"]["proposals"][0]["module"] == "laptop_reveal"
    assert result["comparison"]["changed_proposals"] is False
    assert result["render_ready"] is False
