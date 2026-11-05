"""Enhancement-only creative plan contract tests. No real paid provider calls."""
import asyncio
import json

import httpx
import pytest

from app.services.video_creative_context import build_creative_context
from app.services.video_creative_director import (
    fallback_plan, generate_gemini_plan, generate_openai_plan, validate_plan,
    _OPENAI_PLAN_SCHEMA, SYSTEM_INSTRUCTION,
)
from test_video_creative_context import fixture_report


def context():
    return build_creative_context(fixture_report())


def enhance(c=None):
    c = c or context()
    return {
        "plan_version": "1.1",
        "creative_summary": "Accentuate the question and add a purposeful visual idea.",
        "actions": [
            {
                "type": "caption_emphasis", "phrase_id": "phrase_001",
                "segment_id": "seg_001", "reason": "Make the opening question engaging.",
                "treatment": "bold_accent", "asset_query": None, "scale": None,
                "x": c.caption_zones[0].x, "y": c.caption_zones[0].y,
                "width": c.caption_zones[0].width,
            },
            {
                "type": "broll_asset_suggestion", "phrase_id": "phrase_002",
                "segment_id": "seg_001", "reason": "Illustrate the spoken AI concept.",
                "treatment": None, "asset_query": "abstract neural network visual",
                "scale": None, "x": None, "y": None, "width": None,
            },
        ],
        "warnings": [],
    }


def test_base_captions_are_separate_and_fallback_has_zero_enhancements():
    c = context()
    plan = fallback_plan(c)
    assert plan.plan_version == "1.1"
    assert plan.actions == []
    assert validate_plan(c, plan.model_dump(mode="json")) == plan
    assert "caption" not in c.allowed_actions
    assert "ordinary caption" in SYSTEM_INSTRUCTION


def test_valid_contextual_enhancements_are_accepted():
    c = context()
    result = validate_plan(c, enhance(c))
    assert [a.type for a in result.actions] == ["caption_emphasis", "broll_asset_suggestion"]


def test_prior_weak_caption_plan_is_rejected():
    plan = enhance()
    plan["actions"] = [{
        "type": "caption", "phrase_id": "phrase_001", "segment_id": "seg_001",
        "reason": "Generic caption", "x": .5, "y": .19, "width": .84,
    }]
    with pytest.raises(ValueError):
        validate_plan(context(), plan)


@pytest.mark.parametrize("field,value,match", [
    ("phrase_id", "phrase_999", "nonexistent"),
    ("segment_id", "seg_999", "mismatched"),
    ("y", .7, "face-safe"),
    ("asset_query", "new image", "Asset query only"),
    ("treatment", None, "Emphasis treatment"),
    ("scale", 1.04, "Scale only"),
])
def test_emphasis_rejects_invalid_fields(field, value, match):
    plan = enhance()
    plan["actions"][0][field] = value
    with pytest.raises(ValueError, match=match):
        validate_plan(context(), plan)


def test_zoom_limits_and_non_caption_coordinates():
    c = context()
    plan = enhance(c)
    plan["actions"] = [{
        "type": "centered_zoom", "phrase_id": "phrase_001",
        "segment_id": "seg_001", "reason": "Focus on a contrast.",
        "scale": 1.06, "treatment": None, "asset_query": None,
        "x": None, "y": None, "width": None,
    }]
    assert validate_plan(c, plan).actions[0].scale == 1.06
    plan["actions"][0]["scale"] = 1.12
    with pytest.raises(ValueError, match="Zoom"):
        validate_plan(c, plan)
    plan["actions"][0]["scale"] = 1.03
    plan["actions"][0]["x"] = .5
    with pytest.raises(ValueError, match="Non-caption"):
        validate_plan(c, plan)


def test_duplicate_actions_overlong_plan_and_invented_cuts_rejected():
    c = context()
    plan = enhance(c)
    plan["actions"].append(dict(plan["actions"][0]))
    with pytest.raises(ValueError, match="Duplicate"):
        validate_plan(c, plan)
    plan = enhance(c)
    plan["actions"] = plan["actions"] * 5
    with pytest.raises(ValueError, match="maximum"):
        validate_plan(c, plan)
    plan = enhance(c)
    plan["actions"][0]["type"] = "cut"
    with pytest.raises(ValueError):
        validate_plan(c, plan)


def test_openai_structured_schema_matches_v11():
    schema = _OPENAI_PLAN_SCHEMA
    assert schema["properties"]["plan_version"]["enum"] == ["1.1"]
    action_schema = schema["properties"]["actions"]["items"]
    assert "caption" not in action_schema["properties"]["type"]["enum"]
    assert set(action_schema["required"]) == set(action_schema["properties"])


def test_gemini_mock_proposes_enhancements():
    async def scenario():
        c = context()
        plan = enhance(c)
        def respond(req):
            body = json.loads(req.content)
            assert "ordinary caption" in body["systemInstruction"]["parts"][0]["text"]
            return httpx.Response(200, json={"candidates": [{"content": {
                "parts": [{"text": json.dumps(plan)}],
            }}]})
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            result = await generate_gemini_plan(c, api_key="mock", model="gemini-test", client=client)
        assert len(result.actions) == 2
    asyncio.run(scenario())


def test_openai_mock_proposes_enhancements():
    async def scenario():
        c = context()
        def respond(req):
            body = json.loads(req.content)
            assert body["response_format"]["json_schema"]["strict"] is True
            assert "ordinary caption" in body["messages"][0]["content"]
            return httpx.Response(200, json={"choices": [{
                "finish_reason": "stop", "message": {"content": json.dumps(enhance(c))},
            }]})
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            result = await generate_openai_plan(c, api_key="mock", client=client)
        assert len(result.actions) == 2
    asyncio.run(scenario())


def test_openai_repairs_invalid_asset_query_once():
    async def scenario():
        c = context()
        bad = enhance(c)
        bad["actions"][0]["asset_query"] = "incorrect asset request"
        requests = []
        def respond(req):
            body = json.loads(req.content)
            requests.append(body)
            proposal = bad if len(requests) == 1 else enhance(c)
            return httpx.Response(200, json={"choices": [{
                "finish_reason": "stop", "message": {"content": json.dumps(proposal)},
            }]})
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            result = await generate_openai_plan(c, api_key="mock", client=client)
        assert len(requests) == 2
        assert result.actions[0].asset_query is None
    asyncio.run(scenario())


def test_openai_rejects_invalid_after_one_repair_and_truncation():
    async def scenario():
        c = context()
        bad = enhance(c)
        bad["actions"][0]["y"] = .9
        count = []
        def respond(req):
            count.append(1)
            return httpx.Response(200, json={"choices": [{
                "finish_reason": "stop", "message": {"content": json.dumps(bad)},
            }]})
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            with pytest.raises(ValueError, match="after one correction"):
                await generate_openai_plan(c, api_key="mock", client=client)
        assert len(count) == 2
        async with httpx.AsyncClient(transport=httpx.MockTransport(
            lambda req: httpx.Response(200, json={"choices": [{
                "finish_reason": "length", "message": {"content": json.dumps(enhance(c))},
            }]})
        )) as client:
            with pytest.raises(ValueError, match="truncated"):
                await generate_openai_plan(c, api_key="mock", client=client)
    asyncio.run(scenario())
