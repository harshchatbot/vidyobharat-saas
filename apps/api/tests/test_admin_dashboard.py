from __future__ import annotations

import os
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.deps import AdminPrincipal, require_admin_principal
from app.api.routers.admin_routes import get_admin_repository, router
from app.core.config import Settings
from app.db.repositories.admin_repository import AdminGuestRepository
from app.providers.firebase import get_firestore_client
from app.providers.firebase_emulator import validate_firebase_emulator_environment
from app.services.app_config_service import AppConfigService, defaults_from_settings, get_app_config_service


pytestmark = pytest.mark.skipif(
    os.environ.get('RUN_FIREBASE_EMULATOR_TESTS') != '1',
    reason='Admin integration tests require guarded Firebase emulators.',
)


def _clear(client) -> None:
    for session in client.collection('editor_guest_sessions').stream():
        for export in session.reference.collection('exports').stream():
            export.reference.delete()
        session.reference.delete()
    for name in ('app_config', 'app_config_audit'):
        for row in client.collection(name).stream():
            row.reference.delete()


@pytest.fixture()
def admin_environment():
    validate_firebase_emulator_environment()
    firestore = get_firestore_client()
    _clear(firestore)
    service = AppConfigService(
        firestore, defaults=defaults_from_settings(Settings(_env_file=None)), cache_ttl_seconds=30,
    )
    repository = AdminGuestRepository(firestore)
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[require_admin_principal] = lambda: AdminPrincipal('admin-uid', 'admin@example.com')
    app.dependency_overrides[get_admin_repository] = lambda: repository
    app.dependency_overrides[get_app_config_service] = lambda: service
    with TestClient(app) as client:
        yield client, firestore, service
    _clear(firestore)


def _seed(firestore) -> tuple[str, str]:
    now = datetime.now(UTC)
    first, second = 'guest-one', 'guest-two'
    for index, guest_id in enumerate((first, second)):
        firestore.collection('editor_guest_sessions').document(guest_id).set({
            'guest_id': guest_id, 'token_hash': f'secret-{index}',
            'created_at': now - timedelta(minutes=index + 1), 'updated_at': now - timedelta(minutes=index),
            'expires_at': now + timedelta(hours=2), 'status': 'active',
            'uploads_count': index + 1, 'exports_count': 1 if index == 0 else 0,
            'uploaded_bytes': 100 + index, 'storage_bytes': 80 + index,
            'processing_seconds': float(index), 'reserved_uploads_count': 0,
            'reserved_exports_count': 0, 'reserved_uploaded_bytes': 0,
            'reserved_storage_bytes': 0, 'reserved_processing_seconds': 0.0,
            'active_processing': 0, 'network_subject': 'private-network-value',
        })
    base = firestore.collection('editor_guest_sessions').document(first).collection('exports')
    base.document('completed-job').set({
        'guest_id': first, 'created_at': now - timedelta(minutes=2), 'updated_at': now,
        'expires_at': now + timedelta(hours=2), 'status': 'completed', 'progress_stage': 'completed',
        'attempt_count': 1, 'error_code': None, 'storage_object_path': 'private/path',
        'timeline': {'secret': 'composition'}, 'output': {'filename': 'reel.mp4', 'duration_seconds': 1.0, 'file_size': 1234},
    })
    base.document('failed-job').set({
        'guest_id': first, 'created_at': now - timedelta(minutes=1), 'updated_at': now,
        'expires_at': now + timedelta(hours=2), 'status': 'failed', 'progress_stage': 'failed',
        'attempt_count': 1, 'error_code': 'render_failed', 'fence_token': 'secret', 'output': None,
    })
    return first, second


def test_dashboard_aggregates_and_guest_payloads_are_sanitized(admin_environment) -> None:
    client, firestore, _ = admin_environment
    first, _ = _seed(firestore)

    dashboard = client.get('/api/admin/dashboard')
    assert dashboard.status_code == 200
    assert dashboard.json()['total_guest_sessions'] == 2
    assert dashboard.json()['active_guest_sessions'] == 2
    assert dashboard.json()['accepted_uploads'] == 3
    assert dashboard.json()['completed_exports'] == 1
    assert dashboard.json()['failed_exports'] == 1

    guests = client.get('/api/admin/guests?limit=1')
    assert guests.status_code == 200
    assert len(guests.json()['items']) == 1
    assert guests.json()['next_cursor']
    assert 'token_hash' not in guests.text and 'network_subject' not in guests.text
    assert 'reserved_' not in guests.text and 'active_processing' not in guests.text
    second_page = client.get('/api/admin/guests', params={'limit': 1, 'cursor': guests.json()['next_cursor']})
    assert second_page.status_code == 200
    detail = client.get(f'/api/admin/guests/{first}/exports')
    assert detail.status_code == 200
    assert len(detail.json()['items']) == 2
    assert 'storage_object_path' not in detail.text and 'timeline' not in detail.text and 'fence_token' not in detail.text
    assert client.get('/api/admin/guests?cursor=not-valid').status_code == 400


def test_config_update_is_validated_audited_and_revision_fenced(admin_environment) -> None:
    client, firestore, service = admin_environment
    current = client.get('/api/admin/config').json()
    updated = client.put('/api/admin/config', json={
        'revision': current['revision'],
        'changes': {'guest': {'max_uploads': 27}, 'editor': {'max_clips': 10}},
        'reason': 'Capacity review',
    })
    assert updated.status_code == 200
    assert updated.json()['revision'] == 1
    assert service.get().guest.max_uploads == 27
    audit = list(firestore.collection('app_config_audit').stream())
    assert len(audit) == 1
    assert audit[0].to_dict()['actor_uid'] == 'admin-uid'
    stale = client.put('/api/admin/config', json={
        'revision': 0, 'changes': {'guest': {'max_uploads': 28}},
    })
    assert stale.status_code == 409
    invalid = client.put('/api/admin/config', json={
        'revision': 1, 'changes': {'editor': {'max_duration_seconds': 61}},
    })
    assert invalid.status_code == 422
    assert firestore.collection('app_config').document('editor').get().to_dict()['max_clips'] == 10
    assert len(list(firestore.collection('app_config_audit').stream())) == 1
