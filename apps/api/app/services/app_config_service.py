from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass
from functools import lru_cache
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.core.config import Settings, get_settings
from app.providers.firebase import get_firestore_client


logger = logging.getLogger(__name__)


class _ConfigModel(BaseModel):
    model_config = ConfigDict(extra='ignore', strict=True, frozen=True)


class GuestAppConfig(_ConfigModel):
    max_uploads: int = Field(default=20, ge=1, le=100)
    max_exports: int = Field(default=3, ge=1, le=20)
    max_uploaded_bytes: int = Field(default=250 * 1024 * 1024, ge=1024 * 1024, le=10 * 1024 * 1024 * 1024)
    max_storage_bytes: int = Field(default=500 * 1024 * 1024, ge=1024 * 1024, le=20 * 1024 * 1024 * 1024)
    max_processing_seconds: float = Field(default=600, ge=1, le=7200, allow_inf_nan=False)
    max_concurrent_processing: int = Field(default=1, ge=1, le=4)
    network_max_uploads: int = Field(default=100, ge=1, le=1000)
    network_max_exports: int = Field(default=15, ge=1, le=200)
    network_max_uploaded_bytes: int = Field(default=1250 * 1024 * 1024, ge=1024 * 1024, le=50 * 1024 * 1024 * 1024)
    network_max_processing_seconds: float = Field(default=3000, ge=1, le=100_000, allow_inf_nan=False)


class MediaAppConfig(_ConfigModel):
    max_file_bytes: int = Field(default=100 * 1024 * 1024, ge=1024 * 1024, le=2 * 1024 * 1024 * 1024)
    max_video_duration_seconds: float = Field(default=600, ge=1, le=600, allow_inf_nan=False)
    max_image_pixels: int = Field(default=40_000_000, ge=1_000_000, le=100_000_000)


class EditorAppConfig(_ConfigModel):
    max_clips: int = Field(default=12, ge=1, le=50)
    max_duration_seconds: float = Field(default=60, ge=1, le=120, allow_inf_nan=False)


class ExportAppConfig(_ConfigModel):
    list_limit: int = Field(default=50, ge=1, le=100)


class FeatureAppConfig(_ConfigModel):
    guest_editor_enabled: bool = True


class AppConfigSnapshot(_ConfigModel):
    guest: GuestAppConfig
    media: MediaAppConfig
    editor: EditorAppConfig
    export: ExportAppConfig
    features: FeatureAppConfig


class PublicGuestConfig(_ConfigModel):
    max_uploads: int
    max_exports: int


class PublicMediaConfig(_ConfigModel):
    max_file_bytes: int
    max_video_duration_seconds: float


class PublicEditorConfig(_ConfigModel):
    max_clips: int
    max_duration_seconds: float


class PublicAppConfig(_ConfigModel):
    guest: PublicGuestConfig
    media: PublicMediaConfig
    editor: PublicEditorConfig
    features: FeatureAppConfig


@dataclass
class _CachedSnapshot:
    value: AppConfigSnapshot
    loaded_at: float


def defaults_from_settings(settings: Settings) -> AppConfigSnapshot:
    return AppConfigSnapshot(
        guest=GuestAppConfig(
            max_uploads=settings.editor_guest_max_uploads,
            max_exports=settings.editor_guest_max_exports,
            max_uploaded_bytes=settings.editor_guest_max_uploaded_bytes,
            max_storage_bytes=settings.editor_guest_max_storage_bytes,
            max_processing_seconds=float(settings.editor_guest_max_processing_seconds),
            max_concurrent_processing=settings.editor_guest_max_concurrent_processing,
            network_max_uploads=settings.editor_guest_network_max_uploads,
            network_max_exports=settings.editor_guest_network_max_exports,
            network_max_uploaded_bytes=settings.editor_guest_network_max_uploaded_bytes,
            network_max_processing_seconds=float(settings.editor_guest_network_max_processing_seconds),
        ),
        media=MediaAppConfig(
            max_file_bytes=settings.editor_guest_max_file_bytes,
            max_video_duration_seconds=float(settings.editor_guest_max_video_duration_seconds),
            max_image_pixels=settings.editor_guest_max_image_pixels,
        ),
        editor=EditorAppConfig(
            max_clips=settings.editor_timeline_max_clips,
            max_duration_seconds=float(settings.editor_timeline_max_duration_seconds),
        ),
        export=ExportAppConfig(list_limit=settings.editor_export_list_limit),
        features=FeatureAppConfig(),
    )


class AppConfigService:
    collection_name = 'app_config'
    _models = {
        'guest': GuestAppConfig,
        'media': MediaAppConfig,
        'editor': EditorAppConfig,
        'export': ExportAppConfig,
        'features': FeatureAppConfig,
    }

    def __init__(self, firestore_client, *, defaults: AppConfigSnapshot, cache_ttl_seconds: float = 45) -> None:
        if not 30 <= cache_ttl_seconds <= 60:
            raise ValueError('AppConfig cache TTL must be between 30 and 60 seconds.')
        self.firestore = firestore_client
        self.defaults = defaults
        self.cache_ttl_seconds = float(cache_ttl_seconds)
        self._cache: _CachedSnapshot | None = None
        self._lock = threading.Lock()

    def get(self) -> AppConfigSnapshot:
        now = time.monotonic()
        cached = self._cache
        if cached is not None and now - cached.loaded_at < self.cache_ttl_seconds:
            return cached.value
        with self._lock:
            cached = self._cache
            now = time.monotonic()
            if cached is not None and now - cached.loaded_at < self.cache_ttl_seconds:
                return cached.value
            try:
                snapshot = self._load()
            except Exception:
                logger.warning('app_config_firestore_unavailable', exc_info=True)
                snapshot = cached.value if cached is not None else self.defaults
            self._cache = _CachedSnapshot(snapshot, now)
            return snapshot

    def invalidate(self) -> None:
        with self._lock:
            self._cache = None

    def public(self) -> PublicAppConfig:
        current = self.get()
        return PublicAppConfig(
            guest=PublicGuestConfig(max_uploads=current.guest.max_uploads, max_exports=current.guest.max_exports),
            media=PublicMediaConfig(
                max_file_bytes=current.media.max_file_bytes,
                max_video_duration_seconds=current.media.max_video_duration_seconds,
            ),
            editor=PublicEditorConfig(
                max_clips=current.editor.max_clips,
                max_duration_seconds=current.editor.max_duration_seconds,
            ),
            features=current.features,
        )

    def _load(self) -> AppConfigSnapshot:
        values: dict[str, BaseModel] = {}
        collection = self.firestore.collection(self.collection_name)
        for category, model in self._models.items():
            default = getattr(self.defaults, category)
            document = collection.document(category).get()
            if not document.exists:
                values[category] = default
                continue
            payload = document.to_dict() or {}
            try:
                values[category] = model.model_validate({**default.model_dump(), **payload})
            except ValidationError:
                logger.warning('app_config_category_invalid', extra={'category': category}, exc_info=True)
                values[category] = default
        return AppConfigSnapshot.model_validate(values)


@lru_cache(maxsize=1)
def get_app_config_service() -> AppConfigService:
    settings = get_settings()
    try:
        firestore = get_firestore_client()
    except Exception:
        from app.providers.firebase_emulator import firebase_emulator_requested

        if firebase_emulator_requested():
            raise
        logger.warning('app_config_firestore_client_unavailable', exc_info=True)
        firestore = None
    return AppConfigService(
        firestore,
        defaults=defaults_from_settings(settings),
        cache_ttl_seconds=settings.app_config_cache_ttl_seconds,
    )
