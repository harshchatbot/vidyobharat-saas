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
    _STATUS_POLL_INTERVAL_SECONDS = 4
    _TERMINAL_STATUS_TIMEOUT_SECONDS = 180
    _MODEL_TERMINAL_STATUS_TIMEOUT_SECONDS = {
        'kling': 420,
        'kling_turbo': 300,
        'kling_v3': 480,
    }
    _FOLLOW_UP_REQUEST_TIMEOUT_SECONDS = 180
    _FOLLOW_UP_REQUEST_DEPTH_LIMIT = 8
    _STATUS_REQUEST_TIMEOUT = httpx.Timeout(25.0, connect=10.0)
    _RESPONSE_REQUEST_TIMEOUT = httpx.Timeout(20.0, connect=10.0)
    _SUCCESS_STATES = {'completed', 'succeeded', 'success', 'done'}
    _FAILURE_STATES = {'failed', 'error', 'cancelled', 'canceled'}
    _ACTIVE_STATES = {'in_queue', 'queued', 'pending', 'processing', 'in_progress', 'running'}

    def __init__(self) -> None:
        self.settings = get_settings()

    def generate_infinite_talk(
        self,
        *,
        persona_image_url: str,
        audio_url: str,
        prompt: str,
        duration_hint_seconds: int,
        metadata: dict[str, Any] | None = None,
    ) -> tuple[str, dict[str, Any]]:
        if not getattr(self.settings, 'fal_api_key', None):
            raise RuntimeError('FAL_API_KEY is not configured for InfiniteTalk generation')

        raise RuntimeError(
            'fal InfiniteTalk provider routing is scaffolded but not fully wired to a live endpoint yet. '
            'The pipeline should fall back to the local talking-avatar proxy path.'
        )

    def generate(
        self,
        *,
        model_key: str,
        prompt: str,
        aspect_ratio: str,
        resolution: str,
        duration_seconds: int,
        image_url: str | None = None,
        multi_prompt: list[dict[str, Any]] | None = None,
        shot_type: str | None = None,
        generate_audio: bool | None = None,
    ) -> tuple[str, dict[str, Any]]:
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

        if multi_prompt:
            payload['multi_prompt'] = multi_prompt

        if model_key == 'kling_v3':
            payload['shot_type'] = shot_type or 'customize'
            payload['generate_audio'] = bool(generate_audio) if generate_audio is not None else False

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
                    'has_multi_prompt': bool(multi_prompt),
                    'shot_type': payload.get('shot_type'),
                    'generate_audio': payload.get('generate_audio'),
                },
            )

            submit = client.post(endpoint, headers=headers, json=payload)
            if submit.status_code >= 400:
                raise RuntimeError(f'fal submit failed ({submit.status_code}): {submit.text[:480]}')

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

            normalized_status_url = self._normalize_candidate_url(str(status_url).strip())

            terminal_payload = self._poll_status_until_terminal(
                client=client,
                headers=headers,
                status_url=normalized_status_url,
                requested_model_key=model_key,
                resolved_endpoint=resolved_endpoint,
            )

            direct_video_url = self._extract_video_url(terminal_payload)
            if direct_video_url:
                return direct_video_url, {'raw': terminal_payload, 'mode': 'async'}

            state = self._normalize_state(terminal_payload)
            if state in self._FAILURE_STATES:
                raise RuntimeError(f'fal generation failed: {terminal_payload}')
            if state not in self._SUCCESS_STATES:
                raise RuntimeError(f'fal video generation timed out while waiting for completion: {terminal_payload}')

            response_data, tried_response_urls = self._fetch_completed_response_payload(
                client=client,
                headers=headers,
                status_url=normalized_status_url,
                submit_response_url=response_url if isinstance(response_url, str) else None,
                completed_payload=terminal_payload,
            )

            if response_data is not None:
                video_url = self._extract_video_url(response_data)
                if video_url:
                    return video_url, {'raw': response_data, 'mode': 'async_response_url'}

                # Only do one explicit queued follow-up path if the returned payload is genuinely active.
                response_state = self._normalize_state(response_data)
                if response_state in self._ACTIVE_STATES and response_data.get('status_url'):
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
                    'fal_response_url_missing_video response_urls=%s response_keys=%s response_state=%s preview=%s',
                    tried_response_urls,
                    sorted([str(k) for k in response_data.keys()]),
                    response_state,
                    str(response_data)[:1000],
                )

            logger.error(
                'fal_completed_missing_video_url requested_model_key=%s resolved_endpoint=%s request_id=%s status_keys=%s tried_response_urls=%s status_preview=%s',
                model_key,
                resolved_endpoint,
                terminal_payload.get('request_id') or data.get('request_id'),
                sorted([str(k) for k in terminal_payload.keys()]),
                tried_response_urls,
                str(terminal_payload)[:1000],
            )
            raise RuntimeError('fal completed without output video url')


    def _normalize_state(self, payload: dict[str, Any]) -> str:
        return str(payload.get('status') or payload.get('state') or '').strip().lower()

    def _classify_lifecycle_state(self, state: str) -> str:
        if state in self._SUCCESS_STATES:
            return 'COMPLETED'
        if state in self._FAILURE_STATES:
            return state.upper()
        if state in {'processing', 'in_progress', 'running'}:
            return 'PROCESSING'
        return 'QUEUED'

    def _poll_status_until_terminal(
        self,
        *,
        client: httpx.Client,
        headers: dict[str, str],
        status_url: str,
        requested_model_key: str,
        resolved_endpoint: str,
    ) -> dict[str, Any]:
        started = time.time()
        last_payload: dict[str, Any] | None = None
        last_lifecycle_state: str | None = None
        timeout_seconds = self._terminal_timeout_for_model(requested_model_key)

        while time.time() - started < timeout_seconds:
            status_response = self._request_with_timeout(
                client=client,
                method='GET',
                url=status_url,
                headers=headers,
                timeout=self._STATUS_REQUEST_TIMEOUT,
                failure_label='fal status poll',
            )
            if status_response is None:
                time.sleep(self._STATUS_POLL_INTERVAL_SECONDS)
                continue
            if status_response.status_code >= 400:
                raise RuntimeError(f'fal status failed ({status_response.status_code}): {status_response.text[:240]}')

            current_payload = status_response.json()
            last_payload = current_payload
            state = self._normalize_state(current_payload)
            lifecycle_state = self._classify_lifecycle_state(state)
            if lifecycle_state != last_lifecycle_state:
                logger.info(
                    'fal_video_status_transition',
                    extra={
                        'requested_model_key': requested_model_key,
                        'resolved_endpoint': resolved_endpoint,
                        'request_id': current_payload.get('request_id'),
                        'status_url': status_url,
                        'lifecycle_state': lifecycle_state,
                        'raw_state': state or None,
                    },
                )
                last_lifecycle_state = lifecycle_state

            if state in self._SUCCESS_STATES or state in self._FAILURE_STATES:
                if state in self._FAILURE_STATES:
                    logger.error(
                        'fal_video_terminal_failure',
                        extra={
                            'requested_model_key': requested_model_key,
                            'resolved_endpoint': resolved_endpoint,
                            'request_id': current_payload.get('request_id'),
                            'raw_state': state or None,
                            'payload_preview': str(current_payload)[:480],
                        },
                    )
                return current_payload

            direct_video_url = self._extract_video_url(current_payload)
            if direct_video_url:
                return current_payload

            time.sleep(self._STATUS_POLL_INTERVAL_SECONDS)

        logger.error(
            'fal_video_status_timeout',
            extra={
                'requested_model_key': requested_model_key,
                'resolved_endpoint': resolved_endpoint,
                'status_url': status_url,
                'request_id': (last_payload or {}).get('request_id'),
                'last_state': self._normalize_state(last_payload or {}),
                'timeout_seconds': timeout_seconds,
                'elapsed_seconds': round(time.time() - started, 2),
                'payload_preview': str(last_payload)[:480],
            },
        )
        raise RuntimeError(f'fal video generation timed out while waiting for completion: {last_payload or {"status_url": status_url}}')

    def _terminal_timeout_for_model(self, requested_model_key: str) -> int:
        normalized = str(requested_model_key or '').strip().lower()
        return int(self._MODEL_TERMINAL_STATUS_TIMEOUT_SECONDS.get(normalized, self._TERMINAL_STATUS_TIMEOUT_SECONDS))


    def _fetch_completed_response_payload(
        self,
        *,
        client: httpx.Client,
        headers: dict[str, str],
        status_url: str,
        submit_response_url: str | None,
        completed_payload: dict[str, Any],
    ) -> tuple[dict[str, Any] | None, list[str]]:
        response_url_candidates: list[str] = []

        completed_response_url = completed_payload.get('response_url')
        if isinstance(completed_response_url, str) and completed_response_url.strip():
            response_url_candidates.append(self._normalize_candidate_url(completed_response_url.strip()))

        if isinstance(submit_response_url, str) and submit_response_url.strip():
            response_url_candidates.append(self._normalize_candidate_url(submit_response_url.strip()))

        if '/status' in status_url:
            base_request_url = status_url.rsplit('/status', 1)[0]
            response_url_candidates.append(self._normalize_candidate_url(f'{base_request_url}/response'))

        tried_response_urls: list[str] = []
        deduped_candidates = list(dict.fromkeys(response_url_candidates))

        for response_url in deduped_candidates:
            tried_response_urls.append(response_url)

            response_payload = self._request_with_timeout(
                client=client,
                method='POST',
                url=response_url,
                headers=headers,
                json={},
                timeout=self._RESPONSE_REQUEST_TIMEOUT,
                failure_label='fal response fetch',
            )
            if response_payload is None:
                continue

            if response_payload.status_code >= 400:
                logger.warning(
                    'fal_response_url_fetch_failed response_url=%s status_code=%s body=%s',
                    response_url,
                    response_payload.status_code,
                    response_payload.text[:480],
                )
                continue

            payload = response_payload.json()
            logger.info(
                'fal_response_payload_received',
                extra={
                    'response_url': response_url,
                    'response_keys': sorted([str(k) for k in payload.keys()]),
                    'response_state': self._normalize_state(payload),
                    'response_request_id': payload.get('request_id'),
                    'has_video_url': bool(self._extract_video_url(payload)),
                    'preview': str(payload)[:480],
                },
            )
            return payload, tried_response_urls

        return None, tried_response_urls

    def _endpoint_for(self, model_key: str) -> str:
        mapping = {
            'kling_turbo': 'fal-ai/kling-video/v1/turbo/text-to-video',
            'kling': 'fal-ai/kling-video/v1/standard/text-to-video',
            'kling_v3': 'fal-ai/kling-video/v3/standard/text-to-video',
        }
        endpoint = mapping.get(model_key)
        if not endpoint:
            raise ValueError(f'Unsupported fal model key: {model_key}')
        return endpoint


    def _normalize_candidate_url(self, value: str) -> str:
        if value.startswith('http://') or value.startswith('https://'):
            return value
        base = self.settings.fal_api_base.rstrip('/')
        if value.startswith('/'):
            return f'{base}{value}'
        return f'{base}/{value}'

    def _extract_video_url(self, payload: dict[str, Any]) -> str | None:
        direct_candidates = (
            payload.get('video_url'),
            payload.get('mp4_url'),
            payload.get('output_url'),
            payload.get('result_url'),
            payload.get('download_url'),
            payload.get('file_url'),
            payload.get('url'),
        )
        for candidate in direct_candidates:
            normalized = self._coerce_media_candidate(candidate)
            if normalized:
                return normalized
        video = payload.get('video')
        if isinstance(video, dict):
            for key in ('url', 'video_url', 'mp4_url', 'output_url', 'result_url', 'download_url', 'file_url'):
                normalized = self._coerce_media_candidate(video.get(key))
                if normalized:
                    return normalized

        for container_key in ('output', 'outputs', 'result', 'response', 'data', 'artifact', 'artifacts', 'asset', 'assets', 'media', 'files'):
            container = payload.get(container_key)
            normalized = self._extract_from_container(container)
            if normalized:
                return normalized

        # Final fallback: recursively inspect nested payload for likely video URLs.
        nested = self._find_url_recursive(payload)
        if nested:
            return nested
        return None

    def _extract_from_container(self, container: Any) -> str | None:
        if isinstance(container, dict):
            for key in ('url', 'video_url', 'mp4_url', 'output_url', 'result_url', 'download_url', 'file_url', 'src', 'href'):
                normalized = self._coerce_media_candidate(container.get(key))
                if normalized:
                    return normalized
            for nested_value in container.values():
                normalized = self._extract_from_container(nested_value)
                if normalized:
                    return normalized
            return None
        if isinstance(container, list):
            for item in container:
                normalized = self._extract_from_container(item)
                if normalized:
                    return normalized
            return None
        return self._coerce_media_candidate(container)

    def _coerce_media_candidate(self, candidate: Any) -> str | None:
        if not isinstance(candidate, str):
            return None
        value = candidate.strip()
        if not value:
            return None
        if value.startswith('data:video/'):
            return value
        if value.startswith('//'):
            return f'https:{value}'
        if value.startswith('http://') or value.startswith('https://') or value.startswith('/'):
            lowered = value.lower()
            if (
                '.mp4' in lowered
                or '.mov' in lowered
                or '.webm' in lowered
                or '.m3u8' in lowered
                or '/files/' in lowered
                or '/media/' in lowered
                or '/storage/' in lowered
                or '/download' in lowered
            ):
                return self._normalize_media_url(value)
            if lowered.startswith('https://v3.fal.media/') or lowered.startswith('https://fal.media/') or lowered.startswith('http://fal.media/'):
                return self._normalize_media_url(value)
        return None

    def _find_url_recursive(self, node: Any, *, depth: int = 0) -> str | None:
        if depth > 5:
            return None
        if isinstance(node, str):
            return self._coerce_media_candidate(node)
        if isinstance(node, dict):
            for key, value in node.items():
                if key.lower() in {'url', 'video_url', 'mp4_url', 'file_url', 'download_url', 'output_url', 'result_url', 'src', 'href'}:
                    normalized = self._coerce_media_candidate(value)
                    if normalized:
                        return normalized
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
        if value.startswith('//'):
            return f'https:{value}'
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
        # First, if payload already has final video, return immediately.
        direct_video_url = self._extract_video_url(payload)
        if direct_video_url:
            logger.info(
                'fal_follow_up_video_resolved',
                extra={
                    'request_id': payload.get('request_id'),
                    'depth': depth,
                    'video_url': direct_video_url,
                },
            )
            return direct_video_url, payload

        if depth >= self._FOLLOW_UP_REQUEST_DEPTH_LIMIT:
            logger.warning(
                'fal_follow_up_depth_limit_reached request_id=%s depth=%s',
                payload.get('request_id'),
                depth,
            )
            return None

        state = str(payload.get('status') or payload.get('state') or '').strip().lower()
        status_url = payload.get('status_url')
        if not isinstance(status_url, str) or not status_url.strip():
            logger.warning(
                'fal_follow_up_missing_status_url request_id=%s state=%s payload_preview=%s',
                payload.get('request_id'),
                state,
                str(payload)[:480],
            )
            return None

        normalized_status_url = self._normalize_candidate_url(status_url.strip())
        started = time.time()
        current_payload = payload
        last_state: str | None = None

        while time.time() - started < self._FOLLOW_UP_REQUEST_TIMEOUT_SECONDS:
            direct_video_url = self._extract_video_url(current_payload)
            if direct_video_url:
                logger.info(
                    'fal_follow_up_video_resolved',
                    extra={
                        'request_id': current_payload.get('request_id'),
                        'status_url': normalized_status_url,
                        'depth': depth,
                        'video_url': direct_video_url,
                    },
                )
                return direct_video_url, current_payload

            current_state = str(current_payload.get('status') or current_payload.get('state') or '').strip().lower()

            if current_state != last_state:
                logger.info(
                    'fal_follow_up_state_transition',
                    extra={
                        'request_id': current_payload.get('request_id'),
                        'status_url': normalized_status_url,
                        'depth': depth,
                        'state': current_state,
                    },
                )
                last_state = current_state

            if current_state in self._SUCCESS_STATES:
                response_url = current_payload.get('response_url')
                nested_payload, _ = self._fetch_completed_response_payload(
                    client=client,
                    headers=headers,
                    status_url=normalized_status_url,
                    submit_response_url=self._normalize_candidate_url(response_url.strip()) if isinstance(response_url, str) and response_url.strip() else None,
                    completed_payload=current_payload,
                )
                if nested_payload is not None:
                    nested_video = self._extract_video_url(nested_payload)
                    if nested_video:
                        return nested_video, nested_payload

                    nested_state = str(nested_payload.get('status') or nested_payload.get('state') or '').strip().lower()

                    # Only recurse if it is truly still active.
                    if nested_state in self._ACTIVE_STATES and nested_payload.get('status_url'):
                        return self._follow_queued_response_request(
                            client=client,
                            headers=headers,
                            payload=nested_payload,
                            depth=depth + 1,
                        )

                    logger.warning(
                        'fal_follow_up_completed_without_video request_id=%s depth=%s nested_state=%s preview=%s',
                        current_payload.get('request_id'),
                        depth,
                        nested_state,
                        str(nested_payload)[:480],
                    )
                    return None

                logger.warning(
                    'fal_follow_up_completed_without_video request_id=%s depth=%s preview=%s',
                    current_payload.get('request_id'),
                    depth,
                    str(current_payload)[:480],
                )
                return None

            if current_state in self._FAILURE_STATES:
                raise RuntimeError(f'fal follow-up request failed: {current_payload}')

            time.sleep(self._STATUS_POLL_INTERVAL_SECONDS)

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
            'fal_follow_up_status_timed_out status_url=%s initial_request_id=%s depth=%s',
            normalized_status_url,
            payload.get('request_id'),
            depth,
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
