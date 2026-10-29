from __future__ import annotations

import asyncio
import ipaddress
import json
from typing import TypeVar
from urllib.parse import urlparse

import httpx
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


class OllamaEditingCopilotProvider:
    def __init__(self, settings: Settings, *, client: httpx.AsyncClient | None = None) -> None:
        self.settings = settings
        self.base_url = _validated_local_base_url(settings.editor_copilot_ollama_base_url)
        self._client = client

    @property
    def provider_name(self) -> str:
        return 'ollama'

    @property
    def model_name(self) -> str:
        return self.settings.editor_copilot_ollama_model

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
        schema = response_model.model_json_schema()
        last_error: Exception | None = None
        for attempt in range(2):
            payload = {
                'model': self.model_name,
                'stream': False,
                'format': schema,
                'messages': messages,
                'options': {'temperature': 0.1, 'num_predict': max_output_tokens},
            }
            try:
                response = await self._post(payload, timeout_seconds)
                response.raise_for_status()
                body = response.json()
                content = body.get('message', {}).get('content')
                if not isinstance(content, str):
                    raise ValueError('Ollama response did not contain message content.')
                value = response_model.model_validate_json(content)
                return CopilotProviderResult(
                    value=value,
                    input_tokens=_optional_nonnegative_int(body.get('prompt_eval_count')),
                    output_tokens=_optional_nonnegative_int(body.get('eval_count')),
                )
            except (ValidationError, json.JSONDecodeError, ValueError, TypeError) as exc:
                last_error = exc
                if attempt == 0:
                    messages.append({'role': 'user', 'content': 'Return only JSON matching the supplied schema.'})
                    continue
                raise CopilotProviderMalformedOutput(
                    'The local Copilot provider returned an invalid structured response.',
                    accepted=True,
                ) from exc
            except (TimeoutError, httpx.TimeoutException) as exc:
                raise CopilotProviderTimeout('The local Copilot provider timed out.', accepted=True) from exc
            except httpx.HTTPStatusError as exc:
                raise CopilotProviderError('The local Copilot provider rejected the request.', accepted=True) from exc
            except httpx.RequestError as exc:
                raise CopilotProviderError('The local Copilot provider is unavailable.', accepted=False) from exc
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                raise CopilotProviderError('The local Copilot provider is unavailable.', accepted=True) from exc

        raise CopilotProviderMalformedOutput(
            'The local Copilot provider returned an invalid structured response.',
            accepted=True,
        ) from last_error

    async def _post(self, payload: dict[str, object], timeout_seconds: float) -> httpx.Response:
        timeout = httpx.Timeout(timeout_seconds, connect=min(5.0, timeout_seconds))
        if self._client is not None:
            return await self._client.post(f'{self.base_url}/api/chat', json=payload, timeout=timeout)
        async with httpx.AsyncClient(follow_redirects=False) as client:
            return await client.post(f'{self.base_url}/api/chat', json=payload, timeout=timeout)


def _validated_local_base_url(value: str) -> str:
    parsed = urlparse(value.strip())
    if parsed.scheme != 'http' or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in {'', '/'}:
        raise CopilotProviderError('Ollama must use an unauthenticated local HTTP endpoint.')
    if parsed.hostname not in {'localhost', '127.0.0.1', '::1'}:
        try:
            if not ipaddress.ip_address(parsed.hostname or '').is_loopback:
                raise CopilotProviderError('Ollama must use a loopback endpoint.')
        except ValueError as exc:
            raise CopilotProviderError('Ollama must use a loopback endpoint.') from exc
    try:
        port = parsed.port
    except ValueError as exc:
        raise CopilotProviderError('Ollama endpoint must use a valid port.') from exc
    if not port:
        raise CopilotProviderError('Ollama endpoint must include an explicit port.')
    return value.rstrip('/')


def _optional_nonnegative_int(value: object) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else None
