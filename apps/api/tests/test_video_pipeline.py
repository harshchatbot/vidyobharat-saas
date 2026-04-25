from __future__ import annotations

from app.services.video_pipeline import VideoPipelineService


def test_build_caption_filters_from_timing_map_uses_segment_timestamps() -> None:
    service = VideoPipelineService()

    filters = service._build_caption_filters_from_timing_map(
        timing_map=[
            {"text": "Hook line", "start_ms": 0, "end_ms": 1200},
            {"text": "Showcase line", "start_ms": 1200, "end_ms": 3100},
            {"text": "CTA line", "start_ms": 3100, "end_ms": 4500},
        ],
        total_duration=4.5,
        caption_style="classic",
    )

    assert len(filters) == 3
    assert "between(t,0.00,1.20)" in filters[0]
    assert "between(t,1.20,3.10)" in filters[1]
    assert "between(t,3.10,4.50)" in filters[2]
