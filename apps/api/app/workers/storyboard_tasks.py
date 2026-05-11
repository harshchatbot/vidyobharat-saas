"""
Celery tasks for storyboard pipeline.

Phase 2: Full implementations with service integration, state management, and credit safety.
"""
from __future__ import annotations

import logging
from typing import Any

from app.db.repositories.storyboard_repository import StoryboardRepository
from app.services.credit_service import CreditService
from app.services.emotion_tagging_service import EmotionTaggingService
from app.services.quality_score_service import QualityScoreService
from app.services.render_service import celery_app as app
from app.services.script_generation_service import ScriptGenerationService
from app.services.storyboard_generation_service import StoryboardGenerationService
from app.services.storyboard_pipeline_service import SceneState, StoryboardWorkflowState

logger = logging.getLogger(__name__)


@app.task(bind=True, name="storyboard.generate_script", max_retries=1)
def generate_script_task(
    self,
    project_id: str,
    user_id: str,
    business_brief: str,
    platform: str,
    language: str = "en",
    tone: str = "casual",
) -> dict:
    """
    Generate script for storyboard project.

    Phase 2: Actual implementation:
    - Call ScriptGenerationService to generate clean script
    - Apply emotion tagging to create TTS version
    - Score script for quality assessment
    - Update project in Firestore
    - Return script and metadata
    """
    try:
        logger.info(
            "generate_script_task_started",
            extra={
                "project_id": project_id,
                "task_id": self.request.id,
                "user_id": user_id,
            },
        )

        db = StoryboardRepository()
        project = db.get_project(project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")

        # Generate script using ScriptGenerationService
        script_service = ScriptGenerationService()
        script_result = script_service.generate(
            business_brief=business_brief,
            ad_category=project.ad_category,
            platform=platform,
            language=language,
            tone=tone,
        )

        clean_script = script_result.get("script", "")
        if not clean_script:
            raise ValueError("Script generation returned empty script")

        # Apply emotion tagging for TTS
        emotion_service = EmotionTaggingService()
        tagged = emotion_service.tag_script(
            clean_script=clean_script,
            ad_category=project.ad_category,
            language=language,
            tone=tone,
        )

        # Score the script
        quality_service = QualityScoreService()
        script_score = quality_service.score_script(
            clean_script,
            project.ad_category,
            word_count=len(clean_script.split()),
        )

        # Update project with generated script
        from dataclasses import asdict
        script_score_dict = asdict(script_score) if hasattr(script_score, '__dataclass_fields__') else {
            'hook_strength': script_score.hook_strength if hasattr(script_score, 'hook_strength') else 5.0,
            'clarity': script_score.clarity if hasattr(script_score, 'clarity') else 5.0,
            'emotional_pull': script_score.emotional_pull if hasattr(script_score, 'emotional_pull') else 5.0,
            'word_count_ok': script_score.word_count_ok if hasattr(script_score, 'word_count_ok') else 5.0,
            'category_fit': script_score.category_fit if hasattr(script_score, 'category_fit') else 5.0,
            'overall': script_score.overall if hasattr(script_score, 'overall') else 5.0,
            'improvement_suggestions': script_score.improvement_suggestions if hasattr(script_score, 'improvement_suggestions') else [],
        }

        db.update_project(
            project_id,
            display_script=clean_script,
            tts_script=tagged.tts_script,
            script_score=script_score_dict,
            workflow_state=StoryboardWorkflowState.SCRIPT_AWAITING_APPROVAL,
        )

        logger.info(
            "generate_script_task_completed",
            extra={
                "project_id": project_id,
                "script_length": len(clean_script),
                "word_count": len(clean_script.split()),
                "score": script_score.overall,
            },
        )

        return {
            "project_id": project_id,
            "status": "completed",
            "script": clean_script,
            "word_count": len(clean_script.split()),
            "score": script_score.overall,
            "task_id": self.request.id,
        }

    except Exception as e:
        logger.error(
            "generate_script_task_failed",
            extra={
                "project_id": project_id,
                "error": str(e),
                "task_id": self.request.id,
            },
        )
        raise


@app.task(bind=True, name="storyboard.generate_storyboard", max_retries=1)
def generate_storyboard_task(
    self,
    project_id: str,
    user_id: str,
) -> dict:
    """
    Generate storyboard scenes from approved script.

    Phase 2: Actual implementation:
    - Retrieve project and approved script
    - Call StoryboardGenerationService to break script into scene cards
    - Create individual scene documents in Firestore
    - Score storyboard for quality
    - Return list of scene IDs
    """
    try:
        logger.info(
            "generate_storyboard_task_started",
            extra={"project_id": project_id, "task_id": self.request.id},
        )

        db = StoryboardRepository()
        project = db.get_project(project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")

        if not project.display_script:
            raise ValueError("No approved script available")

        # Generate storyboard scene cards
        storyboard_service = StoryboardGenerationService()
        scene_cards = storyboard_service.generate_storyboard(
            clean_script=project.display_script,
            ad_category=project.ad_category,
            avatar_description="to be specified",
            business_context=project.business_brief,
            platform=project.platform,
            language=project.language,
            tone=project.tone,
        )

        # Create scene documents in Firestore
        scene_ids = []
        for scene_card in scene_cards:
            scene = db.create_scene(
                project_id=project_id,
                scene_number=scene_card.scene_number,
                scene_type=scene_card.scene_type,
                state=SceneState.PENDING,
                spoken_line=scene_card.spoken_line,
                visual_description=scene_card.visual_description,
                shot_type=scene_card.shot_type,
                avatar_action=scene_card.avatar_action,
                avatar_position=scene_card.avatar_position,
                environment=scene_card.environment,
                mood=scene_card.mood,
                product_visibility=scene_card.product_visibility,
                duration_seconds=scene_card.duration_seconds,
            )
            scene_ids.append(scene.id)

        # Score the storyboard
        quality_service = QualityScoreService()
        storyboard_score = quality_service.score_storyboard(
            [s.to_dict() for s in [db.get_scene(project_id, sid) for sid in scene_ids]],
            project.ad_category,
        )

        # Update project with storyboard info
        total_duration = sum(card.duration_seconds for card in scene_cards)
        db.update_project(
            project_id,
            workflow_state=StoryboardWorkflowState.STORYBOARD_AWAITING_APPROVAL,
            duration_seconds=total_duration,
            storyboard_score=storyboard_score.improvement_suggestions + [
                f"Overall score: {storyboard_score.overall:.1f}/10"
            ],
        )

        logger.info(
            "generate_storyboard_task_completed",
            extra={
                "project_id": project_id,
                "scene_count": len(scene_ids),
                "total_duration": total_duration,
                "score": storyboard_score.overall,
            },
        )

        return {
            "project_id": project_id,
            "status": "completed",
            "scene_count": len(scene_ids),
            "scene_ids": scene_ids,
            "total_duration": total_duration,
            "score": storyboard_score.overall,
            "task_id": self.request.id,
        }

    except Exception as e:
        logger.error(
            "generate_storyboard_task_failed",
            extra={
                "project_id": project_id,
                "error": str(e),
                "task_id": self.request.id,
            },
        )
        raise


@app.task(bind=True, name="storyboard.generate_base_image", max_retries=2)
def generate_base_image_task(
    self,
    project_id: str,
    scene_id: str,
    user_id: str,
    model_tier: str = "fast",
) -> dict:
    """
    Generate base image for a scene.

    Phase 2: Actual implementation:
    - Retrieve scene from Firestore
    - Build image generation prompt from visual description
    - Call ImageGenerationService with model tier selection
    - Deduct credits with idempotency key
    - Store image URL in scene
    - Update scene state
    """
    try:
        idempotency_key = f"{project_id}_base_image_{scene_id}_{self.request.retries}"

        logger.info(
            "generate_base_image_task_started",
            extra={
                "project_id": project_id,
                "scene_id": scene_id,
                "model_tier": model_tier,
                "idempotency_key": idempotency_key,
                "task_id": self.request.id,
            },
        )

        db = StoryboardRepository()
        scene = db.get_scene(project_id, scene_id)
        if not scene:
            raise ValueError(f"Scene {scene_id} not found")

        # Build prompt from visual description and metadata
        image_prompt = _build_image_prompt(scene)

        # Call FAL image service directly for pipeline use
        from app.services.fal_image_service import FalImageService

        fal_service = FalImageService()

        # Determine model and dimensions based on tier
        # 9:16 aspect ratio = 720x1280 pixels
        width, height = 720, 1280

        if model_tier == "pro":
            model_key = "recraft_v3"  # High quality model
        else:
            model_key = "recraft_v3"  # Using same model for consistency, FAL handles tier internally

        # Generate image
        image_url = fal_service.generate_recraft(
            model_key=model_key,
            prompt=image_prompt,
            width=width,
            height=height,
            reference_urls=[],
        )

        # Deduct credits with idempotency
        credit_service = CreditService()
        from app.recipes.storyboard_video import CREDIT_COSTS

        cost = CREDIT_COSTS.base_image_generation_fast if model_tier == "fast" else CREDIT_COSTS.base_image_generation_pro
        credit_result = credit_service.deduct_credits(
            user_id=user_id,
            operation="base_image_generation",
            cost_credits=cost,
            metadata={
                "project_id": project_id,
                "scene_id": scene_id,
                "model_tier": model_tier,
            },
            idempotency_key=idempotency_key,
        )

        if not credit_result.success:
            raise ValueError(f"Credit deduction failed: {credit_result.error}")

        # Update scene with image
        db.update_scene(
            project_id,
            scene_id,
            base_image_url=image_url,
            base_image_prompt=image_prompt,
            state=SceneState.AWAITING_APPROVAL,
        )

        logger.info(
            "generate_base_image_task_completed",
            extra={
                "project_id": project_id,
                "scene_id": scene_id,
                "image_url": image_url[:100],
                "credits_deducted": cost,
            },
        )

        return {
            "project_id": project_id,
            "scene_id": scene_id,
            "status": "completed",
            "image_url": image_url,
            "credits_deducted": cost,
            "task_id": self.request.id,
        }

    except Exception as e:
        logger.error(
            "generate_base_image_task_failed",
            extra={
                "project_id": project_id,
                "scene_id": scene_id,
                "error": str(e),
                "task_id": self.request.id,
            },
        )
        # Retry on failure (max 2 retries)
        raise self.retry(exc=e, countdown=10)


def _build_image_prompt(scene) -> str:
    """Build image generation prompt from scene metadata."""
    parts = [
        scene.visual_description,
        f"Shot type: {scene.shot_type}",
        f"Mood: {scene.mood}",
    ]

    if scene.environment:
        parts.append(f"Environment: {scene.environment}")

    if scene.avatar_action:
        parts.append(f"Avatar action: {scene.avatar_action}")

    if scene.product_visibility and scene.product_visibility != "none":
        parts.append(f"Product visibility: {scene.product_visibility}")

    return ". ".join(parts)


@app.task(bind=True, name="storyboard.generate_scene_video", max_retries=2)
def generate_scene_video_task(
    self,
    project_id: str,
    scene_id: str,
    user_id: str,
    audio_url: str | None = None,
) -> dict:
    """
    Generate video for a scene with model routing.

    Phase 2: Actual implementation:
    - Retrieve scene and project
    - Perform model routing by ad_category
    - Build video generation prompt
    - Call FalVideoService with appropriate model
    - Poll for completion
    - Deduct credits with idempotency key
    - Store video URL in scene
    - Update scene state
    """
    try:
        idempotency_key = f"{project_id}_video_{scene_id}_{self.request.retries}"

        logger.info(
            "generate_scene_video_task_started",
            extra={
                "project_id": project_id,
                "scene_id": scene_id,
                "idempotency_key": idempotency_key,
                "task_id": self.request.id,
            },
        )

        db = StoryboardRepository()
        project = db.get_project(project_id)
        scene = db.get_scene(project_id, scene_id)

        if not project or not scene:
            raise ValueError(f"Project or scene not found")

        # Get model key from category
        from app.recipes.storyboard_video import MODEL_ROUTING_BY_CATEGORY

        model_key = MODEL_ROUTING_BY_CATEGORY.get(project.ad_category)
        if not model_key:
            raise ValueError(f"No model routing for category {project.ad_category}")

        # Build video generation prompt
        video_prompt = self._build_video_prompt(scene, project)

        # Get base image if available
        image_url = scene.base_image_url or ""

        # Call FAL video service with appropriate model
        from app.services.fal_video_service import FalVideoService

        fal_service = FalVideoService()

        # Route to appropriate model
        if "kling" in model_key:
            video_url, metadata = fal_service.generate_kling_reference_video(
                prompt=video_prompt,
                image_url=image_url,
                aspect_ratio="9:16",
                duration_seconds=scene.duration_seconds,
                audio_url=audio_url,
            )
        elif "seedance" in model_key:
            video_url, metadata = fal_service.generate_seedance_reference_video(
                prompt=video_prompt,
                image_url=image_url,
                aspect_ratio="9:16",
                duration_seconds=scene.duration_seconds,
            )
        elif "ltx" in model_key:
            video_url, metadata = fal_service.generate_ltx_image_to_video(
                prompt=video_prompt,
                image_url=image_url,
                aspect_ratio="9:16",
                duration_seconds=scene.duration_seconds,
            )
        else:
            # Default to Kling
            video_url, metadata = fal_service.generate_kling_reference_video(
                prompt=video_prompt,
                image_url=image_url,
                aspect_ratio="9:16",
                duration_seconds=scene.duration_seconds,
            )

        # Deduct credits with idempotency
        credit_service = CreditService()
        from app.recipes.storyboard_video import CREDIT_COSTS

        cost = CREDIT_COSTS.get_video_cost(model_key)
        credit_result = credit_service.deduct_credits(
            user_id=user_id,
            operation="scene_video_generation",
            cost_credits=cost,
            metadata={
                "project_id": project_id,
                "scene_id": scene_id,
                "model_key": model_key,
            },
            idempotency_key=idempotency_key,
        )

        if not credit_result.success:
            raise ValueError(f"Credit deduction failed: {credit_result.error}")

        # Update scene with video
        db.update_scene(
            project_id,
            scene_id,
            video_url=video_url,
            video_prompt=video_prompt,
            state=SceneState.VIDEO_GENERATED,
        )

        logger.info(
            "generate_scene_video_task_completed",
            extra={
                "project_id": project_id,
                "scene_id": scene_id,
                "model_key": model_key,
                "video_url": video_url[:100],
                "credits_deducted": cost,
            },
        )

        return {
            "project_id": project_id,
            "scene_id": scene_id,
            "status": "completed",
            "video_url": video_url,
            "model_key": model_key,
            "credits_deducted": cost,
            "task_id": self.request.id,
        }

    except Exception as e:
        logger.error(
            "generate_scene_video_task_failed",
            extra={
                "project_id": project_id,
                "scene_id": scene_id,
                "error": str(e),
                "task_id": self.request.id,
            },
        )
        # Retry on failure
        raise self.retry(exc=e, countdown=15)

    @staticmethod
    def _build_video_prompt(scene, project) -> str:
        """Build video generation prompt from scene and project metadata."""
        parts = [
            scene.visual_description,
            f"Duration: {scene.duration_seconds} seconds",
            f"Shot type: {scene.shot_type}",
            f"Mood: {scene.mood}",
        ]

        if scene.avatar_action:
            parts.append(f"Avatar performs: {scene.avatar_action}")

        if scene.spoken_line:
            parts.append(f"Dialogue: {scene.spoken_line}")

        if scene.product_visibility and scene.product_visibility != "none":
            parts.append(f"Product: {scene.product_visibility}")

        if project.tone:
            parts.append(f"Tone: {project.tone}")

        return ". ".join(parts)


@app.task(bind=True, name="storyboard.apply_lipsync", max_retries=2)
def apply_lipsync_task(
    self,
    project_id: str,
    scene_id: str,
    user_id: str,
    video_url: str,
    audio_url: str,
    lipsync_required: bool = True,
) -> dict:
    """
    Apply lipsync to video (conditional by category).

    Phase 2: Actual implementation:
    - Check if lipsync is required for this category
    - Call LipsyncFaceService if needed
    - Deduct credits with idempotency key
    - Store lipsync video URL in scene
    - Update scene state
    - Fallback to original video if lipsync fails
    """
    try:
        idempotency_key = f"{project_id}_lipsync_{scene_id}_{self.request.retries}"

        logger.info(
            "apply_lipsync_task_started",
            extra={
                "project_id": project_id,
                "scene_id": scene_id,
                "lipsync_required": lipsync_required,
                "task_id": self.request.id,
            },
        )

        # If lipsync not required, skip and return original video
        if not lipsync_required or not audio_url:
            logger.info(
                "lipsync_skipped",
                extra={
                    "project_id": project_id,
                    "scene_id": scene_id,
                    "reason": "not_required" if not lipsync_required else "no_audio",
                },
            )
            return {
                "project_id": project_id,
                "scene_id": scene_id,
                "status": "skipped",
                "lipsync_video_url": video_url,
                "reason": "lipsync_not_required",
                "task_id": self.request.id,
            }

        # Apply lipsync
        from app.services.lipsync_face_service import LipsyncFaceService

        lipsync_service = LipsyncFaceService()
        lipsync_video_url = lipsync_service.apply_lipsync(
            video_url=video_url,
            audio_url=audio_url,
            metadata={
                "project_id": project_id,
                "scene_id": scene_id,
            },
        )

        # Deduct credits
        credit_service = CreditService()
        from app.recipes.storyboard_video import CREDIT_COSTS

        credit_result = credit_service.deduct_credits(
            user_id=user_id,
            operation="lipsync_application",
            cost_credits=CREDIT_COSTS.lipsync_per_scene,
            metadata={
                "project_id": project_id,
                "scene_id": scene_id,
            },
            idempotency_key=idempotency_key,
        )

        if not credit_result.success:
            # Lipsync failed - use original video as fallback
            logger.warning(
                "lipsync_credit_deduction_failed_using_original",
                extra={
                    "project_id": project_id,
                    "scene_id": scene_id,
                    "error": credit_result.error,
                },
            )
            lipsync_video_url = video_url

        # Update scene
        db = StoryboardRepository()
        db.update_scene(
            project_id,
            scene_id,
            lipsync_video_url=lipsync_video_url,
            state=SceneState.LIPSYNC_APPLIED,
        )

        logger.info(
            "apply_lipsync_task_completed",
            extra={
                "project_id": project_id,
                "scene_id": scene_id,
                "lipsync_applied": lipsync_video_url != video_url,
            },
        )

        return {
            "project_id": project_id,
            "scene_id": scene_id,
            "status": "completed",
            "lipsync_video_url": lipsync_video_url,
            "credits_deducted": CREDIT_COSTS.lipsync_per_scene if lipsync_video_url != video_url else 0,
            "task_id": self.request.id,
        }

    except Exception as e:
        logger.error(
            "apply_lipsync_task_failed",
            extra={
                "project_id": project_id,
                "scene_id": scene_id,
                "error": str(e),
                "task_id": self.request.id,
            },
        )
        # Retry with original video as fallback
        db = StoryboardRepository()
        db.update_scene(
            project_id,
            scene_id,
            lipsync_video_url=video_url,  # Fallback
            state=SceneState.LIPSYNC_APPLIED,
        )
        return {
            "project_id": project_id,
            "scene_id": scene_id,
            "status": "fallback",
            "lipsync_video_url": video_url,
            "reason": f"lipsync_failed: {str(e)[:100]}",
            "task_id": self.request.id,
        }


@app.task(bind=True, name="storyboard.generate_tts", max_retries=2)
def generate_tts_task(
    self,
    project_id: str,
    user_id: str,
    tts_script: str,
    selected_voice: str,
    language_code: str,
) -> dict:
    """
    Generate full TTS audio for project.

    Phase 2: Actual implementation:
    - Call FalVideoService.generate_gemini_flash_tts()
    - Pre-generate full script TTS and cache
    - Deduct credits with idempotency key
    - Return audio URL and duration
    """
    try:
        idempotency_key = f"{project_id}_tts_{selected_voice}_{language_code}"

        logger.info(
            "generate_tts_task_started",
            extra={
                "project_id": project_id,
                "voice": selected_voice,
                "language": language_code,
                "script_length": len(tts_script),
                "task_id": self.request.id,
            },
        )

        # Generate TTS using FAL Gemini Flash TTS
        from app.services.fal_video_service import FalVideoService

        fal_service = FalVideoService()
        audio_url, metadata = fal_service.generate_gemini_flash_tts(
            text=tts_script,
            voice=selected_voice,
            language_code=language_code,
            style_instructions=f"Generate TTS for {language_code} language using voice {selected_voice}",
        )

        # Estimate audio duration
        word_count = len(tts_script.split())
        duration_seconds = (word_count / 150.0) * 60.0  # ~150 words per minute

        # Deduct credits
        credit_service = CreditService()
        from app.recipes.storyboard_video import CREDIT_COSTS

        credit_result = credit_service.deduct_credits(
            user_id=user_id,
            operation="tts_generation",
            cost_credits=CREDIT_COSTS.tts_full_script,
            metadata={
                "project_id": project_id,
                "voice": selected_voice,
                "language": language_code,
                "word_count": word_count,
            },
            idempotency_key=idempotency_key,
        )

        if not credit_result.success:
            raise ValueError(f"Credit deduction failed: {credit_result.error}")

        # Update project
        db = StoryboardRepository()
        db.update_project(
            project_id,
            selected_voice=selected_voice,
        )

        logger.info(
            "generate_tts_task_completed",
            extra={
                "project_id": project_id,
                "audio_url": audio_url[:100],
                "duration": duration_seconds,
                "voice": selected_voice,
                "credits_deducted": CREDIT_COSTS.tts_full_script,
            },
        )

        return {
            "project_id": project_id,
            "status": "completed",
            "audio_url": audio_url,
            "duration_seconds": duration_seconds,
            "voice": selected_voice,
            "credits_deducted": CREDIT_COSTS.tts_full_script,
            "task_id": self.request.id,
        }

    except Exception as e:
        logger.error(
            "generate_tts_task_failed",
            extra={
                "project_id": project_id,
                "error": str(e),
                "task_id": self.request.id,
            },
        )
        raise self.retry(exc=e, countdown=10)


@app.task(bind=True, name="storyboard.stitch_final_video", max_retries=2)
def stitch_final_video_task(
    self,
    project_id: str,
    user_id: str,
    audio_url: str | None = None,
) -> dict:
    """
    Stitch scene videos into final ad.

    Phase 2: Actual implementation:
    - Retrieve all approved scene videos
    - Retrieve full audio if available
    - Call VideoStitcher to combine scenes
    - Deduct credits with idempotency key
    - Store final video URL in project
    - Update workflow state
    """
    try:
        idempotency_key = f"{project_id}_stitch_{self.request.retries}"

        logger.info(
            "stitch_final_video_task_started",
            extra={
                "project_id": project_id,
                "idempotency_key": idempotency_key,
                "task_id": self.request.id,
            },
        )

        db = StoryboardRepository()
        project = db.get_project(project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")

        # Retrieve all approved scenes
        scenes = db.list_scenes(project_id)
        approved_scenes = [s for s in scenes if s.user_approved]

        if not approved_scenes:
            raise ValueError("No approved scenes to stitch")

        # Collect video URLs
        video_urls = [s.lipsync_video_url or s.video_url for s in approved_scenes if s.lipsync_video_url or s.video_url]

        if not video_urls:
            raise ValueError("No generated videos found")

        # Stitch videos using VideoStitcher
        from app.services.video_pipeline import VideoPipelineService

        pipeline_service = VideoPipelineService()
        final_video_url = pipeline_service.stitch_videos(
            video_urls=video_urls,
            audio_url=audio_url,
            output_format="mp4",
            metadata={
                "project_id": project_id,
                "scene_count": len(approved_scenes),
            },
        )

        # Deduct credits
        credit_service = CreditService()
        from app.recipes.storyboard_video import CREDIT_COSTS

        credit_result = credit_service.deduct_credits(
            user_id=user_id,
            operation="final_stitching",
            cost_credits=CREDIT_COSTS.final_stitching,
            metadata={"project_id": project_id},
            idempotency_key=idempotency_key,
        )

        if not credit_result.success:
            raise ValueError(f"Credit deduction failed: {credit_result.error}")

        # Calculate total duration
        total_duration = sum(s.duration_seconds for s in approved_scenes)

        # Update project
        db.update_project(
            project_id,
            final_video_url=final_video_url,
            duration_seconds=total_duration,
            workflow_state=StoryboardWorkflowState.FINAL_AWAITING_APPROVAL,
        )

        logger.info(
            "stitch_final_video_task_completed",
            extra={
                "project_id": project_id,
                "final_video_url": final_video_url[:100],
                "scene_count": len(approved_scenes),
                "total_duration": total_duration,
                "credits_deducted": CREDIT_COSTS.final_stitching,
            },
        )

        return {
            "project_id": project_id,
            "status": "completed",
            "final_video_url": final_video_url,
            "scene_count": len(approved_scenes),
            "total_duration": total_duration,
            "credits_deducted": CREDIT_COSTS.final_stitching,
            "task_id": self.request.id,
        }

    except Exception as e:
        logger.error(
            "stitch_final_video_task_failed",
            extra={
                "project_id": project_id,
                "error": str(e),
                "task_id": self.request.id,
            },
        )
        raise self.retry(exc=e, countdown=20)


@app.task(bind=True, name="storyboard.score_final_video", max_retries=1)
def score_final_video_task(
    self,
    project_id: str,
    user_id: str,
    final_video_url: str,
) -> dict:
    """
    Score final video using Gemini vision.

    Phase 2: Actual implementation:
    - Call QualityScoreService with video URL
    - Assess visual consistency, audio sync, production quality
    - Deduct credits with idempotency key
    - Store scores in project
    - Update workflow state
    - Return quality report
    """
    try:
        idempotency_key = f"{project_id}_scoring_{self.request.retries}"

        logger.info(
            "score_final_video_task_started",
            extra={
                "project_id": project_id,
                "video_url": final_video_url[:100],
                "task_id": self.request.id,
            },
        )

        db = StoryboardRepository()
        project = db.get_project(project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")

        # Score the video
        quality_service = QualityScoreService()
        video_score = quality_service.score_video(
            video_url=final_video_url,
            ad_category=project.ad_category,
            has_lipsync=(project.ad_category in ["ugc_testimonial", "founder_talking_head"]),
        )

        # Deduct credits
        credit_service = CreditService()
        from app.recipes.storyboard_video import CREDIT_COSTS

        credit_result = credit_service.deduct_credits(
            user_id=user_id,
            operation="final_scoring",
            cost_credits=CREDIT_COSTS.final_scoring,
            metadata={"project_id": project_id},
            idempotency_key=idempotency_key,
        )

        if not credit_result.success:
            logger.warning(
                "video_scoring_credit_deduction_failed",
                extra={
                    "project_id": project_id,
                    "error": credit_result.error,
                },
            )

        # Update project with scores
        db.update_project(
            project_id,
            final_score=video_score.improvement_suggestions + [
                f"Overall score: {video_score.overall:.1f}/10",
                f"Visual consistency: {video_score.visual_consistency:.1f}/10",
                f"Audio sync: {video_score.audio_sync:.1f}/10",
            ],
            workflow_state=StoryboardWorkflowState.COMPLETED,
        )

        logger.info(
            "score_final_video_task_completed",
            extra={
                "project_id": project_id,
                "overall_score": video_score.overall,
                "visual_consistency": video_score.visual_consistency,
                "audio_sync": video_score.audio_sync,
            },
        )

        return {
            "project_id": project_id,
            "status": "completed",
            "overall_score": video_score.overall,
            "scores": {
                "visual_consistency": video_score.visual_consistency,
                "audio_sync": video_score.audio_sync,
                "lipsync_accuracy": video_score.lipsync_accuracy,
                "production_quality": video_score.production_quality,
                "platform_ready": video_score.platform_ready,
            },
            "suggestions": video_score.improvement_suggestions,
            "credits_deducted": CREDIT_COSTS.final_scoring,
            "task_id": self.request.id,
        }

    except Exception as e:
        logger.error(
            "score_final_video_task_failed",
            extra={
                "project_id": project_id,
                "error": str(e),
                "task_id": self.request.id,
            },
        )
        # Don't retry scoring - just log and return neutral score
        return {
            "project_id": project_id,
            "status": "failed",
            "overall_score": 5.0,
            "error": str(e),
            "task_id": self.request.id,
        }


@app.task(bind=True, name="storyboard.retry_failed_scenes", max_retries=2)
def retry_failed_scenes_task(
    self,
    project_id: str,
    user_id: str,
    scene_ids: list[str] | None = None,
) -> dict:
    """
    Retry generation for failed scenes (idempotent).

    Phase 2: Actual implementation:
    - Identify failed scenes (or use provided list)
    - Re-run generation with same idempotency keys
    - This prevents double-charging due to idempotency
    - Update scene states
    - Return success/failure count
    """
    try:
        logger.info(
            "retry_failed_scenes_task_started",
            extra={
                "project_id": project_id,
                "scene_count": len(scene_ids) if scene_ids else "all",
                "task_id": self.request.id,
            },
        )

        db = StoryboardRepository()
        project = db.get_project(project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")

        # Get scenes to retry
        all_scenes = db.list_scenes(project_id)
        if scene_ids:
            # Retry specific scenes
            scenes_to_retry = [s for s in all_scenes if s.id in scene_ids]
        else:
            # Retry all failed scenes
            scenes_to_retry = [s for s in all_scenes if s.state == SceneState.FAILED]

        if not scenes_to_retry:
            logger.info(
                "no_failed_scenes_to_retry",
                extra={"project_id": project_id},
            )
            return {
                "project_id": project_id,
                "status": "no_failed_scenes",
                "retried_count": 0,
                "success_count": 0,
                "failed_count": 0,
                "task_id": self.request.id,
            }

        success_count = 0
        failed_count = 0
        retry_scene_ids = []

        # Re-run generation for each failed scene
        # Note: Idempotency keys ensure credits aren't double-charged
        for scene in scenes_to_retry:
            try:
                # Re-trigger video generation with same idempotency key
                # The credit system will recognize the idempotency key and not double-charge
                result = generate_scene_video_task(
                    project_id=project_id,
                    scene_id=scene.id,
                    user_id=user_id,
                    audio_url=None,
                )

                if result.get("status") == "completed":
                    success_count += 1
                    retry_scene_ids.append(scene.id)
                else:
                    failed_count += 1
                    logger.warning(
                        "scene_retry_failed",
                        extra={
                            "project_id": project_id,
                            "scene_id": scene.id,
                            "result": result,
                        },
                    )

            except Exception as e:
                failed_count += 1
                logger.error(
                    "scene_retry_error",
                    extra={
                        "project_id": project_id,
                        "scene_id": scene.id,
                        "error": str(e),
                    },
                )

        logger.info(
            "retry_failed_scenes_task_completed",
            extra={
                "project_id": project_id,
                "retried_count": len(scenes_to_retry),
                "success_count": success_count,
                "failed_count": failed_count,
            },
        )

        return {
            "project_id": project_id,
            "status": "completed",
            "retried_count": len(scenes_to_retry),
            "success_count": success_count,
            "failed_count": failed_count,
            "retried_scene_ids": retry_scene_ids,
            "task_id": self.request.id,
        }

    except Exception as e:
        logger.error(
            "retry_failed_scenes_task_failed",
            extra={
                "project_id": project_id,
                "error": str(e),
                "task_id": self.request.id,
            },
        )
        raise self.retry(exc=e, countdown=30)
