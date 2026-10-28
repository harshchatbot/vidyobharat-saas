from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from math import inf, nan

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.requests import Request

from app.api.routers.editor_routes import get_guest_session_service, router
from app.core.config import Settings
from app.db.repositories.guest_session_repository import (
    GuestQuotaLimits,
    GuestQuotaReservation,
    GuestSessionRepository,
)
from app.db.repositories.guest_network_quota_repository import GuestNetworkQuotaRepository
from app.providers.firebase import get_firestore_client
from app.providers.firebase_emulator import validate_firebase_emulator_environment
from app.services.guest_session_errors import GuestSessionError
from app.services.guest_session_service import GuestSessionConfig, GuestSessionService
from app.services.app_config_service import AppConfigService, defaults_from_settings


pytestmark = pytest.mark.skipif(
    os.environ.get('RUN_FIREBASE_EMULATOR_TESTS') != '1',
    reason='Guest session tests require the guarded Firebase emulators.',
)
ORIGIN = 'http://localhost:3000'
CSRF_HEADERS = {'Origin': ORIGIN, 'X-RangManch-Editor-CSRF': '1'}


def _delete_collection(collection) -> None:
    for snapshot in collection.stream():
        for reservation in snapshot.reference.collection('reservations').stream():
            reservation.reference.delete()
        snapshot.reference.delete()


@pytest.fixture()
def firestore_client():
    validate_firebase_emulator_environment()
    client = get_firestore_client()
    _delete_collection(client.collection(GuestSessionRepository.collection_name))
    _delete_collection(client.collection(GuestSessionRepository.rate_limits_collection_name))
    _delete_collection(client.collection(GuestNetworkQuotaRepository.collection_name))
    try:
        yield client
    finally:
        _delete_collection(client.collection(GuestSessionRepository.collection_name))
        _delete_collection(client.collection(GuestSessionRepository.rate_limits_collection_name))
        _delete_collection(client.collection(GuestNetworkQuotaRepository.collection_name))


@pytest.fixture()
def service(firestore_client) -> GuestSessionService:
    config = GuestSessionConfig(
        cookie_name='rangmanch_guest_test',
        cookie_secure=False,
        cookie_samesite='lax',
        lifetime=timedelta(hours=24),
        csrf_header='X-RangManch-Editor-CSRF',
        csrf_value='1',
        allowed_origins=frozenset({ORIGIN}),
        limits=GuestQuotaLimits(
            uploads=2,
            exports=2,
            uploaded_bytes=1_000,
            storage_bytes=2_000,
            processing_seconds=60,
            concurrent_processing=1,
        ),
        creation_rate_limit=2,
        creation_rate_window=timedelta(hours=1),
        reservation_lease=timedelta(minutes=15),
        rate_limit_secret=b'test-rate-limit-secret-at-least-32-bytes',
    )
    return GuestSessionService(
        repository=GuestSessionRepository(firestore_client),
        config=config,
    )


@pytest.fixture()
def client(service: GuestSessionService):
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_guest_session_service] = lambda: service
    with TestClient(app) as test_client:
        yield test_client


def _create(client: TestClient):
    return client.post('/api/editor/guest/session', headers=CSRF_HEADERS)


def _request(*, peer: str = '198.51.100.10', forwarded_for: str | None = None) -> Request:
    headers = dict(CSRF_HEADERS)
    if forwarded_for is not None:
        headers['X-Forwarded-For'] = forwarded_for
    return Request(
        {
            'type': 'http',
            'method': 'POST',
            'path': '/api/editor/guest/session',
            'headers': [(key.lower().encode(), value.encode()) for key, value in headers.items()],
            'client': (peer, 12345),
        }
    )


def test_session_creation_cookie_and_persisted_hash(client: TestClient, service: GuestSessionService) -> None:
    response = _create(client)

    assert response.status_code == 200
    body = response.json()
    assert body['status'] == 'active'
    assert body['usage']['remaining']['uploads'] == 2
    assert 'token' not in str(body).lower()
    cookie_header = response.headers['set-cookie'].lower()
    assert 'httponly' in cookie_header
    assert 'samesite=lax' in cookie_header
    assert 'max-age=86400' in cookie_header
    assert 'path=/api/editor' in cookie_header
    assert 'secure' not in cookie_header

    raw_token = client.cookies.get(service.config.cookie_name)
    stored = service.repository.get(body['guest_id'])
    assert raw_token
    assert stored is not None
    assert stored['token_hash'] == service.hash_token(raw_token)
    assert stored['token_hash'] != raw_token


def test_session_creation_reuses_active_cookie(client: TestClient, service: GuestSessionService) -> None:
    first = _create(client)
    second = _create(client)

    assert second.status_code == 200
    assert second.json()['guest_id'] == first.json()['guest_id']
    assert 'set-cookie' not in second.headers
    assert len(list(service.repository.sessions.stream())) == 1


def test_valid_retrieval_and_x_user_id_is_ignored(client: TestClient) -> None:
    created = _create(client).json()
    response = client.get(
        '/api/editor/guest/session',
        headers={'X-User-ID': 'attacker-controlled-id'},
    )
    assert response.status_code == 200
    assert response.json()['guest_id'] == created['guest_id']


def test_missing_invalid_expired_and_revoked_sessions(
    client: TestClient,
    service: GuestSessionService,
) -> None:
    assert client.get('/api/editor/guest/session').status_code == 401

    client.cookies.set(service.config.cookie_name, 'invalid-token', path='/api/editor')
    invalid = client.get('/api/editor/guest/session')
    assert invalid.status_code == 401
    assert invalid.json()['error'] == 'guest_session_invalid'
    assert 'set-cookie' not in invalid.headers
    assert list(service.repository.sessions.stream()) == []

    client.cookies.clear()
    expired = _create(client).json()
    service.repository.sessions.document(expired['guest_id']).update(
        {'expires_at': datetime.now(UTC) - timedelta(seconds=1)}
    )
    expired_response = client.get('/api/editor/guest/session')
    assert expired_response.status_code == 401
    assert expired_response.json()['error'] == 'guest_session_expired'

    client.cookies.clear()
    revoked = _create(client).json()
    service.repository.sessions.document(revoked['guest_id']).update({'status': 'revoked'})
    revoked_response = client.get('/api/editor/guest/session')
    assert revoked_response.status_code == 403
    assert revoked_response.json()['error'] == 'guest_session_revoked'


def test_cross_session_isolation(service: GuestSessionService) -> None:
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_guest_session_service] = lambda: service
    with TestClient(app) as first, TestClient(app) as second:
        first_id = _create(first).json()['guest_id']
        second_id = _create(second).json()['guest_id']
        assert first_id != second_id
        first_response = first.get('/api/editor/guest/session', headers={'X-User-ID': second_id})
        second_response = second.get('/api/editor/guest/session', headers={'X-User-ID': first_id})
        assert first_response.json()['guest_id'] == first_id
        assert second_response.json()['guest_id'] == second_id


def test_usage_and_reservation_commit_and_release(client: TestClient, service: GuestSessionService) -> None:
    _create(client)
    token = client.cookies.get(service.config.cookie_name)
    assert token

    service.reserve_quota(
        raw_token=token,
        reservation_id='upload-one',
        reservation=GuestQuotaReservation(uploads=1, uploaded_bytes=400, storage_bytes=400),
    )
    usage = client.get('/api/editor/guest/usage')
    assert usage.status_code == 200
    assert usage.json()['reserved']['uploads'] == 1
    assert usage.json()['remaining']['uploads'] == 1
    assert usage.json()['remaining']['uploaded_bytes'] == 600

    service.release_quota(raw_token=token, reservation_id='upload-one', commit=True)
    committed = client.get('/api/editor/guest/usage').json()
    assert committed['used']['uploads'] == 1
    assert committed['used']['uploaded_bytes'] == 400
    assert committed['reserved']['uploads'] == 0

    service.reserve_quota(
        raw_token=token,
        reservation_id='processing-one',
        reservation=GuestQuotaReservation(processing_seconds=10, concurrent_processing=1),
    )
    service.release_quota(raw_token=token, reservation_id='processing-one', commit=False)
    released = client.get('/api/editor/guest/usage').json()
    assert released['used']['processing_seconds'] == 0
    assert released['reserved']['concurrent_processing'] == 0


def test_atomic_concurrent_quota_reservations(client: TestClient, service: GuestSessionService) -> None:
    _create(client)
    token = client.cookies.get(service.config.cookie_name)
    assert token

    def reserve(index: int) -> bool:
        try:
            service.reserve_quota(
                raw_token=token,
                reservation_id=f'concurrent-{index}',
                reservation=GuestQuotaReservation(uploads=1),
            )
            return True
        except GuestSessionError:
            return False

    with ThreadPoolExecutor(max_workers=4) as executor:
        outcomes = list(executor.map(reserve, range(4)))

    assert outcomes.count(True) == 2
    usage = client.get('/api/editor/guest/usage').json()
    assert usage['reserved']['uploads'] == 2
    assert usage['remaining']['uploads'] == 0


def test_app_config_limit_is_enforced_by_quota_transaction(
    client: TestClient,
    service: GuestSessionService,
    firestore_client,
) -> None:
    reference = firestore_client.collection('app_config').document('guest')
    reference.set({'max_uploads': 1})
    service.app_config = AppConfigService(
        firestore_client,
        defaults=defaults_from_settings(Settings(_env_file=None)),
        cache_ttl_seconds=30,
    )
    try:
        _create(client)
        token = client.cookies.get(service.config.cookie_name)
        service.reserve_quota(
            raw_token=token,
            reservation_id='configured-one',
            reservation=GuestQuotaReservation(uploads=1),
        )
        with pytest.raises(GuestSessionError) as captured:
            service.reserve_quota(
                raw_token=token,
                reservation_id='configured-two',
                reservation=GuestQuotaReservation(uploads=1),
            )
        assert captured.value.error == 'guest_quota_exceeded'
    finally:
        reference.delete()


@pytest.mark.parametrize(
    'reservation',
    [
        GuestQuotaReservation(processing_seconds=nan),
        GuestQuotaReservation(processing_seconds=inf),
        GuestQuotaReservation(processing_seconds=-inf),
        GuestQuotaReservation(uploads=0.5),
        GuestQuotaReservation(uploads=True),
    ],
)
def test_invalid_quota_values_cannot_corrupt_counters(
    client: TestClient,
    service: GuestSessionService,
    reservation: GuestQuotaReservation,
) -> None:
    _create(client)
    token = client.cookies.get(service.config.cookie_name)

    with pytest.raises(ValueError):
        service.reserve_quota(
            raw_token=token,
            reservation_id='invalid-value',
            reservation=reservation,
        )

    usage = client.get('/api/editor/guest/usage').json()
    assert all(value == 0 for value in usage['used'].values())
    assert all(value == 0 for value in usage['reserved'].values())


def test_reservation_id_is_idempotent_only_while_active_with_same_payload(
    client: TestClient,
    service: GuestSessionService,
) -> None:
    _create(client)
    token = client.cookies.get(service.config.cookie_name)
    reservation = GuestQuotaReservation(uploads=1)

    service.reserve_quota(raw_token=token, reservation_id='stable-id', reservation=reservation)
    service.reserve_quota(raw_token=token, reservation_id='stable-id', reservation=reservation)
    assert client.get('/api/editor/guest/usage').json()['reserved']['uploads'] == 1

    with pytest.raises(GuestSessionError) as conflicting:
        service.reserve_quota(
            raw_token=token,
            reservation_id='stable-id',
            reservation=GuestQuotaReservation(uploads=2),
        )
    assert conflicting.value.error == 'guest_reservation_conflict'

    service.release_quota(raw_token=token, reservation_id='stable-id')
    with pytest.raises(GuestSessionError) as reused:
        service.reserve_quota(raw_token=token, reservation_id='stable-id', reservation=reservation)
    assert reused.value.error == 'guest_reservation_conflict'


def test_expired_reservation_lease_is_released_before_new_reservation(
    client: TestClient,
    service: GuestSessionService,
) -> None:
    created = _create(client).json()
    token = client.cookies.get(service.config.cookie_name)
    processing = GuestQuotaReservation(processing_seconds=10, concurrent_processing=1)
    service.reserve_quota(raw_token=token, reservation_id='abandoned', reservation=processing)
    reservation_ref = (
        service.repository.sessions.document(created['guest_id'])
        .collection('reservations')
        .document('abandoned')
    )
    reservation_ref.update({'lease_expires_at': datetime.now(UTC) - timedelta(seconds=1)})

    service.reserve_quota(raw_token=token, reservation_id='replacement', reservation=processing)

    assert reservation_ref.get().to_dict()['status'] == 'released'
    usage = client.get('/api/editor/guest/usage').json()
    assert usage['reserved']['concurrent_processing'] == 1
    assert usage['reserved']['processing_seconds'] == 10


@pytest.mark.parametrize(
    ('headers', 'expected_error'),
    [
        ({'X-RangManCh-Editor-CSRF': '1'}, 'guest_origin_rejected'),
        ({'Origin': ORIGIN}, 'guest_csrf_rejected'),
        ({'Origin': 'https://evil.example', 'X-RangManCh-Editor-CSRF': '1'}, 'guest_origin_rejected'),
        ({'Origin': 'not a valid origin', 'X-RangManCh-Editor-CSRF': '1'}, 'guest_origin_rejected'),
    ],
)
def test_session_creation_rejects_origin_and_csrf(
    client: TestClient,
    headers: dict[str, str],
    expected_error: str,
) -> None:
    response = client.post('/api/editor/guest/session', headers=headers)
    assert response.status_code == 403
    assert response.json()['error'] == expected_error


def test_session_creation_rate_limit(service: GuestSessionService) -> None:
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_guest_session_service] = lambda: service
    statuses = []
    for _ in range(3):
        with TestClient(app) as fresh_client:
            statuses.append(_create(fresh_client).status_code)
    assert statuses == [200, 200, 429]


def test_network_subject_ignores_spoofed_forwarded_ip_unless_peer_is_trusted(service: GuestSessionService) -> None:
    direct = service.network_subject(_request(peer='198.51.100.10'))
    spoofed = service.network_subject(_request(peer='198.51.100.10', forwarded_for='203.0.113.50'))
    assert spoofed == direct

    trusted_service = GuestSessionService(
        repository=service.repository,
        config=replace(service.config, trusted_proxy_cidrs=('10.0.0.0/8',)),
    )
    proxied = trusted_service.network_subject(_request(peer='10.1.2.3', forwarded_for='203.0.113.50'))
    proxy_peer = trusted_service.network_subject(_request(peer='10.1.2.3'))
    assert proxied != proxy_peer


def test_network_quota_is_shared_across_sessions_and_expires_after_24_hours(service: GuestSessionService) -> None:
    assert service.network_quotas is not None
    now = datetime.now(UTC)
    limits = GuestQuotaLimits(
        uploads=1, exports=2, uploaded_bytes=1_000,
        storage_bytes=2_000, processing_seconds=60, concurrent_processing=1,
    )
    service.network_quotas.reserve(
        subject='shared-network', guest_id='guest-one', reservation_id='upload-one',
        reservation=GuestQuotaReservation(uploads=1), limits=limits, now=now,
    )
    service.network_quotas.finish(
        subject='shared-network', reservation_id='upload-one', commit=True, now=now,
    )

    with pytest.raises(GuestSessionError) as exceeded:
        service.network_quotas.reserve(
            subject='shared-network', guest_id='guest-two', reservation_id='upload-two',
            reservation=GuestQuotaReservation(uploads=1), limits=limits, now=now,
        )
    assert exceeded.value.error == 'guest_quota_exceeded'
    assert 'network_uploads' in exceeded.value.message
    assert service.network_quotas.usage(
        subject='shared-network', now=now + timedelta(hours=24, microseconds=1),
    )['uploads'] == 0


def test_concurrent_session_creation_rate_limit_ignores_forwarded_ip_spoofing(
    service: GuestSessionService,
) -> None:
    def create(index: int) -> str:
        try:
            service.create_session(
                _request(forwarded_for=f'203.0.113.{index}'),
                raw_token=None,
            )
            return 'created'
        except GuestSessionError as exc:
            return exc.error

    with ThreadPoolExecutor(max_workers=6) as executor:
        outcomes = list(executor.map(create, range(6)))

    assert outcomes.count('created') == 2
    assert all(outcome in {'created', 'guest_quota_exceeded'} for outcome in outcomes)
    assert len(list(service.repository.sessions.stream())) == 2


def test_firebase_failure_does_not_issue_cookie(service: GuestSessionService) -> None:
    class UnavailableRepository:
        def find_by_token_hash(self, token_hash: str):
            return None

        def consume_session_creation_rate_limit(self, **kwargs):
            raise RuntimeError('Firestore unavailable')

    unavailable_service = GuestSessionService(
        repository=UnavailableRepository(),
        config=service.config,
    )
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_guest_session_service] = lambda: unavailable_service

    with TestClient(app, raise_server_exceptions=False) as unavailable_client:
        response = _create(unavailable_client)

    assert response.status_code == 500
    assert 'set-cookie' not in response.headers


def test_production_cookie_defaults_are_secure() -> None:
    settings = Settings(
        _env_file=None,
        env='production',
        allowed_origins='https://rangmanchai.com',
        editor_guest_rate_limit_secret='x' * 32,
    )
    config = GuestSessionConfig.from_settings(settings)
    assert config.cookie_secure is True
    assert config.cookie_samesite == 'lax'


def test_insecure_cookie_rejects_non_loopback_origin(
    firestore_client,
) -> None:
    service = GuestSessionService(
        repository=GuestSessionRepository(firestore_client),
        config=GuestSessionConfig(
            cookie_name='rangmanch_guest_test',
            cookie_secure=False,
            cookie_samesite='lax',
            lifetime=timedelta(hours=24),
            csrf_header='X-RangManch-Editor-CSRF',
            csrf_value='1',
            allowed_origins=frozenset({'https://staging.example'}),
            limits=GuestQuotaLimits(1, 1, 1, 1, 1, 1),
            creation_rate_limit=1,
            creation_rate_window=timedelta(hours=1),
            reservation_lease=timedelta(minutes=15),
            rate_limit_secret=b'test-rate-limit-secret-at-least-32-bytes',
        ),
    )
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_guest_session_service] = lambda: service
    with TestClient(app) as insecure_client:
        response = insecure_client.post(
            '/api/editor/guest/session',
            headers={'Origin': 'https://staging.example', 'X-RangManch-Editor-CSRF': '1'},
        )
    assert response.status_code == 403
    assert response.json()['error'] == 'guest_insecure_origin_rejected'
