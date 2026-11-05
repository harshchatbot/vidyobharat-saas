import json
import asyncio

import httpx
import pytest

from app.services.video_creative_context import build_creative_context
from app.services.video_creative_director import (
    fallback_plan, generate_gemini_plan, validate_plan,
)
from test_video_creative_context import fixture_report


def context():
    return build_creative_context(fixture_report())


def test_safe_fallback_is_caption_only():
    c = context()
    plan = fallback_plan(c)
    assert len(plan.actions) == len(c.phrases)
    assert all(a.type == "caption" for a in plan.actions)
    assert validate_plan(c, plan.model_dump(mode="json")) == plan


def test_rejects_invented_phrase_id():
    c = context()
    plan = fallback_plan(c).model_dump(mode="json")
    plan["actions"][0]["phrase_id"] = "phrase_999"
    with pytest.raises(ValueError, match="nonexistent"):
        validate_plan(c, plan)


def test_rejects_face_covering_caption():
    c = context()
    plan = fallback_plan(c).model_dump(mode="json")
    plan["actions"][0]["y"] = 0.7
    with pytest.raises(ValueError, match="face-safe"):
        validate_plan(c, plan)


def test_rejects_zoom_above_cap_and_unlisted_cut():
    c = context()
    plan = fallback_plan(c).model_dump(mode="json")
    plan["actions"] = [{
        "type": "centered_zoom", "phrase_id": "phrase_001",
        "segment_id": "seg_001", "reason": "subtle", "scale": 1.12,
    }]
    with pytest.raises(ValueError, match="Zoom"):
        validate_plan(c, plan)
    plan["actions"] = [{
        "type": "cut", "phrase_id": "phrase_001",
        "segment_id": "seg_001", "reason": "invented",
    }]
    with pytest.raises(ValueError):
        validate_plan(c, plan)


def test_rejects_unverified_asset_and_too_many_actions():
    c = context()
    plan = fallback_plan(c).model_dump(mode="json")
    plan["actions"] = [{
        "type": "broll_asset_suggestion", "phrase_id": "phrase_001",
        "segment_id": "seg_001", "reason": "AI", "asset_query": None,
    }]
    with pytest.raises(ValueError, match="search query"):
        validate_plan(c, plan)
    plan["actions"] = fallback_plan(c).model_dump(mode="json")["actions"] * 11
    with pytest.raises(ValueError, match="maximum"):
        validate_plan(c, plan)


def test_gemini_mock_output_is_validated_and_request_contains_schema():
    async def scenario():
        c = context()
        proposal = fallback_plan(c).model_dump(mode="json")
        def handler(req: httpx.Request) -> httpx.Response:
            assert req.headers["x-goog-api-key"] == "test-secret"
            payload = json.loads(req.content)
            assert payload["generationConfig"]["responseMimeType"] == "application/json"
            assert "responseJsonSchema" in payload["generationConfig"]
            assert "approved_cuts" in payload["contents"][0]["parts"][0]["text"]
            return httpx.Response(200, json={
                "candidates": [{"content": {"parts": [{"text": json.dumps(proposal)}]}}]
            })
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result = await generate_gemini_plan(c, api_key="test-secret", model="gemini-3.8-flash", client=client)
        assert result.actions[0].phrase_id == "phrase_001"


    asyncio.run(scenario())
def test_gemini_malicious_response_is_rejected():
    async def scenario():
        c = context()
        proposal = fallback_plan(c).model_dump(mode="json")
        proposal["actions"][0]["segment_id"] = "seg_999"
        async with httpx.AsyncClient(transport=httpx.MockTransport(
            lambda req: httpx.Response(200, json={
                "candidates": [{"content": {"parts": [{"text": json.dumps(proposal)}]}}]
            })
        )) as client:
            with pytest.raises(ValueError, match="mismatched"):
                await generate_gemini_plan(c, api_key="test-secret", model="gemini-3.8-flash", client=client)

    asyncio.run(scenario())