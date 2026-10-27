from __future__ import annotations

import os
from uuid import uuid4

import pytest
import httpx

from app.core.config import get_settings
from app.providers.firebase import get_firebase_app, get_firestore_client
from app.providers.firebase_emulator import (
    DEMO_FIREBASE_PROJECT_ID,
    FirebaseEmulatorSafetyError,
    get_firebase_storage_emulator_client,
    validate_firebase_emulator_environment,
)


def test_emulator_guard_rejects_missing_hosts(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv('ENV', 'development')
    monkeypatch.setenv('FIREBASE_PROJECT_ID', DEMO_FIREBASE_PROJECT_ID)
    monkeypatch.setenv('GCLOUD_PROJECT', DEMO_FIREBASE_PROJECT_ID)
    monkeypatch.setenv('FIREBASE_STORAGE_BUCKET', f'{DEMO_FIREBASE_PROJECT_ID}.appspot.com')
    for name in (
        'FIRESTORE_EMULATOR_HOST',
        'FIREBASE_STORAGE_EMULATOR_HOST',
        'FIREBASE_AUTH_EMULATOR_HOST',
    ):
        monkeypatch.delenv(name, raising=False)
    get_settings.cache_clear()

    with pytest.raises(FirebaseEmulatorSafetyError, match='missing'):
        validate_firebase_emulator_environment()

    get_settings.cache_clear()


def test_emulator_guard_rejects_production_credentials(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv('ENV', 'development')
    monkeypatch.setenv('FIREBASE_PROJECT_ID', DEMO_FIREBASE_PROJECT_ID)
    monkeypatch.setenv('GCLOUD_PROJECT', DEMO_FIREBASE_PROJECT_ID)
    monkeypatch.setenv('FIREBASE_STORAGE_BUCKET', f'{DEMO_FIREBASE_PROJECT_ID}.appspot.com')
    monkeypatch.setenv('FIRESTORE_EMULATOR_HOST', '127.0.0.1:8080')
    monkeypatch.setenv('FIREBASE_STORAGE_EMULATOR_HOST', '127.0.0.1:9199')
    monkeypatch.setenv('FIREBASE_AUTH_EMULATOR_HOST', '127.0.0.1:9099')
    monkeypatch.setenv('FIREBASE_CLIENT_EMAIL', 'production@example.invalid')
    get_settings.cache_clear()

    with pytest.raises(FirebaseEmulatorSafetyError, match='must be unset'):
        validate_firebase_emulator_environment()

    get_settings.cache_clear()


@pytest.mark.skipif(
    os.environ.get('RUN_FIREBASE_EMULATOR_TESTS') != '1',
    reason='Set RUN_FIREBASE_EMULATOR_TESTS=1 inside firebase emulators:exec.',
)
def test_firestore_and_storage_emulator_smoke() -> None:
    config = validate_firebase_emulator_environment()
    assert config.project_id == DEMO_FIREBASE_PROJECT_ID

    firestore = get_firestore_client()
    document_id = uuid4().hex
    document = firestore.collection('_emulator_smoke').document(document_id)
    storage = get_firebase_storage_emulator_client()
    object_name = f'_emulator_smoke/{document_id}.txt'
    content = b'rangmanch-firebase-emulator-smoke'
    try:
        document.set({'project_id': DEMO_FIREBASE_PROJECT_ID, 'private': True})
        assert document.get().to_dict() == {
            'project_id': DEMO_FIREBASE_PROJECT_ID,
            'private': True,
        }
        document.delete()
        assert document.get().exists is False

        storage.upload_bytes(object_name, content, content_type='text/plain')
        assert storage.download_bytes(object_name) == content
        storage.delete(object_name)
        with pytest.raises(httpx.HTTPStatusError):
            storage.download_bytes(object_name)
    finally:
        document.delete()
        try:
            storage.delete(object_name)
        except httpx.HTTPStatusError:
            pass
        # Avoid leaking cached emulator state into another test configuration.
        get_firebase_app.cache_clear()
        get_settings.cache_clear()
