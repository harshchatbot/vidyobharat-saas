from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field

from app.api.deps import get_user_id
from app.core.request_context import get_request_id
from app.schemas.avatar import (
    ActorCreateResponse,
    ActorDetailResponse,
    ActorVisibilityUpdateRequest,
    ActorVisibilityUpdateResponse,
    TestAvatarRequest,
    TestAvatarResponse,
)
from app.schemas.catalog import AvatarResponse
from app.services.avatar_preview_service import AvatarPreviewService
from app.services.avatar_service import AvatarService

router = APIRouter()
logger = logging.getLogger(__name__)


class AvatarLibraryResponse(BaseModel):
    avatars: list[AvatarResponse] = Field(default_factory=list)
    preset_avatars: list[AvatarResponse] = Field(default_factory=list)
    user_avatars: list[AvatarResponse] = Field(default_factory=list)


def get_avatar_preview_service() -> AvatarPreviewService:
    return AvatarPreviewService()


@router.get('/avatars', response_model=list[AvatarResponse])
def list_avatars(
    search: str | None = None,
    scope: str | None = None,
    language: str | None = None,
    user_id: str = Depends(get_user_id),
):
    service = AvatarService()
    return service.list_avatars(search=search, scope=scope, language=language, user_id=user_id)


@router.post('/actors/create', response_model=ActorCreateResponse, status_code=status.HTTP_201_CREATED)
@router.post('/api/actors/create', response_model=ActorCreateResponse, include_in_schema=False, status_code=status.HTTP_201_CREATED)
async def create_actor(
    name: str = Form(...),
    scope: str = Form('own'),
    gender: str = Form(...),
    tags: str = Form(''),
    category: str = Form('ugc_influencer'),
    language_support: str = Form('en-IN'),
    prompt_template: str = Form(...),
    negative_prompt: str = Form(''),
    recommended_voice: str = Form(...),
    thumb: UploadFile = File(...),
    ref_front: UploadFile = File(...),
    ref_alt: UploadFile | None = File(default=None),
    preview: UploadFile | None = File(default=None),
    user_id: str = Depends(get_user_id),
):
    try:
        service = AvatarService()
        actor_id = service.create_actor(
            user_id=user_id,
            name=name,
            scope=scope,
            gender=gender,
            tags=[item.strip() for item in tags.split(',') if item.strip()],
            category=category,
            language_support=[item.strip() for item in language_support.split(',') if item.strip()],
            prompt_template=prompt_template,
            negative_prompt=negative_prompt,
            recommended_voice=recommended_voice,
            thumb_bytes=await thumb.read(),
            thumb_content_type=thumb.content_type or 'image/jpeg',
            ref_front_bytes=await ref_front.read(),
            ref_front_content_type=ref_front.content_type or 'image/jpeg',
            ref_alt_bytes=await ref_alt.read() if ref_alt else None,
            ref_alt_content_type=ref_alt.content_type if ref_alt else None,
            preview_bytes=await preview.read() if preview else None,
            preview_content_type=preview.content_type if preview else None,
        )
        return ActorCreateResponse(actor_id=actor_id, status='active')
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception('actor_create_failed', extra={'request_id': get_request_id(), 'user_id': user_id, 'error': str(exc)})
        raise HTTPException(status_code=500, detail='Failed to create actor') from exc


@router.get('/actors/list', response_model=list[AvatarResponse])
@router.get('/api/actors/list', response_model=list[AvatarResponse], include_in_schema=False)
def list_actors(
    search: str | None = None,
    scope: str | None = None,
    language: str | None = None,
    user_id: str = Depends(get_user_id),
):
    service = AvatarService()
    return service.list_avatars(search=search, scope=scope, language=language, user_id=user_id)


@router.get('/actors/{actor_id}', response_model=ActorDetailResponse)
@router.get('/api/actors/{actor_id}', response_model=ActorDetailResponse, include_in_schema=False)
def get_actor_details(
    actor_id: str,
    user_id: str = Depends(get_user_id),
):
    actor = AvatarService().get_actor_details(actor_id, user_id=user_id)
    if not actor:
        raise HTTPException(status_code=404, detail='Actor not found')
    return ActorDetailResponse(**actor)


@router.post('/actors/{actor_id}/visibility', response_model=ActorVisibilityUpdateResponse)
@router.post('/api/actors/{actor_id}/visibility', response_model=ActorVisibilityUpdateResponse, include_in_schema=False)
def update_actor_visibility(
    actor_id: str,
    payload: ActorVisibilityUpdateRequest,
    user_id: str = Depends(get_user_id),
):
    try:
        actor = AvatarService().update_actor_scope(actor_id=actor_id, user_id=user_id, scope=payload.scope)
        return ActorVisibilityUpdateResponse(actor_id=actor.id, scope=actor.scope, status=actor.status or 'active')
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post('/test-avatar', response_model=TestAvatarResponse)
@router.post('/api/test-avatar', response_model=TestAvatarResponse, include_in_schema=False)
def test_avatar(
    payload: TestAvatarRequest,
    user_id: str = Depends(get_user_id),
):
    try:
        result = get_avatar_preview_service().generate_test_avatar_video(
            actor_id=payload.actor_id,
            user_id=user_id,
            script_text=payload.script_text,
        )
        return TestAvatarResponse(**result)
    except RuntimeError as exc:
        detail = str(exc).strip()
        if 'not found' in detail.lower():
            raise HTTPException(status_code=404, detail=detail) from exc
        raise HTTPException(status_code=422, detail=detail) from exc
    except Exception as exc:
        logger.exception('test_avatar_failed', extra={'request_id': get_request_id(), 'user_id': user_id, 'actor_id': payload.actor_id, 'error': str(exc)})
        raise HTTPException(status_code=500, detail='Failed to generate talking avatar video') from exc


@router.get('/api/avatars/library', response_model=AvatarLibraryResponse)
def list_avatar_library(
    refresh_presets: bool = False,
    user_id: str = Depends(get_user_id),
):
    del refresh_presets

    try:
        avatars = AvatarService().list_avatars(user_id=user_id)
        return AvatarLibraryResponse(
            avatars=avatars,
            preset_avatars=[],
            user_avatars=[],
        )
    except Exception as exc:
        logger.exception(
            'avatar_library_list_failed',
            extra={
                'request_id': get_request_id(),
                'user_id': user_id,
                'error': str(exc),
            },
        )
        raise HTTPException(status_code=500, detail='Failed to list avatar library') from exc
