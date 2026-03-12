from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class FalVideoService:
    def __init__(self) -> None:
        self.settings = get_settings()

    def generate(self, *, model_key: str, prompt: str, aspect_ratio: str, resolution: str, duration_seconds: int, image_url: str | None = None) -> tuple[str, dict[str, Any]]:
        if not getattr(self.settings, 'fal_api_key', None):
            raise RuntimeError('FAL_API_KEY is not configured for fal video generation')

        endpoint = f'{self.settings.fal_api_base.rstrip("/")}/{self._endpoint_for(model_key)}'
        payload: dict[str, Any] = {
            'prompt': prompt,
            'aspect_ratio': aspect_ratio,
            'duration': duration_seconds,
            'resolution': resolution,
        }
        if image_url:
            payload['image_url'] = image_url

        headers = {
            'Authorization': f'Key {self.settings.fal_api_key}',
            'Content-Type': 'application/json',
        }

        with httpx.Client(timeout=httpx.Timeout(90.0, connect=20.0)) as client:
            submit = client.post(endpoint, headers=headers, json=payload)
            if submit.status_code >= 400:
                raise RuntimeError(f'fal submit failed ({submit.status_code}): {submit.text[:240]}')
            data = submit.json()
            status_url = data.get('status_url') or data.get('response_url') or data.get('url')
            if not status_url:
                video_url = self._extract_video_url(data)
                if video_url:
                    return video_url, {'raw': data, 'mode': 'immediate'}
                raise RuntimeError('fal response did not include a polling url or video output')

            started = time.time()
            last = data
            while time.time() - started < 900:
                status_response = client.get(status_url, headers=headers)
                if status_response.status_code >= 400:
                    raise RuntimeError(f'fal status failed ({status_response.status_code}): {status_response.text[:240]}')
                last = status_response.json()
                state = str(last.get('status') or last.get('state') or '').lower()
                if state in {'completed', 'succeeded', 'success', 'done'}:
                    video_url = self._extract_video_url(last)
                    if not video_url:
                        raise RuntimeError('fal completed without output video url')
                    return video_url, {'raw': last, 'mode': 'async'}
                if state in {'failed', 'error', 'cancelled', 'canceled'}:
                    raise RuntimeError(f'fal generation failed: {last}')
                time.sleep(5)

        raise RuntimeError('fal video generation timed out while waiting for completion')

    def _endpoint_for(self, model_key: str) -> str:
        mapping = {
            'wan_2_5': 'fal-ai/wan/v2.5/text-to-video',
            'kling_turbo': 'fal-ai/kling-video/v1/turbo/text-to-video',
            'kling': 'fal-ai/kling-video/v1/standard/text-to-video',
        }
        return mapping.get(model_key, 'fal-ai/wan/v2.5/text-to-video')

    def _extract_video_url(self, payload: dict[str, Any]) -> str | None:
        direct = payload.get('video_url') or payload.get('url') or payload.get('mp4_url')
        if isinstance(direct, str) and direct.strip():
            return direct.strip()
        video = payload.get('video')
        if isinstance(video, dict):
            for key in ('url', 'video_url', 'mp4_url'):
                value = video.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()
        output = payload.get('output')
        if isinstance(output, dict):
            for key in ('url', 'video_url', 'mp4_url'):
                value = output.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()
        return None
