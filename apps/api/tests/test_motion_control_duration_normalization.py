from __future__ import annotations

import pytest

from app.services.ai_video_service import AIVideoCreateService, ProviderError


def _service() -> AIVideoCreateService:
    return object.__new__(AIVideoCreateService)


def test_motion_control_duration_allows_non_preset_values_within_range() -> None:
    service = _service()
    normalized = service._normalize_duration(
        model_key='kling_v26_standard_motion_control',
        duration_mode='custom',
        duration_seconds=11,
        image_urls=['https://example.com/image.png'],
    )
    assert normalized == 11


def test_motion_control_duration_rejects_values_above_max() -> None:
    service = _service()
    with pytest.raises(ProviderError, match='supports durations between 1s and 40s'):
        service._normalize_duration(
            model_key='kling_v26_standard_motion_control',
            duration_mode='custom',
            duration_seconds=41,
            image_urls=['https://example.com/image.png'],
        )

