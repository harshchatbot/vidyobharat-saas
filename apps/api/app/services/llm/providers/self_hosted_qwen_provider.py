from __future__ import annotations

import json
import logging
from typing import Any

import httpx
from pydantic import BaseModel

from app.core.config import Settings
from app.services.llm.base import LLMProvider

logger = logging.getLogger(__name__)


class SelfHostedQwenProvider(LLMProvider):
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        if not self.settings.qwen_self_hosted_base_url:
            raise RuntimeError('QWEN_SELF_HOSTED_BASE_URL is required for self_hosted_qwen provider')
        if not self.settings.qwen_self_hosted_model:
            raise RuntimeError('QWEN_SELF_HOSTED_MODEL is required for self_hosted_qwen provider')

    def provider_name(self) -> str:
        return 'self_hosted_qwen'

    def healthcheck(self) -> dict[str, Any]:
        return {'provider': self.provider_name(), 'ok': True, 'model': self.settings.qwen_self_hosted_model}

    def complete_text(self, *, task_type: str, system_prompt: str, user_prompt: str, temperature: float = 0.2) -> str:
        payload = self._request_completion(task_type=task_type, system_prompt=system_prompt, user_prompt=user_prompt, temperature=temperature, response_format=None)
        return str(payload.get('content') or '').strip()

    def complete_structured(
        self,
        *,
        task_type: str,
        schema_model: type[BaseModel],
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.2,
    ) -> BaseModel:
        payload = self._request_completion(
            task_type=task_type,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=temperature,
            response_format={
                'type': 'json_schema',
                'json_schema': {
                    'name': schema_model.__name__,
                    'schema': schema_model.model_json_schema(),
                    'strict': True,
                },
            },
        )
        return schema_model.model_validate(self._extract_json_payload(str(payload.get('content') or '{}').strip()))

    def _request_completion(
        self,
        *,
        task_type: str,
        system_prompt: str,
        user_prompt: str,
        temperature: float,
        response_format: dict[str, Any] | None,
    ) -> dict[str, Any]:
        base_url = str(self.settings.qwen_self_hosted_base_url or '').rstrip('/')
        endpoint = f'{base_url}/v1/chat/completions'
        headers = {'Content-Type': 'application/json'}
        if self.settings.qwen_self_hosted_api_key:
            headers['Authorization'] = f'Bearer {self.settings.qwen_self_hosted_api_key}'
        body: dict[str, Any] = {
            'model': self.settings.qwen_self_hosted_model,
            'messages': [
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': user_prompt},
            ],
            'temperature': temperature,
        }
        if response_format is not None:
            body['response_format'] = response_format
        logger.info(
            'self_hosted_qwen_request',
            extra={
                'provider': self.provider_name(),
                'model': self.settings.qwen_self_hosted_model,
                'task_type': task_type,
                'structured_output': bool(response_format),
                'timeout_seconds': self.settings.qwen_self_hosted_timeout,
            },
        )
        with httpx.Client(timeout=httpx.Timeout(float(self.settings.qwen_self_hosted_timeout or 90), connect=10.0)) as client:
            response = client.post(endpoint, json=body, headers=headers)
            if response.status_code >= 400:
                raise RuntimeError(f'Self-hosted Qwen request failed ({response.status_code}): {response.text[:400]}')
            payload = response.json()
        content = ''
        try:
            content = str(payload['choices'][0]['message']['content'] or '')
        except Exception as exc:
            raise RuntimeError(f'Unexpected self-hosted Qwen response shape: {payload}') from exc
        return {'content': content, 'raw': payload}

    @staticmethod
    def _extract_json_payload(value: str) -> dict[str, Any]:
        raw = value.strip()
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            start = raw.find('{')
            end = raw.rfind('}')
            if start == -1 or end == -1 or end <= start:
                raise
            data = json.loads(raw[start:end + 1])
        if not isinstance(data, dict):
            raise ValueError('Self-hosted Qwen response must be a JSON object')
        return data
