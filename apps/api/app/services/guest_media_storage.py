from __future__ import annotations

from pathlib import Path
import logging
import time
from typing import Iterator

import httpx
from google.api_core.exceptions import NotFound

from app.core.config import Settings, get_settings
from app.providers.firebase import get_firebase_app, normalize_firebase_bucket
from app.providers.firebase_emulator import (
    firebase_emulator_requested,
    get_firebase_storage_emulator_client,
)


logger = logging.getLogger(__name__)


class GuestMediaObjectMissing(RuntimeError):
    pass


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

    def upload_file_if_absent(
        self,
        object_name: str,
        path: Path,
        *,
        content_type: str,
        timeout_seconds: float,
    ) -> str:
        raise NotImplementedError

    def delete(self, object_name: str) -> None:
        raise NotImplementedError

    def delete_generation(self, object_name: str, generation: str) -> None:
        raise NotImplementedError

    def object_size(self, object_name: str) -> int:
        raise NotImplementedError

    def download_to_path(self, object_name: str, destination: Path, *, expected_size: int) -> None:
        """Download an authorized object with strict size validation.

        Emulator and alternate storage implementations retain the compatible
        range-based fallback; Firebase overrides this with a single transfer.
        """
        with destination.open('xb') as target:
            size = 0
            for chunk in self.iter_content(object_name, start=0, end=expected_size - 1):
                size += len(chunk)
                if size > expected_size:
                    raise RuntimeError('Downloaded media exceeded its expected size.')
                target.write(chunk)
        if size != expected_size:
            raise ValueError('Downloaded media size does not match its record.')

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
        try:
            return self.client.download_range(object_name, start=start, end=end)
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                raise GuestMediaObjectMissing(object_name) from exc
            raise

    def object_size(self, object_name: str) -> int:
        try:
            return self.client.object_size(object_name)
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                raise GuestMediaObjectMissing(object_name) from exc
            raise

    def upload_file_if_absent(self, object_name: str, path: Path, *, content_type: str, timeout_seconds: float) -> str:
        return self.client.upload_file_if_absent(
            object_name,
            path,
            content_type=content_type,
            timeout_seconds=timeout_seconds,
        )

    def delete(self, object_name: str) -> None:
        try:
            self.client.delete(object_name)
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code != 404:
                raise

    def delete_generation(self, object_name: str, generation: str) -> None:
        try:
            self.client.delete_generation(object_name, generation)
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code not in {404, 412}:
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

    def download_to_path(self, object_name: str, destination: Path, *, expected_size: int) -> None:
        """Single GCS transfer, retaining ownership checks in the caller."""
        start = time.monotonic()
        try:
            # The SDK writes to disk instead of buffering the entire video in RAM.
            # Its default checksum behavior checks MD5 or CRC32C when available.
            with destination.open('xb') as target:
                self.bucket.blob(object_name).download_to_file(
                    target, timeout=self.timeout_seconds, checksum='auto'
                )
            actual_size = destination.stat().st_size
            if actual_size != expected_size:
                raise ValueError('Downloaded media size does not match its record.')
            logger.info(
                'guest_storage_download_completed',
                extra={'source_bytes': actual_size, 'elapsed_seconds': round(time.monotonic() - start, 3)},
            )
        except NotFound as exc:
            destination.unlink(missing_ok=True)
            raise GuestMediaObjectMissing(object_name) from exc
        except Exception:
            destination.unlink(missing_ok=True)
            logger.exception('guest_storage_download_failed', extra={'elapsed_seconds': round(time.monotonic() - start, 3)})
            raise

    def read_range(self, object_name: str, *, start: int, end: int) -> bytes:
        try:
            return self.bucket.blob(object_name).download_as_bytes(
                start=start,
                end=end,
                timeout=self.timeout_seconds,
            )
        except NotFound as exc:
            raise GuestMediaObjectMissing(object_name) from exc

    def object_size(self, object_name: str) -> int:
        blob = self.bucket.blob(object_name)
        try:
            blob.reload(timeout=self.timeout_seconds)
        except NotFound as exc:
            raise GuestMediaObjectMissing(object_name) from exc
        if blob.size is None:
            raise RuntimeError('Firebase Storage object metadata omitted its size.')
        return int(blob.size)

    def upload_file_if_absent(self, object_name: str, path: Path, *, content_type: str, timeout_seconds: float) -> str:
        blob = self.bucket.blob(object_name)
        blob.cache_control = 'private,no-store,max-age=0'
        blob.upload_from_filename(
            str(path),
            content_type=content_type,
            timeout=min(self.timeout_seconds, timeout_seconds),
            if_generation_match=0,
        )
        if blob.generation is None:
            blob.reload(timeout=self.timeout_seconds)
        if blob.generation is None:
            raise RuntimeError('Firebase Storage upload omitted the object generation.')
        return str(blob.generation)

    def delete(self, object_name: str) -> None:
        try:
            self.bucket.blob(object_name).delete(timeout=self.timeout_seconds)
        except NotFound:
            pass

    def delete_generation(self, object_name: str, generation: str) -> None:
        from google.api_core.exceptions import NotFound, PreconditionFailed

        try:
            self.bucket.blob(object_name).delete(
                timeout=self.timeout_seconds,
                if_generation_match=int(generation),
            )
        except (NotFound, PreconditionFailed):
            pass


def build_guest_media_storage(settings: Settings | None = None) -> GuestMediaStorage:
    current = settings or get_settings()
    timeout = float(current.editor_guest_upload_timeout_seconds)
    if firebase_emulator_requested():
        return EmulatorGuestMediaStorage(timeout_seconds=timeout)
    return FirebaseGuestMediaStorage(current, timeout_seconds=timeout)
