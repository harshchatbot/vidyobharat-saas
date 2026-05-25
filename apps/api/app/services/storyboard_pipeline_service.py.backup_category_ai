"""
Storyboard pipeline service - main orchestrator.

Coordinates the entire storyboard pipeline:
- Foundation phase (script, storyboard generation - free)
- User approval checkpoints (4 stages)
- Production phase (image gen, video gen, lipsync, stitching - expensive)
- Post-generation (scoring, completion)

This is the Phase 1 skeleton - methods return NotImplemented or basic stubs.
Full implementation happens in Phase 2.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from app.core.config import get_settings
from app.db.firestore_utils import utcnow
from app.db.repositories.storyboard_repository import StoryboardRepository
from app.recipes.storyboard_video import AdCategory, CREDIT_COSTS, MODEL_ROUTING_BY_CATEGORY
from app.services.credit_service import CreditService
from app.services.emotion_tagging_service import EmotionTaggingService
from app.services.quality_score_service import QualityScoreService
from app.services.script_generation_service import ScriptGenerationService
from app.services.storyboard_generation_service import StoryboardGenerationService
from app.services.voice_preview_service import normalize_storyboard_tts_literals
from app.services.voice_preview_service import VoicePreviewService
from app.services.avatar_service import AvatarService, resolve_avatar_storage_url
from app.services.avatar_reference_registry import resolve_golden_avatar_references
from app.services.fal_image_service import FalImageService
from app.services.avatar_product_tts_catalog import resolve_storyboard_gemini_language

logger = logging.getLogger(__name__)

STORYBOARD_VIDEO_QUALITY_MAP: dict[str, dict[str, Any]] = {
    "ltx_23_fast": {"quality_label": "Budget", "model_label": "LTX 2.3", "time_label": "1-3 minutes"},
    "seedance_v1": {"quality_label": "Balanced", "model_label": "Seedance v1", "time_label": "2-4 minutes"},
    "kling_standard": {"quality_label": "Best Quality", "model_label": "Kling Standard", "time_label": "3-6 minutes"},
    "kling_4k": {"quality_label": "Premium", "model_label": "Kling 4K", "time_label": "5-10 minutes"},
}

STORYBOARD_MODEL_SCENE_CREDITS: dict[str, int] = {
    "ltx_23_fast": 10,
    "seedance_v1": 15,
    "kling_standard": 25,
    "kling_4k": 45,
}


def _normalize_storyboard_video_quality_model(raw_model_key: str | None) -> tuple[str, bool]:
    raw = str(raw_model_key or "").strip().lower()
    if raw in {"kling_standard"}:
        return "kling_standard", False
    if raw in {"kling_4k", "kling_premium"}:
        return "kling_4k", raw != "kling_4k"
    if raw in {"ltx_23_fast", "seedance_v1"}:
        return raw, False
    # Storyboard default fallback should be Kling Standard when unsupported/missing.
    return "kling_standard", bool(raw)

_STORYBOARD_AVATAR_REFERENCE_FALLBACKS: dict[str, list[str]] = {
    "chitrakala": [
        "gs://rangmanch-ai-backend.firebasestorage.app/avatars/chitrakala/avatar_chitrakala_front1.jpg",
        "gs://rangmanch-ai-backend.firebasestorage.app/avatars/chitrakala/avatar_chitrakala_desk5.png",
    ],
    "charulata": [
        "gs://rangmanch-ai-backend.firebasestorage.app/avatars/charulata/avtaar_charulata.jpeg",
    ],
}


def _resolve_storyboard_avatar_reference_images(*, avatar_id: str | None, avatar_name: str | None, user_id: str, existing: list[str] | None) -> list[str]:
    golden = resolve_golden_avatar_references(avatar_id=avatar_id, avatar_name=avatar_name, limit=3)
    if golden:
        return golden

    normalized_existing = [resolve_avatar_storage_url(url) for url in list(existing or []) if str(url).strip()]
    if normalized_existing:
        return list(dict.fromkeys([url for url in normalized_existing if url]))

    resolved: list[str] = []
    normalized_avatar_id = str(avatar_id or "").strip()
    normalized_avatar_name = str(avatar_name or "").strip().lower()
    if normalized_avatar_id:
        try:
            avatar = AvatarService().get_avatar(normalized_avatar_id, user_id=user_id)
            if avatar:
                variants = list(getattr(avatar, "reference_image_variants", []) or [])
                for item in variants:
                    if isinstance(item, dict):
                        maybe_url = str(item.get("url") or "").strip()
                    else:
                        maybe_url = str(getattr(item, "url", "") or "").strip()
                    if maybe_url:
                        resolved.append(resolve_avatar_storage_url(maybe_url))
                for item in list(getattr(avatar, "reference_images", []) or []):
                    maybe_url = str(item or "").strip()
                    if maybe_url:
                        resolved.append(resolve_avatar_storage_url(maybe_url))
                primary = str(getattr(avatar, "primary_image", "") or "").strip()
                if primary:
                    resolved.insert(0, resolve_avatar_storage_url(primary))
        except Exception:
            logger.warning(
                "storyboard_avatar_reference_resolution_failed",
                extra={"avatar_id": normalized_avatar_id, "user_id": user_id},
                exc_info=True,
            )

    if not resolved:
        fallback_key = normalized_avatar_id.lower() or normalized_avatar_name
        fallback = _STORYBOARD_AVATAR_REFERENCE_FALLBACKS.get(fallback_key, [])
        resolved.extend(resolve_avatar_storage_url(url) for url in fallback)

    return list(dict.fromkeys([url for url in resolved if url]))

# ===== WORKFLOW STATES =====


class StoryboardWorkflowState:
    """State machine for storyboard pipeline."""

    INITIALIZED = "initialized"
    SCRIPT_AWAITING_APPROVAL = "script_awaiting_approval"
    SCRIPT_APPROVED = "script_approved"
    STORYBOARD_AWAITING_APPROVAL = "storyboard_awaiting_approval"
    STORYBOARD_APPROVED = "storyboard_approved"
    IMAGES_GENERATING = "images_generating"
    IMAGES_AWAITING_APPROVAL = "images_awaiting_approval"
    IMAGES_APPROVED = "images_approved"
    PRODUCTION_STARTING = "production_starting"
    PRODUCTION_IN_PROGRESS = "production_in_progress"
    PRODUCTION_COMPLETED = "production_completed"
    PRODUCTION_FAILED = "production_failed"
    FINAL_AWAITING_APPROVAL = "final_awaiting_approval"
    COMPLETED = "completed"
    FAILED = "failed"


class SceneState:
    """State machine for individual scenes."""

    PENDING = "pending"
    GENERATING = "generating"
    AWAITING_APPROVAL = "awaiting_approval"
    APPROVED = "approved"
    REJECTED = "rejected"
    VIDEO_GENERATING = "video_generating"
    VIDEO_GENERATED = "video_generated"
    LIPSYNC_APPLYING = "lipsync_applying"
    LIPSYNC_APPLIED = "lipsync_applied"
    FAILED = "failed"
    COMPLETED = "completed"


@dataclass(frozen=True)
class CreditEstimate:
    """Credit cost estimate for next operation."""

    operation: str
    cost_credits: int
    description: str
    can_afford: bool
    available_credits: int


@dataclass(frozen=True)
class PipelineCheckpoint:
    """Result of reaching a user approval checkpoint."""

    checkpoint_name: str
    workflow_state: str
    ready_to_proceed: bool
    approval_items: list[dict[str, Any]]
    credit_estimate: CreditEstimate


class StoryboardPipelineService:
    """
    Main orchestrator for storyboard pipeline.

    Phase 1 Implementation:
    - Initialize projects and apply foundation services
    - Create checkpoint results (not full approval logic)
    - Skeleton methods for Phase 2 implementation
    """

    def __init__(self) -> None:
        self.settings = get_settings()
        self.db = StoryboardRepository()
        self.credit_service = CreditService()
        self.script_gen_service = ScriptGenerationService()
        self.storyboard_gen_service = StoryboardGenerationService()
        self.emotion_tagging_service = EmotionTaggingService()
        self.quality_score_service = QualityScoreService()
        self.voice_preview_service = VoicePreviewService()

    # ===== INITIALIZATION & PROJECT MANAGEMENT =====

    def initialize_project(
        self,
        user_id: str,
        ad_category: str,
        business_brief: str,
        platform: str,
        language: str = "en",
        tone: str = "casual",
        avatar_id: str | None = None,
        avatar_name: str | None = None,
        creation_mode: str | None = None,
        production_path: str | None = None,
        product_image_url: str | None = None,
        product_reference_images: list[str] | None = None,
        avatar_reference_images: list[str] | None = None,
        target_ad_duration_seconds: int = 15,
    ) -> dict[str, Any]:
        """
        Initialize a new storyboard project.

        Returns project metadata with ID and initial state.
        """
        normalized_avatar_id = str(avatar_id or "").strip() or None
        normalized_avatar_name = str(avatar_name or "").strip() or None
        normalized_creation_mode = str(creation_mode or "").strip().lower() or None
        normalized_production_path = str(production_path or "").strip().lower() or None
        logger.info(
            "storyboard_initialize_duration_received",
            extra={"user_id": user_id, "target_ad_duration_seconds": target_ad_duration_seconds},
        )
        normalized_target_duration = int(target_ad_duration_seconds or 15)
        if normalized_target_duration not in {10, 15, 20, 30}:
            normalized_target_duration = 15
        logger.info(
            "storyboard_initialize_duration_normalized",
            extra={"user_id": user_id, "normalized_target_duration_seconds": normalized_target_duration},
        )
        resolved_avatar_refs = _resolve_storyboard_avatar_reference_images(
            avatar_id=normalized_avatar_id,
            avatar_name=normalized_avatar_name,
            user_id=user_id,
            existing=[str(url).strip() for url in list(avatar_reference_images or []) if str(url).strip()],
        )

        logger.info(
            "storyboard_initialize_avatar_resolution",
            extra={
                "user_id": user_id,
                "selected_avatar_id": normalized_avatar_id,
                "selected_avatar_name": normalized_avatar_name,
                "creation_mode": normalized_creation_mode,
                "production_path": normalized_production_path,
                "resolved_avatar_refs_count": len(resolved_avatar_refs),
                "resolved_avatar_refs_urls": resolved_avatar_refs,
            },
        )

        project = self.db.create_project(
            user_id=user_id,
            ad_category=ad_category,
            workflow_state=StoryboardWorkflowState.INITIALIZED,
            business_brief=business_brief,
            platform=platform,
            language=language,
            tone=tone,
            avatar_id=normalized_avatar_id,
            avatar_name=normalized_avatar_name,
            creation_mode=normalized_creation_mode,
            production_path=normalized_production_path,
            product_image_url=(str(product_image_url or "").strip() or None),
            product_reference_images=[str(url).strip() for url in list(product_reference_images or []) if str(url).strip()],
            avatar_reference_images=resolved_avatar_refs,
            selected_video_model_key="kling_standard",
            selected_video_quality_label=STORYBOARD_VIDEO_QUALITY_MAP.get("kling_standard", {}).get("quality_label", "Best Quality"),
            selected_ad_duration_seconds=normalized_target_duration,
            target_ad_duration_seconds=normalized_target_duration,
            selected_duration_label=f"{normalized_target_duration}s",
            requested_ad_duration_seconds=normalized_target_duration,
            actual_estimated_output_duration_seconds=normalized_target_duration,
            credits_estimated=0,
            credits_consumed=0,
        )

        logger.info(
            "storyboard_project_initialized",
            extra={
                "project_id": project.id,
                "user_id": user_id,
                "ad_category": ad_category,
            },
        )
        logger.info(
            "storyboard_project_model_fields_validated",
            extra={
                "project_id": project.id,
                "target_ad_duration_seconds": getattr(project, "target_ad_duration_seconds", None),
                "selected_duration_label": getattr(project, "selected_duration_label", None),
            },
        )

        return {
            "project_id": project.id,
            "workflow_state": project.workflow_state,
            "ad_category": project.ad_category,
            "created_at": project.created_at.isoformat(),
        }

    def get_project(self, project_id: str) -> dict[str, Any] | None:
        """Get project details."""
        project = self.db.get_project(project_id)
        if not project:
            return None
        self.repair_scene_durations_for_target(project_id=project_id, project=project)
        project = self.db.get_project(project_id) or project
        # State integrity repair: too-long/too-short scripts must not stay script_approved.
        duration_status = str(getattr(project, "script_duration_status", "") or "").strip().lower()
        if str(project.workflow_state or "").strip().lower() == StoryboardWorkflowState.SCRIPT_APPROVED and duration_status and duration_status != "fits":
            logger.warning(
                "storyboard_script_state_repaired_due_to_duration_mismatch",
                extra={"project_id": project_id, "script_duration_status": duration_status},
            )
            project = self.db.update_project(
                project_id,
                workflow_state=StoryboardWorkflowState.SCRIPT_AWAITING_APPROVAL,
                script_approved_at=None,
            ) or project
        scene_generation_id = str(getattr(project, "scene_generation_id", "") or "").strip() or None
        scenes = self.db.list_scenes(
            project_id,
            scene_generation_id=scene_generation_id,
            active_only=True,
        )

        return {
            "id": project.id,
            "user_id": project.user_id,
            "ad_category": project.ad_category,
            "workflow_state": project.workflow_state,
            "business_brief": project.business_brief,
            "platform": project.platform,
            "language": project.language,
            "tone": project.tone,
            "avatar_id": project.avatar_id,
            "avatar_name": project.avatar_name,
            "creation_mode": project.creation_mode,
            "production_path": project.production_path,
            "product_image_url": project.product_image_url,
            "product_reference_images": list(project.product_reference_images or []),
            "avatar_reference_images": list(project.avatar_reference_images or []),
            "character_reference_sheet_url": project.character_reference_sheet_url,
            "character_reference_sheet_prompt": project.character_reference_sheet_prompt,
            "character_reference_sheet_status": getattr(project, "character_reference_sheet_status", None),
            "character_reference_sheet_fallback_to_golden_refs": bool(getattr(project, "character_reference_sheet_fallback_to_golden_refs", False)),
            "scene_generation_id": scene_generation_id,
            "display_script": project.display_script,
            "script_word_count": getattr(project, "script_word_count", None),
            "script_estimated_duration_seconds": getattr(project, "script_estimated_duration_seconds", None),
            "script_duration_status": getattr(project, "script_duration_status", None),
            "tts_script": project.tts_script,
            "selected_voice": project.selected_voice,
            "selected_tts_language_code": getattr(project, "selected_tts_language_code", None),
            "selected_tts_language_label": getattr(project, "selected_tts_language_label", None),
            "selected_tts_provider_language_code": getattr(project, "selected_tts_provider_language_code", None),
            "selected_tts_voice_id": getattr(project, "selected_tts_voice_id", None),
            "selected_tts_voice_name": getattr(project, "selected_tts_voice_name", None),
            "selected_tts_provider_voice_name": getattr(project, "selected_tts_provider_voice_name", None),
            "selected_video_quality_label": getattr(project, "selected_video_quality_label", None),
            "selected_video_model_key": getattr(project, "selected_video_model_key", None),
            "selected_ad_duration_seconds": getattr(project, "selected_ad_duration_seconds", 15),
            "target_ad_duration_seconds": getattr(project, "target_ad_duration_seconds", 15),
            "selected_duration_label": getattr(project, "selected_duration_label", "15s"),
            "requested_ad_duration_seconds": getattr(project, "requested_ad_duration_seconds", None),
            "actual_estimated_output_duration_seconds": getattr(project, "actual_estimated_output_duration_seconds", None),
            "production_credit_estimate": getattr(project, "production_credit_estimate", None),
            "production_estimated_time_label": getattr(project, "production_estimated_time_label", None),
            "credits_estimated": project.credits_estimated,
            "credits_consumed": project.credits_consumed,
            "final_video_url": project.final_video_url,
            "final_thumbnail_url": getattr(project, "final_thumbnail_url", None),
            "production_status": getattr(project, "production_status", None),
            "production_task_id": getattr(project, "production_task_id", None),
            "production_job_id": getattr(project, "production_job_id", None),
            "production_started_at": getattr(project, "production_started_at", None).isoformat() if getattr(project, "production_started_at", None) else None,
            "production_completed_at": getattr(project, "production_completed_at", None).isoformat() if getattr(project, "production_completed_at", None) else None,
            "production_error": getattr(project, "production_error", None),
            "qc_status": getattr(project, "qc_status", None),
            "package_status": getattr(project, "package_status", None),
            "image_generation_started_at": project.image_generation_started_at.isoformat() if project.image_generation_started_at else None,
            "scene_count": len(scenes),
            "scenes": [
                {
                    "id": scene.id,
                    "scene_number": scene.scene_number,
                    "scene_type": scene.scene_type,
                    "state": scene.state,
                    "spoken_line": scene.spoken_line,
                    "dialogue": getattr(scene, "dialogue", None),
                    "voice_line": getattr(scene, "voice_line", None),
                    "tts_text": getattr(scene, "tts_text", None),
                    "script_line": getattr(scene, "script_line", None),
                    "narration": getattr(scene, "narration", None),
                    "visual_description": scene.visual_description,
                    "shot_type": scene.shot_type,
                    "avatar_action": scene.avatar_action,
                    "avatar_position": scene.avatar_position,
                    "environment": scene.environment,
                    "mood": scene.mood,
                    "product_visibility": scene.product_visibility,
                    "original_llm_duration_seconds": getattr(scene, "original_llm_duration_seconds", None),
                    "normalized_scene_duration_seconds": getattr(scene, "normalized_scene_duration_seconds", None),
                    "target_duration_seconds": getattr(scene, "target_duration_seconds", None),
                    "duration_seconds": scene.duration_seconds,
                    "lipsync_this_scene": scene.lipsync_this_scene,
                    "base_image_url": scene.base_image_url,
                    "generated_image_url": scene.base_image_url,
                    "image_url": scene.base_image_url,
                    "frame_url": scene.base_image_url,
                    "base_image_prompt": scene.base_image_prompt,
                    "video_url": scene.video_url,
                    "lipsync_video_url": scene.lipsync_video_url,
                    "scene_video_status": getattr(scene, "scene_video_status", None),
                    "scene_video_url": getattr(scene, "scene_video_url", None) or scene.video_url,
                    "scene_video_error": getattr(scene, "scene_video_error", None),
                    "scene_video_metadata": getattr(scene, "scene_video_metadata", None),
                    "scene_video_started_at": getattr(scene, "scene_video_started_at", None).isoformat() if getattr(scene, "scene_video_started_at", None) else None,
                    "scene_video_completed_at": getattr(scene, "scene_video_completed_at", None).isoformat() if getattr(scene, "scene_video_completed_at", None) else None,
                    "lipsync_status": getattr(scene, "lipsync_status", None),
                    "lipsync_error": getattr(scene, "lipsync_error", None),
                    "final_scene_video_url": getattr(scene, "final_scene_video_url", None) or scene.lipsync_video_url or scene.video_url,
                    "user_approved": scene.user_approved,
                    "image_generation_started_at": scene.image_generation_started_at.isoformat() if scene.image_generation_started_at else None,
                }
                for scene in scenes
            ],
            "created_at": project.created_at.isoformat() if project.created_at else None,
            "updated_at": project.updated_at.isoformat() if project.updated_at else None,
        }

    def repair_scene_durations_for_target(self, *, project_id: str, project: Any | None = None) -> dict[str, Any]:
        project_obj = project or self.db.get_project(project_id)
        if not project_obj:
            return {"repaired": False, "reason": "project_not_found"}
        target = int(getattr(project_obj, "target_ad_duration_seconds", 15) or 15)
        scene_generation_id = str(getattr(project_obj, "scene_generation_id", "") or "").strip() or None
        scenes = sorted(
            self.db.list_scenes(project_id, scene_generation_id=scene_generation_id, active_only=True),
            key=lambda s: int(getattr(s, "scene_number", 0) or 0),
        )
        if not scenes:
            return {"repaired": False, "reason": "no_scenes"}
        total = int(sum(int(getattr(s, "duration_seconds", 0) or 0) for s in scenes))
        missing_meta = any(
            getattr(scene, "normalized_scene_duration_seconds", None) is None
            or getattr(scene, "target_duration_seconds", None) is None
            or getattr(scene, "original_llm_duration_seconds", None) is None
            for scene in scenes
        )
        if abs(total - target) <= 1 and not missing_meta:
            return {"repaired": False, "reason": "already_consistent"}

        scene_count = len(scenes)
        exact_map: dict[tuple[int, int], list[int]] = {
            (10, 2): [5, 5],
            (15, 2): [7, 8],
            (15, 3): [5, 5, 5],
            (20, 2): [10, 10],
            (20, 4): [5, 5, 5, 5],
            (30, 4): [7, 8, 7, 8],
            (30, 5): [6, 6, 6, 6, 6],
        }
        normalized = exact_map.get((target, scene_count))
        if not normalized:
            base = target // scene_count
            remainder = target - (base * scene_count)
            normalized = [base + (1 if idx < remainder else 0) for idx in range(scene_count)]

        for idx, (scene, value) in enumerate(zip(scenes, normalized), start=1):
            original = int(getattr(scene, "duration_seconds", 0) or 0)
            self.db.update_scene(
                project_id,
                scene.id,
                original_llm_duration_seconds=int(getattr(scene, "original_llm_duration_seconds", None) or original),
                normalized_scene_duration_seconds=int(value),
                target_duration_seconds=target,
                duration_seconds=int(value),
            )
            logger.info(
                "storyboard_scene_duration_repair_applied",
                extra={"project_id": project_id, "scene_id": scene.id, "scene_number": idx, "original": original, "normalized": int(value)},
            )
        return {"repaired": True, "scene_count": scene_count, "target_duration_seconds": target, "normalized": normalized}

    # ===== PHASE 1: FOUNDATION (FREE) =====

    def generate_script(
        self,
        project_id: str,
        user_id: str,
        business_brief: str,
        platform: str,
        language: str,
        tone: str,
    ) -> dict[str, Any]:
        """
        Generate initial script for the project.

        Phase 2: Launches Celery task for async script generation.
        """
        logger.info(
            "script_generation_requested",
            extra={
                "project_id": project_id,
                "ad_category": self.db.get_project(project_id).ad_category if self.db.get_project(project_id) else "unknown",
            },
        )

        # Launch Celery task
        from app.workers.storyboard_tasks import generate_script_task

        task = generate_script_task.apply_async(
            args=[
                project_id,
                user_id,
                business_brief,
                platform,
                language,
                tone,
            ],
            task_id=f"script_{project_id}_{generate_script_task.request.id if hasattr(generate_script_task, 'request') else ''}",
        )

        return {
            "project_id": project_id,
            "status": "queued",
            "task_id": task.id,
            "message": "Script generation task queued",
            "estimated_duration": "30-60 seconds",
        }

    def approve_script(self, project_id: str, user_id: str) -> dict[str, Any]:
        """Approve the generated script and move to storyboard generation."""
        project = self.db.get_project(project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")

        creation_mode = str(getattr(project, "creation_mode", "") or "").strip().lower()
        production_path = str(getattr(project, "production_path", "") or "").strip().lower()
        ad_category = str(getattr(project, "ad_category", "") or "").strip().lower()
        is_ai_avatar = production_path == "ai_avatar" or creation_mode == "avatar" or bool(getattr(project, "avatar_id", None))
        requires_product_reference = is_ai_avatar or ad_category == "product_demo_lifestyle"
        avatar_reference_images = [str(url).strip() for url in list(getattr(project, "avatar_reference_images", []) or []) if str(url).strip()]
        product_reference_images = [str(url).strip() for url in list(getattr(project, "product_reference_images", []) or []) if str(url).strip()]
        if not product_reference_images and getattr(project, "product_image_url", None):
            product_reference_images = [str(project.product_image_url).strip()]

        logger.info(
            "storyboard_script_approval_reference_validation",
            extra={
                "project_id": project_id,
                "avatar_id": getattr(project, "avatar_id", None),
                "avatar_name": getattr(project, "avatar_name", None),
                "creation_mode": creation_mode,
                "production_path": production_path,
                "avatar_reference_count": len(avatar_reference_images),
                "avatar_reference_urls": avatar_reference_images,
                "product_reference_count": len(product_reference_images),
            },
        )

        if is_ai_avatar and not avatar_reference_images:
            raise ValueError("Avatar reference images are required for AI Avatar storyboard generation.")
        if requires_product_reference and not product_reference_images:
            raise ValueError("Product reference image is required for this storyboard generation flow.")

        if not project.display_script:
            raise ValueError("No script to approve")
        target_duration = int(getattr(project, "target_ad_duration_seconds", 15) or 15)
        word_count = int(getattr(project, "script_word_count", 0) or 0)
        estimated_seconds = float(getattr(project, "script_estimated_duration_seconds", 0) or 0)
        word_ranges: dict[int, tuple[int, int]] = {
            10: (20, 28),
            15: (35, 45),
            20: (45, 60),
            30: (70, 85),
        }
        min_words, max_words = word_ranges.get(target_duration, (35, 45))
        lower_bound = target_duration * 0.8
        upper_bound = target_duration * 1.2
        script_duration_status = str(getattr(project, "script_duration_status", "") or "").strip().lower()
        if (
            script_duration_status != "fits"
            or word_count < min_words
            or word_count > max_words
            or (estimated_seconds > 0 and (estimated_seconds < lower_bound or estimated_seconds > upper_bound))
        ):
            raise ValueError(
                f"script_duration_mismatch: This script is estimated at {estimated_seconds or 'unknown'}s but your target is {target_duration}s. Please regenerate or shorten it before approving."
            )

        current_state = str(project.workflow_state or "").strip().lower()
        already_advanced_states = {
            StoryboardWorkflowState.STORYBOARD_AWAITING_APPROVAL,
            StoryboardWorkflowState.STORYBOARD_APPROVED,
            StoryboardWorkflowState.IMAGES_GENERATING,
            StoryboardWorkflowState.IMAGES_AWAITING_APPROVAL,
            StoryboardWorkflowState.IMAGES_APPROVED,
            StoryboardWorkflowState.PRODUCTION_STARTING,
            StoryboardWorkflowState.PRODUCTION_IN_PROGRESS,
            StoryboardWorkflowState.FINAL_AWAITING_APPROVAL,
            StoryboardWorkflowState.COMPLETED,
        }

        # Idempotency safety: never move workflow backwards if script approval is retried.
        if current_state in already_advanced_states:
            logger.info(
                "script_approval_noop_already_advanced",
                extra={"project_id": project_id, "user_id": user_id, "workflow_state": project.workflow_state},
            )
            return {"project_id": project_id, "workflow_state": project.workflow_state}

        self.db.update_project(
            project_id,
            workflow_state=StoryboardWorkflowState.SCRIPT_APPROVED,
        )

        logger.info(
            "script_approved",
            extra={"project_id": project_id, "user_id": user_id},
        )

        return {"project_id": project_id, "workflow_state": StoryboardWorkflowState.SCRIPT_APPROVED}

    def regenerate_script(self, project_id: str, user_id: str, target_ad_duration_seconds: int | None = None) -> dict[str, Any]:
        """Regenerate script (free operation)."""
        project = self.db.get_project(project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")
        normalized_target = int(target_ad_duration_seconds or getattr(project, "target_ad_duration_seconds", 15) or 15)
        if normalized_target not in {10, 15, 20, 30}:
            normalized_target = 15
        self.db.update_project(
            project_id,
            target_ad_duration_seconds=normalized_target,
            selected_ad_duration_seconds=normalized_target,
            selected_duration_label=f"{normalized_target}s",
            requested_ad_duration_seconds=normalized_target,
            workflow_state=StoryboardWorkflowState.SCRIPT_AWAITING_APPROVAL,
        )
        from app.workers.storyboard_tasks import generate_script_task
        task = generate_script_task.apply_async(
            args=[
                project_id,
                user_id,
                project.business_brief,
                project.platform,
                project.language,
                project.tone,
            ],
            task_id=f"script_regen_{project_id}_{int(time.time())}",
        )
        return {
            "project_id": project_id,
            "status": "queued",
            "task_id": task.id,
            "message": "Script regeneration task queued",
        }

    def update_script(
        self,
        *,
        project_id: str,
        user_id: str,
        script_text: str,
        source: str = "manual_edit",
    ) -> dict[str, Any]:
        project = self.db.get_project(project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")
        clean = str(script_text or "").strip()
        if not clean:
            raise ValueError("Script text cannot be empty")
        words = [w for w in clean.split() if w.strip()]
        word_count = len(words)
        estimated = round((word_count / 140.0) * 60.0, 1)
        target_duration = int(getattr(project, "target_ad_duration_seconds", 15) or 15)
        ranges = {10: (20, 28), 15: (35, 45), 20: (45, 60), 30: (70, 85)}
        min_words, max_words = ranges.get(target_duration, (35, 45))
        lower_bound = target_duration * 0.8
        upper_bound = target_duration * 1.2
        if word_count < min_words or estimated < lower_bound:
            status = "too_short"
        elif word_count > max_words or estimated > upper_bound:
            status = "too_long"
        else:
            status = "fits"
        next_state = StoryboardWorkflowState.SCRIPT_AWAITING_APPROVAL if status != "fits" else str(project.workflow_state or StoryboardWorkflowState.SCRIPT_AWAITING_APPROVAL)
        if str(next_state).lower() == StoryboardWorkflowState.SCRIPT_APPROVED and status != "fits":
            next_state = StoryboardWorkflowState.SCRIPT_AWAITING_APPROVAL
        self.db.update_project(
            project_id,
            display_script=clean,
            tts_script=clean,
            script_word_count=word_count,
            script_estimated_duration_seconds=estimated,
            script_duration_status=status,
            script_source=source,
            script_updated_at=utcnow(),
            workflow_state=next_state,
        )
        updated = self.db.get_project(project_id)
        return {
            "project_id": project_id,
            "workflow_state": getattr(updated, "workflow_state", next_state),
            "display_script": getattr(updated, "display_script", clean),
            "script_word_count": getattr(updated, "script_word_count", word_count),
            "script_estimated_duration_seconds": getattr(updated, "script_estimated_duration_seconds", estimated),
            "script_duration_status": getattr(updated, "script_duration_status", status),
        }

    def generate_storyboard(
        self,
        project_id: str,
        user_id: str,
    ) -> dict[str, Any]:
        """
        Generate storyboard from approved script.

        Phase 2: Launches Celery task for async storyboard generation.
        """
        project = self.db.get_project(project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")

        # Storyboard generation requires the script checkpoint to be approved.
        # If the script task already produced a display_script, we allow generation
        # once the user has approved (or the caller has already advanced state).
        if project.workflow_state == StoryboardWorkflowState.SCRIPT_AWAITING_APPROVAL:
            if not project.display_script:
                raise ValueError("Cannot approve script: missing display_script")
            self.db.update_project(
                project_id,
                workflow_state=StoryboardWorkflowState.SCRIPT_APPROVED,
            )
            project = self.db.get_project(project_id) or project

        # Idempotency: if storyboard has already been generated/advanced,
        # return a no-op success instead of surfacing a 400 to the UI.
        if project.workflow_state in {
            StoryboardWorkflowState.STORYBOARD_AWAITING_APPROVAL,
            StoryboardWorkflowState.STORYBOARD_APPROVED,
            StoryboardWorkflowState.IMAGES_GENERATING,
            StoryboardWorkflowState.IMAGES_AWAITING_APPROVAL,
            StoryboardWorkflowState.IMAGES_APPROVED,
            StoryboardWorkflowState.PRODUCTION_STARTING,
            StoryboardWorkflowState.PRODUCTION_IN_PROGRESS,
            StoryboardWorkflowState.FINAL_AWAITING_APPROVAL,
            StoryboardWorkflowState.COMPLETED,
        }:
            return {
                "project_id": project_id,
                "status": "already_generated",
                "workflow_state": project.workflow_state,
                "message": "Storyboard already generated for this project.",
            }

        if project.workflow_state != StoryboardWorkflowState.SCRIPT_APPROVED:
            raise ValueError(f"Cannot generate storyboard in state {project.workflow_state}")

        logger.info(
            "storyboard_generation_requested",
            extra={"project_id": project_id},
        )

        # Launch Celery task
        from app.workers.storyboard_tasks import generate_storyboard_task

        task = generate_storyboard_task.apply_async(
            args=[project_id, user_id],
            task_id=f"storyboard_{project_id}",
        )

        # Update workflow state to show generation in progress
        self.db.update_project(
            project_id,
            workflow_state=StoryboardWorkflowState.STORYBOARD_AWAITING_APPROVAL,
        )

        return {
            "project_id": project_id,
            "status": "queued",
            "task_id": task.id,
            "message": "Storyboard generation task queued",
            "estimated_duration": "30-60 seconds",
        }

    def approve_storyboard(self, project_id: str, user_id: str) -> dict[str, Any]:
        """Approve storyboard and move to production preparation."""
        project = self.db.get_project(project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")
        self.repair_scene_durations_for_target(project_id=project_id, project=project)
        project = self.db.get_project(project_id) or project
        scene_generation_id = str(getattr(project, "scene_generation_id", "") or "").strip() or None
        scenes = self.db.list_scenes(
            project_id,
            scene_generation_id=scene_generation_id,
            active_only=True,
        )
        target_duration = int(getattr(project, "target_ad_duration_seconds", 15) or 15)
        total_scene_duration = int(sum(float(getattr(scene, "duration_seconds", 0) or 0) for scene in scenes))
        tolerance_seconds = 1
        logger.info(
            "storyboard_scene_breakdown_approval_duration_check",
            extra={
                "project_id": project_id,
                "target_duration_seconds": target_duration,
                "total_scene_duration_seconds": total_scene_duration,
                "scene_count": len(scenes),
            },
        )
        if abs(total_scene_duration - target_duration) > tolerance_seconds:
            logger.warning(
                "storyboard_scene_breakdown_approval_blocked_duration_mismatch",
                extra={
                    "project_id": project_id,
                    "target_duration_seconds": target_duration,
                    "total_scene_duration_seconds": total_scene_duration,
                },
            )
            raise ValueError(
                f"scene_duration_mismatch: Scene durations total {total_scene_duration}s but target ad duration is {target_duration}s."
            )

        current_state = str(project.workflow_state or "").strip().lower()
        already_advanced_states = {
            StoryboardWorkflowState.IMAGES_GENERATING,
            StoryboardWorkflowState.IMAGES_AWAITING_APPROVAL,
            StoryboardWorkflowState.IMAGES_APPROVED,
            StoryboardWorkflowState.PRODUCTION_STARTING,
            StoryboardWorkflowState.PRODUCTION_IN_PROGRESS,
            StoryboardWorkflowState.FINAL_AWAITING_APPROVAL,
            StoryboardWorkflowState.COMPLETED,
        }

        # Idempotency safety: avoid backtracking to storyboard_approved.
        if current_state in already_advanced_states:
            logger.info(
                "storyboard_approval_noop_already_advanced",
                extra={"project_id": project_id, "user_id": user_id, "workflow_state": project.workflow_state},
            )
            return {"project_id": project_id, "workflow_state": project.workflow_state}

        self.db.update_project(
            project_id,
            workflow_state=StoryboardWorkflowState.STORYBOARD_APPROVED,
        )

        logger.info(
            "storyboard_approved",
            extra={"project_id": project_id, "user_id": user_id},
        )

        return {"project_id": project_id, "workflow_state": StoryboardWorkflowState.STORYBOARD_APPROVED}

    def regenerate_scene(self, project_id: str, scene_id: str, user_id: str) -> dict[str, Any]:
        """Regenerate a single scene (independent from full storyboard)."""
        return self.regenerate_scene_image(project_id=project_id, scene_id=scene_id, user_id=user_id, model_tier="fast")

    def regenerate_scene_image(
        self,
        *,
        project_id: str,
        scene_id: str,
        user_id: str,
        model_tier: str = "fast",
    ) -> dict[str, Any]:
        project = self.db.get_project(project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")
        scene = self.db.get_scene(project_id, scene_id)
        if not scene:
            raise ValueError(f"Scene {scene_id} not found in project {project_id}")

        estimate = self.get_credit_estimate(
            project_id=project_id,
            operation="generate_base_images",
            model_tier=model_tier,
        )
        if not estimate.can_afford:
            raise ValueError(f"Insufficient credits. Required: {estimate.cost_credits}, Available: {estimate.available_credits}")

        ensure_sheet = self._ensure_character_reference_sheet(project_id=project_id, user_id=user_id)
        refreshed_project = self.db.get_project(project_id)
        creation_mode = str(getattr(refreshed_project, "creation_mode", "") or "").strip().lower() if refreshed_project else ""
        production_path = str(getattr(refreshed_project, "production_path", "") or "").strip().lower() if refreshed_project else ""
        is_ai_avatar = production_path == "ai_avatar" or creation_mode == "avatar" or bool(getattr(refreshed_project, "avatar_id", None) if refreshed_project else False)
        sheet_url = str(getattr(refreshed_project, "character_reference_sheet_url", "") or "").strip() if refreshed_project else ""
        if is_ai_avatar and not sheet_url:
            logger.info(
                "storyboard_character_reference_sheet_waiting",
                extra={"project_id": project_id, "status": ensure_sheet.get("status")},
            )
            for _ in range(10):
                time.sleep(1.0)
                maybe = self.db.get_project(project_id)
                sheet_url = str(getattr(maybe, "character_reference_sheet_url", "") or "").strip() if maybe else ""
                if sheet_url:
                    break

        now = utcnow()
        self.db.update_scene(
            project_id,
            scene_id,
            state=SceneState.GENERATING,
            base_image_url=None,
            image_generation_started_at=now,
            user_approved=None,
        )
        self.db.update_project(
            project_id,
            workflow_state=StoryboardWorkflowState.IMAGES_GENERATING,
            image_generation_started_at=now,
        )

        from app.workers.storyboard_tasks import generate_base_image_task

        task = generate_base_image_task.apply_async(
            kwargs={
                "project_id": project_id,
                "scene_id": scene_id,
                "user_id": user_id,
                "model_tier": model_tier,
            },
            task_id=f"regen_image_{project_id}_{scene_id}_{int(now.timestamp())}",
        )

        logger.info(
            "storyboard_scene_image_regeneration_enqueued",
            extra={
                "project_id": project_id,
                "scene_id": scene_id,
                "task_id": task.id,
                "model_tier": model_tier,
                "character_reference_sheet_status": ensure_sheet.get("status"),
                "character_reference_sheet_fallback_to_golden_refs": bool(is_ai_avatar and not sheet_url) or bool(ensure_sheet.get("used_fallback")),
            },
        )

        return {
            "project_id": project_id,
            "scene_id": scene_id,
            "status": "queued",
            "task_id": task.id,
            "message": "Scene image regeneration queued",
        }

    def _build_character_reference_sheet_prompt(self, *, avatar_name: str | None) -> str:
        name = str(avatar_name or "the avatar").strip()
        return (
            f"Create a clean character reference sheet for {name}. "
            "Include front face, slight smile, neutral expression, and upper body. "
            "Consistent hairstyle, skin tone, and smart-casual creator look. "
            "Clean lighting, plain background, no text, no captions, no logos."
        )

    def _ensure_character_reference_sheet(self, *, project_id: str, user_id: str) -> dict[str, Any]:
        project = self.db.get_project(project_id)
        if not project:
            return {"sheet_url": None, "used_fallback": True, "status": "project_missing"}
        if str(getattr(project, "character_reference_sheet_url", "") or "").strip():
            return {
                "sheet_url": str(project.character_reference_sheet_url).strip(),
                "used_fallback": False,
                "status": "already_exists",
            }

        creation_mode = str(getattr(project, "creation_mode", "") or "").strip().lower()
        production_path = str(getattr(project, "production_path", "") or "").strip().lower()
        is_ai_avatar = production_path == "ai_avatar" or creation_mode == "avatar" or bool(getattr(project, "avatar_id", None))
        if not is_ai_avatar:
            return {"sheet_url": None, "used_fallback": False, "status": "not_ai_avatar"}

        avatar_refs = [str(url).strip() for url in list(getattr(project, "avatar_reference_images", []) or []) if str(url).strip()]
        if not avatar_refs:
            raise ValueError("Avatar reference images are required for AI Avatar storyboard generation.")

        prompt = self._build_character_reference_sheet_prompt(avatar_name=getattr(project, "avatar_name", None))
        try:
            provider = str(self.settings.storyboard_image_provider or "fal").strip().lower()
            if "openai" in provider and not bool(self.settings.allow_openai_storyboard_image_provider):
                raise ValueError(
                    "OpenAI storyboard image provider is disabled. "
                    "Set ALLOW_OPENAI_STORYBOARD_IMAGE_PROVIDER=true to enable explicitly."
                )
            if provider != "fal":
                raise ValueError(f"Unsupported storyboard image provider for character sheet: {provider}")
            fal_service = FalImageService()
            sheet_url, _ = fal_service.generate_storyboard_image_with_references(
                prompt=prompt,
                aspect_ratio="1:1",
                reference_urls=avatar_refs[:2],
                metadata={"project_id": project_id, "user_id": user_id, "mode": "character_reference_sheet"},
            )
            sheet_url = str(sheet_url or "").strip()
            if not sheet_url:
                return {"sheet_url": None, "used_fallback": True, "status": "generation_empty"}
            self.db.update_project(
                project_id,
                character_reference_sheet_url=sheet_url,
                character_reference_sheet_prompt=prompt,
            )
            logger.info(
                "storyboard_character_reference_sheet_generated",
                extra={
                    "project_id": project_id,
                    "avatar_reference_count": len(avatar_refs[:2]),
                    "character_reference_sheet_url": sheet_url,
                },
            )
            return {"sheet_url": sheet_url, "used_fallback": False, "status": "generated"}
        except Exception:
            logger.warning(
                "storyboard_character_reference_sheet_generation_failed",
                extra={
                    "project_id": project_id,
                    "character_reference_sheet_fallback_to_golden_refs": True,
                },
                exc_info=True,
            )
            return {"sheet_url": None, "used_fallback": True, "status": "generation_failed"}

    def generate_character_reference_sheet(self, *, project_id: str, user_id: str) -> dict[str, Any]:
        ensure = self._ensure_character_reference_sheet(project_id=project_id, user_id=user_id)
        project = self.db.get_project(project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")
        return {
            "project_id": project_id,
            "character_reference_sheet_url": project.character_reference_sheet_url,
            "character_reference_sheet_prompt": project.character_reference_sheet_prompt,
            "character_reference_sheet_status": ensure.get("status"),
        }

    # ===== PHASE 2+: PRODUCTION (EXPENSIVE) =====

    def generate_base_images(
        self,
        project_id: str,
        user_id: str,
        model_tier: str = "fast",
    ) -> dict[str, Any]:
        """
        Generate base images for all approved scenes.

        Expensive operation - launches parallel Celery tasks.
        """
        project = self.db.get_project(project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")

        estimate = self.get_credit_estimate(
            project_id=project_id,
            operation="generate_base_images",
            model_tier=model_tier,
        )

        if not estimate.can_afford:
            raise ValueError(f"Insufficient credits. Required: {estimate.cost_credits}, Available: {estimate.available_credits}")

        ensure_sheet = self._ensure_character_reference_sheet(project_id=project_id, user_id=user_id)
        refreshed_project = self.db.get_project(project_id)
        creation_mode = str(getattr(refreshed_project, "creation_mode", "") or "").strip().lower() if refreshed_project else ""
        production_path = str(getattr(refreshed_project, "production_path", "") or "").strip().lower() if refreshed_project else ""
        is_ai_avatar = production_path == "ai_avatar" or creation_mode == "avatar" or bool(getattr(refreshed_project, "avatar_id", None) if refreshed_project else False)
        sheet_url = str(getattr(refreshed_project, "character_reference_sheet_url", "") or "").strip() if refreshed_project else ""
        if is_ai_avatar and not sheet_url:
            logger.info(
                "storyboard_character_reference_sheet_waiting",
                extra={"project_id": project_id, "status": ensure_sheet.get("status")},
            )
            for _ in range(10):
                time.sleep(1.0)
                maybe = self.db.get_project(project_id)
                sheet_url = str(getattr(maybe, "character_reference_sheet_url", "") or "").strip() if maybe else ""
                if sheet_url:
                    break

        sheet_fallback_to_golden_refs = bool(is_ai_avatar and not sheet_url) or bool(ensure_sheet.get("used_fallback"))
        if sheet_fallback_to_golden_refs:
            logger.warning(
                "storyboard_character_reference_sheet_fallback",
                extra={
                    "project_id": project_id,
                    "character_reference_sheet_fallback_to_golden_refs": True,
                    "character_reference_sheet_status": ensure_sheet.get("status"),
                },
            )
        self.db.update_project(
            project_id,
            character_reference_sheet_status=ensure_sheet.get("status"),
            character_reference_sheet_fallback_to_golden_refs=sheet_fallback_to_golden_refs,
        )

        # Get approved scenes
        scenes = self.db.list_scenes(project_id)
        if not scenes:
            raise ValueError("No scenes available for image generation")

        missing_scenes = [scene for scene in scenes if not scene.base_image_url]
        if not missing_scenes:
            # Idempotent no-op: all scene images already exist.
            return {
                "project_id": project_id,
                "status": "already_generated",
                "scene_count": len(scenes),
                "cost_credits": 0,
                "message": "All scene images are already generated.",
            }

        stale_seconds = max(60, int(self.settings.storyboard_image_generation_stale_seconds or 120))
        now = utcnow()
        current_state = str(project.workflow_state or "").strip().lower()
        lock_started_at = project.image_generation_started_at or project.updated_at
        lock_age_seconds = int((now - lock_started_at).total_seconds()) if lock_started_at else None
        lock_is_stale = bool(lock_age_seconds is not None and lock_age_seconds >= stale_seconds)

        retryable_scenes: list[Any] = []
        skipped_scenes: list[dict[str, str]] = []
        for scene in missing_scenes:
            scene_state = str(scene.state or "").strip().lower()
            scene_started_at = scene.image_generation_started_at or scene.updated_at
            scene_age_seconds = int((now - scene_started_at).total_seconds()) if scene_started_at else None
            scene_stale = bool(scene_age_seconds is not None and scene_age_seconds >= stale_seconds)

            if scene_state == SceneState.GENERATING and not scene_stale:
                skipped_scenes.append(
                    {
                        "scene_id": scene.id,
                        "reason": "still_generating_within_timeout",
                    }
                )
                continue

            if scene_state in {SceneState.FAILED, SceneState.REJECTED}:
                retryable_scenes.append(scene)
                continue

            if scene_state == SceneState.GENERATING and scene_stale:
                retryable_scenes.append(scene)
                continue

            if scene_state in {SceneState.PENDING, SceneState.AWAITING_APPROVAL}:
                retryable_scenes.append(scene)
                continue

            # Unknown states with missing image are still retry candidates.
            retryable_scenes.append(scene)

        if current_state == StoryboardWorkflowState.IMAGES_GENERATING and not lock_is_stale and not retryable_scenes:
            logger.info(
                "storyboard_image_generation_in_progress",
                extra={
                    "project_id": project_id,
                    "lock_age_seconds": lock_age_seconds,
                    "stale_threshold_seconds": stale_seconds,
                    "missing_scene_count": len(missing_scenes),
                    "skipped_scenes": skipped_scenes,
                },
            )
            return {
                "project_id": project_id,
                "status": "in_progress",
                "scene_count": len(missing_scenes),
                "cost_credits": 0,
                "message": "Image generation is already in progress for this project.",
            }

        if current_state == StoryboardWorkflowState.IMAGES_GENERATING and lock_is_stale:
            logger.warning(
                "storyboard_image_generation_stale_recovery",
                extra={
                    "project_id": project_id,
                    "lock_age_seconds": lock_age_seconds,
                    "stale_threshold_seconds": stale_seconds,
                    "retryable_scene_count": len(retryable_scenes),
                },
            )

        logger.info(
            "base_image_generation_requested",
            extra={
                "project_id": project_id,
                "scene_count": len(scenes),
                "model_tier": model_tier,
                "retryable_scene_count": len(retryable_scenes),
                "skipped_scene_count": len(skipped_scenes),
                "character_reference_sheet_status": ensure_sheet.get("status"),
                "character_reference_sheet_fallback_to_golden_refs": sheet_fallback_to_golden_refs,
            },
        )

        # Launch parallel image generation tasks using Celery group
        from celery import group
        from app.workers.storyboard_tasks import generate_base_image_task

        scenes_to_queue = retryable_scenes or missing_scenes
        image_tasks = group([
            generate_base_image_task.s(
                project_id=project_id,
                scene_id=scene.id,
                user_id=user_id,
                model_tier=model_tier,
            )
            for scene in scenes_to_queue
        ])

        # Execute group (parallel)
        result = image_tasks.apply_async()

        queued_scene_ids: list[str] = []
        for scene in scenes_to_queue:
            self.db.update_scene(
                project_id,
                scene.id,
                state=SceneState.GENERATING,
                image_generation_started_at=now,
            )
            queued_scene_ids.append(scene.id)

        # Update workflow state
        self.db.update_project(
            project_id,
            workflow_state=StoryboardWorkflowState.IMAGES_GENERATING,
            image_generation_started_at=now,
        )

        logger.info(
            "storyboard_image_generation_enqueued",
            extra={
                "project_id": project_id,
                "task_group_id": result.id,
                "queued_scene_ids": queued_scene_ids,
                "skipped_scenes": skipped_scenes,
            },
        )

        return {
            "project_id": project_id,
            "status": "queued",
            "task_group_id": result.id,
            "scene_count": len(scenes_to_queue),
            "model_tier": model_tier,
            "cost_credits": estimate.cost_credits,
            "message": f"Image generation queued for {len(scenes_to_queue)} scenes (parallel)",
            "estimated_duration": "3-10 minutes per scene",
            "character_reference_sheet_status": ensure_sheet.get("status"),
            "character_reference_sheet_fallback_to_golden_refs": sheet_fallback_to_golden_refs,
        }

    def approve_base_images(self, project_id: str, user_id: str) -> dict[str, Any]:
        """Approve base images and move to voice selection."""
        project = self.db.get_project(project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")

        scenes = self.db.list_scenes(project_id)
        if not scenes:
            raise ValueError("No scenes available. Generate storyboard first.")

        missing_images = [scene.id for scene in scenes if not scene.base_image_url]
        if missing_images:
            raise ValueError(
                f"Cannot approve images yet: {len(missing_images)}/{len(scenes)} scenes are missing base images. "
                f"Missing scene IDs: {', '.join(missing_images[:8])}"
            )

        # "Approve all images" should mark scene approvals so video generation can proceed.
        for scene in scenes:
            self.db.update_scene(
                project_id,
                scene.id,
                user_approved=True,
                state=SceneState.AWAITING_APPROVAL,
            )

        # Update workflow state to images_approved so VoiceSelector appears
        self.db.update_project(
            project_id,
            workflow_state=StoryboardWorkflowState.IMAGES_APPROVED,
        )

        logger.info(
            "images_approved",
            extra={"project_id": project_id, "user_id": user_id},
        )

        return {
            "project_id": project_id,
            "workflow_state": StoryboardWorkflowState.IMAGES_APPROVED,
            "status": "approved",
        }

    def generate_voice_preview(
        self,
        project_id: str,
        user_id: str,
        voice: str,
        language_code: str,
        preview_text: str | None = None,
        style_instructions: str | None = None,
    ) -> dict[str, Any]:
        """
        Generate voice preview for voice selection.

        Small cost: 3 credits. Deducts credits immediately.
        """
        project = self.db.get_project(project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")

        tagged_script = project.tts_script
        if not tagged_script:
            # Backfill TTS script from display_script so preview can still work
            # if the async script task didn't persist tts_script for any reason.
            clean_script = str(project.display_script or "").strip()
            if not clean_script:
                raise ValueError("No script available for voice preview")
            tagged = self.emotion_tagging_service.tag_script(
                clean_script=clean_script,
                ad_category=project.ad_category,
                language=project.language or "en",
                tone=project.tone or "casual",
            )
            tagged_script = tagged.tts_script
            self.db.update_project(project_id, tts_script=tagged_script)

        try:
            preview = self.voice_preview_service.generate_preview(
                project_id=project_id,
                user_id=user_id,
                tagged_script=tagged_script,
                voice=voice,
                language_code=language_code,
                ad_category=project.ad_category,
                preview_text=preview_text,
                style_instructions=style_instructions,
            )

            logger.info(
                "voice_preview_generated",
                extra={
                    "project_id": project_id,
                    "voice": voice,
                    "audio_url": preview.audio_url[:100],
                },
            )

            return {
                "project_id": project_id,
                "audio_url": preview.audio_url,
                "duration_seconds": preview.duration_seconds,
                "voice": preview.voice,
                "language": preview.language,
                "credits_deducted": int(getattr(preview, "credits_deducted", 0) or 0),
                "cached": bool(getattr(preview, "cached", False)),
                "current_balance": getattr(preview, "current_balance", None),
            }
        except Exception as e:
            logger.error(
                "voice_preview_generation_failed",
                extra={"project_id": project_id, "error": str(e)},
            )
            raise

    def generate_full_audio(
        self,
        project_id: str,
        user_id: str,
        selected_voice: str,
    ) -> dict[str, Any]:
        """
        Generate full TTS audio for entire project.

        Launches Celery task for audio generation.
        """
        project = self.db.get_project(project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")

        if not project.tts_script:
            raise ValueError("No TTS script available")

        preferred_language = (
            str(getattr(project, "selected_tts_provider_language_code", "") or "").strip()
            or str(getattr(project, "selected_tts_language_label", "") or "").strip()
            or str(project.language or "en")
        )
        normalized_voice, language_code = normalize_storyboard_tts_literals(
            selected_voice,
            preferred_language,
        )

        logger.info(
            "full_audio_generation_requested",
            extra={
                "project_id": project_id,
                "voice": normalized_voice,
                "language": language_code,
            },
        )

        # Launch TTS generation task
        from app.workers.storyboard_tasks import generate_tts_task

        task = generate_tts_task.apply_async(
            args=[
                project_id,
                user_id,
                project.tts_script,
                normalized_voice,
                language_code,
            ],
            task_id=f"tts_{project_id}_{normalized_voice}",
        )

        return {
            "project_id": project_id,
            "status": "queued",
            "task_id": task.id,
            "voice": normalized_voice,
            "language": language_code,
            "message": "Full audio generation task queued",
            "estimated_duration": "30-60 seconds",
        }

    def generate_videos(
        self,
        project_id: str,
        user_id: str,
    ) -> dict[str, Any]:
        """
        Generate videos for all approved scenes in parallel.

        Expensive operation - launches parallel Celery tasks for each scene.
        """
        project = self.db.get_project(project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")

        # Get all scenes, then enforce approvals and image readiness together.
        scenes = self.db.list_scenes(project_id)
        if not scenes:
            raise ValueError("No scenes available for video generation")

        missing_images = [scene.id for scene in scenes if not scene.base_image_url]
        if missing_images:
            raise ValueError(
                f"Cannot generate videos yet: {len(missing_images)}/{len(scenes)} scenes are missing base images. "
                f"Missing scene IDs: {', '.join(missing_images[:8])}"
            )

        unapproved_scenes = [scene.id for scene in scenes if not scene.user_approved]
        if unapproved_scenes:
            raise ValueError(
                f"Cannot generate videos yet: {len(unapproved_scenes)}/{len(scenes)} scenes are not approved. "
                f"Unapproved scene IDs: {', '.join(unapproved_scenes[:8])}"
            )

        approved_scenes = [s for s in scenes if s.user_approved]
        if not str(project.selected_voice or "").strip():
            raise ValueError("Production cannot start without selected voice")
        if not str(project.tts_script or project.display_script or "").strip():
            raise ValueError("Production cannot start without script/dialogue")

        invalid_duration_scenes = [scene.id for scene in approved_scenes if int(getattr(scene, "duration_seconds", 0) or 0) <= 0]
        if invalid_duration_scenes:
            raise ValueError(
                f"Production cannot start: invalid scene durations for scenes {', '.join(invalid_duration_scenes[:8])}"
            )

        approved_scenes = sorted(approved_scenes, key=lambda s: int(getattr(s, "scene_number", 0) or 0))
        requested_model_key = str(getattr(project, "selected_video_model_key", "") or self.settings.storyboard_video_default_model).strip()
        selected_model_key, fallback_applied = _normalize_storyboard_video_quality_model(requested_model_key)
        logger.info(
            "storyboard_video_quality_selected",
            extra={"project_id": project_id, "selected_video_model_key": selected_model_key},
        )
        if fallback_applied:
            logger.info(
                "storyboard_video_quality_fallback_applied",
                extra={"project_id": project_id, "requested_model_key": requested_model_key, "fallback_model_key": selected_model_key},
            )
        selected_duration = int(getattr(project, "selected_ad_duration_seconds", 15) or 15)
        self.normalize_storyboard_scene_durations(
            project_id=project_id,
            selected_duration_seconds=selected_duration,
        )
        logger.info(
            "storyboard_kling_model_selected",
            extra={"project_id": project_id, "selected_video_model_key": selected_model_key},
        )

        # Get credit estimate
        estimate = self.get_credit_estimate(
            project_id=project_id,
            operation="generate_videos",
        )

        if not estimate.can_afford:
            raise ValueError(f"Insufficient credits. Required: {estimate.cost_credits}, Available: {estimate.available_credits}")

        logger.info(
            "video_generation_requested",
            extra={
                "project_id": project_id,
                "scene_count": len(approved_scenes),
            },
        )

        # Launch parallel video generation tasks using Celery group
        from celery import group
        from app.workers.storyboard_tasks import generate_scene_video_task

        # Create a task for each scene
        video_tasks = group([
            generate_scene_video_task.s(
                project_id=project_id,
                scene_id=scene.id,
                user_id=user_id,
                audio_url=None,
            )
            for scene in approved_scenes
        ])

        # Execute group (parallel)
        result = video_tasks.apply_async()

        # Update workflow state
        self.db.update_project(
            project_id,
            workflow_state=StoryboardWorkflowState.PRODUCTION_IN_PROGRESS,
            production_started_at=utcnow(),
            production_job_id=result.id,
            production_error=None,
        )

        return {
            "project_id": project_id,
            "status": "queued",
            "task_group_id": result.id,
            "scene_count": len(approved_scenes),
            "cost_credits": estimate.cost_credits,
            "message": f"Video generation queued for {len(approved_scenes)} scenes (parallel)",
            "estimated_duration": "2-5 minutes per scene",
        }

    def start_production_after_voice_confirm(self, *, project_id: str, user_id: str) -> dict[str, Any]:
        return self.start_production(project_id=project_id, user_id=user_id, force=True)

    def start_production(self, *, project_id: str, user_id: str, force: bool = False) -> dict[str, Any]:
        project = self.db.get_project(project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")
        now = utcnow()
        current_state = str(project.workflow_state or "").strip().lower()

        logger.info(
            "storyboard_production_preflight_started",
            extra={"project_id": project_id, "user_id": user_id, "force": force, "current_state": current_state},
        )

        scene_generation_id = str(getattr(project, "scene_generation_id", "") or "").strip() or None
        scenes = self.db.list_scenes(project_id, scene_generation_id=scene_generation_id, active_only=True)
        approved_scenes = [scene for scene in scenes if bool(scene.user_approved)]
        if not approved_scenes:
            raise ValueError("No approved storyboard scenes available for production")
        if not all(str(scene.base_image_url or "").strip() for scene in approved_scenes):
            raise ValueError("Approved storyboard scenes are missing generated frames")
        if not str(getattr(project, "selected_voice", "") or "").strip():
            raise ValueError("Selected voice missing. Please confirm voice selection before production.")
        if not str(getattr(project, "display_script", "") or "").strip():
            raise ValueError("Project script is missing. Regenerate and approve script first.")
        requested_model_key = str(getattr(project, "selected_video_model_key", "") or self.settings.storyboard_video_default_model).strip()
        selected_model_key, fallback_applied = _normalize_storyboard_video_quality_model(requested_model_key)
        if fallback_applied:
            logger.info(
                "storyboard_video_quality_fallback_applied",
                extra={"project_id": project_id, "requested_model_key": requested_model_key, "fallback_model_key": selected_model_key},
            )
            self.db.update_project(project_id, selected_video_model_key=selected_model_key)
        logger.info("storyboard_kling_model_selected", extra={"project_id": project_id, "selected_video_model_key": selected_model_key})
        if selected_model_key == "kling_4k" and not bool(self.settings.storyboard_video_allow_4k):
            raise ValueError("Premium 4K generation is currently disabled.")
        selected_duration = int(getattr(project, "selected_ad_duration_seconds", 15) or 15)
        target_duration = int(getattr(project, "target_ad_duration_seconds", selected_duration) or selected_duration)
        script_estimated_duration = float(getattr(project, "script_estimated_duration_seconds", 0) or 0)
        if target_duration != selected_duration:
            raise ValueError(
                f"duration_mismatch: Target creative duration is {target_duration}s but selected production duration is {selected_duration}s. "
                "Please regenerate/condense script or align production duration."
            )
        if script_estimated_duration > 0:
            lower = selected_duration * 0.8
            upper = selected_duration * 1.2
            if script_estimated_duration < lower or script_estimated_duration > upper:
                raise ValueError(
                    f"duration_mismatch: Approved script is estimated at {script_estimated_duration:.1f}s but selected production duration is {selected_duration}s. "
                    "Please regenerate/condense script or choose matching duration."
                )
        self.normalize_storyboard_scene_durations(project_id=project_id, selected_duration_seconds=selected_duration)
        refreshed_scenes = self.db.list_scenes(project_id, scene_generation_id=scene_generation_id, active_only=True)
        approved_refreshed = [scene for scene in refreshed_scenes if bool(scene.user_approved)]
        total_scene_duration = sum(float(getattr(scene, "duration_seconds", 0) or 0) for scene in approved_refreshed)
        if total_scene_duration <= 0:
            raise ValueError("duration_mismatch: Scene durations are missing. Please regenerate scene plan.")
        if abs(total_scene_duration - selected_duration) > max(1.0, selected_duration * 0.2):
            raise ValueError(
                f"duration_mismatch: Total approved scene duration is {total_scene_duration:.1f}s but selected production duration is {selected_duration}s. "
                "Please regenerate scene plan for selected duration."
            )

        logger.info(
            "storyboard_production_preflight_passed",
            extra={
                "project_id": project_id,
                "approved_scene_count": len(approved_scenes),
                "has_voice": True,
                "has_script": True,
                "selected_video_model_key": selected_model_key,
                "selected_duration_seconds": selected_duration,
            },
        )

        if current_state == StoryboardWorkflowState.PRODUCTION_IN_PROGRESS:
            return {
                "project_id": project_id,
                "workflow_state": StoryboardWorkflowState.PRODUCTION_IN_PROGRESS,
                "status": "already_running",
                "production_job_id": getattr(project, "production_job_id", None),
            }

        if current_state == StoryboardWorkflowState.PRODUCTION_STARTING:
            updated_at = getattr(project, "updated_at", None)
            if (not force) and updated_at and (now - updated_at) < timedelta(minutes=3):
                return {
                    "project_id": project_id,
                    "workflow_state": StoryboardWorkflowState.PRODUCTION_STARTING,
                    "status": "waiting_start",
                    "production_job_id": getattr(project, "production_job_id", None),
                }

        self.db.update_project(
            project_id,
            workflow_state=StoryboardWorkflowState.PRODUCTION_STARTING,
            production_start_requested_at=now,
            production_error=None,
        )

        try:
            logger.info(
                "storyboard_production_task_enqueue_started",
                extra={"project_id": project_id, "user_id": user_id},
            )
            from app.workers.storyboard_tasks import generate_storyboard_production_task

            task = generate_storyboard_production_task.apply_async(
                kwargs={"project_id": project_id, "user_id": user_id},
            )
            self.db.update_project(
                project_id,
                workflow_state=StoryboardWorkflowState.PRODUCTION_IN_PROGRESS,
                production_started_at=utcnow(),
                production_job_id=task.id,
                production_error=None,
            )
            logger.info(
                "storyboard_production_task_queued",
                extra={
                    "project_id": project_id,
                    "workflow_state": StoryboardWorkflowState.PRODUCTION_IN_PROGRESS,
                    "production_task_id": task.id,
                },
            )
            logger.info(
                "storyboard_production_status_set_in_progress",
                extra={"project_id": project_id, "production_task_id": task.id},
            )
            return {
                "project_id": project_id,
                "workflow_state": StoryboardWorkflowState.PRODUCTION_IN_PROGRESS,
                "status": "queued",
                "production_task_id": task.id,
            }
        except Exception as exc:
            self.db.update_project(
                project_id,
                workflow_state=StoryboardWorkflowState.PRODUCTION_FAILED,
                production_error=str(exc),
            )
            logger.error(
                "storyboard_production_start_failed",
                extra={"project_id": project_id, "error": str(exc)},
            )
            raise

    def apply_lipsync_if_required(
        self,
        project_id: str,
        user_id: str,
    ) -> dict[str, Any]:
        """
        Apply lipsync to videos if required by category.

        Conditional operation based on ad_category.
        """
        project = self.db.get_project(project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")

        # Categories that require lipsync
        LIPSYNC_REQUIRED_CATEGORIES = {
            "ugc_testimonial",
            "founder_talking_head",
            "inner_monologue",
        }

        if project.ad_category not in LIPSYNC_REQUIRED_CATEGORIES:
            logger.info(
                "lipsync_not_required",
                extra={
                    "project_id": project_id,
                    "category": project.ad_category,
                },
            )
            return {
                "project_id": project_id,
                "status": "skipped",
                "reason": f"Lipsync not required for {project.ad_category}",
            }

        # Get scenes that need lipsync
        scenes = self.db.list_scenes(project_id)
        scenes_for_lipsync = [s for s in scenes if s.video_url and s.user_approved]

        if not scenes_for_lipsync:
            raise ValueError("No videos available for lipsync")

        logger.info(
            "lipsync_generation_requested",
            extra={
                "project_id": project_id,
                "scene_count": len(scenes_for_lipsync),
            },
        )

        # Launch parallel lipsync tasks using Celery group
        from celery import group
        from app.workers.storyboard_tasks import apply_lipsync_task

        lipsync_tasks = group([
            apply_lipsync_task.s(
                project_id=project_id,
                scene_id=scene.id,
                user_id=user_id,
            )
            for scene in scenes_for_lipsync
        ])

        # Execute group (parallel)
        result = lipsync_tasks.apply_async()

        return {
            "project_id": project_id,
            "status": "queued",
            "task_group_id": result.id,
            "scene_count": len(scenes_for_lipsync),
            "message": f"Lipsync generation queued for {len(scenes_for_lipsync)} scenes",
            "estimated_duration": "1-3 minutes per scene",
        }

    def stitch_final_ad(
        self,
        project_id: str,
        user_id: str,
        audio_url: str | None = None,
    ) -> dict[str, Any]:
        """
        Stitch final video from all scene videos.

        Phase 2: Launches Celery task to combine approved scene videos.
        """
        project = self.db.get_project(project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")

        logger.info(
            "final_stitching_requested",
            extra={"project_id": project_id},
        )

        # Launch Celery task
        from app.workers.storyboard_tasks import stitch_final_video_task

        task = stitch_final_video_task.apply_async(
            args=[project_id, user_id, audio_url],
            task_id=f"stitch_{project_id}",
        )

        return {
            "project_id": project_id,
            "status": "queued",
            "task_id": task.id,
            "message": "Final video stitching queued",
            "estimated_duration": "1-2 minutes",
        }

    def score_project(
        self,
        project_id: str,
        user_id: str,
        final_video_url: str,
    ) -> dict[str, Any]:
        """
        Score final video and complete project.

        Phase 2: Launches Celery task for quality assessment.
        """
        project = self.db.get_project(project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")

        logger.info(
            "project_scoring_requested",
            extra={"project_id": project_id},
        )

        # Launch Celery task
        from app.workers.storyboard_tasks import score_final_video_task

        task = score_final_video_task.apply_async(
            args=[project_id, user_id, final_video_url],
            task_id=f"score_{project_id}",
        )

        return {
            "project_id": project_id,
            "status": "queued",
            "task_id": task.id,
            "message": "Project scoring queued",
            "estimated_duration": "30-60 seconds",
        }

    # ===== CREDIT & ESTIMATE METHODS =====

    def get_credit_estimate(
        self,
        project_id: str,
        operation: str,
        **kwargs,
    ) -> CreditEstimate:
        """
        Get credit estimate for next operation.

        Returns cost before any credits are deducted.
        """
        project = self.db.get_project(project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")

        available = self.credit_service.get_user_credit_balance(project.user_id)

        # Estimate based on operation type
        if operation == "generate_base_images":
            scene_count = len(self.db.list_scenes(project_id))
            model_tier = kwargs.get("model_tier", "fast")
            cost = scene_count * (CREDIT_COSTS.base_image_generation_fast if model_tier == "fast" else CREDIT_COSTS.base_image_generation_pro)
            description = f"Generate {scene_count} base images ({model_tier} quality)"

        elif operation == "voice_preview":
            cost = 3
            description = "Generate voice preview (2 lines)"

        elif operation == "generate_full_audio":
            cost = CREDIT_COSTS.tts_full_script
            description = "Generate full TTS audio"

        elif operation == "generate_videos":
            scene_count = len(self.db.list_scenes(project_id))
            model_key = MODEL_ROUTING_BY_CATEGORY.get(project.ad_category)
            cost_per_scene = CREDIT_COSTS.get_video_cost(model_key or "kling_o3_standard_reference")
            cost = scene_count * cost_per_scene
            description = f"Generate {scene_count} videos ({model_key})"

        else:
            cost = 0
            description = f"Unknown operation: {operation}"

        return CreditEstimate(
            operation=operation,
            cost_credits=cost,
            description=description,
            can_afford=cost <= available,
            available_credits=available,
        )

    def normalize_storyboard_scene_durations(self, *, project_id: str, selected_duration_seconds: int) -> dict[str, Any]:
        project = self.db.get_project(project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")
        scenes = sorted(self.db.list_scenes(project_id), key=lambda s: int(getattr(s, "scene_number", 0) or 0))
        approved = [s for s in scenes if bool(getattr(s, "user_approved", False))]
        if not approved:
            approved = scenes
        if not approved:
            raise ValueError("No scenes available for duration normalization")

        selected = int(selected_duration_seconds)
        scene_count = len(approved)
        max_total = scene_count * 10
        min_total = scene_count * 5
        actual_total = max(min_total, min(max_total, selected))
        if selected != actual_total:
            logger.warning(
                "storyboard_duration_warning_if_capped",
                extra={"project_id": project_id, "requested": selected, "actual": actual_total, "scene_count": scene_count},
            )
        base = actual_total // scene_count
        remainder = actual_total % scene_count
        normalized: list[int] = []
        for idx in range(scene_count):
            value = base + (1 if idx < remainder else 0)
            value = max(5, min(10, value))
            normalized.append(value)
        for scene, value in zip(approved, normalized):
            logger.info(
                "storyboard_scene_duration_original",
                extra={"project_id": project_id, "scene_id": scene.id, "original": int(getattr(scene, "duration_seconds", 0) or 0)},
            )
            self.db.update_scene(
                project_id,
                scene.id,
                requested_scene_duration_seconds=selected,
                normalized_scene_duration_seconds=value,
                duration_seconds=value,
            )
            logger.info(
                "storyboard_scene_duration_normalized",
                extra={"project_id": project_id, "scene_id": scene.id, "normalized": value},
            )
        logger.info("storyboard_actual_output_duration_estimate", extra={"project_id": project_id, "actual": actual_total})
        return {"scene_count": scene_count, "actual_duration_seconds": actual_total, "normalized_scene_durations": normalized}

    def calculate_storyboard_production_estimate(
        self,
        *,
        project_id: str,
        model_key: str,
        duration_seconds: int,
    ) -> dict[str, Any]:
        project = self.db.get_project(project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")
        requested_model_key = str(model_key or self.settings.storyboard_video_default_model).strip()
        normalized_model_key, fallback_applied = _normalize_storyboard_video_quality_model(requested_model_key)
        if normalized_model_key not in STORYBOARD_VIDEO_QUALITY_MAP:
            raise ValueError(f"Unsupported model key: {normalized_model_key}")
        logger.info("storyboard_video_quality_selected", extra={"project_id": project_id, "selected_video_model_key": normalized_model_key})
        if fallback_applied:
            logger.info(
                "storyboard_video_quality_fallback_applied",
                extra={"project_id": project_id, "requested_model_key": requested_model_key, "fallback_model_key": normalized_model_key},
            )
        logger.info("storyboard_kling_model_selected", extra={"project_id": project_id, "selected_video_model_key": normalized_model_key})
        if normalized_model_key == "kling_4k" and not bool(self.settings.storyboard_video_allow_4k):
            raise ValueError("Premium 4K generation is currently disabled.")
        if int(duration_seconds) not in {10, 15, 20, 30}:
            raise ValueError("Duration must be one of 10, 15, 20, or 30 seconds")

        normalized = self.normalize_storyboard_scene_durations(
            project_id=project_id,
            selected_duration_seconds=int(duration_seconds),
        )
        scene_count = int(normalized["scene_count"])
        actual_duration = int(normalized["actual_duration_seconds"])
        scene_video_credits = int(STORYBOARD_MODEL_SCENE_CREDITS.get(normalized_model_key, 15)) * scene_count
        tts_credits = 4
        scenes = self.db.list_scenes(project_id)
        lipsync_required_count = sum(1 for s in scenes if bool(getattr(s, "lipsync_this_scene", False)))
        lipsync_credits = lipsync_required_count * 4
        stitching_credits = 2
        qc_credits = 2
        total = scene_video_credits + tts_credits + lipsync_credits + stitching_credits + qc_credits
        available_credits = int(self.credit_service.get_user_credit_balance(project.user_id))
        warning_list: list[str] = []
        if int(duration_seconds) != actual_duration:
            warning_list.append(
                f"Requested {int(duration_seconds)}s was capped to {actual_duration}s due to scene safety limits (5-10s per scene)."
            )
        meta = STORYBOARD_VIDEO_QUALITY_MAP[normalized_model_key]
        breakdown = [
            {"label": "Scene videos", "credits": scene_video_credits},
            {"label": "TTS", "credits": tts_credits},
            {"label": "Lipsync", "credits": lipsync_credits},
            {"label": "Stitching", "credits": stitching_credits},
            {"label": "QC", "credits": qc_credits},
        ]
        return {
            "model_key": normalized_model_key,
            "quality_label": meta["quality_label"],
            "duration_seconds": int(duration_seconds),
            "actual_estimated_output_duration_seconds": actual_duration,
            "scene_count": scene_count,
            "estimated_video_credits": scene_video_credits,
            "estimated_tts_credits": tts_credits,
            "estimated_lipsync_credits": lipsync_credits,
            "estimated_stitching_credits": stitching_credits,
            "estimated_qc_credits": qc_credits,
            "estimated_total_credits": total,
            "available_credits": available_credits,
            "balance_after_estimate": available_credits - total,
            "estimated_time_label": meta["time_label"],
            "warnings": warning_list,
            "breakdown": breakdown,
        }

    def save_production_settings(
        self,
        *,
        project_id: str,
        model_key: str,
        duration_seconds: int,
    ) -> dict[str, Any]:
        estimate = self.calculate_storyboard_production_estimate(
            project_id=project_id,
            model_key=model_key,
            duration_seconds=duration_seconds,
        )
        update_payload = {
            "selected_video_quality_label": estimate["quality_label"],
            "selected_video_model_key": estimate["model_key"],
            "selected_ad_duration_seconds": int(duration_seconds),
            "target_ad_duration_seconds": int(duration_seconds),
            "selected_duration_label": f"{int(duration_seconds)}s",
            "requested_ad_duration_seconds": int(duration_seconds),
            "actual_estimated_output_duration_seconds": int(estimate["actual_estimated_output_duration_seconds"]),
            "production_credit_estimate": estimate,
            "production_estimated_time_label": estimate["estimated_time_label"],
        }
        self.db.update_project(project_id, **update_payload)
        return {"project_id": project_id, "estimate": estimate}

    # ===== UTILITY METHODS =====

    def retry_failed_scenes(
        self,
        project_id: str,
        user_id: str,
        scene_ids: list[str] | None = None,
    ) -> dict[str, Any]:
        """Retry generation for failed scenes (idempotent)."""
        project = self.db.get_project(project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")

        # Get all scenes or specific ones
        all_scenes = self.db.list_scenes(project_id)
        if scene_ids:
            scenes_to_retry = [s for s in all_scenes if s.id in scene_ids and s.state == SceneState.FAILED]
        else:
            scenes_to_retry = [s for s in all_scenes if s.state == SceneState.FAILED]

        if not scenes_to_retry:
            return {
                "project_id": project_id,
                "status": "no_failed_scenes",
                "message": "No failed scenes to retry",
            }

        logger.info(
            "scene_retry_requested",
            extra={
                "project_id": project_id,
                "scene_count": len(scenes_to_retry),
            },
        )

        # Launch retry tasks using Celery group
        from celery import group
        from app.workers.storyboard_tasks import retry_failed_scenes_task

        retry_tasks = group([
            retry_failed_scenes_task.s(
                project_id=project_id,
                scene_id=scene.id,
                user_id=user_id,
            )
            for scene in scenes_to_retry
        ])

        # Execute group (parallel)
        result = retry_tasks.apply_async()

        return {
            "project_id": project_id,
            "status": "queued",
            "task_group_id": result.id,
            "scene_count": len(scenes_to_retry),
            "message": f"Retry queued for {len(scenes_to_retry)} failed scenes",
            "estimated_duration": "Depends on operation type",
        }

    def create_variation(
        self,
        project_id: str,
        user_id: str,
        variation_type: str,  # "new_avatar" | "new_hook" | "new_language"
        **kwargs,
    ) -> dict[str, Any]:
        """
        Create a variation of approved project.

        Reuses approved assets, only regenerates changed parts.
        """
        project = self.db.get_project(project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")

        if project.workflow_state != StoryboardWorkflowState.COMPLETED:
            raise ValueError(f"Cannot create variation of incomplete project (current state: {project.workflow_state})")

        logger.info(
            "variation_creation_requested",
            extra={
                "project_id": project_id,
                "variation_type": variation_type,
            },
        )

        # For Phase 2: Just log the request and return a status
        # Full implementation would clone the project and regenerate specific parts
        return {
            "project_id": project_id,
            "variation_type": variation_type,
            "status": "queued",
            "message": f"Variation creation task queued for {variation_type}",
            "estimated_duration": "Depends on variation type (10-30 minutes)",
            "note": "Full variation implementation coming in Phase 3",
        }
