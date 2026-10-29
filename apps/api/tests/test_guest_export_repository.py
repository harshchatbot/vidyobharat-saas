from __future__ import annotations

import math

import pytest

from app.db.repositories.guest_export_repository import ExportFenceError, GuestExportRepository


def _job(*, fps: int = 30) -> dict:
    return {'timeline': {'fps': fps}}


def test_completion_accepts_ffprobe_rounding_but_commits_reserved_duration() -> None:
    committed = GuestExportRepository._processing_seconds_to_commit(
        job=_job(fps=30),
        reservation={'status': 'active', 'processing_seconds': 1.0},
        actual_processing_seconds=1.05,
    )

    assert committed == 1.0


def test_completion_rejects_duration_beyond_renderer_tolerance() -> None:
    with pytest.raises(ExportFenceError, match='reservation cannot be committed'):
        GuestExportRepository._processing_seconds_to_commit(
            job=_job(fps=30),
            reservation={'status': 'active', 'processing_seconds': 1.0},
            actual_processing_seconds=1.07,
        )


@pytest.mark.parametrize('status', ['released', 'committed', 'cleanup_pending', None])
def test_completion_rejects_non_active_reservation_states(status: str | None) -> None:
    with pytest.raises(ExportFenceError, match='reservation cannot be committed'):
        GuestExportRepository._processing_seconds_to_commit(
            job=_job(),
            reservation={'status': status, 'processing_seconds': 1.0},
            actual_processing_seconds=1.0,
        )


@pytest.mark.parametrize('actual', [math.nan, math.inf, -0.01])
def test_completion_rejects_invalid_actual_duration(actual: float) -> None:
    with pytest.raises(ExportFenceError, match='reservation cannot be committed'):
        GuestExportRepository._processing_seconds_to_commit(
            job=_job(),
            reservation={'status': 'active', 'processing_seconds': 1.0},
            actual_processing_seconds=actual,
        )


@pytest.mark.parametrize('reserved', [None, 0, -1, math.nan, math.inf])
def test_completion_rejects_invalid_reserved_duration(reserved: float | None) -> None:
    with pytest.raises(ExportFenceError, match='reservation cannot be committed'):
        GuestExportRepository._processing_seconds_to_commit(
            job=_job(),
            reservation={'status': 'active', 'processing_seconds': reserved},
            actual_processing_seconds=1.0,
        )
