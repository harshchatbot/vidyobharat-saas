from __future__ import annotations

import asyncio
import json
import logging
from functools import lru_cache
from typing import TypeVar

from openai import APIStatusError, AsyncOpenAI
from pydantic import BaseModel, ValidationError

from app.core.config import Settings
from app.schemas.editor_copilot import CopilotHistoryMessage
from app.services.editor_copilot_provider import (
    CopilotProviderError,
    CopilotProviderMalformedOutput,
    CopilotProviderResult,
    CopilotProviderTimeout,
)


T = TypeVar('T', bound=BaseModel)
_STRUCTURED_MODEL_PREFIXES = ('gpt-4.1', 'gpt-4o', 'gpt-5', 'o3', 'o4')
logger = logging.getLogger(__name__)
_ERROR_CODES = frozenset({'invalid_json_schema', 'invalid_value', 'invalid_parameter', 'unsupported_parameter', 'unsupported_value', 'model_not_found', 'rate_limit_exceeded', 'insufficient_quota'})
_ERROR_PARAMS = frozenset({'response_format', 'response_format.json_schema', 'response_format.json_schema.schema', 'model', 'temperature', 'max_tokens', 'max_completion_tokens', 'messages'})
_ERROR_TYPES = frozenset({'invalid_request_error', 'authentication_error', 'permission_error', 'rate_limit_error', 'server_error', 'insufficient_quota'})


def _safe_error_field(value: object, allowed: frozenset[str]) -> str:
    return value if isinstance(value, str) and value in allowed else 'unknown'


@lru_cache(maxsize=16)
def _openai_response_model(response_model: type[T]) -> type[T]:
    class OpenAIResponseModel(response_model):  # type: ignore[valid-type, misc]
        @classmethod
        def model_json_schema(cls, *args, **kwargs):
            schema = super().model_json_schema(*args, **kwargs)

            def adapt(node):
                if isinstance(node, dict):
                    discriminator = node.get('discriminator')
                    if 'oneOf' in node and isinstance(discriminator, dict):
                        # Only rewrite mutually exclusive literal-tag branches.
                        # Validation still uses the original discriminated union.
                        tag = discriminator['propertyName']
                        values = []
                        for branch in node['oneOf']:
                            definition = branch
                            if '$ref' in branch:
                                definition = schema
                                for part in branch['$ref'].removeprefix('#/').split('/'):
                                    definition = definition[part]
                            values.append(definition['properties'][tag]['const'])
                        if len(values) != len(set(values)):
                            raise ValueError('Structured output union tags must be distinct.')
                        node['anyOf'] = node.pop('oneOf')
                        node.pop('discriminator')
                    for value in node.values():
                        adapt(value)
                elif isinstance(node, list):
                    for value in node:
                        adapt(value)

            adapt(schema)
            return schema

    return OpenAIResponseModel


class OpenAIEditingCopilotProvider:
    def __init__(self, settings: Settings, *, client: AsyncOpenAI | None = None) -> None:
        if not settings.openai_api_key and client is None:
            raise CopilotProviderError('OpenAI credentials are not configured.')
        if not any(settings.editor_copilot_model.startswith(prefix) for prefix in _STRUCTURED_MODEL_PREFIXES):
            raise CopilotProviderError('The configured OpenAI model is not approved for strict structured output.')
        self.settings = settings
        self.client = client or AsyncOpenAI(api_key=settings.openai_api_key)

    @property
    def provider_name(self) -> str:
        return 'openai'

    @property
    def model_name(self) -> str:
        return self.settings.editor_copilot_model

    async def create_plan(
        self,
        *,
        system_prompt: str,
        project_context: dict[str, object],
        user_prompt: str,
        history: list[CopilotHistoryMessage],
        response_model: type[T],
        timeout_seconds: float,
        max_output_tokens: int,
    ) -> CopilotProviderResult:
        messages: list[dict[str, str]] = [{'role': 'system', 'content': system_prompt}]
        messages.extend({'role': item.role, 'content': item.content} for item in history)
        messages.append({
            'role': 'user',
            'content': json.dumps(
                {'instruction': user_prompt, 'project': project_context},
                ensure_ascii=False,
                separators=(',', ':'),
            ),
        })
        last_validation_error: Exception | None = None
        for attempt in range(2):
            try:
                async with asyncio.timeout(timeout_seconds):
                    completion = await self.client.beta.chat.completions.parse(
                        model=self.model_name,
                        messages=messages,
                        response_format=_openai_response_model(response_model),
                        temperature=0.1,
                        max_tokens=max_output_tokens,
                    )
            except TimeoutError as exc:
                raise CopilotProviderTimeout('The Copilot provider timed out.', accepted=True) from exc
            except APIStatusError as exc:
                body = exc.body if isinstance(exc.body, dict) else {}
                logger.warning('editor_copilot_openai_http_error', extra={
                    'http_status': exc.status_code,
                    'error_code': _safe_error_field(exc.code, _ERROR_CODES),
                    'error_param': _safe_error_field(exc.param, _ERROR_PARAMS),
                    'error_type': _safe_error_field(body.get('type'), _ERROR_TYPES),
                })
                raise CopilotProviderError('The Copilot provider is unavailable.', accepted=True) from exc
            except (ValidationError, json.JSONDecodeError, ValueError) as exc:
                last_validation_error = exc
                if attempt == 0:
                    messages.append({'role': 'user', 'content': 'Return only a value matching the required JSON schema.'})
                    continue
                raise CopilotProviderMalformedOutput(
                    'The Copilot provider returned an invalid structured response.',
                    accepted=True,
                ) from exc
            except Exception as exc:
                # Once a request has been attempted, billing acceptance can be
                # ambiguous. Account conservatively unless failure is proven
                # before this method is called.
                raise CopilotProviderError('The Copilot provider is unavailable.', accepted=True) from exc

            choice = completion.choices[0] if completion.choices else None
            parsed = choice.message.parsed if choice else None
            if parsed is not None:
                usage = completion.usage
                return CopilotProviderResult(
                    value=parsed,
                    input_tokens=getattr(usage, 'prompt_tokens', None),
                    output_tokens=getattr(usage, 'completion_tokens', None),
                )
            last_validation_error = ValueError('Provider response did not contain parsed structured output.')
            if attempt == 0:
                messages.append({'role': 'user', 'content': 'Return only a value matching the required JSON schema.'})

        raise CopilotProviderMalformedOutput(
            'The Copilot provider returned an invalid structured response.',
            accepted=True,
        ) from last_validation_error
