"""Local end-to-end orchestration tests without Whisper, FFmpeg or OpenAI calls."""
from __future__ import annotations

import asyncio
import json

from scripts import render_harshverse_creative_local as local
from test_video_creative_context import fixture_report


def test_local_pipeline_reuses_existing_engines(monkeypatch, tmp_path):
    source = tmp_path / "presenter.mp4"
    source.write_bytes(b"video-with-audio-fixture")
    transcript = tmp_path / "words.json"
    transcript.write_text(json.dumps({
        "language": "en",
        "words": [{"text": w.text, "start": w.start, "end": w.end}
                  for w in fixture_report().speech.words],
    }))
    monkeypatch.setattr(local, "_probe", lambda path: {
        "format": {"duration": "15.733"},
        "streams": [{"codec_type": "video"}, {"codec_type": "audio"}],
    })
    monkeypatch.setattr(local, "build_video_analysis_report",
                        lambda path, media_id, *, transcript, style: fixture_report())
    output_calls = []
    def burn(input_path, captions, output_path):
        assert input_path == source.resolve()
        assert captions.read_text(encoding="utf-8").count("Dialogue:") >= 2
        output_calls.append(input_path)
        output_path.write_bytes(b"preview-output")
    monkeypatch.setattr(local, "_burn_captions", burn)
    output_dir = tmp_path / "preview"
    result = asyncio.run(local.build_local_creative_preview(
        source, output_dir, transcript_path=transcript, api_key=None,
    ))
    assert result["status"] == "preview_requires_review"
    assert result["captions"] == 2
    assert result["highlighted_words"] == 6
    assert result["director_mode"] == "existing_deterministic_fallback"
    assert output_calls == [source.resolve()]
    assert (output_dir / "harshverse_creative_preview.mp4").read_bytes() == b"preview-output"
    assert (output_dir / "visual_analysis_v2.json").exists()
    assert (output_dir / "creative_context.json").exists()
    assert (output_dir / "creative_director_v2.json").exists()
    assert (output_dir / "creative_director_v21.json").exists()
    assert json.loads((output_dir / "local_preview_report.json").read_text())["status"] == "preview_requires_review"


def test_does_not_clobber_existing_preview(tmp_path):
    source = tmp_path / "presenter.mp4"
    source.write_bytes(b"recording")
    output_dir = tmp_path / "preview"
    output_dir.mkdir()
    (output_dir / "harshverse_creative_preview.mp4").write_bytes(b"original-result")
    try:
        asyncio.run(local.build_local_creative_preview(source, output_dir))
    except FileExistsError:
        pass
    else:
        raise AssertionError("Existing render was overwritten")
    assert (output_dir / "harshverse_creative_preview.mp4").read_bytes() == b"original-result"
