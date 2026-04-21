from __future__ import annotations

import time
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.core.config import Settings
from app.services.video.base import VideoProvider, VideoStatusResult, VideoSubmitResult

_MOCK_JOBS: dict[str, dict[str, Any]] = {}


class MockLtxProvider(VideoProvider):
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def provider_name(self) -> str:
        return 'mock_ltx'

    def healthcheck(self) -> dict[str, Any]:
        return {'provider': self.provider_name(), 'ok': True, 'profile': self.settings.ltx_mock_profile}

    def submit_generation(
        self,
        *,
        render_id: str,
        prompt: str,
        aspect_ratio: str,
        resolution: str,
        duration_seconds: int,
        metadata: dict[str, Any] | None = None,
    ) -> VideoSubmitResult:
        provider_job_id = f'mock-ltx-{uuid4().hex}'
        output_name = str((metadata or {}).get('output_name') or f'{render_id}.mp4')
        sample_video = str(self.settings.ltx_mock_sample_video_path or (Path.cwd() / 'apps/web/public/videos/samples/advertisement.mp4').resolve())
        _MOCK_JOBS[provider_job_id] = {
            'created_at': time.monotonic(),
            'output_name': output_name,
            'sample_video': sample_video,
        }
        return VideoSubmitResult(
            provider_job_id=provider_job_id,
            status='queued',
            progress=5,
            metadata={
                'status_url': f'mock://ltx/{provider_job_id}',
                'output_name': output_name,
                'provider_payload': {'status': 'queued', 'job_id': provider_job_id},
            },
        )

    def get_status(self, *, provider_job_id: str | None = None, status_url: str | None = None) -> VideoStatusResult:
        resolved_job_id = str(provider_job_id or '').strip() or str(status_url or '').rstrip('/').split('/')[-1].strip()
        if not resolved_job_id or resolved_job_id not in _MOCK_JOBS:
            raise RuntimeError(f'Mock LTX job not found: {resolved_job_id}')
        if self.settings.ltx_mock_force_error:
            return VideoStatusResult(
                provider_job_id=resolved_job_id,
                status='failed',
                progress=100,
                error_message='Mock LTX forced error is enabled',
                metadata={'provider_payload': {'status': 'failed', 'job_id': resolved_job_id, 'error': 'forced_error'}},
            )
        job = _MOCK_JOBS[resolved_job_id]
        elapsed = max(0.0, time.monotonic() - float(job['created_at']))
        if self.settings.ltx_mock_malformed_status:
            return VideoStatusResult(provider_job_id=resolved_job_id, status='running', metadata={'provider_payload': {'job_id': resolved_job_id}})
        queue_seconds = max(0.0, (self.settings.ltx_mock_latency_ms or 1000) / 2000)
        processing_seconds = max(0.0, (self.settings.ltx_mock_latency_ms or 1000) / 1000)
        if elapsed < queue_seconds:
            return VideoStatusResult(provider_job_id=resolved_job_id, status='queued', progress=10, metadata={'provider_payload': {'status': 'queued', 'job_id': resolved_job_id}})
        if elapsed < queue_seconds + processing_seconds:
            return VideoStatusResult(provider_job_id=resolved_job_id, status='running', progress=65, metadata={'provider_payload': {'status': 'running', 'job_id': resolved_job_id}})
        return VideoStatusResult(
            provider_job_id=resolved_job_id,
            status='completed',
            progress=100,
            video_url=job['sample_video'],
            metadata={'provider_payload': {'status': 'completed', 'job_id': resolved_job_id, 'video_url': job['sample_video']}, 'output_name': job['output_name']},
        )

    def get_result(self, *, provider_job_id: str | None = None, status_url: str | None = None) -> VideoStatusResult:
        return self.get_status(provider_job_id=provider_job_id, status_url=status_url)
