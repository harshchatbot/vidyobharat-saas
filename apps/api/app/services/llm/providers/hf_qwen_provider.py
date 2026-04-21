from __future__ import annotations

import json
import logging
from typing import Any

from pydantic import BaseModel

from app.core.config import Settings
from app.services.llm.base import LLMProvider

logger = logging.getLogger(__name__)


class HFQwenProvider(LLMProvider):
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        if not self.settings.hf_token:
            raise RuntimeError('HF_TOKEN is required for hf_qwen provider')

    def provider_name(self) -> str:
        return 'hf_qwen'

    def healthcheck(self) -> dict[str, Any]:
        return {'provider': self.provider_name(), 'ok': True, 'model': self.settings.hf_qwen_model}

    def complete_text(self, *, task_type: str, system_prompt: str, user_prompt: str, temperature: float = 0.2) -> str:
        response = self._chat_completion(
            task_type=task_type,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=temperature,
            response_format=None,
        )
        return str(response.get('content') or '').strip()

    def complete_structured(
        self,
        *,
        task_type: str,
        schema_model: type[BaseModel],
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.2,
    ) -> BaseModel:
        response = self._chat_completion(
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
        content = str(response.get('content') or '{}').strip()
        parsed = self._extract_json_payload(content)
        return schema_model.model_validate(parsed)

    def _chat_completion(
        self,
        *,
        task_type: str,
        system_prompt: str,
        user_prompt: str,
        temperature: float,
        response_format: dict[str, Any] | None,
    ) -> dict[str, Any]:
        try:
            from huggingface_hub import InferenceClient
        except ImportError as exc:
            raise RuntimeError('huggingface_hub is required for hf_qwen provider') from exc

        client = InferenceClient(
            provider=self.settings.hf_qwen_provider,
            api_key=self.settings.hf_token,
            timeout=float(self.settings.hf_qwen_timeout or 90),
        )
        request_kwargs: dict[str, Any] = {
            'model': self.settings.hf_qwen_model,
            'messages': [
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': user_prompt},
            ],
            'temperature': temperature,
        }
        if response_format is not None:
            request_kwargs['response_format'] = response_format
        logger.info(
            'hf_qwen_request',
            extra={
                'provider': self.provider_name(),
                'model': self.settings.hf_qwen_model,
                'task_type': task_type,
                'structured_output': bool(response_format),
                'timeout_seconds': self.settings.hf_qwen_timeout,
            },
        )
        completion = client.chat.completions.create(**request_kwargs)
        message = completion.choices[0].message
        return {'content': getattr(message, 'content', '')}

    @staticmethod
    def _extract_json_payload(value: str) -> dict[str, Any]:
        raw = value.strip()
        if raw.startswith('```'):
            raw = raw.strip('`')
            if raw.lower().startswith('json'):
                raw = raw[4:].strip()
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            start = raw.find('{')
            end = raw.rfind('}')
            if start == -1 or end == -1 or end <= start:
                raise
            data = json.loads(raw[start:end + 1])
        if not isinstance(data, dict):
            raise ValueError('HF Qwen response must be a JSON object')
        return data
