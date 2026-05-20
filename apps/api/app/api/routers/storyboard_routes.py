"""
Storyboard pipeline API routes.

26 endpoints for:
- Project initialization and management
- Foundation phase (script, storyboard)
- User approval checkpoints
- Production phase (images, videos, lipsync, stitching)
- Post-generation (scoring, completion)

Phase 1: All endpoints return status/results, actual processing happens via Celery in Phase 2.
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field

from app.services.storyboard_pipeline_service import (
    StoryboardPipelineService,
    StoryboardWorkflowState,
)
from app.services.voice_preview_service import normalize_storyboard_tts_literals
from app.services.avatar_product_tts_catalog import list_storyboard_tts_catalog, resolve_storyboard_gemini_language

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/storyboard", tags=["storyboard"])


# ===== REQUEST/RESPONSE MODELS =====


class InitializeProjectRequest(BaseModel):
    """Request to initialize a new storyboard project."""

    ad_category: str = Field(..., description="One of 7 categories")
    business_brief: str = Field(..., description="Business context and objectives")
    platform: str = Field(..., description="Target platform (e.g., instagram_reels)")
    language: str = Field("en", description="Script language code")
    tone: str = Field("casual", description="Tone of the ad")
    avatar_id: str | None = Field(None, description="Pre-selected avatar ID")
    avatar_name: str | None = Field(None, description="Pre-selected avatar display name")
    creation_mode: str | None = Field(None, description="Creation mode (avatar|storyboard)")
    production_path: str | None = Field(None, description="Production path (ai_avatar|storyboard)")
    product_image_url: str | None = Field(None, description="Primary product reference image")
    product_reference_images: list[str] = Field(default_factory=list, description="Product reference images")
    avatar_reference_images: list[str] = Field(default_factory=list, description="Avatar reference images")
    target_ad_duration_seconds: int = Field(15, description="Creative target duration (10|15|20|30)")


class GenerateScriptRequest(BaseModel):
    """Request to generate script."""

    user_prompt: str | None = Field(None, description="Optional user custom prompt")


class ApproveScriptRequest(BaseModel):
    """Request to approve generated script."""

    confirmation: bool = Field(..., description="Must be true to proceed")


class GenerateStoryboardRequest(BaseModel):
    """Request to generate storyboard from script."""

    confirmation: bool = Field(..., description="Must be true to proceed")


class ApproveSceneRequest(BaseModel):
    """Request to approve a single scene."""

    user_approved: bool = Field(True, description="Scene approved?")
    user_feedback: str | None = Field(None, description="Optional feedback")


class RegenerateSceneRequest(BaseModel):
    """Request to regenerate a scene."""

    reason: str | None = Field(None, description="Why regenerate")


class UpdateSceneRequest(BaseModel):
    dialogue: str | None = None
    voice_line: str | None = None
    tts_text: str | None = None
    script_line: str | None = None
    narration: str | None = None
    spoken_line: str | None = None
    visual_description: str | None = None
    shot_type: str | None = None
    mood: str | None = None
    environment: str | None = None
    avatar_action: str | None = None
    duration_seconds: int | None = None


class GenerateVoicePreviewRequest(BaseModel):
    """Request to generate voice preview."""

    voice: str = Field(..., description="Voice name (e.g., 'Kore')")
    language_code: str = Field("English (India)", description="Language for voice")
    preview_text: str | None = Field(None, description="Optional short preview text")
    style_instructions: str | None = Field(None, description="Optional delivery/style instructions")


class SelectVoiceRequest(BaseModel):
    """Request to select a voice for the project."""

    voice: str = Field(..., description="Selected voice name")
    language_code: str = Field("English (India)", description="Language for voice")


class ProductionSettingsRequest(BaseModel):
    selected_video_model_key: str = Field(..., description="ltx_23_fast | seedance_v1 | kling_standard | kling_4k")
    selected_ad_duration_seconds: int = Field(..., description="10 | 15 | 20 | 30")


class CreateVariationRequest(BaseModel):
    """Request to create a variation of the project."""

    variation_type: str = Field(..., description="Type: new_avatar | new_hook | new_language")
    avatar_id: str | None = Field(None, description="For new_avatar variation")
    hook_override: str | None = Field(None, description="For new_hook variation")
    language: str | None = Field(None, description="For new_language variation")


# ===== HELPER FUNCTION =====


def get_current_user_id(x_user_id: str = Header(...)) -> str:
    """Extract user ID from header."""
    if not x_user_id:
        raise HTTPException(status_code=401, detail="X-User-ID header required")
    return x_user_id


# ===== PROJECT INITIALIZATION & MANAGEMENT =====


@router.post("/initialize", summary="Initialize new storyboard project")
async def initialize_project(
    request: InitializeProjectRequest,
    user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """
    Initialize a new storyboard ad project.

    Returns project ID and workflow state.
    """
    try:
        service = StoryboardPipelineService()
        result = service.initialize_project(
            user_id=user_id,
            ad_category=request.ad_category,
            business_brief=request.business_brief,
            platform=request.platform,
            language=request.language,
            tone=request.tone,
            avatar_id=request.avatar_id,
            avatar_name=request.avatar_name,
            creation_mode=request.creation_mode,
            production_path=request.production_path,
            product_image_url=request.product_image_url,
            product_reference_images=request.product_reference_images,
            avatar_reference_images=request.avatar_reference_images,
            target_ad_duration_seconds=request.target_ad_duration_seconds,
        )

        logger.info("project_initialized", extra={"project_id": result["project_id"], "user_id": user_id})
        return {
            "status": "success",
            "project_id": result["project_id"],
            "workflow_state": result["workflow_state"],
            "created_at": result["created_at"],
        }
    except Exception as e:
        logger.error("project_initialization_failed", extra={"error": str(e)})
        raise HTTPException(status_code=400, detail=str(e))

@router.get("", summary="List user's storyboard projects")
async def list_projects(
    limit: int = 50,
    user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """
    List all storyboard projects for the current user.
    
    Returns project summaries with status and creation date.
    """
    try:
        service = StoryboardPipelineService()
        projects = service.db.list_projects(user_id=user_id, limit=limit)
        
        # Map to response format
        project_list = [
            {
                "id": p.id,
                "adCategory": p.ad_category,
                "businessBrief": p.business_brief[:60] + "..." if len(p.business_brief) > 60 else p.business_brief,
                "workflowState": p.workflow_state,
                "productionStatus": p.production_status,
                "thumbnailUrl": p.thumbnail_url,
                "createdAt": p.created_at.isoformat() if p.created_at else None,
                "completedAt": p.completed_at.isoformat() if p.completed_at else None,
            }
            for p in projects
        ]
        
        logger.info("projects_listed", extra={"user_id": user_id, "count": len(project_list)})
        return {
            "status": "success",
            "projects": project_list,
            "total": len(project_list),
        }
    except Exception as e:
        logger.error("list_projects_failed", extra={"error": str(e)})
        raise HTTPException(status_code=400, detail=str(e))

        logger.error("project_initialization_failed", extra={"error": str(e)})
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{project_id}", summary="Get project details")
async def get_project(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """Get detailed project information."""
    try:
        service = StoryboardPipelineService()
        project = service.get_project(project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        return {"status": "success", "project": project}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("get_project_failed", extra={"project_id": project_id, "error": str(e)})
        raise HTTPException(status_code=400, detail=str(e))


# ===== FOUNDATION PHASE =====


@router.post("/{project_id}/generate-script", summary="Generate script")
async def generate_script(
    project_id: str,
    request: GenerateScriptRequest | None = None,
    user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """
    Generate script for the project (Phase 1: queues task).

    This is a free operation. Returns task status.
    """
    try:
        service = StoryboardPipelineService()
        # Fetch project to get stored values
        project = service.get_project(project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")

        result = service.generate_script(
            project_id=project_id,
            user_id=user_id,
            business_brief=project['business_brief'],
            platform=project['platform'],
            language=project['language'],
            tone=project['tone'],
        )
        return {"status": "success", "result": result}
    except Exception as e:
        logger.error("script_generation_failed", extra={"project_id": project_id, "error": str(e)})
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{project_id}/script", summary="Get generated script")
async def get_script(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """Get the generated/current script."""
    try:
        service = StoryboardPipelineService()
        project = service.get_project(project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        return {
            "status": "success",
            "display_script": project["display_script"],
            "workflow_state": project["workflow_state"],
        }
    except HTTPException:
        raise
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{project_id}/approve-script", summary="Approve script checkpoint")
async def approve_script(
    project_id: str,
    request: ApproveScriptRequest,
    user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """Approve script and move to storyboard generation."""
    if not request.confirmation:
        raise HTTPException(status_code=400, detail="Confirmation required")

    try:
        service = StoryboardPipelineService()
        result = service.approve_script(project_id, user_id)
        return {"status": "success", "result": result}
    except Exception as e:
        logger.error("script_approval_failed", extra={"project_id": project_id, "error": str(e)})
        if "script_duration_mismatch" in str(e):
            raise HTTPException(
                status_code=400,
                detail={
                    "error_code": "script_duration_mismatch",
                    "message": str(e).split("script_duration_mismatch:", 1)[-1].strip() or str(e),
                },
            )
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{project_id}/regenerate-script", summary="Regenerate script")
async def regenerate_script(
    project_id: str,
    request: RegenerateScriptRequest | None = None,
    user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """Regenerate script (free operation)."""
    try:
        service = StoryboardPipelineService()
        result = service.regenerate_script(
            project_id,
            user_id,
            target_ad_duration_seconds=request.target_ad_duration_seconds if request else None,
        )
        return {"status": "success", "result": result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/{project_id}/script", summary="Update script text")
async def update_script(
    project_id: str,
    request: UpdateScriptRequest,
    user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    try:
        service = StoryboardPipelineService()
        result = service.update_script(
            project_id=project_id,
            user_id=user_id,
            script_text=request.script_text,
            source=request.source,
        )
        return {"status": "success", "result": result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{project_id}/generate-storyboard", summary="Generate storyboard")
async def generate_storyboard(
    project_id: str,
    request: GenerateStoryboardRequest,
    user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """
    Generate visual storyboard from approved script (Phase 1: queues task).

    This is a free operation. Returns task status.
    """
    if not request.confirmation:
        raise HTTPException(status_code=400, detail="Confirmation required")

    try:
        service = StoryboardPipelineService()
        result = service.generate_storyboard(project_id, user_id)
        return {"status": "success", "result": result}
    except ValueError as e:
        logger.error("storyboard_generation_validation_failed", extra={"project_id": project_id, "error": str(e)})
        raise HTTPException(status_code=400, detail=f"Validation error: {str(e)}")
    except Exception as e:
        logger.error("storyboard_generation_failed", extra={"project_id": project_id, "error": str(e), "error_type": type(e).__name__})
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


@router.get("/{project_id}/storyboard", summary="Get storyboard scenes")
async def get_storyboard(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """Get generated storyboard scenes with all details."""
    try:
        from app.db.repositories.storyboard_repository import StoryboardRepository

        db = StoryboardRepository()
        project = db.get_project(project_id)
        scene_generation_id = str(getattr(project, "scene_generation_id", "") or "").strip() or None
        scenes = db.list_scenes(
            project_id,
            scene_generation_id=scene_generation_id,
            active_only=True,
        )
        logger.info(
            "storyboard_scenes_fetched",
            extra={
                "project_id": project_id,
                "scene_generation_id": scene_generation_id,
                "active_scene_count": len(scenes),
            },
        )
        return {
            "status": "success",
            "scene_generation_id": scene_generation_id,
            "scene_count": len(scenes),
            "scenes": [
                {
                    "id": s.id,
                    "scene_number": s.scene_number,
                    "scene_type": s.scene_type,
                    "spoken_line": s.spoken_line,
                    "dialogue": getattr(s, "dialogue", None),
                    "voice_line": getattr(s, "voice_line", None),
                    "tts_text": getattr(s, "tts_text", None),
                    "script_line": getattr(s, "script_line", None),
                    "narration": getattr(s, "narration", None),
                    "visual_description": s.visual_description,
                    "shot_type": s.shot_type,
                    "avatar_action": s.avatar_action,
                    "avatar_position": s.avatar_position,
                    "environment": s.environment,
                    "mood": s.mood,
                    "product_visibility": s.product_visibility,
                    "original_llm_duration_seconds": getattr(s, "original_llm_duration_seconds", None),
                    "normalized_scene_duration_seconds": getattr(s, "normalized_scene_duration_seconds", None),
                    "target_duration_seconds": getattr(s, "target_duration_seconds", None),
                    "duration_seconds": s.duration_seconds,
                    "base_image_url": s.base_image_url,
                    "generated_image_url": s.base_image_url,
                    "image_url": s.base_image_url,
                    "frame_url": s.base_image_url,
                    "base_image_prompt": s.base_image_prompt,
                    "state": s.state,
                    "user_approved": s.user_approved,
                }
                for s in scenes
            ],
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))



@router.post("/{project_id}/approve-storyboard", summary="Approve storyboard checkpoint")
async def approve_storyboard(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """Approve storyboard and move to production prep."""
    try:
        service = StoryboardPipelineService()
        result = service.approve_storyboard(project_id, user_id)
        return {"status": "success", "result": result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ===== SCENE-LEVEL OPERATIONS =====


@router.get("/{project_id}/scenes/{scene_id}", summary="Get scene details")
async def get_scene(
    project_id: str,
    scene_id: str,
    user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """Get details for a specific scene."""
    try:
        from app.db.repositories.storyboard_repository import StoryboardRepository

        db = StoryboardRepository()
        scene = db.get_scene(project_id, scene_id)
        if not scene:
            raise HTTPException(status_code=404, detail="Scene not found")

        return {"status": "success", "scene": scene.to_dict()}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{project_id}/scenes/{scene_id}/approve", summary="Approve scene")
async def approve_scene(
    project_id: str,
    scene_id: str,
    request: ApproveSceneRequest,
    user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """Approve or reject a scene."""
    try:
        from app.db.repositories.storyboard_repository import StoryboardRepository

        db = StoryboardRepository()
        db.update_scene(
            project_id,
            scene_id,
            user_approved=request.user_approved,
            user_feedback=request.user_feedback,
        )
        return {"status": "success", "user_approved": request.user_approved}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/{project_id}/scenes/{scene_id}", summary="Update scene fields")
async def update_scene(
    project_id: str,
    scene_id: str,
    request: UpdateSceneRequest,
    user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    try:
        from app.db.repositories.storyboard_repository import StoryboardRepository

        db = StoryboardRepository()
        project = db.get_project(project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        if str(project.user_id) != str(user_id):
            raise HTTPException(status_code=403, detail="Forbidden")
        scene = db.get_scene(project_id, scene_id)
        if not scene:
            raise HTTPException(status_code=404, detail="Scene not found")

        payload = request.model_dump(exclude_none=True)
        logger.info("storyboard_scene_update_started", extra={"project_id": project_id, "scene_id": scene_id})
        spoken = (
            str(payload.get("dialogue") or "").strip()
            or str(payload.get("voice_line") or "").strip()
            or str(payload.get("tts_text") or "").strip()
            or str(payload.get("spoken_line") or "").strip()
        )
        if spoken:
            payload["dialogue"] = spoken
            payload["voice_line"] = spoken
            payload["tts_text"] = spoken
            payload["script_line"] = spoken
            payload["spoken_line"] = spoken
            logger.info(
                "storyboard_scene_update_text_fields",
                extra={"project_id": project_id, "scene_id": scene_id, "text_length": len(spoken)},
            )
        if payload.get("duration_seconds") is not None:
            payload["normalized_scene_duration_seconds"] = int(payload["duration_seconds"])

        updated = db.update_scene(project_id, scene_id, **payload)
        logger.info("storyboard_scene_update_completed", extra={"project_id": project_id, "scene_id": scene_id})
        return {"status": "success", "scene": updated.to_dict() if updated else None}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{project_id}/scenes/{scene_id}/regenerate", summary="Regenerate scene")
async def regenerate_scene(
    project_id: str,
    scene_id: str,
    request: RegenerateSceneRequest | None = None,
    user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """Regenerate a single scene independently."""
    try:
        service = StoryboardPipelineService()
        result = service.regenerate_scene(project_id, scene_id, user_id)
        return {"status": "success", "result": result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{project_id}/scenes/{scene_id}/regenerate-image", summary="Regenerate scene image")
async def regenerate_scene_image(
    project_id: str,
    scene_id: str,
    user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """Regenerate base image for a single scene only."""
    try:
        service = StoryboardPipelineService()
        result = service.regenerate_scene_image(
            project_id=project_id,
            scene_id=scene_id,
            user_id=user_id,
            model_tier="fast",
        )
        return {"status": "success", "result": result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ===== PRODUCTION PHASE =====


@router.post("/{project_id}/generate-images", summary="Generate base images")
async def generate_images(
    project_id: str,
    request: GenerateStoryboardRequest,
    user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """
    Generate base images for all scenes.

    Expensive operation. Requires confirmation and available credits.
    """
    try:
        service = StoryboardPipelineService()

        # If confirmation not provided, return estimate
        if not request.confirmation:
            estimate = service.get_credit_estimate(project_id, "generate_base_images")
            return {
                "status": "estimate_required",
                "credit_estimate": {
                    "cost_credits": estimate.cost_credits,
                    "can_afford": estimate.can_afford,
                    "available_credits": estimate.available_credits,
                    "description": estimate.description,
                },
                "message": "Credit estimate provided. Set confirmation=true to proceed.",
            }

        # Launch image generation
        result = service.generate_base_images(project_id, user_id, model_tier="fast")
        return {"status": "success", "result": result}
    except ValueError as e:
        logger.error("image_generation_validation_failed", extra={"project_id": project_id, "error": str(e)})
        raise HTTPException(status_code=400, detail=f"Validation error: {str(e)}")
    except Exception as e:
        logger.error("image_generation_failed", extra={"project_id": project_id, "error": str(e), "error_type": type(e).__name__})
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


@router.post("/{project_id}/generate-character-reference-sheet", summary="Generate character reference sheet")
async def generate_character_reference_sheet(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    try:
        service = StoryboardPipelineService()
        result = service.generate_character_reference_sheet(project_id=project_id, user_id=user_id)
        return {"status": "success", "result": result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{project_id}/approve-images", summary="Approve base images checkpoint")
async def approve_images(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """Approve base images."""
    try:
        service = StoryboardPipelineService()
        result = service.approve_base_images(project_id, user_id)
        return {"status": "success", "result": result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{project_id}/voice-preview", summary="Generate voice preview")
async def voice_preview(
    project_id: str,
    request: GenerateVoicePreviewRequest,
    user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """
    Generate voice preview (first 2 lines) for voice selection.

    Costs credits only when generating a new preview; cached previews are free.
    """
    try:
        service = StoryboardPipelineService()
        logger.info(
            "storyboard_voice_preview_clicked",
            extra={"project_id": project_id, "user_id": user_id, "voice": request.voice, "language_code": request.language_code},
        )
        result = service.generate_voice_preview(
            project_id=project_id,
            user_id=user_id,
            voice=request.voice,
            language_code=request.language_code,
            preview_text=request.preview_text,
            style_instructions=request.style_instructions,
        )
        return {"status": "success", "result": result}
    except ValueError as e:
        logger.error("voice_preview_validation_failed", extra={"project_id": project_id, "error": str(e)})
        message = str(e)
        if "insufficient_credits" in message:
            raise HTTPException(
                status_code=402,
                detail={
                    "error_code": "insufficient_credits",
                    "message": "You need 1 credit to generate this voice preview.",
                    "recoverable": True,
                    "retry_action": "add_credits",
                },
            )
        raise HTTPException(status_code=400, detail=f"Validation error: {message}")
    except Exception as e:
        logger.error("voice_preview_failed", extra={"project_id": project_id, "error": str(e), "error_type": type(e).__name__})
        detail = str(e)
        if "balance" in detail.lower():
            raise HTTPException(status_code=502, detail="Voice preview provider failed because Fal balance is exhausted. Please check provider billing.")
        raise HTTPException(status_code=500, detail=f"Internal error: {detail}")


@router.get("/{project_id}/voices", summary="Get available voices")
async def get_available_voices(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """Get list of available voices for TTS."""
    try:
        catalog = list_storyboard_tts_catalog()
        return {"status": "success", **catalog}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{project_id}/select-voice", summary="Select voice for project")
async def select_voice(
    project_id: str,
    request: SelectVoiceRequest,
    user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """Select voice for the project."""
    try:
        from app.db.repositories.storyboard_repository import StoryboardRepository

        logger.info(
            "storyboard_production_start_requested",
            extra={"project_id": project_id, "user_id": user_id},
        )
        db = StoryboardRepository()
        project = db.get_project(project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        normalized_language = resolve_storyboard_gemini_language(request.language_code)
        normalized_voice, provider_language = normalize_storyboard_tts_literals(
            request.voice,
            normalized_language,
        )
        update_payload: dict[str, Any] = {
            "selected_voice": normalized_voice,
            "selected_tts_language_code": request.language_code,
            "selected_tts_language_label": normalized_language,
            "selected_tts_provider_language_code": provider_language,
            "selected_tts_voice_id": normalized_voice.lower(),
            "selected_tts_voice_name": normalized_voice,
            "selected_tts_provider_voice_name": normalized_voice,
        }
        updated_project = db.update_project(
            project_id,
            **update_payload,
        )
        production_result: dict[str, Any] | None = None
        update_payload["workflow_state"] = "voice_confirmed"
        db.update_project(
            project_id,
            workflow_state="voice_confirmed",
        )

        logger.info(
            "storyboard_project_status_updated",
            extra={"project_id": project_id, "workflow_state": update_payload.get("workflow_state", getattr(updated_project, "workflow_state", None))},
        )
        return {
            "status": "success",
            "voice": normalized_voice,
            "language_code": normalized_language,
            "provider_language_code": provider_language,
            "workflow_state": update_payload.get("workflow_state", project.workflow_state),
            "production_result": production_result,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{project_id}/production/settings", summary="Save production settings and estimate")
async def save_production_settings(
    project_id: str,
    request: ProductionSettingsRequest,
    user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    try:
        service = StoryboardPipelineService()
        result = service.save_production_settings(
            project_id=project_id,
            model_key=request.selected_video_model_key,
            duration_seconds=request.selected_ad_duration_seconds,
        )
        project = service.get_project(project_id)
        return {"status": "success", "project": project, "estimate": result["estimate"]}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/{project_id}/production/estimate", summary="Get production estimate")
async def get_production_estimate(
    project_id: str,
    model_key: str,
    duration_seconds: int,
    user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    try:
        service = StoryboardPipelineService()
        estimate = service.calculate_storyboard_production_estimate(
            project_id=project_id,
            model_key=model_key,
            duration_seconds=duration_seconds,
        )
        return {"status": "success", "estimate": estimate}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/{project_id}/production/start", summary="Start storyboard production")
async def start_storyboard_production(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """Start (or retry) storyboard production after voice selection."""
    service = StoryboardPipelineService()
    logger.info("storyboard_production_start_requested", extra={"project_id": project_id, "user_id": user_id})
    try:
        result = service.start_production(project_id=project_id, user_id=user_id, force=False)
        logger.info("storyboard_production_task_queued", extra={"project_id": project_id, "result": result})
        return {"status": "success", **result}
    except ValueError as exc:
        logger.error("storyboard_production_preflight_failed", extra={"project_id": project_id, "error": str(exc)})
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        logger.error("storyboard_production_start_failed", extra={"project_id": project_id, "error": str(exc)})
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


@router.post("/{project_id}/generate-full-audio", summary="Generate full TTS audio")
async def generate_full_audio(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """
    Generate full TTS audio for the project.

    Uses the selected voice to create complete audio track.
    """
    try:
        service = StoryboardPipelineService()
        project = service.db.get_project(project_id)

        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        if not project.selected_voice:
            raise HTTPException(status_code=400, detail="No voice selected. Call select-voice first.")

        result = service.generate_full_audio(
            project_id=project_id,
            user_id=user_id,
            selected_voice=project.selected_voice,
        )
        return {"status": "success", "result": result}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("full_audio_generation_failed", extra={"project_id": project_id, "error": str(e)})
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{project_id}/apply-lipsync", summary="Apply lipsync to videos")
async def apply_lipsync(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """
    Apply lipsync to videos if required by category.

    Conditional operation - only applies to avatar-based categories.
    """
    try:
        service = StoryboardPipelineService()
        result = service.apply_lipsync_if_required(project_id, user_id)
        return {"status": "success", "result": result}
    except Exception as e:
        logger.error("lipsync_failed", extra={"project_id": project_id, "error": str(e)})
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{project_id}/generate-videos", summary="Generate scene videos")
async def generate_videos(
    project_id: str,
    request: GenerateStoryboardRequest,
    user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """
    Generate videos for all approved scenes.

    Expensive operation. Requires confirmation and available credits.
    """
    try:
        service = StoryboardPipelineService()

        # If confirmation not provided, return estimate
        if not request.confirmation:
            estimate = service.get_credit_estimate(project_id, "generate_videos")
            return {
                "status": "estimate_required",
                "credit_estimate": {
                    "cost_credits": estimate.cost_credits,
                    "can_afford": estimate.can_afford,
                    "available_credits": estimate.available_credits,
                    "description": estimate.description,
                },
                "message": "Credit estimate provided. Set confirmation=true to proceed.",
            }

        # Launch video generation
        result = service.generate_videos(project_id, user_id)
        return {"status": "success", "result": result}
    except ValueError as e:
        logger.error("video_generation_validation_failed", extra={"project_id": project_id, "error": str(e)})
        raise HTTPException(status_code=400, detail=f"Validation error: {str(e)}")
    except Exception as e:
        logger.error("video_generation_failed", extra={"project_id": project_id, "error": str(e), "error_type": type(e).__name__})
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


@router.post("/{project_id}/generate-final-video", summary="Stitch final video")
async def generate_final_video(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """Stitch and finalize the video."""
    try:
        service = StoryboardPipelineService()
        result = service.stitch_final_ad(project_id, user_id)
        return {"status": "success", "result": result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{project_id}/approve-final-video", summary="Approve final video")
async def approve_final_video(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """Approve final video."""
    try:
        from app.db.repositories.storyboard_repository import StoryboardRepository

        db = StoryboardRepository()
        db.update_project(
            project_id,
            workflow_state=StoryboardWorkflowState.COMPLETED,
        )
        return {"status": "success", "workflow_state": StoryboardWorkflowState.COMPLETED}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ===== VARIATIONS & RECOVERY =====


@router.post("/{project_id}/retry-failed-scenes", summary="Retry failed scenes")
async def retry_failed_scenes(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """Retry generation for failed scenes (idempotent)."""
    try:
        service = StoryboardPipelineService()
        result = service.retry_failed_scenes(project_id, user_id)
        return {"status": "success", "result": result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{project_id}/create-variation", summary="Create project variation")
async def create_variation(
    project_id: str,
    request: CreateVariationRequest,
    user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """Create a variation of the project (reuses approved assets)."""
    try:
        service = StoryboardPipelineService()
        result = service.create_variation(
            project_id=project_id,
            user_id=user_id,
            variation_type=request.variation_type,
        )
        return {"status": "success", "result": result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ===== CREDIT & ESTIMATE =====


@router.get("/{project_id}/credit-estimate", summary="Get credit estimate")
async def get_credit_estimate(
    project_id: str,
    operation: str,
    user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """Get credit cost estimate for next operation."""
    try:
        service = StoryboardPipelineService()
        estimate = service.get_credit_estimate(project_id, operation)

        return {
            "status": "success",
            "estimate": {
                "operation": estimate.operation,
                "cost_credits": estimate.cost_credits,
                "description": estimate.description,
                "can_afford": estimate.can_afford,
                "available_credits": estimate.available_credits,
            },
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
class RegenerateScriptRequest(BaseModel):
    target_ad_duration_seconds: int | None = Field(None, description="Creative target duration (10|15|20|30)")


class UpdateScriptRequest(BaseModel):
    script_text: str = Field(..., description="Updated script text")
    source: str = Field("manual_edit", description="Edit source marker")
