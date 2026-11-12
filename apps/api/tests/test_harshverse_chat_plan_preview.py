"""V0.16 offline preview bridge tests: never uses an API or renders without input."""
import pytest

from app.services.harshverse.chat_plan_preview import compile_chat_preview
from app.services.video_creative_context import CreativeContext, ClipMetadata, Phrase


def context():
    return CreativeContext(
        media=ClipMetadata(duration_seconds=8, aspect_ratio="9:16", style="energetic"),
        phrases=[
            Phrase(id="phrase_001", segment_id="seg_001", start=0, end=2,
                   text="How does our application work?", timing_status="estimated"),
            Phrase(id="phrase_002", segment_id="seg_002", start=3, end=5,
                   text="Let me show you the dashboard", timing_status="estimated"),
        ],
        allowed_actions=["caption_emphasis"],
        review_required=False,
    )


def choices(module="laptop_reveal", phrase_id="phrase_002", quote="dashboard"):
    return {"schema_version": "1.0", "choices": [{
        "phrase_id": phrase_id, "module": module,
        "evidence_quote": quote,
        "reason": "A preview of the spoken concept clarifies the explanation.",
    }]}


def test_valid_chat_choices_review_only():
    result, scene_plan = compile_chat_preview(context(), choices())
    assert result["proposals"][0]["module"] == "laptop_reveal"
    assert result["safety"]["render_ready"] is False
    assert scene_plan is None


def test_verified_plate_compiles_to_existing_scene_plan():
    result, plan = compile_chat_preview(
        context(), choices(), approved_module="laptop_reveal",
        animation_duration=2.1)
    assert result["automatic_application_allowed"] is False
    assert [(x.recipe, x.start, x.end) for x in plan.scenes] == [
        ("presenter_hook", 0, 3), ("presenter_split", 3, 5),
        ("presenter_outro", 5, 8),
    ]
    assert plan.scenes[1].title == "laptop_reveal"


@pytest.mark.parametrize("kwargs", [
    {"approved_module": "headline", "animation_duration": 3},
    {"approved_module": "laptop_reveal", "animation_duration": 1},
    {"approved_module": "laptop_reveal"},
    {"animation_duration": 2.1},
])
def test_mismatched_or_missing_plate_rejected(kwargs):
    with pytest.raises(ValueError):
        compile_chat_preview(context(), choices(), **kwargs)


def test_data_visual_requires_verification():
    with pytest.raises(ValueError, match="Data visual"):
        compile_chat_preview(context(), choices(module="stat_chart"),
                             approved_module="stat_chart",
                             animation_duration=3)


def test_forged_quote_fails_before_plate_compile():
    with pytest.raises(ValueError, match="evidence"):
        compile_chat_preview(context(),
                             choices(quote="Made up fact"),
                             approved_module="laptop_reveal",
                             animation_duration=3)


def test_forged_phrase_id_rejected():
    with pytest.raises(ValueError, match="missing phrase"):
        compile_chat_preview(context(), choices(phrase_id="phrase_999"))


def test_empty_choices_never_render():
    data, plan = compile_chat_preview(context(), {"schema_version": "1.0", "choices": []})
    assert data["proposals"] == [] and plan is None


def test_two_choices_cannot_use_single_plate():
    two = {"schema_version": "1.0", "choices": [
        {"phrase_id": "phrase_001", "module": "headline",
         "evidence_quote": "How does", "reason": "An opening title helps explain the hook."},
        choices()["choices"][0],
    ]}
    with pytest.raises(ValueError, match="exactly one"):
        compile_chat_preview(context(), two, approved_module="laptop_reveal",
                             animation_duration=4)
