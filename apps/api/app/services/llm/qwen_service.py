from __future__ import annotations

import logging
from typing import Any

from pydantic import BaseModel

from app.core.config import Settings, get_settings
from app.services.llm.base import LLMProvider
from app.services.llm.providers.hf_qwen_provider import HFQwenProvider
from app.services.llm.providers.mock_qwen_provider import MockQwenProvider
from app.services.llm.providers.self_hosted_qwen_provider import SelfHostedQwenProvider

logger = logging.getLogger(__name__)


class QwenService:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self.provider = self._select_provider()

    def provider_name(self) -> str:
        return self.provider.provider_name()

    def healthcheck(self) -> dict[str, Any]:
        return self.provider.healthcheck()

    def complete_text(
        self,
        *,
        task_type: str,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.2,
    ) -> str:
        logger.info(
            'qwen_provider_selected',
            extra={
                'selected_text_provider': self.provider.provider_name(),
                'model': self._selected_model_name(),
                'task_type': task_type,
                'mock_mode': self._mock_enabled(),
                'structured_output_requested': False,
            },
        )
        return self.provider.complete_text(
            task_type=task_type,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=temperature,
        )

    def complete_structured(
        self,
        *,
        task_type: str,
        schema_model: type[BaseModel],
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.2,
    ) -> BaseModel:
        logger.info(
            'qwen_provider_selected',
            extra={
                'selected_text_provider': self.provider.provider_name(),
                'model': self._selected_model_name(),
                'task_type': task_type,
                'mock_mode': self._mock_enabled(),
                'structured_output_requested': True,
                'schema_model': schema_model.__name__,
            },
        )
        return self.provider.complete_structured(
            task_type=task_type,
            schema_model=schema_model,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=temperature,
        )

    def _select_provider(self) -> LLMProvider:
        provider_key = 'mock' if self._mock_enabled() else str(self.settings.ai_text_provider or 'mock').strip().lower()
        if provider_key == 'mock':
            return MockQwenProvider(self.settings)
        if provider_key == 'hf_qwen':
            return HFQwenProvider(self.settings)
        if provider_key == 'self_hosted_qwen':
            return SelfHostedQwenProvider(self.settings)
        raise RuntimeError(f'Unsupported AI text provider: {provider_key}')

    def _mock_enabled(self) -> bool:
        provider_key = str(self.settings.ai_text_provider or 'mock').strip().lower()
        return bool(self.settings.qwen_mock_mode or provider_key == 'mock')

    def _selected_model_name(self) -> str:
        if self.provider.provider_name() == 'hf_qwen':
            return str(self.settings.hf_qwen_model)
        if self.provider.provider_name() == 'self_hosted_qwen':
            return str(self.settings.qwen_self_hosted_model or 'self_hosted_qwen')
        return f"mock:{self.settings.qwen_mock_profile}"
