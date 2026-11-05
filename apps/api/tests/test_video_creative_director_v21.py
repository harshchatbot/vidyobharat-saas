"""V2.1 composition tests: preserve all source footage, gaps, safe zones and rights."""
import pytest

from app.services.video_creative_context import build_creative_context
from app.services.video_creative_director_v2 import ScenePlanV2
from app.services.video_creative_director_v21 import (
    ApprovedAsset, compile_composition_v21,
)
from test_video_creative_context import fixture_report
from test_video_creative_director_v2 import sample


def test_full_source_continuity_and_motion_envelope():
    context = build_creative_context(fixture_report())
    plan = ScenePlanV2.model_validate(sample(context))
    result = compile_composition_v21(context, plan)
    assert result.version == "2.1"
    assert result.ready_to_render is False
    assert result.source_audio_uninterrupted and result.base_video_uninterrupted
    source = result.beats[0]
    assert source.kind == "source" and source.start == 0
    assert source.end == context.media.duration_seconds
    assert any(beat.kind == "typography" for beat in result.beats)
    assert any(beat.kind == "zoom" for beat in result.beats)
    assert any(beat.kind == "hold_original" for beat in result.beats)
    for beat in result.beats:
        assert 0 <= beat.start <= beat.end <= result.duration_seconds
        assert all(0 <= frame.at <= beat.end - beat.start + 1e-3 for frame in beat.keyframes)


def test_broll_draft_never_treated_as_real_asset():
    context = build_creative_context(fixture_report())
    plan_raw = sample(context)
    plan_raw["scenes"][0].update(
        visual_mode="broll_overlay",
        motion_template="none",
        emphasis_phrase_id=None,
        broll_query="licensable footage of a brain network",
    )
    result = compile_composition_v21(context, ScenePlanV2.model_validate(plan_raw))
    assert any(b.kind == "broll_intent" and b.asset_status == "unresolved" for b in result.beats)
    assert any("no verified B-roll" in warning for warning in result.warnings)


def test_only_vetted_registry_assets_can_resolve_queries():
    context = build_creative_context(fixture_report())
    plan_raw = sample(context)
    plan_raw["scenes"][0].update(
        visual_mode="broll_overlay", motion_template="none", emphasis_phrase_id=None,
        broll_query="neural network animated brain",
    )
    item = ApprovedAsset(
        id="broll:network", type="broll",
        tags=["neural", "network", "animated"],
        sha256="a" * 64, content_url="/api/editor/visual-assets/broll:network/content",
    )
    result = compile_composition_v21(
        context, ScenePlanV2.model_validate(plan_raw), approved_assets=[item],
    )
    assert any(b.approved_asset_id == item.id and b.asset_status == "approved" for b in result.beats)


def test_wrong_urls_and_duplicate_assets_rejected():
    context = build_creative_context(fixture_report())
    plan = ScenePlanV2.model_validate(sample(context))
    invalid = ApprovedAsset(
        id="emoji:brain", type="emoji", tags=["brain"], sha256="b" * 64,
        content_url="https://untrusted.invalid/download/brain.png",
    )
    with pytest.raises(ValueError, match="approved public resolver"):
        compile_composition_v21(context, plan, approved_assets=[invalid])
    item = invalid.model_copy(update={"content_url": "/api/editor/visual-assets/emoji:brain/content"})
    with pytest.raises(ValueError, match="Duplicate"):
        compile_composition_v21(context, plan, approved_assets=[item, item])


def test_graphic_scene_splits_into_phrase_synchronized_microbeats():
    context = build_creative_context(fixture_report())
    data = sample(context)
    data["scenes"][0]["emphasis_phrase_id"] = None
    data["scenes"][0]["motion_template"] = "data_flow"
    result = compile_composition_v21(context, ScenePlanV2.model_validate(data))
    beats = [beat for beat in result.beats if beat.kind == "motion_graphic"]
    assert len(beats) == 1
    assert beats[0].text_from_phrase_id == context.phrases[0].id
    assert beats[0].layout == "face_safe_graphic"


def test_empty_transcript_preserves_original_clip():
    context = build_creative_context(fixture_report())
    from app.schemas.video_analysis import SpeechEvidence, CreativeGuidance
    report = fixture_report()
    report.speech = SpeechEvidence(status="no_speech")
    report.creative_guidance = CreativeGuidance()
    empty = build_creative_context(report)
    from app.services.video_creative_director_v2 import fallback_scene_plan
    result = compile_composition_v21(empty, fallback_scene_plan(empty))
    assert len(result.beats) == 2
    assert result.beats[0].kind == "source"
    assert result.beats[1].kind == "hold_original"
