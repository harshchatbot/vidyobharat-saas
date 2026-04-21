from __future__ import annotations

import sys
import types

import pytest

from app.core.config import Settings
from app.schemas.ai import ReelScriptResponse
from app.services.llm.base import HookVariants
from app.services.llm.providers.hf_qwen_provider import HFQwenProvider
from app.services.llm.providers.self_hosted_qwen_provider import SelfHostedQwenProvider
from app.services.llm.qwen_service import QwenService


class _FakeMessage:
    def __init__(self, content: str) -> None:
        self.content = content


class _FakeChoice:
    def __init__(self, content: str) -> None:
        self.message = _FakeMessage(content)


class _FakeCompletion:
    def __init__(self, content: str) -> None:
        self.choices = [_FakeChoice(content)]


class _FakeChatCompletions:
    def __init__(self, sink: dict[str, object], content: str) -> None:
        self.sink = sink
        self.content = content

    def create(self, **kwargs):
        self.sink['request'] = kwargs
        return _FakeCompletion(self.content)


class _FakeInferenceClient:
    def __init__(self, *, provider=None, api_key=None, timeout=None, **kwargs) -> None:
        self.provider = provider
        self.api_key = api_key
        self.timeout = timeout
        sink = kwargs.pop('sink', None)
        self.chat = types.SimpleNamespace(completions=_FakeChatCompletions(sink or {}, '{}'))


def test_text_provider_selection_based_on_config() -> None:
    mock_service = QwenService(Settings(_env_file=None, ai_text_provider='mock', qwen_mock_mode=True))
    assert mock_service.provider_name() == 'mock_qwen'

    hf_service = QwenService(Settings(_env_file=None, ai_text_provider='hf_qwen', hf_token='hf_test_token'))
    assert hf_service.provider_name() == 'hf_qwen'

    self_hosted_service = QwenService(
        Settings(
            _env_file=None,
            ai_text_provider='self_hosted_qwen',
            qwen_self_hosted_base_url='http://localhost:9000',
            qwen_self_hosted_model='qwen-local',
        )
    )
    assert self_hosted_service.provider_name() == 'self_hosted_qwen'


def test_hf_qwen_request_payload_formation(monkeypatch) -> None:
    sink: dict[str, object] = {}

    class FakeInferenceClient:
        def __init__(self, **kwargs) -> None:
            sink['init'] = kwargs
            self.chat = types.SimpleNamespace(completions=_FakeChatCompletions(sink, 'plain text'))

    monkeypatch.setitem(sys.modules, 'huggingface_hub', types.SimpleNamespace(InferenceClient=FakeInferenceClient))
    provider = HFQwenProvider(Settings(hf_token='hf_test_token', hf_qwen_model='Qwen/Test', hf_qwen_provider='auto', hf_qwen_timeout=42))
    text = provider.complete_text(task_type='script_generate', system_prompt='system', user_prompt='user', temperature=0.6)

    assert text == 'plain text'
    assert sink['init']['provider'] == 'auto'
    assert sink['init']['api_key'] == 'hf_test_token'
    request = sink['request']
    assert request['model'] == 'Qwen/Test'
    assert request['temperature'] == 0.6
    assert request['messages'][0]['role'] == 'system'
    assert request['messages'][1]['role'] == 'user'


def test_hf_qwen_structured_output_parsing(monkeypatch) -> None:
    sink: dict[str, object] = {}
    content = '{"hook":"Hook","body_lines":["One","Two"],"cta":"CTA","caption":"Caption","hashtags":["#one"]}'

    class FakeInferenceClient:
        def __init__(self, **kwargs) -> None:
            sink['init'] = kwargs
            self.chat = types.SimpleNamespace(completions=_FakeChatCompletions(sink, content))

    monkeypatch.setitem(sys.modules, 'huggingface_hub', types.SimpleNamespace(InferenceClient=FakeInferenceClient))
    provider = HFQwenProvider(Settings(hf_token='hf_test_token'))
    result = provider.complete_structured(
        task_type='reel_script',
        schema_model=ReelScriptResponse,
        system_prompt='system',
        user_prompt='user',
        temperature=0.2,
    )

    assert result.hook == 'Hook'
    assert result.body_lines == ['One', 'Two']
    assert sink['request']['response_format']['type'] == 'json_schema'


def test_mock_qwen_happy_path_structured_output() -> None:
    service = QwenService(Settings(ai_text_provider='mock', qwen_mock_mode=True, qwen_mock_latency_ms=0))
    result = service.complete_structured(
        task_type='hook_variants',
        schema_model=HookVariants,
        system_prompt='system',
        user_prompt='user',
    )
    assert len(result.hooks) >= 3


def test_mock_qwen_forced_error_mode() -> None:
    service = QwenService(Settings(ai_text_provider='mock', qwen_mock_mode=True, qwen_mock_force_error=True))
    with pytest.raises(RuntimeError, match='forced error'):
        service.complete_text(task_type='script_generate', system_prompt='system', user_prompt='user')


def test_missing_token_and_missing_config_handling() -> None:
    with pytest.raises(RuntimeError, match='HF_TOKEN'):
        HFQwenProvider(Settings(_env_file=None, ai_text_provider='hf_qwen'))

    with pytest.raises(RuntimeError, match='QWEN_SELF_HOSTED_BASE_URL'):
        SelfHostedQwenProvider(
            Settings(
                _env_file=None,
                ai_text_provider='self_hosted_qwen',
                qwen_self_hosted_model='qwen',
            )
        )
