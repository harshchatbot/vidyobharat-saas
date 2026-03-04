from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import quote
from uuid import uuid4

import httpx

from app.core.config import Settings, get_settings
from app.providers.firebase import get_firebase_app


@dataclass
class SignedUpload:
    upload_url: str
    public_url: str
    storage_path: str
    method: str = 'PUT'
    headers: dict[str, str] = field(default_factory=dict)


class StorageProvider:
    def sign_upload(self, filename: str, *, kind: str = 'asset') -> SignedUpload:
        raise NotImplementedError

    def upload_bytes(self, filename: str, content: bytes, *, content_type: str, kind: str = 'asset') -> SignedUpload:
        raise NotImplementedError

    def delete(self, path: str) -> bool:
        raise NotImplementedError


class LocalStorageProvider(StorageProvider):
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self.upload_dir = Path('data/uploads')
        self.upload_dir.mkdir(parents=True, exist_ok=True)
        self.base_url = self.settings.public_asset_base_url.rstrip('/')

    def sign_upload(self, filename: str, *, kind: str = 'asset') -> SignedUpload:
        ext = Path(filename).suffix
        asset_name = f'{uuid4()}{ext}'
        local_path = self.upload_dir / asset_name
        return SignedUpload(
            upload_url=str(local_path),
            public_url=f'{self.base_url}/uploads/{asset_name}',
            storage_path=str(local_path),
        )

    def upload_bytes(self, filename: str, content: bytes, *, content_type: str, kind: str = 'asset') -> SignedUpload:
        signed = self.sign_upload(filename, kind=kind)
        target = Path(signed.storage_path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        return signed

    def delete(self, path: str) -> bool:
        target = Path(path)
        if target.exists():
            target.unlink()
            return True
        return False


class SupabaseStorageProvider(StorageProvider):
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        if not self.settings.supabase_url or not self.settings.supabase_service_role_key:
            raise RuntimeError('Supabase storage is configured as primary backend but SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.')
        if not self.settings.supabase_anon_key:
            raise RuntimeError('SUPABASE_ANON_KEY is required for direct browser uploads to Supabase Storage.')

        self.supabase_url = self.settings.supabase_url.rstrip('/')
        self.bucket = self.settings.supabase_storage_bucket

    def sign_upload(self, filename: str, *, kind: str = 'asset') -> SignedUpload:
        ext = Path(filename).suffix
        object_path = f'{kind}/{uuid4()}{ext}'
        # Browser can upload directly to the Storage object endpoint with the anon key.
        upload_url = f'{self.supabase_url}/storage/v1/object/{self.bucket}/{object_path}'
        public_url = (
            f'{self.supabase_url}/storage/v1/object/public/{self.bucket}/{object_path}'
            if self.settings.supabase_storage_public
            else f'{self.supabase_url}/storage/v1/object/sign/{self.bucket}/{object_path}'
        )
        return SignedUpload(
            upload_url=upload_url,
            public_url=public_url,
            storage_path=object_path,
            headers={
                'apikey': self.settings.supabase_anon_key,
                'Authorization': f'Bearer {self.settings.supabase_anon_key}',
                'x-upsert': 'false',
            },
        )

    def upload_bytes(self, filename: str, content: bytes, *, content_type: str, kind: str = 'asset') -> SignedUpload:
        signed = self.sign_upload(filename, kind=kind)
        response = httpx.put(
            signed.upload_url,
            content=content,
            headers={
                **signed.headers,
                'Content-Type': content_type,
            },
            timeout=30.0,
        )
        response.raise_for_status()
        return signed

    def delete(self, path: str) -> bool:
        delete_url = f'{self.supabase_url}/storage/v1/object/{self.bucket}/{path.lstrip("/")}'
        response = httpx.delete(
            delete_url,
            headers={
                'apikey': self.settings.supabase_service_role_key or '',
                'Authorization': f'Bearer {self.settings.supabase_service_role_key or ""}',
            },
            timeout=20.0,
        )
        return response.status_code in {200, 204}


class FirebaseStorageProvider(StorageProvider):
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        if not self.settings.firebase_storage_bucket:
            raise RuntimeError('Firebase storage is configured as primary backend but FIREBASE_STORAGE_BUCKET is missing.')
        self.bucket_name = self.settings.firebase_storage_bucket
        self.bucket = self._get_bucket()

    def _get_bucket(self):
        from firebase_admin import storage

        app = get_firebase_app()
        return storage.bucket(app=app)

    def _storage_path(self, filename: str, *, kind: str) -> str:
        ext = Path(filename).suffix
        return f'{kind.strip("/")}/{uuid4()}{ext}'

    def _download_url(self, path: str, token: str) -> str:
        encoded = quote(path, safe='')
        return f'https://firebasestorage.googleapis.com/v0/b/{self.bucket_name}/o/{encoded}?alt=media&token={token}'

    def sign_upload(self, filename: str, *, kind: str = 'asset') -> SignedUpload:
        object_path = self._storage_path(filename, kind=kind)
        token = str(uuid4())
        blob = self.bucket.blob(object_path)
        upload_url = blob.generate_signed_url(
            version='v4',
            expiration=15 * 60,
            method='PUT',
            content_type='application/octet-stream',
        )
        return SignedUpload(
            upload_url=upload_url,
            public_url=self._download_url(object_path, token),
            storage_path=object_path,
            headers={'x-goog-meta-firebaseStorageDownloadTokens': token},
        )

    def upload_bytes(self, filename: str, content: bytes, *, content_type: str, kind: str = 'asset') -> SignedUpload:
        object_path = self._storage_path(filename, kind=kind)
        token = str(uuid4())
        blob = self.bucket.blob(object_path)
        blob.metadata = {'firebaseStorageDownloadTokens': token}
        blob.cache_control = 'public,max-age=31536000'
        blob.upload_from_string(content, content_type=content_type)
        return SignedUpload(
            upload_url='',
            public_url=self._download_url(object_path, token),
            storage_path=object_path,
        )

    def delete(self, path: str) -> bool:
        blob = self.bucket.blob(path.lstrip('/'))
        try:
            blob.delete()
            return True
        except Exception:
            return False


def build_storage_provider(settings: Settings | None = None) -> StorageProvider:
    current = settings or get_settings()
    if current.storage_backend == 'firebase':
        return FirebaseStorageProvider(current)
    if current.storage_backend == 'supabase':
        return SupabaseStorageProvider(current)
    return LocalStorageProvider(current)
