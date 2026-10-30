from __future__ import annotations

import json
import subprocess
import tempfile
import hashlib
from urllib.parse import quote
from datetime import datetime
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.core.config import get_settings
from app.providers.storage import build_storage_provider


class AudioLibraryEntry(BaseModel):
    model_config = ConfigDict(frozen=True)
    id: str = Field(min_length=1, max_length=120)
    title: str = Field(min_length=1, max_length=200)
    category: str = Field(min_length=1, max_length=80)
    type: Literal['music', 'sfx']
    duration_seconds: float = Field(gt=0, le=3600)
    content_type: str = Field(pattern=r'^audio/[a-z0-9.+-]+$')
    tags: list[str] = Field(default_factory=list, max_length=20)
    license: str = Field(min_length=1, max_length=120)
    attribution: str | None = Field(default=None, max_length=500)
    source: str = Field(min_length=1, max_length=500)
    evidence_reference: str = Field(min_length=1, max_length=500)
    playback_url: str = ''
    storage_path: str | None = None
    status: Literal['draft', 'published', 'retired'] = 'draft'
    created_at: datetime | None = None
    updated_at: datetime | None = None

    def public(self) -> dict:
        payload = self.model_dump(exclude={'evidence_reference', 'storage_path', 'status', 'created_at', 'updated_at'})
        payload['playback_url'] = f'/api/editor/audio-library/{self.id}/content'
        return payload


class AudioLibraryRepository:
    def __init__(self, firestore_client) -> None:
        self.collection = firestore_client.collection('editor_audio_library')

    def list(self, *, include_unpublished: bool = False) -> list[AudioLibraryEntry]:
        query = self.collection
        if not include_unpublished:
            query = query.where('status', '==', 'published')
        return [AudioLibraryEntry.model_validate(snapshot.to_dict() | {'id': snapshot.id}) for snapshot in query.stream()]

    def get(self, asset_id: str) -> AudioLibraryEntry | None:
        snapshot = self.collection.document(asset_id).get()
        return AudioLibraryEntry.model_validate(snapshot.to_dict() | {'id': snapshot.id}) if snapshot.exists else None

    def save(self, entry: AudioLibraryEntry) -> AudioLibraryEntry:
        self.collection.document(entry.id).set(entry.model_dump(exclude={'id'}))
        return entry

    def find_by_storage_path(self, storage_path: str) -> AudioLibraryEntry | None:
        for entry in self.list(include_unpublished=True):
            if entry.storage_path == storage_path:
                return entry
        return None


def validate_audio_file(content: bytes, content_type: str, filename: str, max_bytes: int) -> float:
    if len(content) == 0 or len(content) > max_bytes:
        raise ValueError('Audio file is empty or exceeds the configured size limit.')
    signature = content[:16]
    if not (signature.startswith((b'ID3', b'\xff\xfb', b'RIFF', b'OggS', b'ftyp')) and content_type.startswith('audio/')):
        raise ValueError('The uploaded file is not a supported audio stream.')
    with tempfile.NamedTemporaryFile(suffix=Path(filename).suffix or '.audio') as handle:
        handle.write(content); handle.flush()
        try:
            result = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', handle.name], check=True, capture_output=True, text=True, timeout=15)
            duration = float(json.loads(result.stdout)['format']['duration'])
        except (OSError, subprocess.SubprocessError, KeyError, TypeError, ValueError) as exc:
            raise ValueError('The audio file could not be decoded.') from exc
    if duration <= 0 or duration > 3600:
        raise ValueError('Audio duration must be greater than zero and at most one hour.')
    return duration


def build_audio_library_repository():
    from app.providers.firebase import get_firestore_client
    return AudioLibraryRepository(get_firestore_client())


def list_audio_library(*, category: str | None = None, query: str | None = None) -> list[dict]:
    # Public listing is intentionally repository-backed; an unavailable backend fails closed.
    entries = build_audio_library_repository().list()
    needle = query.casefold().strip() if query else None
    return [entry.public() for entry in entries if (category is None or entry.type == category) and (needle is None or needle in ' '.join([entry.title, entry.category, *entry.tags]).casefold())]


def upload_audio_library_asset(filename: str, content: bytes, content_type: str, kind: str) -> tuple[str, str, float]:
    duration = validate_audio_file(content, content_type, filename, get_settings().editor_guest_max_file_bytes)
    signed = build_storage_provider().upload_bytes(filename, content, content_type=content_type, kind=f'audio-library/{kind}')
    return signed.storage_path, signed.public_url, duration


def register_existing_audio_asset(*, storage_path: str, title: str, category: str, kind: str,
                                  duration_seconds: float, content_type: str, tags: list[str],
                                  license_name: str, attribution: str | None, source: str,
                                  evidence_reference: str, redistribution_confirmed: bool) -> AudioLibraryEntry:
    clean_path = storage_path.strip('/')
    if not clean_path.startswith(f'audio-library/{kind}/') or '..' in Path(clean_path).parts:
        raise ValueError('Storage path must be inside the audio-library music or sfx namespace.')
    if not redistribution_confirmed:
        raise ValueError('Redistribution permission must be explicitly confirmed.')
    if duration_seconds <= 0 or duration_seconds > 3600:
        raise ValueError('Audio duration must be greater than zero and at most one hour.')
    if not content_type.startswith('audio/'):
        raise ValueError('Catalog registration requires an audio MIME type.')
    repository = build_audio_library_repository()
    existing = repository.find_by_storage_path(clean_path)
    if existing:
        return existing
    storage = build_storage_provider()
    metadata = storage.inspect_object(clean_path)
    if metadata is None:
        raise ValueError('The Firebase Storage audio object was not found.')
    if metadata.content_type and metadata.content_type != content_type:
        raise ValueError('Declared MIME type does not match the stored object.')
    asset_id = hashlib.sha256(clean_path.encode('utf-8')).hexdigest()[:40]
    playback_url = ''
    token = metadata.metadata.get('firebaseStorageDownloadTokens')
    bucket = getattr(storage, 'bucket_name', None)
    if token and bucket:
        playback_url = f'https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{quote(clean_path, safe="")}?alt=media&token={quote(token, safe="")}'
    if not playback_url:
        raise ValueError('The stored object has no controlled playback token. Set a Firebase download token before registration.')
    entry = AudioLibraryEntry(
        id=asset_id, title=title, category=category, type=kind, duration_seconds=duration_seconds,
        content_type=content_type, tags=tags, license=license_name, attribution=attribution,
        source=source, evidence_reference=evidence_reference, playback_url=playback_url,
        storage_path=clean_path, status='draft',
    )
    repository.save(entry)
    return entry
