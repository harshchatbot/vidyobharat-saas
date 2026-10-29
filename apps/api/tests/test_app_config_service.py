from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routers.editor_routes import get_app_config_service, router
from app.core.config import Settings
from app.services.app_config_service import AppConfigService, defaults_from_settings
from app.services.guest_session_service import GuestSessionConfig, GuestSessionService


class FakeSnapshot:
    def __init__(self, payload=None) -> None:
        self._payload = payload
        self.exists = payload is not None

    def to_dict(self):
        return self._payload


class FakeDocument:
    def __init__(self, store: dict, name: str, *, fail: bool = False) -> None:
        self.store = store
        self.name = name
        self.fail = fail

    def get(self):
        if self.fail:
            raise RuntimeError('firestore unavailable')
        return FakeSnapshot(self.store.get(self.name))


class FakeCollection:
    def __init__(self, store: dict, *, fail: bool = False) -> None:
        self.store = store
        self.fail = fail

    def document(self, name: str):
        return FakeDocument(self.store, name, fail=self.fail)


class FakeFirestore:
    def __init__(self, store=None, *, fail: bool = False) -> None:
        self.store = store or {}
        self.fail = fail

    def collection(self, name: str):
        assert name == 'app_config'
        return FakeCollection(self.store, fail=self.fail)


def _defaults():
    return defaults_from_settings(Settings(_env_file=None))


def test_defaults_use_twenty_uploads_and_firestore_overrides_are_cached() -> None:
    firestore = FakeFirestore({'guest': {'max_uploads': 32}})
    service = AppConfigService(firestore, defaults=_defaults(), cache_ttl_seconds=30)

    assert service.get().guest.max_uploads == 32
    firestore.store['guest']['max_uploads'] = 40
    assert service.get().guest.max_uploads == 32
    service.invalidate()
    assert service.get().guest.max_uploads == 40
    assert _defaults().guest.max_uploads == 20


def test_invalid_category_and_firestore_failure_fall_back_safely() -> None:
    invalid = AppConfigService(
        FakeFirestore({'guest': {'max_uploads': 1000}}),
        defaults=_defaults(),
        cache_ttl_seconds=45,
    )
    assert invalid.get().guest.max_uploads == 20

    unavailable = AppConfigService(FakeFirestore(fail=True), defaults=_defaults(), cache_ttl_seconds=45)
    assert unavailable.get() == _defaults()


def test_public_endpoint_exposes_only_allowlisted_configuration() -> None:
    service = AppConfigService(
        FakeFirestore({'guest': {'max_uploads': 25, 'max_storage_bytes': 999_999_999}}),
        defaults=_defaults(),
        cache_ttl_seconds=45,
    )
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_app_config_service] = lambda: service

    response = TestClient(app).get('/api/editor/config')

    assert response.status_code == 200
    assert response.json()['guest'] == {'max_uploads': 25, 'max_exports': 3}
    assert 'max_storage_bytes' not in response.text
    assert 'rate_limit' not in response.text


def test_cache_ttl_must_stay_within_operational_bounds() -> None:
    for ttl in (29, 61):
        try:
            AppConfigService(FakeFirestore(), defaults=_defaults(), cache_ttl_seconds=ttl)
        except ValueError as exc:
            assert 'between 30 and 60' in str(exc)
        else:
            raise AssertionError('invalid cache TTL was accepted')


def test_runtime_limit_change_preserves_existing_guest_usage_counts() -> None:
    firestore = FakeFirestore({'guest': {'max_uploads': 20}})
    app_config = AppConfigService(firestore, defaults=_defaults(), cache_ttl_seconds=30)
    settings = Settings(_env_file=None)
    sessions = GuestSessionService(
        repository=None,  # type: ignore[arg-type]
        config=GuestSessionConfig.from_settings(settings),
        app_config=app_config,
    )
    stored_session = {'uploads_count': 7, 'reserved_uploads_count': 2}

    before = sessions.usage_payload(stored_session)
    assert before['limits']['uploads'] == 20
    assert before['remaining']['uploads'] == 11

    firestore.store['guest']['max_uploads'] = 25
    app_config.invalidate()
    after = sessions.usage_payload(stored_session)
    assert after['limits']['uploads'] == 25
    assert after['used']['uploads'] == 7
    assert after['reserved']['uploads'] == 2
    assert after['remaining']['uploads'] == 16
