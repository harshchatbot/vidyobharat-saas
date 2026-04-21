from __future__ import annotations

import logging
import re
import shutil
import time
from pathlib import Path
from typing import Any
from uuid import uuid4

import httpx

from app.core.config import Settings, get_settings
from app.services.video.base import VideoProvider
from app.services.video.providers.hf_ltx_provider import HFLtxProvider
from app.services.video.providers.mock_ltx_provider import MockLtxProvider
from app.services.video.providers.self_hosted_ltx_provider import SelfHostedLtxProvider

logger = logging.getLogger(__name__)


class LtxService:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self.provider = self._select_provider()

    def provider_name(self) -> str:
        return self.provider.provider_name()

    def healthcheck(self) -> dict[str, Any]:
        return self.provider.healthcheck()

    def submit_ltx_job(
        self,
        *,
        render_id: str,
        prompt: str,
        aspect_ratio: str,
        resolution: str,
        duration_seconds: int,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        output_name = self._build_output_name(render_id=render_id, metadata=metadata)
        merged_metadata = {**(metadata or {}), 'output_name': output_name}
        logger.info(
            'ltx_provider_selected',
            extra={
                'ai_video_provider_value': str(self.settings.ai_video_provider or '').strip(),
                'selected_video_provider': self.provider.provider_name(),
                'model': 'ltx',
                'provider_model': self._selected_model_name(),
                'resolved_provider_module': self.provider.__class__.__module__,
                'resolved_provider_class': self.provider.__class__.__name__,
                'legacy_compatibility_path': bool((metadata or {}).get('legacy_compatibility_path')),
                'mock_mode': self._mock_enabled(),
                'timeout_seconds': self.settings.ltx_self_hosted_timeout or self.settings.hf_ltx_timeout or self.settings.ltx_video_timeout_seconds,
            },
        )
        result = self.provider.submit_generation(
            render_id=render_id,
            prompt=prompt,
            aspect_ratio=aspect_ratio,
            resolution=resolution,
            duration_seconds=duration_seconds,
            metadata=merged_metadata,
        )
        return {
            'external_job_id': result.provider_job_id,
            'status_url': result.metadata.get('status_url'),
            'provider_status': result.status,
            'provider_payload': result.metadata.get('provider_payload') or {},
            'submit_url': result.metadata.get('submit_url'),
            'video_source': result.video_url,
            'stderr_tail': result.error_message,
            'output_name': output_name,
            'num_frames': (result.metadata.get('normalized_request') or {}).get('parameters', {}).get('num_frames', 81),
            'frame_rate': (result.metadata.get('normalized_request') or {}).get('parameters', {}).get('frame_rate', 16),
        }

    def get_ltx_job_status(self, *, job_id: str | None = None, status_url: str | None = None) -> dict[str, Any]:
        result = self.provider.get_status(provider_job_id=job_id, status_url=status_url)
        return {
            'external_job_id': result.provider_job_id,
            'status_url': result.metadata.get('status_url') or status_url,
            'provider_status': result.status,
            'provider_payload': result.metadata.get('provider_payload') or {},
            'video_source': result.video_url,
            'stderr_tail': result.error_message,
        }

    def generate_scene(
        self,
        *,
        render_id: str,
        prompt: str,
        aspect_ratio: str,
        resolution: str,
        duration_seconds: int,
        metadata: dict[str, Any] | None = None,
    ) -> tuple[str, dict[str, Any]]:
        submit_result = self.submit_ltx_job(
            render_id=render_id,
            prompt=prompt,
            aspect_ratio=aspect_ratio,
            resolution=resolution,
            duration_seconds=duration_seconds,
            metadata=metadata,
        )
        if submit_result.get('video_source'):
            local_path = self._materialize_video_source(video_source=str(submit_result['video_source']), render_id=render_id)
            logger.info('ltx_completed', extra={'provider': self.provider_name(), 'render_id': render_id, 'external_job_id': submit_result.get('external_job_id'), 'video_url': local_path, 'mode': 'immediate'})
            return local_path, {**submit_result, 'status': 'completed', 'response_mode': 'immediate', 'video_url': local_path}

        timeout_seconds = int(self.settings.ltx_self_hosted_timeout or self.settings.ltx_video_timeout_seconds or 1800)
        poll_interval = max(1, int(self.settings.ltx_video_poll_interval_seconds or 5))
        max_attempts = max(1, timeout_seconds // poll_interval)
        last_status: dict[str, Any] = submit_result
        attempts = 0
        while attempts < max_attempts:
            status_result = self.get_ltx_job_status(job_id=str(submit_result.get('external_job_id') or '').strip() or None, status_url=str(submit_result.get('status_url') or '').strip() or None)
            last_status = status_result
            provider_status = str(status_result.get('provider_status') or '').lower()
            if provider_status == 'completed':
                video_source = str(status_result.get('video_source') or '').strip()
                if not video_source:
                    raise RuntimeError(f'LTX completed without output video: {status_result.get("provider_payload")}')
                local_path = self._materialize_video_source(video_source=video_source, render_id=render_id)
                logger.info('ltx_completed', extra={'provider': self.provider_name(), 'render_id': render_id, 'external_job_id': status_result.get('external_job_id'), 'video_url': local_path, 'attempts': attempts + 1})
                return local_path, {**submit_result, **status_result, 'status': 'completed', 'response_mode': 'polled', 'video_url': local_path}
            if provider_status == 'failed':
                error_detail = status_result.get('stderr_tail') or status_result.get('provider_payload')
                logger.error('ltx_failed', extra={'provider': self.provider_name(), 'render_id': render_id, 'external_job_id': status_result.get('external_job_id'), 'error': str(error_detail)[:480]})
                raise RuntimeError(f'LTX generation failed: {error_detail}')
            attempts += 1
            time.sleep(poll_interval)

        logger.error('ltx_timeout', extra={'provider': self.provider_name(), 'render_id': render_id, 'external_job_id': submit_result.get('external_job_id'), 'status_url': submit_result.get('status_url'), 'attempts': attempts, 'last_status': last_status.get('provider_status')})
        raise RuntimeError(f"LTX generation timed out while waiting for completion: {last_status.get('provider_payload') or {'status_url': submit_result.get('status_url')}}")

    def _select_provider(self) -> VideoProvider:
        provider_key = 'mock' if self._mock_enabled() else str(self.settings.ai_video_provider or 'mock').strip().lower()
        if provider_key == 'mock':
            return MockLtxProvider(self.settings)
        if provider_key == 'hf_ltx':
            return HFLtxProvider(self.settings)
        if provider_key == 'self_hosted_ltx':
            return SelfHostedLtxProvider(self.settings)
        raise RuntimeError(f'Unsupported AI video provider: {provider_key}')

    def _mock_enabled(self) -> bool:
        provider_key = str(self.settings.ai_video_provider or 'mock').strip().lower()
        return bool(self.settings.ltx_mock_mode or provider_key == 'mock')

    def _selected_model_name(self) -> str:
        if self.provider.provider_name() == 'hf_ltx':
            return str(self.settings.hf_ltx_model)
        if self.provider.provider_name() == 'self_hosted_ltx':
            return str(self.settings.ltx_self_hosted_model or 'self_hosted_ltx')
        return f"mock:{self.settings.ltx_mock_profile}"

    def _materialize_video_source(self, *, video_source: str, render_id: str) -> str:
        output_path = Path('data/renders') / f'{render_id}.mp4'
        output_path.parent.mkdir(parents=True, exist_ok=True)
        source = str(video_source).strip()
        if source.startswith('http://') or source.startswith('https://'):
            with httpx.Client(timeout=httpx.Timeout(120.0, connect=10.0)) as client:
                response = client.get(source)
                if response.status_code >= 400 or not response.content:
                    raise RuntimeError(f'LTX output download failed ({response.status_code}): {response.text[:320]}')
                output_path.write_bytes(response.content)
            return f'/static/renders/{output_path.name}'
        local_candidate = Path(source).expanduser()
        if not local_candidate.is_absolute():
            local_candidate = Path.cwd() / local_candidate
        if self.settings.ltx_mock_mode and self.settings.ltx_mock_sample_video_path:
            local_candidate = Path(str(self.settings.ltx_mock_sample_video_path)).expanduser()
        if not local_candidate.exists():
            raise RuntimeError(f'LTX output path does not exist: {local_candidate}')
        shutil.copyfile(local_candidate, output_path)
        return f'/static/renders/{output_path.name}'

    def _build_output_name(self, *, render_id: str, metadata: dict[str, Any] | None) -> str:
        raw_parts = [str(render_id or '').strip(), str((metadata or {}).get('scene_id') or '').strip(), str((metadata or {}).get('scene_role') or '').strip()]
        raw_base = '-'.join(part for part in raw_parts if part)
        safe_base = re.sub(r'[^A-Za-z0-9._-]+', '-', raw_base).strip('._-')
        if not safe_base:
            safe_base = f'ltx-{uuid4().hex}'
        if not safe_base.lower().endswith('.mp4'):
            safe_base = f'{safe_base}.mp4'
        return safe_base
