from __future__ import annotations

import logging
import time
from typing import Any
from urllib.parse import urlparse

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def _redact_url(value: str | None) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    try:
        parsed = urlparse(raw)
        return f"{parsed.scheme}://{parsed.netloc}{parsed.path}" if parsed.scheme and parsed.netloc else raw.split("?", 1)[0]
    except Exception:
        return raw.split("?", 1)[0]


def _extract_error_message(payload: Any) -> str | None:
    if isinstance(payload, str):
        return payload.strip() or None
    if not isinstance(payload, dict):
        return None
    for key in ("detail", "error", "message", "errors"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
        if isinstance(value, list) and value:
            first = value[0]
            if isinstance(first, dict):
                msg = first.get("msg") or first.get("message") or first.get("detail")
                if isinstance(msg, str) and msg.strip():
                    return msg.strip()
            if isinstance(first, str) and first.strip():
                return first.strip()
        if isinstance(value, dict):
            nested = value.get("message") or value.get("detail")
            if isinstance(nested, str) and nested.strip():
                return nested.strip()
    return None


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

    def generate_storyboard_image_with_references(
        self,
        *,
        prompt: str,
        aspect_ratio: str,
        reference_urls: list[str],
        metadata: dict[str, Any] | None = None,
    ) -> tuple[str, dict[str, Any]]:
        endpoint = str(self.settings.storyboard_image_reference_model or "").strip()
        if not endpoint:
            raise RuntimeError("STORYBOARD_IMAGE_REFERENCE_MODEL is not configured")
        if not reference_urls:
            raise RuntimeError("Storyboard reference image generation requires reference_urls")

        payload: dict[str, Any] = {
            "prompt": prompt,
            "aspect_ratio": aspect_ratio,
            "image_url": reference_urls[0],
        }
        if len(reference_urls) > 1:
            payload["reference_images"] = reference_urls
            payload["image_urls"] = reference_urls
            payload["additional_image_urls"] = reference_urls[1:]

        result = self._submit_storyboard_image_job(
            endpoint=endpoint,
            payload=payload,
            metadata=metadata or {},
            mode="reference",
        )
        return result["image_url"], result

    def generate_storyboard_image_text_only(
        self,
        *,
        prompt: str,
        aspect_ratio: str,
        metadata: dict[str, Any] | None = None,
    ) -> tuple[str, dict[str, Any]]:
        endpoint = str(self.settings.storyboard_image_text_model or "").strip()
        if not endpoint:
            raise RuntimeError("STORYBOARD_IMAGE_TEXT_MODEL is not configured")

        payload: dict[str, Any] = {
            "prompt": prompt,
            "aspect_ratio": aspect_ratio,
        }
        result = self._submit_storyboard_image_job(
            endpoint=endpoint,
            payload=payload,
            metadata=metadata or {},
            mode="text_only",
        )
        return result["image_url"], result

    def _submit_storyboard_image_job(
        self,
        *,
        endpoint: str,
        payload: dict[str, Any],
        metadata: dict[str, Any],
        mode: str,
    ) -> dict[str, Any]:
        if not self.settings.fal_api_key:
            raise RuntimeError("FAL_API_KEY is not configured for storyboard image generation")
        submit_url = f"{self.settings.fal_api_base.rstrip('/')}/{endpoint}"
        logger.info(
            "fal_storyboard_image_request_started",
            extra={
                "endpoint": endpoint,
                "mode": mode,
                "metadata": metadata,
            },
        )
        with httpx.Client(timeout=httpx.Timeout(180.0, connect=20.0)) as client:
            submit = client.post(
                submit_url,
                headers={
                    "Authorization": f"Key {self.settings.fal_api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            if submit.status_code >= 400:
                logger.error(
                    "fal_storyboard_image_request_failed",
                    extra={"endpoint": endpoint, "status_code": submit.status_code, "body": submit.text[:500], "metadata": metadata},
                )
                raise RuntimeError(f"fal storyboard image submit failed ({submit.status_code}): {submit.text[:300]}")

            submit_data = submit.json() if submit.content else {}
            logger.info(
                "fal_queue_submit_response_keys",
                extra={"endpoint": endpoint, "keys": sorted(list(submit_data.keys())) if isinstance(submit_data, dict) else []},
            )
            request_id = str(submit_data.get("request_id") or submit_data.get("id") or "").strip() or None
            status_url = str(submit_data.get("status_url") or "").strip()
            response_url = str(submit_data.get("response_url") or "").strip()
            result_url = str(submit_data.get("result_url") or "").strip()
            if request_id and not status_url:
                status_url = f"{self.settings.fal_api_base.rstrip('/')}/{endpoint}/requests/{request_id}/status"
            if request_id and not response_url and not result_url:
                response_url = f"{self.settings.fal_api_base.rstrip('/')}/{endpoint}/requests/{request_id}"
            logger.info(
                "fal_queue_urls_resolved",
                extra={
                    "fal_queue_status_url": _redact_url(status_url),
                    "fal_queue_response_url": _redact_url(response_url),
                    "fal_queue_result_url": _redact_url(result_url),
                    "fal_queue_request_id": request_id,
                },
            )
            logger.info("fal_queue_status_url", extra={"value": _redact_url(status_url)})
            logger.info("fal_queue_response_url", extra={"value": _redact_url(response_url or result_url)})
            logger.info("fal_queue_request_id", extra={"value": request_id})
            if not status_url and not response_url and not result_url:
                raise RuntimeError("fal storyboard image submit did not include status_url or response_url")

            poll_url = status_url or response_url or result_url
            last_payload: dict[str, Any] | None = None
            for _ in range(120):
                status_res = client.get(
                    poll_url,
                    headers={"Authorization": f"Key {self.settings.fal_api_key}"},
                )
                if status_res.status_code >= 400:
                    raise RuntimeError(f"fal storyboard image status failed ({status_res.status_code}): {status_res.text[:300]}")
                status_data = status_res.json() if status_res.content else {}
                logger.info(
                    "fal_queue_status_response",
                    extra={
                        "url": _redact_url(poll_url),
                        "status_code": status_res.status_code,
                        "state": str(status_data.get("status") or status_data.get("state") or "").lower() if isinstance(status_data, dict) else "",
                    },
                )
                if isinstance(status_data, dict):
                    last_payload = status_data
                state = str(status_data.get("status") or status_data.get("state") or "").lower()
                if state in {"completed", "succeeded", "success", "ok"}:
                    final_data = status_data
                    resolved_response_url = response_url or result_url or str(status_data.get("response_url") or "").strip() or str(status_data.get("result_url") or "").strip()
                    if resolved_response_url:
                        response_res = client.get(
                            resolved_response_url,
                            headers={"Authorization": f"Key {self.settings.fal_api_key}"},
                        )
                        logger.info(
                            "fal_queue_result_fetch",
                            extra={
                                "url": _redact_url(resolved_response_url),
                                "fal_queue_result_status_code": response_res.status_code,
                            },
                        )
                        logger.info("fal_queue_result_status_code", extra={"value": response_res.status_code})
                        if response_res.status_code >= 400:
                            body = response_res.text[:1000]
                            logger.error(
                                "fal_queue_result_body_on_error",
                                extra={"status_code": response_res.status_code, "body": body},
                            )
                            raise RuntimeError(
                                f"Fal storyboard image failed: {body}"
                            )
                        if response_res.content:
                            maybe = response_res.json()
                            if isinstance(maybe, dict):
                                final_data = maybe
                    image_url = self._extract_image_url(final_data)
                    if not image_url:
                        message = _extract_error_message(final_data)
                        logger.error(
                            "fal_storyboard_image_no_output",
                            extra={
                                "fal_storyboard_image_raw_result_keys": sorted(list(final_data.keys())) if isinstance(final_data, dict) else [],
                                "fal_storyboard_image_error_payload": message or str(final_data)[:600],
                            },
                        )
                        if message:
                            raise RuntimeError(f"Fal storyboard image failed: {message}")
                        raise RuntimeError(
                            "Fal storyboard image completed without output image url. "
                            f"Raw result keys: {sorted(list(final_data.keys())) if isinstance(final_data, dict) else []}. "
                            f"Raw preview: {str(final_data)[:300]}"
                        )
                    logger.info(
                        "fal_storyboard_image_request_completed",
                        extra={"endpoint": endpoint, "image_url": image_url, "metadata": metadata},
                    )
                    return {
                        "image_url": image_url,
                        "endpoint": endpoint,
                        "status_url": status_url,
                        "response_url": response_url,
                        "mode": mode,
                    }
                if state in {"failed", "error"}:
                    message = _extract_error_message(status_data) or str(status_data)
                    logger.error(
                        "fal_storyboard_image_request_failed",
                        extra={"endpoint": endpoint, "state": state, "payload": message, "metadata": metadata},
                    )
                    raise RuntimeError(f"Fal storyboard image failed: {message}")
                time.sleep(2.0)

        raise RuntimeError(f"fal storyboard image timed out: {last_payload}")

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
