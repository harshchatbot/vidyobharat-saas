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
    _COMPLETED_RESPONSE_RETRY_LIMIT = 8
    _COMPLETED_RESPONSE_RETRY_SLEEP_SECONDS = 3
    _FOLLOW_UP_REQUEST_TIMEOUT_SECONDS = 120
    _FOLLOW_UP_REQUEST_DEPTH_LIMIT = 3
    _STATUS_REQUEST_TIMEOUT = httpx.Timeout(25.0, connect=10.0)
    _RESPONSE_REQUEST_TIMEOUT = httpx.Timeout(20.0, connect=10.0)

    def __init__(self) -> None:
        self.settings = get_settings()

    def generate(self, *, model_key: str, prompt: str, aspect_ratio: str, resolution: str, duration_seconds: int, image_url: str | None = None) -> tuple[str, dict[str, Any]]:
        if not getattr(self.settings, 'fal_api_key', None):
            raise RuntimeError('FAL_API_KEY is not configured for fal video generation')

        resolved_endpoint = self._endpoint_for(model_key)
        endpoint = f'{self.settings.fal_api_base.rstrip("/")}/{resolved_endpoint}'
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
            logger.info(
                'fal_video_submit_started',
                extra={
                    'requested_model_key': model_key,
                    'resolved_endpoint': resolved_endpoint,
                    'endpoint': endpoint,
                    'aspect_ratio': aspect_ratio,
                    'resolution': resolution,
                    'duration_seconds': duration_seconds,
                    'has_image_seed': bool(image_url),
                },
            )
            submit = client.post(endpoint, headers=headers, json=payload)
            if submit.status_code >= 400:
                raise RuntimeError(f'fal submit failed ({submit.status_code}): {submit.text[:240]}')
            data = submit.json()
            status_url = data.get('status_url')
            response_url = data.get('response_url')
            logger.info(
                'fal_video_submit_succeeded',
                extra={
                    'requested_model_key': model_key,
                    'resolved_endpoint': resolved_endpoint,
                    'submit_keys': sorted([str(k) for k in data.keys()]),
                    'status_url': status_url,
                    'response_url': response_url,
                },
            )
            if not status_url:
                status_url = response_url or data.get('url')
            if not status_url:
                video_url = self._extract_video_url(data)
                if video_url:
                    return video_url, {'raw': data, 'mode': 'immediate'}
                raise RuntimeError('fal response did not include a polling url or video output')

            started = time.time()
            last = data
            while time.time() - started < 900:
                status_response = self._request_with_timeout(
                    client=client,
                    method='GET',
                    url=status_url,
                    headers=headers,
                    timeout=self._STATUS_REQUEST_TIMEOUT,
                    failure_label='fal status poll',
                )
                if status_response is None:
                    continue
                if status_response.status_code >= 400:
                    raise RuntimeError(f'fal status failed ({status_response.status_code}): {status_response.text[:240]}')
                last = status_response.json()
                state = str(last.get('status') or last.get('state') or '').lower()
                direct_video_url = self._extract_video_url(last)
                if direct_video_url:
                    return direct_video_url, {'raw': last, 'mode': 'async'}
                if state in {'completed', 'succeeded', 'success', 'done'}:
                    video_url = self._extract_video_url(last)
                    if video_url:
                        return video_url, {'raw': last, 'mode': 'async'}
                    # Some fal endpoints keep status payload minimal and expose output via a response url.
                    # Try multiple candidates because some payloads include stale/model-level paths.
                    response_url_candidates: list[str] = []
                    for candidate in (last.get('response_url'), response_url):
                        if isinstance(candidate, str) and candidate.strip():
                            response_url_candidates.append(self._normalize_candidate_url(candidate.strip()))
                    # Derive request-level alternatives from status_url when present.
                    if '/status' in status_url:
                        base_request_url = status_url.rsplit('/status', 1)[0]
                        response_url_candidates.append(self._normalize_candidate_url(base_request_url))
                        response_url_candidates.append(self._normalize_candidate_url(f'{base_request_url}/response'))
                    tried_response_urls: list[str] = []
                    for response_url in list(dict.fromkeys(response_url_candidates)):
                        url_variants = [response_url]
                        if '/requests/' in response_url and not response_url.rstrip('/').endswith('/response'):
                            url_variants.append(f'{response_url.rstrip("/")}/response')
                        for attempt_index in range(self._COMPLETED_RESPONSE_RETRY_LIMIT):
                            response_payload = None
                            attempted_url = response_url
                            for candidate_url in url_variants:
                                attempted_url = candidate_url
                                tried_response_urls.append(candidate_url)
                                response_payload = self._request_with_timeout(
                                    client=client,
                                    method='GET',
                                    url=candidate_url,
                                    headers=headers,
                                    timeout=self._RESPONSE_REQUEST_TIMEOUT,
                                    failure_label='fal response fetch',
                                )
                                if response_payload is None:
                                    continue
                                if response_payload.status_code in {404, 405, 422} and candidate_url == url_variants[0] and len(url_variants) > 1:
                                    continue
                                if response_payload.status_code == 405:
                                    response_payload = self._request_with_timeout(
                                        client=client,
                                        method='POST',
                                        url=candidate_url,
                                        headers=headers,
                                        json={},
                                        timeout=self._RESPONSE_REQUEST_TIMEOUT,
                                        failure_label='fal response fetch',
                                    )
                                    if response_payload is None:
                                        continue
                                break
                            if response_payload is None:
                                continue
                            if response_payload.status_code >= 400:
                                logger.warning(
                                    'fal_response_url_fetch_failed attempt=%s response_url=%s status_code=%s body=%s',
                                    attempt_index + 1,
                                    attempted_url,
                                    response_payload.status_code,
                                    response_payload.text[:240],
                                )
                                break
                            response_data = response_payload.json()
                            video_url = self._extract_video_url(response_data)
                            if video_url:
                                return video_url, {'raw': response_data, 'mode': 'async_response_url'}
                            followed_video = self._follow_queued_response_request(
                                client=client,
                                headers=headers,
                                payload=response_data,
                                depth=0,
                            )
                            if followed_video is not None:
                                followed_url, followed_payload = followed_video
                                return followed_url, {'raw': followed_payload, 'mode': 'async_response_followup'}
                            logger.warning(
                                'fal_response_url_missing_video attempt=%s response_url=%s response_keys=%s preview=%s',
                                attempt_index + 1,
                                attempted_url,
                                sorted([str(k) for k in response_data.keys()]),
                                str(response_data)[:480],
                            )
                            if attempt_index < self._COMPLETED_RESPONSE_RETRY_LIMIT - 1:
                                time.sleep(self._COMPLETED_RESPONSE_RETRY_SLEEP_SECONDS)
                    logger.error(
                        'fal_completed_missing_video_url requested_model_key=%s resolved_endpoint=%s status_keys=%s tried_response_urls=%s status_preview=%s',
                        model_key,
                        resolved_endpoint,
                        sorted([str(k) for k in last.keys()]),
                        tried_response_urls,
                        str(last)[:480],
                    )
                    raise RuntimeError('fal completed without output video url')
                if state in {'failed', 'error', 'cancelled', 'canceled'}:
                    raise RuntimeError(f'fal generation failed: {last}')
                time.sleep(5)

        raise RuntimeError('fal video generation timed out while waiting for completion')

    def _endpoint_for(self, model_key: str) -> str:
        mapping = {
            # Use canonical fal-ai WAN route to keep status/response URLs compatible.
            'wan_2_5': 'fal-ai/wan/v2.6/text-to-video',
            'kling_turbo': 'fal-ai/kling-video/v1/turbo/text-to-video',
            'kling': 'fal-ai/kling-video/v1/standard/text-to-video',
        }
        return mapping.get(model_key, 'fal-ai/wan/v2.6/text-to-video')

    def _normalize_candidate_url(self, value: str) -> str:
        if value.startswith('http://') or value.startswith('https://'):
            return value
        base = self.settings.fal_api_base.rstrip('/')
        if value.startswith('/'):
            return f'{base}{value}'
        return f'{base}/{value}'

    def _extract_video_url(self, payload: dict[str, Any]) -> str | None:
        direct = payload.get('video_url') or payload.get('url') or payload.get('mp4_url')
        if isinstance(direct, str) and direct.strip():
            return self._normalize_media_url(direct.strip())
        video = payload.get('video')
        if isinstance(video, dict):
            for key in ('url', 'video_url', 'mp4_url'):
                value = video.get(key)
                if isinstance(value, str) and value.strip():
                    return self._normalize_media_url(value.strip())
        output = payload.get('output')
        if isinstance(output, dict):
            for key in ('url', 'video_url', 'mp4_url'):
                value = output.get(key)
                if isinstance(value, str) and value.strip():
                    return self._normalize_media_url(value.strip())
        if isinstance(output, list):
            for item in output:
                if isinstance(item, dict):
                    for key in ('url', 'video_url', 'mp4_url'):
                        value = item.get(key)
                        if isinstance(value, str) and value.strip():
                            return self._normalize_media_url(value.strip())
                elif isinstance(item, str) and item.strip():
                    return self._normalize_media_url(item.strip())

        # Final fallback: recursively inspect nested payload for likely video URLs.
        nested = self._find_url_recursive(payload)
        if nested:
            return nested
        return None

    def _find_url_recursive(self, node: Any, *, depth: int = 0) -> str | None:
        if depth > 5:
            return None
        if isinstance(node, str):
            value = node.strip()
            if (value.startswith('http') or value.startswith('/')) and ('.mp4' in value.lower() or '/video' in value.lower() or '/files/' in value.lower()):
                return self._normalize_media_url(value)
            return None
        if isinstance(node, dict):
            for key, value in node.items():
                if key.lower() in {'url', 'video_url', 'mp4_url', 'file_url', 'download_url'} and isinstance(value, str):
                    candidate = value.strip()
                    if candidate.startswith('http') or candidate.startswith('/'):
                        return self._normalize_media_url(candidate)
                nested = self._find_url_recursive(value, depth=depth + 1)
                if nested:
                    return nested
            return None
        if isinstance(node, list):
            for item in node:
                nested = self._find_url_recursive(item, depth=depth + 1)
                if nested:
                    return nested
            return None
        return None

    def _normalize_media_url(self, value: str) -> str:
        if value.startswith('http://') or value.startswith('https://'):
            return value
        return self._normalize_candidate_url(value)

    def _follow_queued_response_request(
        self,
        *,
        client: httpx.Client,
        headers: dict[str, str],
        payload: dict[str, Any],
        depth: int,
    ) -> tuple[str, dict[str, Any]] | None:
        if depth >= self._FOLLOW_UP_REQUEST_DEPTH_LIMIT:
            return None

        state = str(payload.get('status') or payload.get('state') or '').lower()
        status_url = payload.get('status_url')
        if not isinstance(status_url, str) or not status_url.strip():
            return None
        if state not in {'in_queue', 'queued', 'pending', 'processing', 'in_progress', 'running'}:
            return None

        normalized_status_url = self._normalize_candidate_url(status_url.strip())
        started = time.time()
        current_payload = payload

        while time.time() - started < self._FOLLOW_UP_REQUEST_TIMEOUT_SECONDS:
            direct_video_url = self._extract_video_url(current_payload)
            if direct_video_url:
                return direct_video_url, current_payload

            current_state = str(current_payload.get('status') or current_payload.get('state') or '').lower()
            if current_state in {'completed', 'succeeded', 'success', 'done'}:
                response_url = current_payload.get('response_url')
                if isinstance(response_url, str) and response_url.strip():
                    nested_payload = self._fetch_response_payload(
                        client=client,
                        headers=headers,
                        response_url=self._normalize_candidate_url(response_url.strip()),
                    )
                    if nested_payload is not None:
                        nested_video = self._extract_video_url(nested_payload)
                        if nested_video:
                            return nested_video, nested_payload
                        nested_follow_up = self._follow_queued_response_request(
                            client=client,
                            headers=headers,
                            payload=nested_payload,
                            depth=depth + 1,
                        )
                        if nested_follow_up is not None:
                            return nested_follow_up
                return None
            if current_state in {'failed', 'error', 'cancelled', 'canceled'}:
                raise RuntimeError(f'fal follow-up request failed: {current_payload}')

            time.sleep(self._COMPLETED_RESPONSE_RETRY_SLEEP_SECONDS)
            status_response = self._request_with_timeout(
                client=client,
                method='GET',
                url=normalized_status_url,
                headers=headers,
                timeout=self._STATUS_REQUEST_TIMEOUT,
                failure_label='fal follow-up status poll',
            )
            if status_response is None:
                continue
            if status_response.status_code >= 400:
                logger.warning(
                    'fal_follow_up_status_failed status_url=%s status_code=%s body=%s',
                    normalized_status_url,
                    status_response.status_code,
                    status_response.text[:240],
                )
                return None
            current_payload = status_response.json()

        logger.warning(
            'fal_follow_up_status_timed_out status_url=%s initial_request_id=%s',
            normalized_status_url,
            payload.get('request_id'),
        )
        return None

    def _fetch_response_payload(
        self,
        *,
        client: httpx.Client,
        headers: dict[str, str],
        response_url: str,
    ) -> dict[str, Any] | None:
        variants = [response_url]
        if '/requests/' in response_url and not response_url.rstrip('/').endswith('/response'):
            variants.append(f'{response_url.rstrip("/")}/response')

        last_response: httpx.Response | None = None
        attempted_url = response_url
        for candidate_url in list(dict.fromkeys(variants)):
            attempted_url = candidate_url
            response_payload = self._request_with_timeout(
                client=client,
                method='GET',
                url=candidate_url,
                headers=headers,
                timeout=self._RESPONSE_REQUEST_TIMEOUT,
                failure_label='fal follow-up response fetch',
            )
            if response_payload is None:
                continue
            if response_payload.status_code in {404, 405, 422} and candidate_url == variants[0] and len(variants) > 1:
                last_response = response_payload
                continue
            if response_payload.status_code == 405:
                response_payload = self._request_with_timeout(
                    client=client,
                    method='POST',
                    url=candidate_url,
                    headers=headers,
                    json={},
                    timeout=self._RESPONSE_REQUEST_TIMEOUT,
                    failure_label='fal follow-up response fetch',
                )
                if response_payload is None:
                    continue
            last_response = response_payload
            if response_payload.status_code < 400:
                return response_payload.json()

        if last_response is not None:
            logger.warning(
                'fal_follow_up_response_fetch_failed response_url=%s attempted_url=%s status_code=%s body=%s',
                response_url,
                attempted_url,
                last_response.status_code,
                last_response.text[:240],
            )
        return None

    def _request_with_timeout(
        self,
        *,
        client: httpx.Client,
        method: str,
        url: str,
        headers: dict[str, str],
        timeout: httpx.Timeout,
        failure_label: str,
        json: dict[str, Any] | None = None,
    ) -> httpx.Response | None:
        try:
            return client.request(method, url, headers=headers, json=json, timeout=timeout)
        except httpx.ReadTimeout:
            logger.warning('%s_read_timeout method=%s url=%s timeout=%s', failure_label, method, url, timeout.read)
            return None
