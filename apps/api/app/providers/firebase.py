from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from app.core.config import get_settings


class FirebaseNotConfiguredError(RuntimeError):
    pass


@lru_cache(maxsize=1)
def get_firebase_app():
    settings = get_settings()
    if not settings.firebase_project_id:
        raise FirebaseNotConfiguredError('FIREBASE_PROJECT_ID is not configured')

    try:
        import firebase_admin
        from firebase_admin import credentials
    except ImportError as exc:
        raise FirebaseNotConfiguredError('firebase-admin dependency is not installed') from exc

    try:
        return firebase_admin.get_app()
    except ValueError:
        pass

    cred = None
    if settings.firebase_service_account_json:
        cred = credentials.Certificate(json.loads(settings.firebase_service_account_json))
    elif settings.firebase_service_account_path:
        cred = credentials.Certificate(Path(settings.firebase_service_account_path))
    else:
        cred = credentials.ApplicationDefault()

    options: dict[str, str] = {'projectId': settings.firebase_project_id}
    if settings.firebase_storage_bucket:
        options['storageBucket'] = settings.firebase_storage_bucket

    return firebase_admin.initialize_app(cred, options)


def get_firestore_client():
    from firebase_admin import firestore

    app = get_firebase_app()
    return firestore.client(app=app)
