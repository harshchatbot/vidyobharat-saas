"""Regression checks for temporary local upload-to-analysis source reuse."""
from __future__ import annotations

import hashlib
import time
from pathlib import Path

from app.services import editor_local_media_cache as cache


def test_store_copy_and_delete(monkeypatch, tmp_path):
    monkeypatch.setenv("RANGMANCH_EDITOR_LOCAL_MEDIA_CACHE_DIR", str(tmp_path / "cache"))
    source = tmp_path / "original.mp4"
    content = b"RangManch local cache test video data"
    source.write_bytes(content)
    digest = hashlib.sha256(content).hexdigest()
    assert cache.store("guest/user-1/video-1", digest, source, len(content))
    recovered = tmp_path / "recovered.mp4"
    assert cache.get_copy("guest/user-1/video-1", digest, recovered, len(content))
    assert recovered.read_bytes() == content

    # Storage object and content identity are part of the cache key.
    assert not cache.get_copy("guest/user-2/video-1", digest, tmp_path / "other.mp4", len(content))
    assert not cache.get_copy("guest/user-1/video-1", "0" * 64, tmp_path / "wrong.mp4", len(content))

    cache.invalidate("guest/user-1/video-1", digest)
    assert not cache.get_copy("guest/user-1/video-1", digest, tmp_path / "deleted.mp4", len(content))


def test_expired_and_tampered_entries_fall_back_to_storage(monkeypatch, tmp_path):
    monkeypatch.setenv("RANGMANCH_EDITOR_LOCAL_MEDIA_CACHE_DIR", str(tmp_path / "cache"))
    source = tmp_path / "original.mp4"
    content = b"original bytes"
    source.write_bytes(content)
    digest = hashlib.sha256(content).hexdigest()
    object_path = "guest/user-1/video-1"

    assert cache.store(object_path, digest, source, len(content))
    cached_file = next((tmp_path / "cache").glob("*.source"))
    cached_file.write_bytes(b"tampered bytes")
    assert not cache.get_copy(object_path, digest, tmp_path / "tampered.mp4", len(content))

    assert cache.store(object_path, digest, source, len(content))
    cached_file = next((tmp_path / "cache").glob("*.source"))
    old = time.time() - 8000
    cached_file.touch()
    import os
    os.utime(cached_file, (old, old))
    monkeypatch.setenv("RANGMANCH_EDITOR_LOCAL_MEDIA_CACHE_TTL_SECONDS", "3600")
    assert not cache.get_copy(object_path, digest, tmp_path / "expired.mp4", len(content))


def test_disabled_cache_does_not_create_files(monkeypatch, tmp_path):
    monkeypatch.delenv("RANGMANCH_EDITOR_LOCAL_MEDIA_CACHE_DIR", raising=False)
    source = tmp_path / "video.mp4"
    source.write_bytes(b"video")
    digest = hashlib.sha256(b"video").hexdigest()
    assert cache.store("guest/one", digest, source, 5) is False
    assert cache.get_copy("guest/one", digest, tmp_path / "missing", 5) is False
