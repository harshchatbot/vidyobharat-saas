from __future__ import annotations

import logging
from typing import Any

from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)


class HFQwenChatClient:
    def __init__(
        self,
        *,
        settings: Settings | None = None,
        api_key: str | None = None,
        model: str | None = None,
        provider: str | None = None,
        timeout_seconds: int | float | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        self.api_key = api_key or self.settings.hf_token
        self.model = model or self.settings.hf_qwen_model
        self.provider = provider or self.settings.hf_qwen_provider
        self.timeout_seconds = float(timeout_seconds or self.settings.hf_qwen_timeout or 90)
        if not self.api_key:
            raise RuntimeError('HF_TOKEN is required for HF Qwen client')

        try:
            from huggingface_hub import InferenceClient
        except ImportError as exc:
            raise RuntimeError('huggingface_hub is required for HF Qwen client') from exc

        self.client = InferenceClient(
            provider=self.provider,
            api_key=self.api_key,
            timeout=self.timeout_seconds,
        )

    def provider_name(self) -> str:
        return 'hf_qwen'

    def selected_model_name(self) -> str:
        return str(self.model)

    def chat_completion(
        self,
        *,
        task_type: str,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.2,
        response_format: dict[str, Any] | None = None,
        max_tokens: int | None = None,
    ) -> str:
        request_kwargs: dict[str, Any] = {
            'model': self.model,
            'messages': [
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': user_prompt},
            ],
            'temperature': temperature,
        }
        if response_format is not None:
            request_kwargs['response_format'] = response_format
        if max_tokens is not None:
            request_kwargs['max_tokens'] = max_tokens

        logger.info(
            'hf_qwen_request',
            extra={
                'provider': self.provider_name(),
                'model': self.model,
                'task_type': task_type,
                'structured_output': bool(response_format),
                'timeout_seconds': self.timeout_seconds,
            },
        )
        completion = self.client.chat.completions.create(**request_kwargs)
        message = completion.choices[0].message if completion.choices else None
        return str(getattr(message, 'content', '') or '').strip()
