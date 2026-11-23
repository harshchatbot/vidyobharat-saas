import json
import pytest

from app.services.harshverse.jack_content_engine import ContentRequest
from app.services.harshverse.jack_scriptwriter import (
    Evidence, build_script_prompt, validate_evidence,
    validate_script_payload, generate_script_draft,
)


def request():
    return ContentRequest(topic="CDC basics", audience="Developers", goal="Learn CDC",
                          format="screen_demo")


def evidence():
    return [Evidence("doc1", "https://example.com/docs", "An event describes a change.")]


def response_payload():
    return {"beats": [
        {"kind": "hook", "narration": "Want to understand CDC?", "evidence_ids": []},
        {"kind": "value", "narration": "Events describe changes.", "evidence_ids": ["doc1"]},
        {"kind": "takeaway", "narration": "Review the event model.", "evidence_ids": ["doc1"]},
        {"kind": "cta", "narration": "Try a demo.", "evidence_ids": []},
    ]}


def test_prompt_contains_grounded_evidence():
    prompt = json.loads(build_script_prompt(request(), evidence()))
    assert prompt["evidence"][0]["id"] == "doc1"
    assert prompt["request"]["format"] == "screen_demo"


def test_duplicate_evidence_rejected():
    with pytest.raises(ValueError, match="unique"):
        validate_evidence(evidence() * 2)


def test_unknown_citation_rejected():
    payload = response_payload()
    payload["beats"][1]["evidence_ids"] = ["invented"]
    with pytest.raises(ValueError, match="Unknown"):
        validate_script_payload(payload, {"doc1"})


def test_missing_value_citation_rejected():
    payload = response_payload()
    payload["beats"][1]["evidence_ids"] = []
    with pytest.raises(ValueError, match="must cite"):
        validate_script_payload(payload, {"doc1"})


def test_generated_draft_is_review_only(monkeypatch):
    class Response:
        def raise_for_status(self):
            pass
        def json(self):
            return {"choices": [{"message": {"content": json.dumps(response_payload())}}]}
    def fake_post(*args, **kwargs):
        assert kwargs["json"]["response_format"]["type"] == "json_object"
        return Response()
    import httpx
    monkeypatch.setattr(httpx, "post", fake_post)
    output = generate_script_draft(request(), evidence(), api_key="test-not-real")
    assert output["format"] == "screen_demo"
    assert output["scenes"][1]["visual_intent"] == "screen_capture"
    assert output["script_evidence_ids"]["value"] == ["doc1"]
    assert output["safety"]["claims_verified"] is False
    assert output["safety"]["render_ready"] is False
