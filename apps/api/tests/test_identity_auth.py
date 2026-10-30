from types import SimpleNamespace

from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from fastapi import HTTPException

from app.api.deps import VerifiedFirebasePrincipal, get_user_id
from app.core.config import Settings


def _app() -> FastAPI:
    app = FastAPI()

    @app.get('/protected')
    async def protected(user_id: str = Depends(get_user_id)):
        return {'user_id': user_id}

    return app


def _patch_user(monkeypatch, user_id: str = 'internal-user'):
    class FakeUserRepository:
        def __init__(self, db):
            pass

        def get_or_create_auth_user(self, **kwargs):
            return SimpleNamespace(id=user_id)

    monkeypatch.setattr('app.api.deps.UserRepository', FakeUserRepository)
    monkeypatch.setattr('app.api.deps.FirestoreSyncService.sync_user', lambda self, user: None)


def test_missing_token_rejects_spoofed_header(monkeypatch):
    monkeypatch.setattr('app.api.deps.get_settings', lambda: Settings(_env_file=None, env='production'))
    response = TestClient(_app()).get('/protected', headers={'X-User-ID': 'attacker'})
    assert response.status_code == 401


def test_valid_firebase_uid_maps_to_internal_user(monkeypatch):
    monkeypatch.setattr('app.api.deps.get_settings', lambda: Settings(_env_file=None, env='production'))
    async def verified(request, authorization):
        return VerifiedFirebasePrincipal('firebase-uid', 'a@example.com')

    monkeypatch.setattr('app.api.deps.require_verified_firebase_principal', verified)
    _patch_user(monkeypatch, 'internal-user')
    response = TestClient(_app()).get('/protected', headers={'Authorization': 'Bearer valid'})
    assert response.status_code == 200
    assert response.json() == {'user_id': 'internal-user'}


def test_mismatched_identity_header_is_rejected(monkeypatch):
    monkeypatch.setattr('app.api.deps.get_settings', lambda: Settings(_env_file=None, env='production'))
    async def verified(request, authorization):
        return VerifiedFirebasePrincipal('firebase-uid', None)

    monkeypatch.setattr('app.api.deps.require_verified_firebase_principal', verified)
    _patch_user(monkeypatch, 'internal-user')
    response = TestClient(_app()).get(
        '/protected',
        headers={'Authorization': 'Bearer valid', 'X-User-ID': 'other-user'},
    )
    assert response.status_code == 403


def test_legacy_header_requires_explicit_local_gate(monkeypatch):
    monkeypatch.setattr(
        'app.api.deps.get_settings',
        lambda: Settings(_env_file=None, env='production', allow_legacy_user_id_header=True),
    )
    assert TestClient(_app()).get('/protected', headers={'X-User-ID': 'legacy'}).status_code == 401

    monkeypatch.setattr(
        'app.api.deps.get_settings',
        lambda: Settings(_env_file=None, env='test', allow_legacy_user_id_header=True),
    )
    _patch_user(monkeypatch, 'legacy')
    response = TestClient(_app()).get('/protected', headers={'X-User-ID': 'legacy'})
    assert response.status_code == 200


def test_firebase_verification_outage_fails_closed_as_503(monkeypatch):
    monkeypatch.setattr('app.api.deps.get_settings', lambda: Settings(_env_file=None, env='production'))

    async def unavailable(request, authorization):
        raise HTTPException(status_code=503, detail='Firebase authentication is unavailable')

    monkeypatch.setattr('app.api.deps.require_verified_firebase_principal', unavailable)
    response = TestClient(_app()).get('/protected', headers={'Authorization': 'Bearer valid'})
    assert response.status_code == 503


def test_invalid_firebase_token_remains_401(monkeypatch):
    monkeypatch.setattr('app.api.deps.get_settings', lambda: Settings(_env_file=None, env='production'))

    async def invalid(request, authorization):
        raise HTTPException(status_code=401, detail='Invalid or expired auth token')

    monkeypatch.setattr('app.api.deps.require_verified_firebase_principal', invalid)
    response = TestClient(_app()).get('/protected', headers={'Authorization': 'Bearer invalid'})
    assert response.status_code == 401
