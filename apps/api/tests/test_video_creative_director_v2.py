"""Creative Director V2: scene coverage, license gates, and provider contract."""
import asyncio
import json

import httpx
import pytest

from app.services.video_creative_context import build_creative_context
from app.services.video_creative_director_v2 import (
    SCENE_PLAN_SCHEMA_V2, fallback_scene_plan, generate_openai_scene_plan,
    storyboard, validate_scene_plan,
)
from test_video_creative_context import fixture_report


def context():
    return build_creative_context(fixture_report())


def sample(c=None):
    c = c or context()
    return {
        "plan_version": "2.0",
        "creative_thesis": "Make the opener memorable without losing a syllable.",
        "scenes": [
            {
                "first_phrase_id": c.phrases[0].id,
                "last_phrase_id": c.phrases[0].id,
                "visual_mode": "graphic_overlay",
                "motion_template": "keyword_card",
                "creative_intent": "Introduce the idea with a clean animated word card.",
                "emphasis_phrase_id": c.phrases[0].id,
                "zoom_scale": None,
                "broll_query": None,
                "sound_cue": "soft_pop",
            },
            {
                "first_phrase_id": c.phrases[-1].id,
                "last_phrase_id": c.phrases[-1].id,
                "visual_mode": "talking_head",
                "motion_template": "none",
                "creative_intent": "Keep the speaker visible to finish the question naturally.",
                "emphasis_phrase_id": None,
                "zoom_scale": 1.06,
                "broll_query": None,
                "sound_cue": "none",
            },
        ],
        "warnings": [],
    }


def test_valid_scene_plan_covers_spoken_phrases_and_derives_times():
    c = context()
    p = validate_scene_plan(c, sample(c))
    beats = storyboard(c, p)
    assert len(beats) == 2
    assert beats[0]["start_seconds_estimated"] == c.phrases[0].start
    assert beats[-1]["end_seconds_estimated"] == c.phrases[-1].end
    assert all(b["requires_human_review"] for b in beats)


@pytest.mark.parametrize("mutation,reason", [
    (lambda p: p["scenes"][0].update(first_phrase_id="phrase_999"), "exactly once"),
    (lambda p: p["scenes"].pop(), "final spoken"),
    (lambda p: p["scenes"][1].update(first_phrase_id="phrase_001"), "exactly once"),
    (lambda p: p["scenes"][1].update(zoom_scale=1.12), "Zoom"),
    (lambda p: p["scenes"][0].update(broll_query="stock animation"), "Only B-roll"),
    (lambda p: p["scenes"][0].update(emphasis_phrase_id="phrase_999"), "Emphasis"),
    (lambda p: p["scenes"][0].update(motion_template="none"), "requires a motion"),
    (lambda p: p["scenes"][1].update(motion_template="source_stack"), "cannot request"),
])
def test_invalid_scene_spec_is_rejected(mutation, reason):
    p = sample()
    mutation(p)
    with pytest.raises(ValueError, match=reason):
        validate_scene_plan(context(), p)


def test_broll_is_search_only_never_asserted_available():
    c = context()
    p = sample(c)
    scene = p["scenes"][0]
    scene.update(
        visual_mode="broll_overlay", motion_template="none",
        broll_query="licensed book pages footage",
        emphasis_phrase_id=None,
    )
    validated = validate_scene_plan(c, p)
    assert storyboard(c, validated)[0]["asset_search_only"] == "licensed book pages footage"
    scene["broll_query"] = None
    with pytest.raises(ValueError, match="requires an asset"):
        validate_scene_plan(c, p)


def test_fallback_preserves_all_phrases():
    c = context()
    plan = fallback_scene_plan(c)
    assert len(plan.scenes) == 1
    assert plan.scenes[0].visual_mode == "talking_head"
    assert validate_scene_plan(c, plan.model_dump(mode="json")) == plan


def test_no_speech_has_no_fake_story():
    report = fixture_report()
    from app.schemas.video_analysis import SpeechEvidence, CreativeGuidance
    report.speech = SpeechEvidence(status="no_speech")
    report.creative_guidance = CreativeGuidance()
    c = build_creative_context(report)
    assert fallback_scene_plan(c).scenes == []
    with pytest.raises(ValueError, match="without speech"):
        validate_scene_plan(c, sample(context()))


def test_openai_strict_schema_and_mock_response():
    async def scenario():
        c = context()
        calls = []
        def handler(req):
            payload = json.loads(req.content)
            calls.append(payload)
            schema = payload["response_format"]["json_schema"]["schema"]
            assert schema == SCENE_PLAN_SCHEMA_V2
            assert set(schema["properties"]["scenes"]["items"]["required"]) == set(
                schema["properties"]["scenes"]["items"]["properties"]
            )
            return httpx.Response(200, json={"choices": [{
                "finish_reason": "stop", "message": {"content": json.dumps(sample(c))}
            }]})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            plan = await generate_openai_scene_plan(c, api_key="mock", client=client)
        assert len(plan.scenes) == 2
        assert len(calls) == 1
    asyncio.run(scenario())


def test_openai_repairs_coverage_once_and_fails_closed():
    async def scenario():
        c = context()
        attempts = []
        def handler(req):
            body = json.loads(req.content)
            attempts.append(body)
            p = sample(c)
            if len(attempts) == 1:
                p["scenes"].pop()
            return httpx.Response(200, json={"choices": [{
                "finish_reason": "stop", "message": {"content": json.dumps(p)}
            }]})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            plan = await generate_openai_scene_plan(c, api_key="mock", client=client)
        assert len(plan.scenes) == 2
        assert len(attempts) == 2

        def bad(req):
            return httpx.Response(200, json={"choices": [{
                "finish_reason": "stop", "message": {"content": json.dumps(
                    {"plan_version": "2.0", "creative_thesis": "test",
                     "scenes": [], "warnings": []}
                )}
            }]})
        async with httpx.AsyncClient(transport=httpx.MockTransport(bad)) as client:
            with pytest.raises(ValueError, match="after one repair"):
                await generate_openai_scene_plan(c, api_key="mock", client=client)
    asyncio.run(scenario())
