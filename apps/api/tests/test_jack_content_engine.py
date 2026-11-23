import pytest

from app.services.harshverse.jack_content_engine import ContentRequest, build_content_brief


def test_jack_creates_review_only_brief():
    brief = build_content_brief(ContentRequest(
        topic="Salesforce CDC explained", audience="Salesforce developers",
        goal="Understand when to use CDC", platform="linkedin_video"))
    assert brief["schema_version"] == "jack-content-brief/v0.1"
    assert brief["creative_brief"]["working_title"] == "Salesforce CDC explained"
    assert [stage["stage"] for stage in brief["pipeline"]] == [
        "research", "script", "creative_director", "asset_resolution",
        "render", "quality_review", "publish"]
    assert brief["safety"]["render_authorized"] is False
    assert brief["safety"]["publish_authorized"] is False


@pytest.mark.parametrize("changes", [
    {"topic": ""}, {"audience": " "}, {"duration_seconds": 0},
    {"duration_seconds": True}, {"platform": "unknown"}, {"format": "unknown"},
])
def test_jack_rejects_invalid_input(changes):
    values = dict(topic="Demo", audience="Developers", goal="Teach a concept")
    values.update(changes)
    with pytest.raises(ValueError):
        build_content_brief(ContentRequest(**values))
