from __future__ import annotations

import logging
import time
from typing import Any

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class FalImageService:
    def __init__(self) -> None:
        self.settings = get_settings()

    def generate_recraft(
        self,
        *,
        model_key: str,
        prompt: str,
        width: int,
        height: int,
        reference_urls: list[str],
    ) -> str:
        if not self.settings.fal_api_key:
            raise RuntimeError('FAL_API_KEY is not configured for fal image generation')

        endpoint = self._resolve_recraft_endpoint(model_key)
        submit_url = f'{self.settings.fal_api_base.rstrip("/")}/{endpoint}'
        payload: dict[str, Any] = {
            'prompt': prompt,
            'image_size': {'width': width, 'height': height},
            'num_images': 1,
        }
        if reference_urls:
            payload['image_url'] = reference_urls[0]

        with httpx.Client(timeout=httpx.Timeout(120.0, connect=20.0)) as client:
            submit = client.post(
                submit_url,
                headers={
                    'Authorization': f'Key {self.settings.fal_api_key}',
                    'Content-Type': 'application/json',
                },
                json=payload,
            )
            if submit.status_code >= 400:
                raise RuntimeError(f'fal image submit failed ({submit.status_code}): {submit.text[:240]}')
            submit_data = submit.json() if submit.content else {}

            status_url = str(submit_data.get('status_url') or '').strip()
            response_url = str(submit_data.get('response_url') or '').strip()
            if not status_url and not response_url:
                raise RuntimeError('fal image submit did not include status_url or response_url')

            logger.info(
                'fal_image_submit_succeeded',
                extra={
                    'model_key': model_key,
                    'endpoint': endpoint,
                    'status_url': status_url,
                    'response_url': response_url,
                },
            )

            poll_url = status_url or response_url
            last_payload: dict[str, Any] | None = None
            for _ in range(90):
                status_res = client.get(
                    poll_url,
                    headers={'Authorization': f'Key {self.settings.fal_api_key}'},
                )
                if status_res.status_code >= 400:
                    raise RuntimeError(f'fal image status failed ({status_res.status_code}): {status_res.text[:240]}')
                status_data = status_res.json() if status_res.content else {}
                if isinstance(status_data, dict):
                    last_payload = status_data

                state = str(status_data.get('status') or status_data.get('state') or '').lower()
                if state in {'completed', 'succeeded', 'success', 'ok'}:
                    final_data = status_data
                    if response_url:
                        response_res = client.get(
                            response_url,
                            headers={'Authorization': f'Key {self.settings.fal_api_key}'},
                        )
                        if response_res.status_code < 400 and response_res.content:
                            response_payload = response_res.json()
                            if isinstance(response_payload, dict):
                                final_data = response_payload
                    image_url = self._extract_image_url(final_data)
                    if image_url:
                        return image_url
                    raise RuntimeError('fal image completed without output image url')
                if state in {'failed', 'error'}:
                    raise RuntimeError(f'fal image generation failed: {status_data}')
                time.sleep(2.0)

        raise RuntimeError(f'fal image generation timed out: {last_payload}')

    def _resolve_recraft_endpoint(self, model_key: str) -> str:
        endpoint = (
            self.settings.fal_recraft_image_pro_endpoint
            if model_key == 'recraft_studio_pro'
            else self.settings.fal_recraft_image_endpoint
        )
        endpoint = (endpoint or '').strip()
        if not endpoint:
            raise RuntimeError(f'fal recraft endpoint is not configured for model "{model_key}"')
        return endpoint

    def _extract_image_url(self, payload: dict[str, Any]) -> str | None:
        def from_dict(value: dict[str, Any]) -> str | None:
            for key in ('url', 'image_url', 'imageUrl'):
                item = value.get(key)
                if isinstance(item, str) and item.strip():
                    return item.strip()

            for key in ('images', 'output', 'data', 'results'):
                nested = value.get(key)
                if isinstance(nested, list):
                    for entry in nested:
                        if isinstance(entry, dict):
                            nested_url = from_dict(entry)
                            if nested_url:
                                return nested_url
                        elif isinstance(entry, str) and entry.strip().startswith(('http://', 'https://')):
                            return entry.strip()
                elif isinstance(nested, dict):
                    nested_url = from_dict(nested)
                    if nested_url:
                        return nested_url

            return None

        return from_dict(payload)
