"""Opt-in ephemeral local source reuse for the editor API process.

Only call get_copy AFTER verifying current guest ownership and media status.
Storage remains authoritative. Cache is optional and never changes upload success.
No arbitrary filesystem paths derived from user input are used.
"""
from __future__ import annotations

import hashlib
import logging
import os
import shutil
import tempfile
import time
from pathlib import Path
from threading import RLock

logger = logging.getLogger(__name__)
_lock = RLock()
DEFAULT_MAX_BYTES = 512 * 1024 * 1024
DEFAULT_TTL_SECONDS = 3600


def _root() -> Path | None:
    location = os.getenv("RANGMANCH_EDITOR_LOCAL_MEDIA_CACHE_DIR", "").strip()
    if not location:
        return None
    root = Path(location).expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    if root.is_symlink():
        raise ValueError("Local media cache directory must not be a symlink.")
    return root


def _key(object_name: str, content_sha256: str) -> str:
    return hashlib.sha256((object_name + "\x00" + content_sha256).encode()).hexdigest()


def _limits() -> tuple[int, int]:
    try:
        ttl = min(24 * 3600, max(60, int(os.getenv("RANGMANCH_EDITOR_LOCAL_MEDIA_CACHE_TTL_SECONDS", str(DEFAULT_TTL_SECONDS)))))
        maximum = min(4 * 1024**3, max(8 * 1024**2, int(os.getenv("RANGMANCH_EDITOR_LOCAL_MEDIA_CACHE_MAX_BYTES", str(DEFAULT_MAX_BYTES)))))
        return ttl, maximum
    except ValueError:
        return DEFAULT_TTL_SECONDS, DEFAULT_MAX_BYTES


def _prune(root: Path, *, ttl: int, max_bytes: int, reserve: int = 0) -> None:
    now = time.time()
    files = []
    for file in root.glob("*.source"):
        if file.is_symlink():
            file.unlink(missing_ok=True)
            continue
        try:
            meta = file.stat()
        except FileNotFoundError:
            continue
        if now - meta.st_mtime > ttl:
            file.unlink(missing_ok=True)
        else:
            files.append((meta.st_mtime, meta.st_size, file))
    total = sum(size for _, size, _ in files)
    for _, size, file in sorted(files):
        if total + reserve <= max_bytes:
            break
        file.unlink(missing_ok=True)
        total -= size


def store(object_name: str, content_sha256: str, source: Path, expected_size: int) -> bool:
    """Best effort; only call after the durable upload has committed successfully."""
    try:
        root = _root()
        if root is None:
            return False
        ttl, maximum = _limits()
        if expected_size <= 0 or expected_size > maximum or source.stat().st_size != expected_size:
            return False
        destination = root / (_key(object_name, content_sha256) + ".source")
        with _lock:
            _prune(root, ttl=ttl, max_bytes=maximum, reserve=expected_size)
            fd, tmp_name = tempfile.mkstemp(prefix=".incoming-", dir=root)
            os.close(fd)
            tmp = Path(tmp_name)
            try:
                shutil.copyfile(source, tmp)
                if tmp.stat().st_size != expected_size:
                    return False
                os.chmod(tmp, 0o600)
                os.replace(tmp, destination)
                logger.info("editor_local_media_cache_stored", extra={"source_bytes": expected_size})
                return True
            finally:
                tmp.unlink(missing_ok=True)
    except (OSError, ValueError):
        logger.warning("editor_local_media_cache_store_failed", exc_info=True)
        return False


def get_copy(object_name: str, content_sha256: str, destination: Path, expected_size: int) -> bool:
    """Copy a validated cache hit into request-private temp space.

    Missing/expired or corrupted entries fall through to cloud storage.
    Expected SHA-256 is verified, so stale or tampered media is never used.
    """
    try:
        root = _root()
        if root is None or not content_sha256 or expected_size <= 0:
            return False
        ttl, maximum = _limits()
        source = root / (_key(object_name, content_sha256) + ".source")
        with _lock:
            if not source.is_file() or source.is_symlink():
                return False
            metadata = source.stat()
            if metadata.st_size != expected_size or time.time() - metadata.st_mtime > ttl:
                source.unlink(missing_ok=True)
                return False
            # Copy and hash while holding the in-process lock to avoid pruning.
            digest = hashlib.sha256()
            with source.open("rb") as inp, destination.open("xb") as out:
                while True:
                    data = inp.read(1024 * 1024)
                    if not data:
                        break
                    digest.update(data)
                    out.write(data)
            if destination.stat().st_size != expected_size or digest.hexdigest() != content_sha256:
                destination.unlink(missing_ok=True)
                source.unlink(missing_ok=True)
                return False
            os.utime(source, None)
            _prune(root, ttl=ttl, max_bytes=maximum)
            logger.info("editor_local_media_cache_hit", extra={"source_bytes": expected_size})
            return True
    except (OSError, ValueError):
        destination.unlink(missing_ok=True)
        logger.warning("editor_local_media_cache_read_failed", exc_info=True)
        return False


def invalidate(object_name: str, content_sha256: str) -> None:
    try:
        root = _root()
        if root is None or not content_sha256:
            return
        with _lock:
            (root / (_key(object_name, content_sha256) + ".source")).unlink(missing_ok=True)
    except (OSError, ValueError):
        logger.warning("editor_local_media_cache_invalidate_failed", exc_info=True)
