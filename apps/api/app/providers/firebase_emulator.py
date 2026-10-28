from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote

import httpx

from app.core.config import Settings, get_settings
from app.providers.firebase import normalize_firebase_bucket


DEMO_FIREBASE_PROJECT_ID = 'demo-rangmanch-editor'
_EMULATOR_HOST_VARIABLES = (
    'FIRESTORE_EMULATOR_HOST',
    'FIREBASE_STORAGE_EMULATOR_HOST',
    'FIREBASE_AUTH_EMULATOR_HOST',
)
_PRODUCTION_CREDENTIAL_VARIABLES = (
    'GOOGLE_APPLICATION_CREDENTIALS',
    'FIREBASE_SERVICE_ACCOUNT_JSON',
    'FIREBASE_SERVICE_ACCOUNT_JSON_B64',
    'FIREBASE_SERVICE_ACCOUNT_PATH',
    'FIREBASE_PRIVATE_KEY_ID',
    'FIREBASE_PRIVATE_KEY',
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_CLIENT_ID',
    'FIREBASE_CLIENT_X509_CERT_URL',
)
_SETTINGS_CREDENTIAL_FIELDS = {
    'FIREBASE_SERVICE_ACCOUNT_JSON': 'firebase_service_account_json',
    'FIREBASE_SERVICE_ACCOUNT_JSON_B64': 'firebase_service_account_json_b64',
    'FIREBASE_SERVICE_ACCOUNT_PATH': 'firebase_service_account_path',
    'FIREBASE_PRIVATE_KEY_ID': 'firebase_private_key_id',
    'FIREBASE_PRIVATE_KEY': 'firebase_private_key',
    'FIREBASE_CLIENT_EMAIL': 'firebase_client_email',
    'FIREBASE_CLIENT_ID': 'firebase_client_id',
    'FIREBASE_CLIENT_X509_CERT_URL': 'firebase_client_x509_cert_url',
}


class FirebaseEmulatorSafetyError(RuntimeError):
    pass


@dataclass(frozen=True)
class FirebaseEmulatorConfig:
    project_id: str
    firestore_host: str
    storage_host: str
    auth_host: str
    storage_bucket: str


def firebase_emulator_requested() -> bool:
    return any(os.environ.get(name, '').strip() for name in _EMULATOR_HOST_VARIABLES)


def validate_firebase_emulator_environment(
    settings: Settings | None = None,
) -> FirebaseEmulatorConfig:
    current = settings or get_settings()
    if current.env != 'development':
        raise FirebaseEmulatorSafetyError('Firebase emulators are allowed only when ENV=development.')
    if current.firebase_project_id != DEMO_FIREBASE_PROJECT_ID:
        raise FirebaseEmulatorSafetyError(
            f'FIREBASE_PROJECT_ID must be exactly {DEMO_FIREBASE_PROJECT_ID} for emulator use.'
        )

    cloud_project = os.environ.get('GCLOUD_PROJECT', '').strip()
    if cloud_project != DEMO_FIREBASE_PROJECT_ID:
        raise FirebaseEmulatorSafetyError(
            f'GCLOUD_PROJECT must be exactly {DEMO_FIREBASE_PROJECT_ID} for emulator use.'
        )

    hosts = {name: os.environ.get(name, '').strip() for name in _EMULATOR_HOST_VARIABLES}
    missing = [name for name, value in hosts.items() if not value]
    if missing:
        raise FirebaseEmulatorSafetyError(
            f'All Firebase emulator hosts are required; missing: {", ".join(missing)}.'
        )
    for name, value in hosts.items():
        _validate_loopback_host(name, value)

    configured_credentials = []
    for name in _PRODUCTION_CREDENTIAL_VARIABLES:
        environment_value = os.environ.get(name, '').strip()
        settings_field = _SETTINGS_CREDENTIAL_FIELDS.get(name)
        settings_value = getattr(current, settings_field, None) if settings_field else None
        if environment_value or (isinstance(settings_value, str) and settings_value.strip()):
            configured_credentials.append(name)
    if configured_credentials:
        raise FirebaseEmulatorSafetyError(
            'Production Firebase credentials must be unset during emulator use: '
            + ', '.join(configured_credentials)
        )

    bucket = normalize_firebase_bucket(current.firebase_storage_bucket)
    expected_buckets = {
        f'{DEMO_FIREBASE_PROJECT_ID}.appspot.com',
        f'{DEMO_FIREBASE_PROJECT_ID}.firebasestorage.app',
    }
    if bucket not in expected_buckets:
        raise FirebaseEmulatorSafetyError(
            'FIREBASE_STORAGE_BUCKET must be a bucket owned by the demo emulator project.'
        )

    return FirebaseEmulatorConfig(
        project_id=DEMO_FIREBASE_PROJECT_ID,
        firestore_host=hosts['FIRESTORE_EMULATOR_HOST'],
        storage_host=hosts['FIREBASE_STORAGE_EMULATOR_HOST'],
        auth_host=hosts['FIREBASE_AUTH_EMULATOR_HOST'],
        storage_bucket=bucket,
    )


def _validate_loopback_host(name: str, value: str) -> None:
    if '://' in value or '/' in value:
        raise FirebaseEmulatorSafetyError(f'{name} must be host:port without a URL scheme or path.')
    host, separator, port = value.rpartition(':')
    if not separator or host not in {'127.0.0.1', 'localhost', '::1'} or not port.isdigit():
        raise FirebaseEmulatorSafetyError(f'{name} must point to a loopback host and numeric port.')


class FirebaseStorageEmulatorClient:
    """Small server-side adapter for Python, whose Admin SDK lacks Storage emulator support."""

    def __init__(self, config: FirebaseEmulatorConfig, *, timeout_seconds: float = 15.0) -> None:
        self.config = config
        self.base_url = f'http://{config.storage_host}/v0/b/{config.storage_bucket}/o'
        self.timeout_seconds = timeout_seconds
        self._headers = {'Authorization': 'Bearer owner'}

    def upload_bytes(self, object_name: str, content: bytes, *, content_type: str) -> None:
        response = httpx.post(
            self.base_url,
            params={'name': self._object_name(object_name)},
            content=content,
            headers={**self._headers, 'Content-Type': content_type},
            timeout=self.timeout_seconds,
        )
        response.raise_for_status()

    def upload_file(
        self,
        object_name: str,
        path: str | Path,
        *,
        content_type: str,
        timeout_seconds: float | None = None,
    ) -> None:
        with Path(path).open('rb') as source:
            response = httpx.post(
                self.base_url,
                params={'name': self._object_name(object_name)},
                content=source,
                headers={**self._headers, 'Content-Type': content_type},
                timeout=timeout_seconds or self.timeout_seconds,
            )
        response.raise_for_status()

    def upload_file_if_absent(
        self,
        object_name: str,
        path: str | Path,
        *,
        content_type: str,
        timeout_seconds: float | None = None,
    ) -> str:
        with Path(path).open('rb') as source:
            response = httpx.post(
                self.base_url,
                params={'name': self._object_name(object_name), 'ifGenerationMatch': '0'},
                content=source,
                headers={**self._headers, 'Content-Type': content_type},
                timeout=timeout_seconds or self.timeout_seconds,
            )
        response.raise_for_status()
        generation = response.json().get('generation')
        if not generation:
            raise RuntimeError('Storage emulator upload response omitted the object generation.')
        return str(generation)

    def download_bytes(self, object_name: str) -> bytes:
        response = httpx.get(
            self._object_url(object_name),
            params={'alt': 'media'},
            headers=self._headers,
            timeout=self.timeout_seconds,
        )
        response.raise_for_status()
        return response.content

    def download_range(self, object_name: str, *, start: int, end: int) -> bytes:
        response = httpx.get(
            self._object_url(object_name),
            params={'alt': 'media'},
            headers={**self._headers, 'Range': f'bytes={start}-{end}'},
            timeout=self.timeout_seconds,
        )
        response.raise_for_status()
        return response.content

    def object_size(self, object_name: str) -> int:
        response = httpx.get(
            self._object_url(object_name),
            headers=self._headers,
            timeout=self.timeout_seconds,
        )
        response.raise_for_status()
        size = response.json().get('size')
        if size is None:
            raise RuntimeError('Storage emulator object metadata omitted its size.')
        return int(size)

    def delete(self, object_name: str) -> None:
        response = httpx.delete(
            self._object_url(object_name),
            headers=self._headers,
            timeout=self.timeout_seconds,
        )
        response.raise_for_status()

    def delete_generation(self, object_name: str, generation: str) -> None:
        metadata = httpx.get(
            self._object_url(object_name),
            headers=self._headers,
            timeout=self.timeout_seconds,
        )
        if metadata.status_code == 404:
            return
        metadata.raise_for_status()
        if str(metadata.json().get('generation')) != str(generation):
            return
        # The emulator ignores the production ifGenerationMatch delete precondition,
        # so compare metadata first to preserve parity as closely as it permits.
        response = httpx.delete(
            self._object_url(object_name),
            headers=self._headers,
            timeout=self.timeout_seconds,
        )
        response.raise_for_status()

    def _object_url(self, object_name: str) -> str:
        return f'{self.base_url}/{quote(self._object_name(object_name), safe="")}'

    @staticmethod
    def _object_name(object_name: str) -> str:
        normalized = object_name.strip('/')
        if not normalized or normalized.startswith('.') or '..' in normalized.split('/'):
            raise ValueError('Storage emulator object name must be a safe relative path.')
        return normalized


def get_firebase_storage_emulator_client(
    settings: Settings | None = None,
) -> FirebaseStorageEmulatorClient:
    return FirebaseStorageEmulatorClient(validate_firebase_emulator_environment(settings))
