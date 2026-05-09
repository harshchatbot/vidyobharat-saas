from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace

from app.api.routes import _dedupe_videos_for_library, _is_invalid_completed_video


def _video(
    *,
    video_id: str,
    status: str,
    output_url: str | None,
    created_at: datetime,
    updated_at: datetime,
):
    return SimpleNamespace(
        id=video_id,
        status=status,
        output_url=output_url,
        created_at=created_at,
        updated_at=updated_at,
    )


def test_invalid_completed_video_detected_when_output_missing() -> None:
    video = _video(
        video_id="v1",
        status="completed",
        output_url=None,
        created_at=datetime(2026, 5, 9, tzinfo=UTC),
        updated_at=datetime(2026, 5, 9, tzinfo=UTC),
    )
    assert _is_invalid_completed_video(video) is True


def test_completed_video_with_output_is_valid() -> None:
    video = _video(
        video_id="v2",
        status="completed",
        output_url="https://cdn.example.com/video.mp4",
        created_at=datetime(2026, 5, 9, tzinfo=UTC),
        updated_at=datetime(2026, 5, 9, tzinfo=UTC),
    )
    assert _is_invalid_completed_video(video) is False


def test_dedupe_keeps_latest_updated_variant_for_same_id() -> None:
    older = _video(
        video_id="same-id",
        status="processing",
        output_url=None,
        created_at=datetime(2026, 5, 9, 10, tzinfo=UTC),
        updated_at=datetime(2026, 5, 9, 10, 0, 0, tzinfo=UTC),
    )
    newer = _video(
        video_id="same-id",
        status="completed",
        output_url="https://cdn.example.com/final.mp4",
        created_at=datetime(2026, 5, 9, 10, tzinfo=UTC),
        updated_at=datetime(2026, 5, 9, 10, 5, 0, tzinfo=UTC),
    )
    deduped, removed = _dedupe_videos_for_library([older, newer])
    assert len(deduped) == 1
    assert removed == 1
    assert deduped[0].output_url == "https://cdn.example.com/final.mp4"
