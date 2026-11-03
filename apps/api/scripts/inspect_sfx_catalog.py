"""Read-only diagnostics for the Firebase SFX catalog.

Run from apps/api: python scripts/inspect_sfx_catalog.py
Requires the backend's configured Firebase credentials.
"""
from collections import Counter

from app.services.editor_audio_library import build_audio_library_repository, sync_firebase_sfx_catalog
from app.providers.storage import FirebaseStorageProvider, build_storage_provider


def main():
    storage = build_storage_provider()
    if not isinstance(storage, FirebaseStorageProvider):
        print('Storage backend is not Firebase. Check backend configuration.')
        return
    paths = [
        blob.name
        for prefix in ('sfx/', 'audio-library/sfx/')
        for blob in storage.bucket.list_blobs(prefix=prefix)
        if blob.name.lower().endswith(('.wav', '.mp3', '.ogg'))
    ]
    print(f'Firebase SFX objects: {len(paths)}')
    print(f'New catalog drafts discovered: {sync_firebase_sfx_catalog()}')
    entries = [entry for entry in build_audio_library_repository().list(include_unpublished=True) if entry.type == 'sfx']
    print(f'Catalog SFX: {len(entries)}; statuses: {dict(Counter(e.status for e in entries))}')
    catalog_paths = {entry.storage_path for entry in entries}
    for entry in entries:
        print(f'[{entry.status}] {entry.title}: {entry.storage_path} (license: {entry.license}; evidence: {entry.evidence_reference})')
    for path in sorted(set(paths) - catalog_paths):
        print(f'[NOT INDEXED] {path} (check duration, MIME type, size and ffprobe availability)')


if __name__ == '__main__':
    main()
