"""Where queued items live: a local folder (tests, single box) or a Firebase
Storage bucket (cloud thread queues, prod server publishes).

Layout under the root/prefix::

    <id>/item.json   <id>/video.mp4   <id>/cover.jpg   _config/blocked.json
"""
from __future__ import annotations

import asyncio
import base64
import json
import os
import shutil
from datetime import timedelta
from pathlib import Path
from typing import Any, Protocol

from .models import QueueItem


class Store(Protocol):
    async def put_file(self, key: str, path: Path, content_type: str) -> None: ...
    async def download(self, key: str, dest: Path) -> Path: ...
    async def read_json(self, key: str) -> dict[str, Any] | None: ...
    async def write_json(self, key: str, data: dict[str, Any]) -> None: ...
    async def list_ids(self) -> list[str]: ...
    async def public_url(self, key: str, ttl: timedelta) -> str | None: ...


class LocalStore:
    def __init__(self, root: Path, base_url: str | None = None) -> None:
        self.root, self.base_url = root, base_url
        root.mkdir(parents=True, exist_ok=True)

    async def put_file(self, key: str, path: Path, content_type: str) -> None:
        dest = self.root / key
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, dest)

    async def download(self, key: str, dest: Path) -> Path:
        shutil.copyfile(self.root / key, dest)
        return dest

    async def read_json(self, key: str) -> dict[str, Any] | None:
        p = self.root / key
        return json.loads(p.read_text()) if p.exists() else None

    async def write_json(self, key: str, data: dict[str, Any]) -> None:
        p = self.root / key
        p.parent.mkdir(parents=True, exist_ok=True)
        tmp = p.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, indent=1, ensure_ascii=False))
        tmp.replace(p)

    async def list_ids(self) -> list[str]:
        return sorted(p.parent.name for p in self.root.glob("*/item.json"))

    async def public_url(self, key: str, ttl: timedelta) -> str | None:
        # Only if the folder is served over HTTPS (e.g. by nginx); else IG must use resumable upload.
        return f"{self.base_url.rstrip('/')}/{key}" if self.base_url else None


class FirebaseStore:
    """Firebase Storage via firebase_admin (sync SDK, run in a thread)."""

    def __init__(self, bucket: str, prefix: str = "jack-publish") -> None:
        import firebase_admin
        from firebase_admin import credentials, storage

        sa_path = os.environ.get("FIREBASE_SERVICE_ACCOUNT_PATH")
        sa_json = os.environ.get("JACK_FIREBASE_SA_JSON")  # cloud env secret: raw or base64 JSON
        if sa_path:
            cred = credentials.Certificate(sa_path)
        elif sa_json:
            raw = sa_json if sa_json.lstrip().startswith("{") else base64.b64decode(sa_json).decode()
            cred = credentials.Certificate(json.loads(raw))
        else:
            raise RuntimeError("Set FIREBASE_SERVICE_ACCOUNT_PATH or JACK_FIREBASE_SA_JSON for the publish queue")
        name = "jack-publish"
        try:
            app = firebase_admin.get_app(name)
        except ValueError:
            app = firebase_admin.initialize_app(cred, {"storageBucket": bucket}, name=name)
        self.bucket = storage.bucket(app=app)
        self.prefix = prefix.strip("/")

    def _k(self, key: str) -> str:
        return f"{self.prefix}/{key}"

    async def put_file(self, key: str, path: Path, content_type: str) -> None:
        blob = self.bucket.blob(self._k(key))
        await asyncio.to_thread(blob.upload_from_filename, str(path), content_type=content_type)

    async def download(self, key: str, dest: Path) -> Path:
        await asyncio.to_thread(self.bucket.blob(self._k(key)).download_to_filename, str(dest))
        return dest

    async def read_json(self, key: str) -> dict[str, Any] | None:
        blob = self.bucket.blob(self._k(key))
        if not await asyncio.to_thread(blob.exists):
            return None
        data: dict[str, Any] = json.loads(await asyncio.to_thread(blob.download_as_text))
        return data

    async def write_json(self, key: str, data: dict[str, Any]) -> None:
        blob = self.bucket.blob(self._k(key))
        body = json.dumps(data, indent=1, ensure_ascii=False)
        await asyncio.to_thread(blob.upload_from_string, body, content_type="application/json")

    async def list_ids(self) -> list[str]:
        blobs = await asyncio.to_thread(lambda: list(self.bucket.list_blobs(prefix=self.prefix + "/")))
        return sorted({b.name.split("/")[-2] for b in blobs if b.name.endswith("/item.json")})

    async def public_url(self, key: str, ttl: timedelta) -> str | None:
        blob = self.bucket.blob(self._k(key))
        url: str = await asyncio.to_thread(blob.generate_signed_url, expiration=ttl, version="v4", method="GET")
        return url


def open_store() -> Store:
    """``JACK_PUBLISH_STORE`` = ``gs://<bucket>/<prefix>`` or a local folder path."""
    spec = os.environ.get("JACK_PUBLISH_STORE", "")
    if spec.startswith("gs://"):
        bucket, _, prefix = spec[5:].partition("/")
        return FirebaseStore(bucket, prefix or "jack-publish")
    if not spec:
        raise RuntimeError("JACK_PUBLISH_STORE is not set (gs://<bucket>/jack-publish or a folder)")
    return LocalStore(Path(spec), os.environ.get("JACK_PUBLISH_PUBLIC_BASE_URL"))


async def load_item(store: Store, item_id: str) -> QueueItem | None:
    d = await store.read_json(f"{item_id}/item.json")
    return QueueItem.from_dict(d) if d else None


async def save_item(store: Store, item: QueueItem) -> None:
    await store.write_json(f"{item.id}/item.json", json.loads(item.to_json()))


async def blocked_dates(store: Store) -> dict[str, str]:
    d = await store.read_json("_config/blocked.json")
    return dict(d or {})
