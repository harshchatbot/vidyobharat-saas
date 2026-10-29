from __future__ import annotations

import json

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app.api.deps import VerifiedFirebasePrincipal, require_verified_firebase_principal
from app.core.config import Settings, get_settings
from app.db.repositories.editor_copilot_usage_repository import EditorCopilotUsageRepository
from app.providers.firebase import get_firestore_client
from app.schemas.editor_copilot import CopilotPlanRequest, CopilotPlanResponse
from app.services.editor_copilot_provider import CopilotProviderError, DisabledEditingCopilotProvider
from app.services.editor_copilot_service import CopilotServiceError, EditorCopilotService
from app.services.openai_editor_copilot_provider import OpenAIEditingCopilotProvider
from app.services.ollama_editor_copilot_provider import OllamaEditingCopilotProvider


router = APIRouter(prefix='/api/editor/copilot', tags=['RangManch Editor Copilot'])


def build_editor_copilot_service(settings: Settings | None = None) -> EditorCopilotService:
    current = settings or get_settings()
    try:
        if not current.editor_copilot_enabled:
            provider = DisabledEditingCopilotProvider()
        elif current.editor_copilot_provider == 'openai':
            provider = OpenAIEditingCopilotProvider(current)
        elif current.editor_copilot_provider == 'ollama':
            provider = OllamaEditingCopilotProvider(current)
        else:
            provider = DisabledEditingCopilotProvider()
    except CopilotProviderError:
        provider = DisabledEditingCopilotProvider()
    return EditorCopilotService(
        settings=current,
        provider=provider,
        usage=(
            EditorCopilotUsageRepository(get_firestore_client())
            if current.editor_copilot_enabled
            else None
        ),
    )


def get_editor_copilot_service() -> EditorCopilotService:
    return build_editor_copilot_service()


@router.get('/capabilities')
def get_copilot_capabilities(
    _: VerifiedFirebasePrincipal = Depends(require_verified_firebase_principal),
    service: EditorCopilotService = Depends(get_editor_copilot_service),
):
    return service.capabilities()


@router.post('/plan', response_model=CopilotPlanResponse)
async def create_copilot_plan(
    request: Request,
    principal: VerifiedFirebasePrincipal = Depends(require_verified_firebase_principal),
    service: EditorCopilotService = Depends(get_editor_copilot_service),
):
    try:
        maximum = service.settings.editor_copilot_max_context_bytes + 16_384
        raw = bytearray()
        async for chunk in request.stream():
            raw.extend(chunk)
            if len(raw) > maximum:
                raise CopilotServiceError('copilot_request_too_large', 'The Copilot request is too large.', status_code=413, recoverable=False)
        try:
            payload = CopilotPlanRequest.model_validate(json.loads(raw))
        except (json.JSONDecodeError, UnicodeDecodeError, ValidationError, TypeError) as exc:
            raise CopilotServiceError('copilot_request_invalid', 'The Copilot request is invalid.', status_code=422, recoverable=False) from exc
        return await service.plan(uid=principal.uid, request=payload)
    except CopilotServiceError as exc:
        return JSONResponse(status_code=exc.status_code, content=exc.response_body())
