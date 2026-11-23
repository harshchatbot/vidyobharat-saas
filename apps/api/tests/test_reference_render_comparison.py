"""Review-only reference-driven FFmpeg scene recipe tests; no media rendering."""
import pytest
from app.services.video_creative_context import CreativeContext, ClipMetadata, Phrase
from scripts.render_reference_comparison_local import build_comparison_plans


def context(text):
    return CreativeContext(
        media=ClipMetadata(duration_seconds=10, aspect_ratio="9:16", style="energetic"),
        phrases=[Phrase(id="phrase_001", segment_id="seg_001", start=2, end=5,
                        text=text, timing_status="estimated")],
        allowed_actions=["caption_emphasis"], review_required=False,
    )


def blueprint():
    return {
        "schema_version": "reference-style-blueprint/v0.13",
        "quality_gate": {"automatic_application_allowed": False},
        "recommended": {"advisory_editing_preferences": [{
            "technique": "presenter_with_supporting_visual",
            "strength": "soft_preference", "never_force": True
        }]},
    }


def test_grounded_reference_creates_split_screen_only_with_approval():
    baseline, guided, metadata = build_comparison_plans(
        context("Here is my dashboard"), blueprint(), supporting_visual_approved=True)
    assert [x.recipe for x in baseline.scenes] == ["presenter_hook"]
    assert [x.recipe for x in guided.scenes] == [
        "presenter_hook", "presenter_split", "presenter_outro"]
    assert guided.scenes[1].start == 2
    assert guided.scenes[1].end == 5
    assert metadata["automatic_application_allowed"] is False


def test_no_visual_approval_fails_closed():
    with pytest.raises(ValueError, match="independently approved"):
        build_comparison_plans(context("Here is my dashboard"), blueprint(),
                               supporting_visual_approved=False)


def test_no_semantic_relevance_does_not_force_split_screen():
    baseline, guided, metadata = build_comparison_plans(
        context("Hello everyone"), blueprint(), supporting_visual_approved=True)
    assert baseline == guided
    assert metadata["status"] == "no_grounded_supporting_visual_scene"
