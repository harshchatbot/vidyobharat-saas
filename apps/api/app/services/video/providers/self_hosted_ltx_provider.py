from __future__ import annotations

import logging
from typing import Any
from urllib.parse import urlparse

import httpx

from app.core.config import Settings
from app.services.video.base import VideoProvider, VideoStatusResult, VideoSubmitResult

logger = logging.getLogger(__name__)


class SelfHostedLtxProvider(VideoProvider):
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def provider_name(self) -> str:
        return 'self_hosted_ltx'

    def healthcheck(self) -> dict[str, Any]:
        base = self._base_url()
        if not self._is_valid_base_url(base):
            return {'provider': self.provider_name(), 'ok': False, 'error': 'missing_or_invalid_base_url', 'base_url': base}
        return {'provider': self.provider_name(), 'ok': True, 'base_url': base}

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
        base = self._base_url()
        if not self._is_valid_base_url(base):
            raise RuntimeError(
                'Self-hosted LTX is selected, but LTX_SELF_HOSTED_BASE_URL is missing or invalid. '
                'Set AI_VIDEO_PROVIDER=mock|hf_ltx for non-pod testing, or configure a valid self-hosted URL.'
            )
        submit_url = f'{base}{self.settings.ltx_video_submit_path}'
        output_name = str((metadata or {}).get('output_name') or f'{render_id}.mp4')
        payload = {
            'prompt': prompt,
            'output_name': output_name,
            'num_frames': 81,
            'frame_rate': 16,
        }
        logger.info(
            'ltx_submit_started',
            extra={
                'provider': self.provider_name(),
                'submit_url': submit_url,
                'render_id': render_id,
                'scene_role': (metadata or {}).get('scene_role'),
                'payload_keys': sorted(payload.keys()),
                'output_name': output_name,
                'num_frames': 81,
                'frame_rate': 16,
                'timeout_seconds': self.settings.ltx_self_hosted_timeout or self.settings.ltx_video_timeout_seconds,
            },
        )
        with httpx.Client(timeout=httpx.Timeout(180.0, connect=10.0)) as client:
            response = client.post(submit_url, json=payload, headers=self._headers())
            if response.status_code >= 400:
                raise RuntimeError(f'LTX submit failed ({response.status_code}): {response.text[:480]}')
            body = response.json()
        provider_job_id = self._extract_job_id(body)
        status_url = self._extract_status_url(body, provider_job_id)
        logger.info(
            'ltx_submit_succeeded',
            extra={
                'provider': self.provider_name(),
                'render_id': render_id,
                'provider_job_id': provider_job_id,
                'status_url': status_url,
            },
        )
        return VideoSubmitResult(
            provider_job_id=provider_job_id,
            status=self._normalize_status(body),
            progress=5,
            video_url=self._extract_video_url(body),
            metadata={
                'status_url': status_url,
                'output_name': output_name,
                'provider_payload': body,
                'submit_url': submit_url,
            },
            error_message=self._extract_error(body),
        )

    def get_status(self, *, provider_job_id: str | None = None, status_url: str | None = None) -> VideoStatusResult:
        resolved_status_url = status_url or self._status_url_for_job_id(str(provider_job_id or '').strip())
        if not resolved_status_url:
            raise RuntimeError('LTX status lookup requires either provider_job_id or status_url')
        with httpx.Client(timeout=httpx.Timeout(60.0, connect=10.0)) as client:
            response = client.get(resolved_status_url, headers=self._headers())
            if response.status_code >= 400:
                raise RuntimeError(f'LTX status failed ({response.status_code}): {response.text[:320]}')
            payload = response.json()
        normalized_status = self._normalize_status(payload)
        logger.info(
            'ltx_poll_status',
            extra={
                'provider': self.provider_name(),
                'provider_job_id': provider_job_id or self._extract_job_id(payload),
                'status_url': resolved_status_url,
                'provider_status': normalized_status,
            },
        )
        return VideoStatusResult(
            provider_job_id=self._extract_job_id(payload) or provider_job_id,
            status=normalized_status,
            progress=100 if normalized_status == 'completed' else 65 if normalized_status == 'running' else 15,
            video_url=self._extract_video_url(payload),
            metadata={'status_url': resolved_status_url, 'provider_payload': payload},
            error_message=self._extract_error(payload),
        )

    def get_result(self, *, provider_job_id: str | None = None, status_url: str | None = None) -> VideoStatusResult:
        return self.get_status(provider_job_id=provider_job_id, status_url=status_url)

    def _base_url(self) -> str:
        return str(self.settings.ltx_self_hosted_base_url or '').rstrip('/')

    @staticmethod
    def _is_valid_base_url(value: str) -> bool:
        candidate = str(value or '').strip()
        if not candidate:
            return False
        if '<' in candidate or '>' in candidate:
            return False
        parsed = urlparse(candidate)
        if parsed.scheme not in {'http', 'https'}:
            return False
        if not parsed.netloc:
            return False
        return True

    def _headers(self) -> dict[str, str]:
        headers = {'Content-Type': 'application/json'}
        token = self.settings.ltx_self_hosted_api_key or self.settings.ltx_video_api_key
        if token:
            headers['Authorization'] = f'Bearer {token}'
        return headers

    def _status_url_for_job_id(self, provider_job_id: str) -> str | None:
        if not provider_job_id:
            return None
        base = self._base_url()
        template = str(self.settings.ltx_video_status_path or '/status/{job_id}')
        return f'{base}{template.replace("{job_id}", provider_job_id)}' if '{job_id}' in template else f'{base}{template.rstrip("/")}/{provider_job_id}'

    def _extract_status_url(self, payload: dict[str, Any], provider_job_id: str | None) -> str | None:
        direct = payload.get('status_url') or payload.get('statusUrl')
        if direct:
            return str(direct)
        return self._status_url_for_job_id(str(provider_job_id or '').strip())

    @staticmethod
    def _extract_job_id(payload: dict[str, Any]) -> str | None:
        for key in ('job_id', 'jobId', 'id', 'request_id', 'requestId'):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return None

    @staticmethod
    def _normalize_status(payload: dict[str, Any]) -> str:
        raw = str(payload.get('status') or payload.get('state') or '').strip().lower()
        mapping = {
            'queued': 'queued',
            'pending': 'queued',
            'submitted': 'queued',
            'running': 'running',
            'processing': 'running',
            'in_progress': 'running',
            'completed': 'completed',
            'success': 'completed',
            'succeeded': 'completed',
            'done': 'completed',
            'failed': 'failed',
            'error': 'failed',
            'cancelled': 'failed',
            'canceled': 'failed',
        }
        return mapping.get(raw, 'queued' if not raw else raw)

    @staticmethod
    def _extract_video_url(payload: dict[str, Any]) -> str | None:
        for key in ('video_url', 'videoUrl', 'output_url', 'outputUrl', 'result_url', 'resultUrl'):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return None

    @staticmethod
    def _extract_error(payload: dict[str, Any]) -> str | None:
        for key in ('stderr_tail', 'stderr', 'error', 'message', 'detail'):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return None
