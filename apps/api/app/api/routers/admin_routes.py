from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field

from app.api.deps import AdminPrincipal, require_admin_principal
from app.db.repositories.admin_repository import AdminCursorError, AdminGuestRepository
from app.providers.firebase import FirebaseNotConfiguredError, get_firestore_client
from app.schemas.admin import (
    AdminConfigAuditPage,
    AdminConfigResponse,
    AdminConfigUpdateRequest,
    AdminDashboardResponse,
    AdminExportPage,
    AdminGuestPage,
    AdminMeResponse,
)
from app.schemas.template_management import UnifiedTemplateResponse
from app.services.app_config_service import (
    AppConfigConflictError,
    AppConfigService,
    AppConfigUpdateError,
    get_app_config_service,
)
from app.services.template_management_service import TemplateManagementService
from app.services.editor_audio_library import AudioLibraryEntry, build_audio_library_repository, register_existing_audio_asset, upload_audio_library_asset


router = APIRouter(prefix='/api/admin', tags=['RangManch Admin'])


class AudioLibraryMetadata(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    category: str = Field(min_length=1, max_length=80)
    type: str = Field(pattern='^(music|sfx)$')
    tags: list[str] = Field(default_factory=list, max_length=20)
    license: str = Field(min_length=1, max_length=120)
    attribution: str | None = Field(default=None, max_length=500)
    source: str = Field(min_length=1, max_length=500)
    evidence_reference: str = Field(min_length=1, max_length=500)
    redistribution_confirmed: bool

class ExistingAudioRegistration(AudioLibraryMetadata):
    storage_path: str = Field(min_length=1, max_length=500)
    duration_seconds: float = Field(gt=0, le=3600)
    content_type: str = Field(pattern=r'^audio/[a-z0-9.+-]+$')


@router.get('/audio-library')
def admin_audio_library(_: AdminPrincipal = Depends(require_admin_principal)):
    return {'items': [entry.model_dump() for entry in build_audio_library_repository().list(include_unpublished=True)]}


@router.post('/audio-library', status_code=201)
async def admin_upload_audio_library(
    metadata: str = Form(...),
    file: UploadFile = File(...),
    _: AdminPrincipal = Depends(require_admin_principal),
):
    try:
        payload = AudioLibraryMetadata.model_validate_json(metadata)
    except Exception as exc:
        raise HTTPException(status_code=422, detail='Invalid audio library metadata.') from exc
    if not payload.redistribution_confirmed:
        raise HTTPException(status_code=422, detail='Redistribution permission must be explicitly confirmed.')
    content = await file.read()
    try:
        storage_path, _, duration = upload_audio_library_asset(file.filename or 'audio', content, file.content_type or '', payload.type)
        entry = AudioLibraryEntry(
            id=storage_path.rsplit('/', 1)[-1].rsplit('.', 1)[0], title=payload.title, category=payload.category,
            type=payload.type, duration_seconds=duration, content_type=file.content_type or 'audio/mpeg', tags=payload.tags,
            license=payload.license, attribution=payload.attribution, source=payload.source,
            evidence_reference=payload.evidence_reference, storage_path=storage_path, status='draft',
        )
        build_audio_library_repository().save(entry)
        return entry.model_dump(exclude={'evidence_reference'})
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post('/audio-library/register', status_code=201)
def admin_register_existing_audio_library(
    payload: ExistingAudioRegistration,
    _: AdminPrincipal = Depends(require_admin_principal),
):
    try:
        entry = register_existing_audio_asset(
            storage_path=payload.storage_path, title=payload.title, category=payload.category,
            kind=payload.type, duration_seconds=payload.duration_seconds, content_type=payload.content_type,
            tags=payload.tags, license_name=payload.license, attribution=payload.attribution,
            source=payload.source, evidence_reference=payload.evidence_reference,
            redistribution_confirmed=payload.redistribution_confirmed,
        )
        return entry.model_dump(exclude={'evidence_reference'})
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.patch('/audio-library/{asset_id}')
def admin_update_audio_library(asset_id: str, payload: AudioLibraryMetadata, _: AdminPrincipal = Depends(require_admin_principal)):
    repository = build_audio_library_repository(); entry = repository.get(asset_id)
    if not entry: raise HTTPException(status_code=404, detail='Audio library asset not found.')
    if not payload.redistribution_confirmed: raise HTTPException(status_code=422, detail='Redistribution permission must be explicitly confirmed.')
    updated = entry.model_copy(update=payload.model_dump(exclude={'redistribution_confirmed'}))
    repository.save(updated)
    return updated.model_dump(exclude={'evidence_reference'})


@router.post('/audio-library/{asset_id}/publish')
def admin_publish_audio_library(asset_id: str, _: AdminPrincipal = Depends(require_admin_principal)):
    repository = build_audio_library_repository(); entry = repository.get(asset_id)
    if not entry: raise HTTPException(status_code=404, detail='Audio library asset not found.')
    updated = entry.model_copy(update={'status': 'published'}); repository.save(updated); return updated.model_dump(exclude={'evidence_reference'})


@router.post('/audio-library/{asset_id}/retire')
def admin_retire_audio_library(asset_id: str, _: AdminPrincipal = Depends(require_admin_principal)):
    repository = build_audio_library_repository(); entry = repository.get(asset_id)
    if not entry: raise HTTPException(status_code=404, detail='Audio library asset not found.')
    updated = entry.model_copy(update={'status': 'retired'}); repository.save(updated); return updated.model_dump(exclude={'evidence_reference'})
_EDITABLE_FIELDS = {
    'guest': {
        'max_uploads', 'max_exports', 'max_uploaded_bytes', 'max_storage_bytes',
        'max_processing_seconds', 'max_concurrent_processing',
        'network_max_uploads', 'network_max_exports', 'network_max_uploaded_bytes',
        'network_max_processing_seconds',
    },
    'media': {'max_file_bytes'},
    'editor': {'max_clips', 'max_duration_seconds'},
    'features': {'guest_editor_enabled'},
}


def get_admin_repository() -> AdminGuestRepository:
    try:
        return AdminGuestRepository(get_firestore_client())
    except FirebaseNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail='Admin data is unavailable') from exc


@router.get('/me', response_model=AdminMeResponse)
def admin_me(principal: AdminPrincipal = Depends(require_admin_principal)):
    return {'uid': principal.uid, 'email': principal.email}


@router.get('/templates', response_model=list[UnifiedTemplateResponse])
def admin_templates(
    type: str | None = None,
    category: str | None = None,
    trending: bool | None = None,
    featured: bool | None = None,
    active: bool | None = None,
    aspect_ratio: str | None = None,
    search: str | None = Query(default=None, max_length=200),
    _: AdminPrincipal = Depends(require_admin_principal),
):
    return TemplateManagementService().list_templates(
        type=type,
        category=category,
        trending=trending,
        featured=featured,
        active=active,
        aspect_ratio=aspect_ratio,
        search=search,
        include_inactive=True,
    )


@router.get('/dashboard', response_model=AdminDashboardResponse)
def admin_dashboard(
    _: AdminPrincipal = Depends(require_admin_principal),
    repository: AdminGuestRepository = Depends(get_admin_repository),
):
    payload = repository.dashboard(now=datetime.now(UTC))
    payload['coverage_note'] = (
        'Metrics cover retained guest-session and export records. Guest sessions are not unique people, '
        'and detailed historical events require dedicated analytics tracking.'
    )
    return payload


@router.get('/guests', response_model=AdminGuestPage)
def admin_guests(
    limit: int = Query(default=25, ge=1, le=50),
    cursor: str | None = Query(default=None, max_length=512),
    _: AdminPrincipal = Depends(require_admin_principal),
    repository: AdminGuestRepository = Depends(get_admin_repository),
):
    try:
        items, next_cursor = repository.list_guests(limit=limit, cursor=cursor)
    except AdminCursorError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {'items': items, 'next_cursor': next_cursor}


@router.get('/guests/{guest_id}/exports', response_model=AdminExportPage)
def admin_guest_exports(
    guest_id: str,
    limit: int = Query(default=25, ge=1, le=50),
    cursor: str | None = Query(default=None, max_length=512),
    _: AdminPrincipal = Depends(require_admin_principal),
    repository: AdminGuestRepository = Depends(get_admin_repository),
):
    try:
        guest, items, next_cursor = repository.guest_exports(
            guest_id=guest_id, limit=limit, cursor=cursor,
        )
    except AdminCursorError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if guest is None:
        raise HTTPException(status_code=404, detail='Guest session was not found')
    return {'guest': guest, 'items': items, 'next_cursor': next_cursor}


@router.get('/config', response_model=AdminConfigResponse)
def admin_config(
    _: AdminPrincipal = Depends(require_admin_principal),
    service: AppConfigService = Depends(get_app_config_service),
):
    try:
        snapshot, revision = service.admin()
    except AppConfigUpdateError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {
        'revision': revision,
        'cache_ttl_seconds': service.cache_ttl_seconds,
        'config': snapshot.model_dump(),
    }


@router.put('/config', response_model=AdminConfigResponse)
def update_admin_config(
    payload: AdminConfigUpdateRequest,
    principal: AdminPrincipal = Depends(require_admin_principal),
    service: AppConfigService = Depends(get_app_config_service),
):
    unsupported_categories = set(payload.changes) - set(_EDITABLE_FIELDS)
    if unsupported_categories:
        raise HTTPException(status_code=422, detail='One or more configuration categories are not editable.')
    for category, values in payload.changes.items():
        if not isinstance(values, dict) or not values or set(values) - _EDITABLE_FIELDS[category]:
            raise HTTPException(status_code=422, detail=f'One or more {category} settings are not editable.')
    try:
        snapshot, revision = service.update(
            changes=payload.changes,
            expected_revision=payload.revision,
            actor_uid=principal.uid,
            actor_email=principal.email,
            reason=payload.reason.strip() if payload.reason and payload.reason.strip() else None,
        )
    except AppConfigConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except AppConfigUpdateError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {
        'revision': revision,
        'cache_ttl_seconds': service.cache_ttl_seconds,
        'config': snapshot.model_dump(),
    }


@router.get('/config/audit', response_model=AdminConfigAuditPage)
def admin_config_audit(
    limit: int = Query(default=25, ge=1, le=50),
    cursor: str | None = Query(default=None, max_length=512),
    _: AdminPrincipal = Depends(require_admin_principal),
    repository: AdminGuestRepository = Depends(get_admin_repository),
):
    try:
        items, next_cursor = repository.config_audit(limit=limit, cursor=cursor)
    except AdminCursorError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {'items': items, 'next_cursor': next_cursor}
