from __future__ import annotations

import json
import logging
from typing import Any

from pydantic import BaseModel

from app.core.config import Settings
from app.services.llm.base import LLMProvider
from app.services.llm.hf_qwen_client import HFQwenChatClient

logger = logging.getLogger(__name__)


class HFQwenProvider(LLMProvider):
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client = HFQwenChatClient(settings=settings)

    def provider_name(self) -> str:
        return 'hf_qwen'

    def healthcheck(self) -> dict[str, Any]:
        return {'provider': self.provider_name(), 'ok': True, 'model': self.client.selected_model_name()}

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
        content = self.client.chat_completion(
            task_type=task_type,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=temperature,
            response_format=response_format,
        )
        return {'content': content}

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
