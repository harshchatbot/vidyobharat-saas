from __future__ import annotations

import logging
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.core.config import Settings
from app.services.video.base import VideoProvider, VideoStatusResult, VideoSubmitResult

logger = logging.getLogger(__name__)
_HF_JOBS: dict[str, dict[str, Any]] = {}


class HFLtxProvider(VideoProvider):
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        if not self.settings.hf_token:
            raise RuntimeError('HF_TOKEN is required for hf_ltx provider')

    def provider_name(self) -> str:
        return 'hf_ltx'

    def healthcheck(self) -> dict[str, Any]:
        return {'provider': self.provider_name(), 'ok': True, 'model': self.settings.hf_ltx_model, 'backend': self.settings.hf_ltx_provider}

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
        provider_job_id = f'hf-ltx-{uuid4().hex}'
        normalized_payload = {
            'inputs': prompt,
            'parameters': {
                'negative_prompt': str((metadata or {}).get('negative_prompt') or 'no speaking, no lip sync, no abrupt fast motion'),
                'num_frames': int((metadata or {}).get('num_frames') or 81),
                'guidance_scale': float((metadata or {}).get('guidance_scale') or 3.0),
                'aspect_ratio': aspect_ratio,
                'resolution': resolution,
                'seed': (metadata or {}).get('seed'),
            },
            'model': self.settings.hf_ltx_model,
            'provider': self.settings.hf_ltx_provider,
        }
        logger.info(
            'hf_ltx_submit_normalized',
            extra={
                'provider': self.provider_name(),
                'model': self.settings.hf_ltx_model,
                'provider_backend': self.settings.hf_ltx_provider,
                'payload_keys': sorted(normalized_payload.keys()),
                'parameter_keys': sorted(normalized_payload['parameters'].keys()),
            },
        )
        try:
            from huggingface_hub import InferenceClient
        except ImportError as exc:
            raise RuntimeError('huggingface_hub is required for hf_ltx provider') from exc
        client = InferenceClient(provider=self.settings.hf_ltx_provider, api_key=self.settings.hf_token, timeout=float(self.settings.hf_ltx_timeout or 600))
        # HF text-to-video providers can return direct artifact content. We normalize that into a completed async job.
        result = client.text_to_video(prompt=prompt, model=self.settings.hf_ltx_model)
        temp_path = Path('data/renders') / f'{provider_job_id}.mp4'
        temp_path.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(result, bytes):
            temp_path.write_bytes(result)
        elif hasattr(result, 'read'):
            temp_path.write_bytes(result.read())
        else:
            raise RuntimeError('HF LTX returned an unsupported artifact type')
        local_source = str(temp_path.resolve())
        _HF_JOBS[provider_job_id] = {'video_url': local_source, 'payload': normalized_payload}
        return VideoSubmitResult(
            provider_job_id=provider_job_id,
            status='completed',
            progress=100,
            video_url=local_source,
            metadata={'provider_payload': {'status': 'completed', 'job_id': provider_job_id, 'video_url': local_source}, 'normalized_request': normalized_payload},
        )

    def get_status(self, *, provider_job_id: str | None = None, status_url: str | None = None) -> VideoStatusResult:
        if not provider_job_id or provider_job_id not in _HF_JOBS:
            raise RuntimeError(f'HF LTX job not found: {provider_job_id}')
        job = _HF_JOBS[provider_job_id]
        return VideoStatusResult(
            provider_job_id=provider_job_id,
            status='completed',
            progress=100,
            video_url=job['video_url'],
            metadata={'provider_payload': {'status': 'completed', 'job_id': provider_job_id, 'video_url': job['video_url']}, 'normalized_request': job['payload']},
        )

    def get_result(self, *, provider_job_id: str | None = None, status_url: str | None = None) -> VideoStatusResult:
        return self.get_status(provider_job_id=provider_job_id, status_url=status_url)
