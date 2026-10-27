from __future__ import annotations

from pathlib import Path
from typing import Iterator

import httpx

from app.core.config import Settings, get_settings
from app.providers.firebase import get_firebase_app, normalize_firebase_bucket
from app.providers.firebase_emulator import (
    firebase_emulator_requested,
    get_firebase_storage_emulator_client,
)


class GuestMediaStorage:
    def upload_file(
        self,
        object_name: str,
        path: Path,
        *,
        content_type: str,
        timeout_seconds: float,
    ) -> None:
        raise NotImplementedError

    def read_range(self, object_name: str, *, start: int, end: int) -> bytes:
        raise NotImplementedError

    def delete(self, object_name: str) -> None:
        raise NotImplementedError

    def iter_content(
        self,
        object_name: str,
        *,
        start: int,
        end: int,
        chunk_size: int = 1024 * 1024,
    ) -> Iterator[bytes]:
        position = start
        while position <= end:
            chunk_end = min(end, position + chunk_size - 1)
            chunk = self.read_range(object_name, start=position, end=chunk_end)
            if not chunk:
                raise RuntimeError('Firebase Storage returned an empty content chunk.')
            expected = chunk_end - position + 1
            if len(chunk) > expected:
                raise RuntimeError('Firebase Storage returned more bytes than requested.')
            yield chunk
            position += len(chunk)


class EmulatorGuestMediaStorage(GuestMediaStorage):
    def __init__(self, *, timeout_seconds: float) -> None:
        self.client = get_firebase_storage_emulator_client()
        self.client.timeout_seconds = timeout_seconds

    def upload_file(
        self,
        object_name: str,
        path: Path,
        *,
        content_type: str,
        timeout_seconds: float,
    ) -> None:
        self.client.upload_file(
            object_name,
            path,
            content_type=content_type,
            timeout_seconds=timeout_seconds,
        )

    def read_range(self, object_name: str, *, start: int, end: int) -> bytes:
        return self.client.download_range(object_name, start=start, end=end)

    def delete(self, object_name: str) -> None:
        try:
            self.client.delete(object_name)
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code != 404:
                raise


class FirebaseGuestMediaStorage(GuestMediaStorage):
    def __init__(self, settings: Settings, *, timeout_seconds: float) -> None:
        bucket_name = normalize_firebase_bucket(settings.firebase_storage_bucket)
        if not bucket_name:
            raise RuntimeError('FIREBASE_STORAGE_BUCKET is required for guest media storage.')
        from firebase_admin import storage

        self.bucket = storage.bucket(bucket_name, app=get_firebase_app())
        self.timeout_seconds = timeout_seconds

    def upload_file(
        self,
        object_name: str,
        path: Path,
        *,
        content_type: str,
        timeout_seconds: float,
    ) -> None:
        blob = self.bucket.blob(object_name)
        blob.cache_control = 'private,no-store,max-age=0'
        blob.upload_from_filename(
            str(path),
            content_type=content_type,
            timeout=min(self.timeout_seconds, timeout_seconds),
        )

    def read_range(self, object_name: str, *, start: int, end: int) -> bytes:
        return self.bucket.blob(object_name).download_as_bytes(
            start=start,
            end=end,
            timeout=self.timeout_seconds,
        )

    def delete(self, object_name: str) -> None:
        from google.api_core.exceptions import NotFound

        try:
            self.bucket.blob(object_name).delete(timeout=self.timeout_seconds)
        except NotFound:
            pass


def build_guest_media_storage(settings: Settings | None = None) -> GuestMediaStorage:
    current = settings or get_settings()
    timeout = float(current.editor_guest_upload_timeout_seconds)
    if firebase_emulator_requested():
        return EmulatorGuestMediaStorage(timeout_seconds=timeout)
    return FirebaseGuestMediaStorage(current, timeout_seconds=timeout)
