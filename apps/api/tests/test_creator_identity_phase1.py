from types import SimpleNamespace

from fastapi import Depends, FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.api.deps import VerifiedFirebasePrincipal, get_user_id
from app.core.config import Settings


def _app() -> FastAPI:
    app = FastAPI()

    @app.get('/protected')
    async def protected(user_id: str = Depends(get_user_id)):
        return {'user_id': user_id}

    return app


def _fake_user(monkeypatch, user_id='internal-user'):
    class Repo:
        def __init__(self, db): pass
        def get_or_create_auth_user(self, **kwargs): return SimpleNamespace(id=user_id)
    monkeypatch.setattr('app.api.deps.UserRepository', Repo)
    monkeypatch.setattr('app.api.deps.FirestoreSyncService.sync_user', lambda self, user: None)


def test_production_rejects_header_only_identity(monkeypatch):
    monkeypatch.setattr('app.api.deps.get_settings', lambda: Settings(_env_file=None, env='production'))
    assert TestClient(_app()).get('/protected', headers={'X-User-ID': 'attacker'}).status_code == 401


def test_verified_uid_maps_to_internal_id_and_rejects_mismatch(monkeypatch):
    monkeypatch.setattr('app.api.deps.get_settings', lambda: Settings(_env_file=None, env='production'))
    async def verify(request, authorization):
        return VerifiedFirebasePrincipal('firebase-uid', 'creator@example.com')
    monkeypatch.setattr('app.api.deps.require_verified_firebase_principal', verify)
    _fake_user(monkeypatch)
    client = TestClient(_app())
    assert client.get('/protected', headers={'Authorization': 'Bearer token'}).json() == {'user_id': 'internal-user'}
    assert client.get('/protected', headers={'Authorization': 'Bearer token', 'X-User-ID': 'other'}).status_code == 403


def test_invalid_token_fails_closed(monkeypatch):
    monkeypatch.setattr('app.api.deps.get_settings', lambda: Settings(_env_file=None, env='production'))
    async def reject(request, authorization):
        raise HTTPException(status_code=401, detail='Invalid or expired Firebase token')
    monkeypatch.setattr('app.api.deps.require_verified_firebase_principal', reject)
    assert TestClient(_app()).get('/protected', headers={'Authorization': 'Bearer expired'}).status_code == 401
