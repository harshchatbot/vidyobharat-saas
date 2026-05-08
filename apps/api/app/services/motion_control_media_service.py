from __future__ import annotations

import logging
import math
import subprocess
from dataclasses import dataclass
from pathlib import Path

from app.services.video_pipeline import VideoPipelineService

logger = logging.getLogger(__name__)

MAX_MOTION_CONTROL_DURATION_SECONDS = 40.0


@dataclass(frozen=True)
class MotionReferenceVideoAnalysis:
    duration_seconds: float
    billed_duration_seconds: int
    has_audio: bool
    local_path: str | None = None


class MotionControlMediaService:
    def __init__(self) -> None:
        self.pipeline = VideoPipelineService()

    def analyze_reference_video(self, video_url: str) -> MotionReferenceVideoAnalysis:
        normalized = str(video_url or '').strip()
        if not normalized:
            raise ValueError('Dance video URL is required.')

        local_path = self.pipeline.ensure_local_media_path(normalized)
        if not local_path or not local_path.exists():
            raise ValueError('Could not access the uploaded dance video.')

        duration_seconds = self._probe_duration(local_path)
        has_audio = self.pipeline.video_has_audio_stream(local_path)
        billed_duration_seconds = max(1, int(math.ceil(duration_seconds)))
        return MotionReferenceVideoAnalysis(
            duration_seconds=round(duration_seconds, 3),
            billed_duration_seconds=billed_duration_seconds,
            has_audio=has_audio,
            local_path=str(local_path),
        )

    def validate_supported_duration(self, analysis: MotionReferenceVideoAnalysis) -> None:
        if analysis.duration_seconds > MAX_MOTION_CONTROL_DURATION_SECONDS:
            raise ValueError('Dance videos longer than 40 seconds are not supported yet.')

    def _probe_duration(self, media_path: Path) -> float:
        try:
            result = subprocess.run(
                [
                    'ffprobe',
                    '-v',
                    'error',
                    '-show_entries',
                    'format=duration',
                    '-of',
                    'default=noprint_wrappers=1:nokey=1',
                    str(media_path),
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            return max(0.0, float((result.stdout or '').strip() or '0'))
        except Exception as exc:
            logger.warning('motion_control_duration_probe_failed', extra={'path': str(media_path), 'error': str(exc)})
            raise ValueError('Could not analyze the uploaded dance video duration.') from exc
