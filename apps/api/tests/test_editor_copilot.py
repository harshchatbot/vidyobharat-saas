from __future__ import annotations

import json
import asyncio
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
import httpx
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from openai import AsyncOpenAI
from firebase_admin import auth

from app.api.deps import require_verified_firebase_principal
from app.core.config import Settings
from app.db.repositories.editor_copilot_usage_repository import (
    CopilotQuotaExceeded,
    CopilotQuotaLimits,
    EditorCopilotUsageRepository,
)
from app.schemas.editor_copilot import (
    AddTextOperation,
    CopilotGeneratedPlan,
    CopilotModelPlan,
    CopilotPlanRequest,
    CopilotTextItem,
    MoveItemOperation,
    UpdateItemOperation,
)
from app.services.editor_copilot_provider import CopilotProviderResult
from app.services.editor_copilot_provider import CopilotProviderTimeout
from app.services.editor_copilot_service import (
    CopilotServiceError,
    EditorCopilotService,
    calculate_project_revision,
    minimal_llm_context,
    validate_plan_semantics,
)
from app.services.openai_editor_copilot_provider import OpenAIEditingCopilotProvider
from app.services.ollama_editor_copilot_provider import OllamaEditingCopilotProvider
from app.services.editor_copilot_provider import CopilotProviderMalformedOutput


FIXTURE = Path(__file__).resolve().parents[3] / 'shared/fixtures/editor_copilot_protocol_v1.json'


def fixture_payload() -> dict:
    return json.loads(FIXTURE.read_text())


def settings(**overrides) -> Settings:
    values = {
        'editor_copilot_enabled': True,
        'editor_copilot_user_cost_usd_24h': 1,
        'editor_copilot_global_cost_usd_24h': 10,
        'editor_copilot_input_cost_per_1m': 1,
        'editor_copilot_output_cost_per_1m': 2,
        'openai_api_key': 'test-only',
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


class FakeUsage:
    def __init__(self) -> None:
        self.reservations = []
        self.reconciliations = []

    def reserve(self, **kwargs) -> None:
        self.reservations.append(kwargs)

    def reconcile(self, **kwargs) -> None:
        self.reconciliations.append(kwargs)


class FakeProvider:
    provider_name = 'openai'
    model_name = 'fake-structured'

    def __init__(self, value: CopilotModelPlan) -> None:
        self.value = value
        self.calls = []

    async def create_plan(self, **kwargs) -> CopilotProviderResult:
        self.calls.append(kwargs)
        return CopilotProviderResult(value=self.value, input_tokens=100, output_tokens=50)


class TimeoutProvider(FakeProvider):
    async def create_plan(self, **kwargs) -> CopilotProviderResult:
        raise CopilotProviderTimeout('timeout', accepted=True)


def request_for(*, revision: str | None = None) -> CopilotPlanRequest:
    fixture = fixture_payload()
    return CopilotPlanRequest.model_validate({
        'schemaVersion': '1.0',
        'projectRevision': revision or fixture['projectRevision'],
        'prompt': 'Make the opening warmer',
        'project': fixture['project'],
        'history': [],
    })


def text_item(item_id: str = 'new-text') -> CopilotTextItem:
    return CopilotTextItem.model_validate({
        'id': item_id, 'kind': 'text', 'trackId': 'text', 'label': 'Title',
        'startTime': 1, 'duration': 1, 'text': 'Hello', 'fontFamily': 'Inter',
        'fontSize': 40, 'color': '#ffffff', 'bold': False, 'x': 0.5, 'y': 0.5,
        'width': 0.8, 'rotation': 0, 'alignment': 'center',
        'outlineColor': '#000000', 'outlineWidth': 0, 'shadow': True,
        'backgroundColor': '#000000', 'backgroundOpacity': 0,
        'inAnimation': 'none', 'outAnimation': 'none', 'loopAnimation': 'none',
        'inAnimationDuration': 0.5, 'outAnimationDuration': 0.5,
    })


def test_backend_revision_matches_phase_a_fixture() -> None:
    request = request_for()
    assert calculate_project_revision(request.project) == fixture_payload()['projectRevision']
    changed = request.project.model_copy(update={'duration': 8})
    assert calculate_project_revision(changed) != request.projectRevision


def test_minimal_context_excludes_content_types_export_settings_and_paths() -> None:
    context = minimal_llm_context(request_for().project)
    serialized = json.dumps(context)
    assert 'contentType' not in serialized
    assert 'exportSettings' not in serialized
    assert 'storage' not in serialized.lower()
    assert 'mediaId' in serialized


def test_semantic_validation_supports_evolving_ids_and_rejects_overlap() -> None:
    project = request_for().project
    operations = [
        AddTextOperation(op='add_text', item=text_item()),
        UpdateItemOperation(op='update_item', itemId='new-text', changes={'text': 'Updated'}),
    ]
    validate_plan_semantics(project, operations)
    with pytest.raises(CopilotServiceError, match='overlap'):
        validate_plan_semantics(project, [MoveItemOperation(op='move_item', itemId='clip-b', startTime=2)])


def test_service_recomputes_revision_uses_minimal_context_and_reconciles() -> None:
    provider = FakeProvider(CopilotModelPlan(
        summary='Add a title', warnings=[],
        operations=[AddTextOperation(op='add_text', item=text_item())],
    ))
    usage = FakeUsage()
    service = EditorCopilotService(settings=settings(), provider=provider, usage=usage)  # type: ignore[arg-type]
    response = asyncio.run(service.plan(uid='registered-user', request=request_for()))
    assert response.plan.projectRevision == fixture_payload()['projectRevision']
    assert response.plan.requestId
    assert response.usage.inputTokens == 100
    assert len(usage.reservations) == 1
    assert usage.reconciliations[0]['status'] == 'completed'
    provider_context = provider.calls[0]['project_context']
    assert 'exportSettings' not in provider_context


def test_service_rejects_stale_revision_before_provider_or_quota() -> None:
    provider = FakeProvider(CopilotModelPlan(summary='No', warnings=[], operations=[AddTextOperation(op='add_text', item=text_item())]))
    usage = FakeUsage()
    service = EditorCopilotService(settings=settings(), provider=provider, usage=usage)  # type: ignore[arg-type]
    with pytest.raises(CopilotServiceError) as caught:
        asyncio.run(service.plan(uid='user', request=request_for(revision='sha256:' + '0' * 64)))
    assert caught.value.code == 'copilot_stale_project'
    assert not provider.calls
    assert not usage.reservations


def test_timeout_commits_conservative_reservation_and_returns_safe_error() -> None:
    provider = TimeoutProvider(CopilotModelPlan(summary='No', warnings=[], operations=[AddTextOperation(op='add_text', item=text_item())]))
    usage = FakeUsage()
    service = EditorCopilotService(settings=settings(), provider=provider, usage=usage)  # type: ignore[arg-type]
    with pytest.raises(CopilotServiceError) as caught:
        asyncio.run(service.plan(uid='user', request=request_for()))
    assert caught.value.code == 'copilot_provider_timeout'
    assert usage.reconciliations[0]['status'] == 'timed_out'
    assert usage.reconciliations[0]['tokens'] > 0


def test_usage_expired_lease_is_conservative_and_no_longer_concurrent() -> None:
    now = datetime.now(UTC)
    events = EditorCopilotUsageRepository._events({'events': [{
        'id': 'old', 'created_at': now - timedelta(minutes=10),
        'lease_expires_at': now - timedelta(minutes=5), 'active': True,
        'tokens': 2500, 'cost_usd': 0.01,
    }]}, now, 300)
    assert events[0]['status'] == 'lease_expired'
    totals = EditorCopilotUsageRepository._totals(events, now)
    assert totals == {'requests': 1, 'tokens': 2500, 'cost': 0.01, 'active': 0}


def test_usage_reservations_are_atomic_under_concurrent_requests(monkeypatch) -> None:
    lock = threading.Lock()
    data: dict[str, dict] = {}

    class Snapshot:
        def __init__(self, value): self.value = value
        def to_dict(self): return self.value

    class Reference:
        def __init__(self, key): self.key = key
        def get(self, *, transaction): return Snapshot(data.get(self.key))

    class Collection:
        def document(self, key): return Reference(key)

    class Transaction:
        def get(self, reference): return iter([reference.get(transaction=self)])
        def set(self, reference, value): data[reference.key] = value

    class Client:
        def collection(self, name): return Collection()
        def transaction(self): return Transaction()

    def transactional(function):
        def wrapped(transaction):
            with lock:
                return function(transaction)
        return wrapped

    monkeypatch.setattr('firebase_admin.firestore.transactional', transactional)
    repository = EditorCopilotUsageRepository(Client())
    limits = CopilotQuotaLimits(
        user_requests=1, user_tokens=10000, user_cost_usd=1,
        global_requests=10, global_cost_usd=10,
        concurrent_per_user=1, lease_seconds=300,
    )

    def reserve(reservation_id: str) -> str:
        try:
            repository.reserve(
                uid='same-user', reservation_id=reservation_id,
                reserved_tokens=100, reserved_cost_usd=0.01,
                limits=limits, now=datetime.now(UTC),
            )
            return 'accepted'
        except CopilotQuotaExceeded:
            return 'rejected'

    with ThreadPoolExecutor(max_workers=2) as executor:
        outcomes = list(executor.map(reserve, ['one', 'two']))
    assert sorted(outcomes) == ['accepted', 'rejected']


def test_openai_provider_rejects_model_without_verified_structured_output_support() -> None:
    with pytest.raises(Exception, match='structured output'):
        OpenAIEditingCopilotProvider(
            settings(editor_copilot_model='legacy-model'),
            client=AsyncOpenAI(api_key='test-only'),
        )


def test_ollama_provider_uses_local_structured_chat_without_external_calls() -> None:
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured.update(json.loads(request.content))
        value = CopilotModelPlan(
            summary='Add a local title', warnings=[],
            operations=[AddTextOperation(op='add_text', item=text_item())],
        )
        return httpx.Response(200, json={
            'message': {'role': 'assistant', 'content': value.model_dump_json(by_alias=True)},
            'prompt_eval_count': 42,
            'eval_count': 18,
        })

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider = OllamaEditingCopilotProvider(
        settings(
            editor_copilot_provider='ollama',
            editor_copilot_ollama_base_url='http://127.0.0.1:11434',
            editor_copilot_ollama_model='qwen2.5:3b',
        ),
        client=client,
    )
    result = asyncio.run(provider.create_plan(
        system_prompt='Return a safe plan.', project_context={'id': 'project'},
        user_prompt='Add a title', history=[], response_model=CopilotModelPlan,
        timeout_seconds=10, max_output_tokens=500,
    ))
    asyncio.run(client.aclose())
    assert result.input_tokens == 42
    assert result.output_tokens == 18
    assert result.value.summary == 'Add a local title'
    assert captured['model'] == 'qwen2.5:3b'
    assert captured['stream'] is False
    assert captured['format']['additionalProperties'] is False
    assert captured['options']['num_predict'] == 500


def test_ollama_provider_retries_malformed_output_once() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, json={'message': {'content': 'not-json'}})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider = OllamaEditingCopilotProvider(
        settings(editor_copilot_provider='ollama'), client=client,
    )
    with pytest.raises(CopilotProviderMalformedOutput):
        asyncio.run(provider.create_plan(
            system_prompt='system', project_context={}, user_prompt='prompt', history=[],
            response_model=CopilotModelPlan, timeout_seconds=10, max_output_tokens=500,
        ))
    asyncio.run(client.aclose())
    assert calls == 2


def test_ollama_provider_maps_local_timeout_without_retrying() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        raise httpx.ReadTimeout('local timeout', request=request)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider = OllamaEditingCopilotProvider(
        settings(editor_copilot_provider='ollama'), client=client,
    )
    with pytest.raises(CopilotProviderTimeout):
        asyncio.run(provider.create_plan(
            system_prompt='system', project_context={}, user_prompt='prompt', history=[],
            response_model=CopilotModelPlan, timeout_seconds=5, max_output_tokens=500,
        ))
    asyncio.run(client.aclose())
    assert calls == 1


@pytest.mark.parametrize('base_url', [
    'https://127.0.0.1:11434',
    'http://ollama.example.com:11434',
    'http://192.168.1.10:11434',
    'http://127.0.0.1:11434/proxy',
])
def test_ollama_provider_rejects_non_loopback_or_proxied_endpoints(base_url: str) -> None:
    with pytest.raises(Exception, match='local|loopback'):
        OllamaEditingCopilotProvider(settings(
            editor_copilot_provider='ollama',
            editor_copilot_ollama_base_url=base_url,
        ))


def test_ollama_configuration_keeps_token_and_request_quotas_with_zero_cost() -> None:
    provider = FakeProvider(CopilotModelPlan(
        summary='Add title', warnings=[],
        operations=[AddTextOperation(op='add_text', item=text_item())],
    ))
    provider.provider_name = 'ollama'
    provider.model_name = 'qwen2.5:3b'
    usage = FakeUsage()
    service = EditorCopilotService(
        settings=settings(
            editor_copilot_provider='ollama',
            editor_copilot_user_cost_usd_24h=0,
            editor_copilot_global_cost_usd_24h=0,
            editor_copilot_input_cost_per_1m=0,
            editor_copilot_output_cost_per_1m=0,
        ),
        provider=provider,
        usage=usage,  # type: ignore[arg-type]
    )
    response = asyncio.run(service.plan(uid='local-user', request=request_for()))
    assert response.usage.estimatedCostUsd == 0
    assert usage.reservations[0]['reserved_tokens'] > 0
    assert usage.reservations[0]['reserved_cost_usd'] == 0


def test_verified_auth_ignores_spoofed_user_id() -> None:
    app = FastAPI()

    @app.get('/strict')
    async def strict(_: object = Depends(require_verified_firebase_principal)):
        return {'ok': True}

    response = TestClient(app).get('/strict', headers={'X-User-ID': 'spoofed'})
    assert response.status_code == 401


def test_verified_auth_accepts_admin_verified_token_and_rejects_invalid(monkeypatch) -> None:
    app = FastAPI()

    @app.get('/strict')
    async def strict(principal=Depends(require_verified_firebase_principal)):
        return {'uid': principal.uid}

    monkeypatch.setattr('app.api.deps.get_firebase_app', lambda: object())
    monkeypatch.setattr(auth, 'verify_id_token', lambda *args, **kwargs: {'uid': 'verified-user'})
    assert TestClient(app).get('/strict', headers={'Authorization': 'Bearer valid'}).json() == {'uid': 'verified-user'}
    monkeypatch.setattr(auth, 'verify_id_token', lambda *args, **kwargs: (_ for _ in ()).throw(auth.InvalidIdTokenError('invalid')))
    assert TestClient(app).get('/strict', headers={'Authorization': 'Bearer invalid'}).status_code == 401


def test_generated_plan_forbids_unknown_fields() -> None:
    with pytest.raises(Exception):
        CopilotGeneratedPlan.model_validate({
            'schemaVersion': '1.0', 'requestId': 'request',
            'projectRevision': fixture_payload()['projectRevision'], 'summary': 'Test',
            'warnings': [], 'operations': [{'op': 'remove_item', 'itemId': 'clip-a', 'unknown': True}],
        })


@pytest.mark.parametrize('failure', ['missing', 'accounting', 'quota'])
def test_usage_failures_never_call_provider(failure, caplog) -> None:
    from app.db.repositories.editor_copilot_usage_repository import CopilotUsageUnavailable

    class BrokenUsage(FakeUsage):
        def reserve(self, **kwargs):
            if failure == 'quota':
                raise CopilotQuotaExceeded('concurrency')
            try:
                raise RuntimeError('underlying accounting failure')
            except RuntimeError as exc:
                raise CopilotUsageUnavailable('failed closed') from exc

    provider = FakeProvider(CopilotModelPlan(
        summary='Title', warnings=[], operations=[AddTextOperation(op='add_text', item=text_item())],
    ))
    service = EditorCopilotService(
        settings=settings(), provider=provider,
        usage=None if failure == 'missing' else BrokenUsage(),
    )
    with pytest.raises(CopilotServiceError) as caught:
        asyncio.run(service.plan(uid='user', request=request_for()))
    assert caught.value.status_code == (429 if failure == 'quota' else 503)
    assert not provider.calls
    if failure == 'accounting':
        assert 'underlying accounting failure' in caplog.text


def test_firestore_emulator_copilot_reservation_and_route(monkeypatch) -> None:
    import os
    import uuid
    import hashlib
    from google.auth.credentials import AnonymousCredentials
    from google.cloud.firestore_v1 import Client
    from app.api.routers.editor_copilot_routes import router, get_editor_copilot_service

    if os.environ.get('RUN_FIREBASE_EMULATOR_TESTS') != '1':
        pytest.skip('Run explicitly with a loopback Firestore emulator.')
    # Never use ADC, an env file, a production project, or a remote endpoint.
    assert os.environ.get('FIRESTORE_EMULATOR_HOST') == '127.0.0.1:8080'
    client = Client(project='demo-rangmanch-editor', credentials=AnonymousCredentials())
    repository = EditorCopilotUsageRepository(client)
    repository.collection = client.collection('_copilot_test_' + uuid.uuid4().hex)
    uid = 'emulator-copilot-user'
    now = datetime.now(UTC)
    limits = CopilotQuotaLimits(10, 100000, 0, 100, 0, 1, 300)
    try:
        repository.reserve(uid=uid, reservation_id='first', reserved_tokens=100,
                           reserved_cost_usd=0, limits=limits, now=now)
        with pytest.raises(CopilotQuotaExceeded, match='concurrency'):
            repository.reserve(uid=uid, reservation_id='second', reserved_tokens=100,
                               reserved_cost_usd=0, limits=limits, now=now)
        repository.reconcile(uid=uid, reservation_id='first', tokens=50,
                             cost_usd=0, status='completed', now=now)
        calls = []
        value = CopilotModelPlan(summary='Title', warnings=[], operations=[AddTextOperation(op='add_text', item=text_item())])

        def handler(request):
            calls.append(request)
            assert request.url.host == '127.0.0.1'
            return httpx.Response(200, json={'message': {'content': value.model_dump_json(by_alias=True)},
                                           'prompt_eval_count': 20, 'eval_count': 30})

        local_settings = settings(editor_copilot_provider='ollama',
                                  editor_copilot_input_cost_per_1m=0, editor_copilot_output_cost_per_1m=0)
        provider = OllamaEditingCopilotProvider(local_settings, client=httpx.AsyncClient(transport=httpx.MockTransport(handler)))
        service = EditorCopilotService(settings=local_settings, provider=provider, usage=repository)
        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[get_editor_copilot_service] = lambda: service
        # Exercise the route without changing its real authentication dependency.
        app.dependency_overrides[require_verified_firebase_principal] = lambda: type('Principal', (), {'uid': uid})()
        response = TestClient(app).post('/api/editor/copilot/plan', json=request_for().model_dump(mode='json', by_alias=True))
        assert response.status_code == 200, response.text
        assert len(calls) == 1
        for key in ['global', 'user-' + hashlib.sha256(uid.encode()).hexdigest()]:
            events = repository.collection.document(key).get().to_dict()['events']
            assert len(events) == 2
            assert all(event['status'] == 'completed' and not event['active'] for event in events)
    finally:
        for document in repository.collection.stream():
            document.reference.delete()
        client.close()


def _openai_completion(value: dict) -> dict:
    return {
        'id': 'test-completion', 'object': 'chat.completion', 'created': 0,
        'model': 'gpt-4.1-mini',
        'choices': [{'index': 0, 'finish_reason': 'stop',
                     'message': {'role': 'assistant', 'content': json.dumps(value)}}],
        'usage': {'prompt_tokens': 100, 'completion_tokens': 50, 'total_tokens': 150},
    }


def test_openai_provider_sends_compatible_strict_schema_and_parses_original_model() -> None:
    captured = []
    value = CopilotModelPlan(summary='Title', warnings=[], operations=[AddTextOperation(op='add_text', item=text_item())])

    def handler(request):
        captured.append(json.loads(request.content))
        return httpx.Response(200, json=_openai_completion(value.model_dump(mode='json')))

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            provider = OpenAIEditingCopilotProvider(settings(editor_copilot_model='gpt-4.1-mini'), client=AsyncOpenAI(api_key='test-only', http_client=http, max_retries=0))
            return await provider.create_plan(system_prompt='test', project_context={}, user_prompt='test', history=[], response_model=CopilotModelPlan, timeout_seconds=5, max_output_tokens=2500)

    result = asyncio.run(run())
    assert isinstance(result.value, CopilotModelPlan)
    assert result.value.operations == value.operations
    assert result.input_tokens == 100 and result.output_tokens == 50
    payload = captured[0]
    assert payload['model'] == 'gpt-4.1-mini'
    assert payload['temperature'] == 0.1 and payload['max_tokens'] == 2500
    response_format = payload['response_format']['json_schema']
    assert response_format['strict'] is True
    schema = response_format['schema']
    union = schema['properties']['operations']['items']
    assert len(union['anyOf']) == 9

    def check(node):
        if isinstance(node, dict):
            assert 'oneOf' not in node and 'discriminator' not in node
            if node.get('type') == 'object':
                assert node['additionalProperties'] is False
                assert set(node['required']) == set(node['properties'])
            for child in node.values():
                check(child)
        elif isinstance(node, list):
            for child in node:
                check(child)
    check(schema)
    # Adapting the OpenAI wire schema never changes canonical/Ollama schemas.
    assert 'oneOf' in CopilotModelPlan.model_json_schema()['properties']['operations']['items']


@pytest.mark.parametrize('operation', [
    {'op': 'invent_media'},
    {'op': 'remove_item', 'itemId': 'clip-a', 'unexpected': 'secret-response'},
    {'op': 'move_item', 'itemId': 'clip-a', 'startTime': 'not-a-number'},
])
def test_openai_provider_preserves_strict_validation(operation) -> None:
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(200, json=_openai_completion({'summary': 'Invalid', 'warnings': [], 'operations': [operation]}))

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            provider = OpenAIEditingCopilotProvider(settings(), client=AsyncOpenAI(api_key='test-only', http_client=http, max_retries=0))
            with pytest.raises(CopilotProviderMalformedOutput):
                await provider.create_plan(system_prompt='test', project_context={}, user_prompt='test', history=[], response_model=CopilotModelPlan, timeout_seconds=5, max_output_tokens=2500)
    asyncio.run(run())
    assert len(calls) == 2


@pytest.mark.parametrize('untrusted_fields', [False, True])
def test_openai_provider_logs_only_allowlisted_http_metadata_and_preserves_accounting(caplog, untrusted_fields) -> None:
    secret = 'SENSITIVE-marker-secret-prompt-key-response'
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(400, json={'error': {
            'message': secret,
            'type': secret if untrusted_fields else 'invalid_request_error',
            'code': secret if untrusted_fields else 'invalid_json_schema',
            'param': secret if untrusted_fields else 'response_format',
        }})

    usage = FakeUsage()

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            provider = OpenAIEditingCopilotProvider(settings(), client=AsyncOpenAI(api_key=secret, http_client=http, max_retries=0))
            service = EditorCopilotService(settings=settings(), provider=provider, usage=usage)
            with pytest.raises(CopilotServiceError) as caught:
                await service.plan(uid='test-user', request=request_for().model_copy(update={'prompt': secret}))
            assert caught.value.status_code == 503
            assert caught.value.code == 'copilot_provider_unavailable'
    asyncio.run(run())
    assert len(calls) == 1
    record = next(record for record in caplog.records if record.message == 'editor_copilot_openai_http_error')
    assert record.http_status == 400
    assert record.error_code == ('unknown' if untrusted_fields else 'invalid_json_schema')
    assert record.error_param == ('unknown' if untrusted_fields else 'response_format')
    assert record.error_type == ('unknown' if untrusted_fields else 'invalid_request_error')
    assert record.exc_info is None
    assert secret not in caplog.text
    assert secret not in repr(record.__dict__)
    assert len(usage.reservations) == 1
    assert usage.reconciliations[0]['status'] == 'provider_failed'
    assert usage.reconciliations[0]['tokens'] == usage.reservations[0]['reserved_tokens']


def test_service_serializes_sparse_updates_and_valid_animated_title() -> None:
    from app.schemas.editor_copilot import CopilotItemChanges, CopilotPlanResponse

    placeholders = {name: None for name in CopilotItemChanges.model_fields}
    title = text_item().model_copy(update={
        'text': 'My First AI Video', 'startTime': 0.0, 'duration': 3.0,
        'x': 0.5, 'y': 0.5, 'alignment': 'center',
        'inAnimation': 'fade-in', 'inAnimationDuration': 1.0,
    })
    value = CopilotModelPlan(summary='Slideshow', warnings=[], operations=[
        UpdateItemOperation(op='update_item', itemId='clip-a', changes={**placeholders, 'startTime': 0, 'duration': 3}),
        UpdateItemOperation(op='update_item', itemId='clip-b', changes={**placeholders, 'startTime': 3, 'duration': 3}),
        AddTextOperation(op='add_text', item=title),
    ])
    service = EditorCopilotService(settings=settings(), provider=FakeProvider(value), usage=FakeUsage())
    app = FastAPI()

    @app.get('/test-plan', response_model=CopilotPlanResponse)
    async def plan():
        return await service.plan(uid='user', request=request_for())

    response = TestClient(app).get('/test-plan')
    assert response.status_code == 200
    operations = response.json()['plan']['operations']
    assert operations[0]['changes'] == {'startTime': 0, 'duration': 3}
    assert operations[1]['changes'] == {'startTime': 3, 'duration': 3}
    assert operations[2]['item']['text'] == 'My First AI Video'
    assert operations[2]['item']['inAnimation'] == 'fade-in'
    assert operations[2]['item']['inAnimationDuration'] == 1
    CopilotPlanResponse.model_validate(response.json())


@pytest.mark.parametrize('changes', [
    {'duration': 3, 'text': 'Meaningful but unsupported'},
    {'duration': 3, 'fontSize': 42},
    {'duration': 3, 'shadow': False},
    {'duration': 3, 'inAnimation': 'fade-in'},
    {'text': None, 'fontSize': None},
])
def test_backend_rejects_unsupported_meaningful_or_empty_updates(changes) -> None:
    operation = UpdateItemOperation(op='update_item', itemId='clip-a', changes=changes)
    with pytest.raises(CopilotServiceError) as caught:
        validate_plan_semantics(request_for().project, [operation])
    assert caught.value.code == 'copilot_invalid_plan'


def test_backend_rejects_unknown_null_update_field() -> None:
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        UpdateItemOperation.model_validate({'op': 'update_item', 'itemId': 'clip-a', 'changes': {'duration': 3, 'unknown': None}})
