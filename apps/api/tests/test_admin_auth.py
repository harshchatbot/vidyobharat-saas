from __future__ import annotations

import os

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from firebase_admin import auth

from app.api.deps import get_settings
from app.api.routers.admin_routes import router
from app.providers.firebase import get_firebase_app


def _client(monkeypatch, *, ids: str = '', emails: str = '', claims=None, failure: Exception | None = None):
    monkeypatch.setenv('ADMIN_USER_IDS', ids)
    monkeypatch.setenv('ADMIN_USER_EMAILS', emails)
    get_settings.cache_clear()
    if failure:
        monkeypatch.setattr(auth, 'verify_id_token', lambda *args, **kwargs: (_ for _ in ()).throw(failure))
    else:
        monkeypatch.setattr(auth, 'verify_id_token', lambda *args, **kwargs: claims or {'uid': 'user'})
    monkeypatch.setattr('app.api.deps.get_firebase_app', lambda: object())
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def test_admin_auth_rejects_missing_allowlist(monkeypatch) -> None:
    response = _client(monkeypatch, claims={'uid': 'admin'}).get(
        '/api/admin/me', headers={'Authorization': 'Bearer token'},
    )
    assert response.status_code == 503


def test_admin_auth_ignores_spoofed_user_header(monkeypatch) -> None:
    response = _client(monkeypatch, ids='admin').get('/api/admin/me', headers={'X-User-ID': 'admin'})
    assert response.status_code == 401


def test_admin_auth_rejects_invalid_and_non_admin_tokens(monkeypatch) -> None:
    invalid = _client(monkeypatch, ids='admin', failure=auth.InvalidIdTokenError('invalid')).get(
        '/api/admin/me', headers={'Authorization': 'Bearer bad'},
    )
    assert invalid.status_code == 401
    non_admin = _client(monkeypatch, ids='admin', claims={'uid': 'other'}).get(
        '/api/admin/me', headers={'Authorization': 'Bearer valid'},
    )
    assert non_admin.status_code == 403


def test_admin_auth_fails_closed_when_firebase_verification_is_unavailable(monkeypatch) -> None:
    response = _client(monkeypatch, ids='admin', failure=RuntimeError('firebase unavailable')).get(
        '/api/admin/me', headers={'Authorization': 'Bearer token'},
    )
    assert response.status_code == 503


def test_admin_auth_accepts_allowlisted_uid(monkeypatch) -> None:
    response = _client(monkeypatch, ids='admin', claims={'uid': 'admin', 'email': 'a@example.com'}).get(
        '/api/admin/me', headers={'Authorization': 'Bearer valid'},
    )
    assert response.status_code == 200
    assert response.json() == {'uid': 'admin', 'email': 'a@example.com'}


def test_admin_email_must_be_verified(monkeypatch) -> None:
    client = _client(
        monkeypatch, emails='admin@example.com',
        claims={'uid': 'user', 'email': 'admin@example.com', 'email_verified': False},
    )
    assert client.get('/api/admin/me', headers={'Authorization': 'Bearer token'}).status_code == 403
    client = _client(
        monkeypatch, emails='admin@example.com',
        claims={'uid': 'user', 'email': 'ADMIN@example.com', 'email_verified': True},
    )
    assert client.get('/api/admin/me', headers={'Authorization': 'Bearer token'}).status_code == 200


@pytest.mark.skipif(
    os.environ.get('RUN_FIREBASE_EMULATOR_TESTS') != '1',
    reason='Real Firebase token verification requires the Auth emulator.',
)
def test_admin_verifies_real_auth_emulator_token(monkeypatch) -> None:
    host = os.environ['FIREBASE_AUTH_EMULATOR_HOST']
    response = httpx.post(
        f'http://{host}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key',
        json={'email': 'admin-emulator@example.com', 'password': 'correct-horse-battery-staple', 'returnSecureToken': True},
        timeout=10,
    )
    response.raise_for_status()
    payload = response.json()
    monkeypatch.setenv('ADMIN_USER_IDS', payload['localId'])
    monkeypatch.setenv('ADMIN_USER_EMAILS', '')
    get_settings.cache_clear()
    get_firebase_app.cache_clear()
    app = FastAPI()
    app.include_router(router)

    verified = TestClient(app).get(
        '/api/admin/me', headers={'Authorization': f"Bearer {payload['idToken']}"},
    )

    assert verified.status_code == 200
    assert verified.json()['uid'] == payload['localId']


def teardown_module() -> None:
    get_settings.cache_clear()
