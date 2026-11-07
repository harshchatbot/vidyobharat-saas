"""Backend-only tests using the existing Visual Analysis/Director fixtures."""
from pathlib import Path

from app.services.video_creative_context import build_creative_context
from app.services.video_creative_director_v2 import ScenePlanV2
from app.services.video_creative_director_v21 import compile_composition_v21
from app.services.harshverse.creative_caption_bridge import (
    build_caption_overlays, write_caption_track,
)
from test_video_creative_context import fixture_report
from test_video_creative_director_v2 import sample


def _inputs():
    report = fixture_report()
    context = build_creative_context(report)
    plan = ScenePlanV2.model_validate(sample(context))
    composition = compile_composition_v21(context, plan)
    return report, context, composition


def test_caption_bridge_reuses_source_words_and_face_guidance():
    report, context, composition = _inputs()
    overlays, warnings = build_caption_overlays(report, context, composition)
    assert len(overlays) == len(context.phrases) == 2
    assert overlays[0].text == "Have you ever wondered"
    assert overlays[1].text == "how ChatGPT?"
    assert overlays[0].x == context.caption_zones[0].x
    assert overlays[0].y == context.caption_zones[0].y
    assert overlays[0].width == context.caption_zones[0].width
    assert overlays[0].start_seconds == report.speech.words[0].start
    assert overlays[0].caption_words[0].start == 0
    assert overlays[0].caption_words[0].end == round(report.speech.words[0].end - report.speech.words[0].start, 3)
    assert any("estimates" in warning for warning in warnings)


def test_v21_emphasis_changes_caption_style_but_not_transcript():
    report, context, composition = _inputs()
    overlays, _ = build_caption_overlays(report, context, composition)
    assert overlays[0].font_size > overlays[1].font_size
    assert overlays[0].text == " ".join(word.text for word in report.speech.words[:4])


def test_existing_ass_caption_renderer_provides_word_highlights_and_entry(tmp_path):
    report, context, composition = _inputs()
    overlays, _ = build_caption_overlays(report, context, composition)
    target = tmp_path / "captions.ass"
    result = write_caption_track(target, overlays)
    text = target.read_text(encoding="utf-8")
    assert result.caption_count == 2
    assert result.word_count == len(report.speech.words)
    assert result.review_required
    assert "Have you ever wondered" not in text or "Have" in text
    assert "Dialogue:" in text
    assert r"\1c&H66E0FF&" in text
    assert r"\fad(65,0)" in text
    assert "PlayResX: 720" in text
    assert not list(tmp_path.glob(".hv-caption-phrase-*.ass"))


def test_unverified_caption_zone_is_marked_for_review():
    report, context, composition = _inputs()
    context.caption_zones[0].status = "review_required"
    overlays, warnings = build_caption_overlays(report, context, composition)
    assert overlays[0].y == 0.84
    assert any("fallback placement" in line for line in warnings)


def test_no_words_never_fabricates_captions():
    report, context, composition = _inputs()
    report.speech.words.clear()
    overlays, warnings = build_caption_overlays(report, context, composition)
    assert not overlays
    assert any("not invented" in warning for warning in warnings)
