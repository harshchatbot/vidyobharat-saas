"""
Firestore repository for storyboard projects and scenes.

Handles CRUD operations for the storyboard pipeline entities:
- StoryboardProject: Top-level project containing all scenes
- StoryboardScene: Individual scene within a project
"""
from __future__ import annotations

import inspect
import json
import logging
from datetime import datetime
from typing import Any
from uuid import uuid4

from app.db.firestore_utils import coerce_datetime, utcnow
from app.providers.firebase import get_firestore_client

logger = logging.getLogger(__name__)


class StoryboardProject:
    """Data model for a storyboard project."""

    def __init__(
        self,
        id: str,
        user_id: str,
        ad_category: str,
        workflow_state: str,
        business_brief: str,
        platform: str,
        language: str,
        tone: str,
        avatar_id: str | None = None,
        avatar_name: str | None = None,
        creation_mode: str | None = None,
        production_path: str | None = None,
        product_image_url: str | None = None,
        product_reference_images: list[str] | None = None,
        avatar_reference_images: list[str] | None = None,
        character_reference_sheet_url: str | None = None,
        character_reference_sheet_prompt: str | None = None,
        character_reference_sheet_status: str | None = None,
        character_reference_sheet_fallback_to_golden_refs: bool | None = None,
        scene_generation_id: str | None = None,
        display_script: str | None = None,
        script_word_count: int | None = None,
        script_estimated_duration_seconds: float | None = None,
        script_duration_status: str | None = None,
        script_source: str | None = None,
        script_updated_at: datetime | None = None,
        tts_script: str | None = None,
        selected_voice: str | None = None,
        selected_tts_language_code: str | None = None,
        selected_tts_language_label: str | None = None,
        selected_tts_provider_language_code: str | None = None,
        selected_tts_voice_id: str | None = None,
        selected_tts_voice_name: str | None = None,
        selected_tts_provider_voice_name: str | None = None,
        selected_video_quality_label: str | None = None,
        selected_video_model_key: str | None = None,
        selected_ad_duration_seconds: int | None = None,
        target_ad_duration_seconds: int | None = 15,
        selected_duration_label: str | None = None,
        requested_ad_duration_seconds: int | None = None,
        actual_estimated_output_duration_seconds: int | None = None,
        production_credit_estimate: dict[str, Any] | None = None,
        production_estimated_time_label: str | None = None,
        script_score: dict | None = None,
        storyboard_score: dict | None = None,
        final_score: dict | None = None,
        credits_estimated: int = 0,
        credits_consumed: int = 0,
        final_video_url: str | None = None,
        thumbnail_url: str | None = None,
        duration_seconds: float | None = None,
        production_status: str | None = None,
        production_task_id: str | None = None,
        production_job_id: str | None = None,
        production_started_at: datetime | None = None,
        production_completed_at: datetime | None = None,
        production_error: str | None = None,
        production_substage: str | None = None,
        stitching_status: str | None = None,
        stitching_task_id: str | None = None,
        stitching_lock: bool | None = None,
        stitching_started_at: datetime | None = None,
        stitching_queued_at: datetime | None = None,
        stitching_completed_at: datetime | None = None,
        qc_status: str | None = None,
        package_status: str | None = None,
        final_thumbnail_url: str | None = None,
        image_generation_started_at: datetime | None = None,
        created_at: datetime | None = None,
        updated_at: datetime | None = None,
        completed_at: datetime | None = None,
    ) -> None:
        self.id = id
        self.user_id = user_id
        self.ad_category = ad_category
        self.workflow_state = workflow_state
        self.business_brief = business_brief
        self.platform = platform
        self.language = language
        self.tone = tone
        self.avatar_id = avatar_id
        self.avatar_name = avatar_name
        self.creation_mode = creation_mode
        self.production_path = production_path
        self.product_image_url = product_image_url
        self.product_reference_images = list(product_reference_images or [])
        self.avatar_reference_images = list(avatar_reference_images or [])
        self.character_reference_sheet_url = character_reference_sheet_url
        self.character_reference_sheet_prompt = character_reference_sheet_prompt
        self.character_reference_sheet_status = character_reference_sheet_status
        self.character_reference_sheet_fallback_to_golden_refs = character_reference_sheet_fallback_to_golden_refs
        self.scene_generation_id = scene_generation_id
        self.display_script = display_script
        self.script_word_count = script_word_count
        self.script_estimated_duration_seconds = script_estimated_duration_seconds
        self.script_duration_status = script_duration_status
        self.script_source = script_source
        self.script_updated_at = script_updated_at
        self.tts_script = tts_script
        self.selected_voice = selected_voice
        self.selected_tts_language_code = selected_tts_language_code
        self.selected_tts_language_label = selected_tts_language_label
        self.selected_tts_provider_language_code = selected_tts_provider_language_code
        self.selected_tts_voice_id = selected_tts_voice_id
        self.selected_tts_voice_name = selected_tts_voice_name
        self.selected_tts_provider_voice_name = selected_tts_provider_voice_name
        self.selected_video_quality_label = selected_video_quality_label
        self.selected_video_model_key = selected_video_model_key
        self.selected_ad_duration_seconds = selected_ad_duration_seconds
        self.target_ad_duration_seconds = target_ad_duration_seconds
        self.selected_duration_label = selected_duration_label
        self.requested_ad_duration_seconds = requested_ad_duration_seconds
        self.actual_estimated_output_duration_seconds = actual_estimated_output_duration_seconds
        self.production_credit_estimate = production_credit_estimate
        self.production_estimated_time_label = production_estimated_time_label
        self.script_score = script_score
        self.storyboard_score = storyboard_score
        self.final_score = final_score
        self.credits_estimated = credits_estimated
        self.credits_consumed = credits_consumed
        self.final_video_url = final_video_url
        self.thumbnail_url = thumbnail_url
        self.duration_seconds = duration_seconds
        self.production_status = production_status
        self.production_task_id = production_task_id
        self.production_job_id = production_job_id
        self.production_started_at = production_started_at
        self.production_completed_at = production_completed_at
        self.production_error = production_error
        self.production_substage = production_substage
        self.stitching_status = stitching_status
        self.stitching_task_id = stitching_task_id
        self.stitching_lock = stitching_lock
        self.stitching_started_at = stitching_started_at
        self.stitching_queued_at = stitching_queued_at
        self.stitching_completed_at = stitching_completed_at
        self.qc_status = qc_status
        self.package_status = package_status
        self.final_thumbnail_url = final_thumbnail_url
        self.image_generation_started_at = image_generation_started_at
        self.created_at = created_at or utcnow()
        self.updated_at = updated_at or utcnow()
        self.completed_at = completed_at

    def to_dict(self) -> dict[str, Any]:
        """Serialize to Firestore document."""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'ad_category': self.ad_category,
            'workflow_state': self.workflow_state,
            'business_brief': self.business_brief,
            'platform': self.platform,
            'language': self.language,
            'tone': self.tone,
            'avatar_id': self.avatar_id,
            'avatar_name': self.avatar_name,
            'creation_mode': self.creation_mode,
            'production_path': self.production_path,
            'product_image_url': self.product_image_url,
            'product_reference_images': self.product_reference_images,
            'avatar_reference_images': self.avatar_reference_images,
            'character_reference_sheet_url': self.character_reference_sheet_url,
            'character_reference_sheet_prompt': self.character_reference_sheet_prompt,
            'character_reference_sheet_status': self.character_reference_sheet_status,
            'character_reference_sheet_fallback_to_golden_refs': self.character_reference_sheet_fallback_to_golden_refs,
            'scene_generation_id': self.scene_generation_id,
            'display_script': self.display_script,
            'script_word_count': self.script_word_count,
            'script_estimated_duration_seconds': self.script_estimated_duration_seconds,
            'script_duration_status': self.script_duration_status,
            'script_source': self.script_source,
            'script_updated_at': self.script_updated_at,
            'tts_script': self.tts_script,
            'selected_voice': self.selected_voice,
            'selected_tts_language_code': self.selected_tts_language_code,
            'selected_tts_language_label': self.selected_tts_language_label,
            'selected_tts_provider_language_code': self.selected_tts_provider_language_code,
            'selected_tts_voice_id': self.selected_tts_voice_id,
            'selected_tts_voice_name': self.selected_tts_voice_name,
            'selected_tts_provider_voice_name': self.selected_tts_provider_voice_name,
            'selected_video_quality_label': self.selected_video_quality_label,
            'selected_video_model_key': self.selected_video_model_key,
            'selected_ad_duration_seconds': self.selected_ad_duration_seconds,
            'target_ad_duration_seconds': self.target_ad_duration_seconds,
            'selected_duration_label': self.selected_duration_label,
            'requested_ad_duration_seconds': self.requested_ad_duration_seconds,
            'actual_estimated_output_duration_seconds': self.actual_estimated_output_duration_seconds,
            'production_credit_estimate': self.production_credit_estimate,
            'production_estimated_time_label': self.production_estimated_time_label,
            'script_score': self.script_score,
            'storyboard_score': self.storyboard_score,
            'final_score': self.final_score,
            'credits_estimated': self.credits_estimated,
            'credits_consumed': self.credits_consumed,
            'final_video_url': self.final_video_url,
            'thumbnail_url': self.thumbnail_url,
            'duration_seconds': self.duration_seconds,
            'production_status': self.production_status,
            'production_task_id': self.production_task_id,
            'production_job_id': self.production_job_id,
            'production_started_at': self.production_started_at,
            'production_completed_at': self.production_completed_at,
            'production_error': self.production_error,
            'production_substage': self.production_substage,
            'stitching_status': self.stitching_status,
            'stitching_task_id': self.stitching_task_id,
            'stitching_lock': self.stitching_lock,
            'stitching_started_at': self.stitching_started_at,
            'stitching_queued_at': self.stitching_queued_at,
            'stitching_completed_at': self.stitching_completed_at,
            'qc_status': self.qc_status,
            'package_status': self.package_status,
            'final_thumbnail_url': self.final_thumbnail_url,
            'image_generation_started_at': self.image_generation_started_at,
            'created_at': self.created_at,
            'updated_at': self.updated_at,
            'completed_at': self.completed_at,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> StoryboardProject:
        """Deserialize from Firestore document."""
        return cls(
            id=data.get('id') or '',
            user_id=data.get('user_id') or '',
            ad_category=data.get('ad_category') or '',
            workflow_state=data.get('workflow_state') or 'initialized',
            business_brief=data.get('business_brief') or '',
            platform=data.get('platform') or '',
            language=data.get('language') or 'en',
            tone=data.get('tone') or 'casual',
            avatar_id=data.get('avatar_id'),
            avatar_name=data.get('avatar_name'),
            creation_mode=data.get('creation_mode'),
            production_path=data.get('production_path'),
            product_image_url=data.get('product_image_url'),
            product_reference_images=list(data.get('product_reference_images') or []),
            avatar_reference_images=list(data.get('avatar_reference_images') or []),
            character_reference_sheet_url=data.get('character_reference_sheet_url'),
            character_reference_sheet_prompt=data.get('character_reference_sheet_prompt'),
            character_reference_sheet_status=data.get('character_reference_sheet_status'),
            character_reference_sheet_fallback_to_golden_refs=data.get('character_reference_sheet_fallback_to_golden_refs'),
            scene_generation_id=data.get('scene_generation_id'),
            display_script=data.get('display_script'),
            script_word_count=data.get('script_word_count'),
            script_estimated_duration_seconds=data.get('script_estimated_duration_seconds'),
            script_duration_status=data.get('script_duration_status'),
            script_source=data.get('script_source'),
            script_updated_at=coerce_datetime(data.get('script_updated_at')),
            tts_script=data.get('tts_script'),
            selected_voice=data.get('selected_voice'),
            selected_tts_language_code=data.get('selected_tts_language_code'),
            selected_tts_language_label=data.get('selected_tts_language_label'),
            selected_tts_provider_language_code=data.get('selected_tts_provider_language_code'),
            selected_tts_voice_id=data.get('selected_tts_voice_id'),
            selected_tts_voice_name=data.get('selected_tts_voice_name'),
            selected_tts_provider_voice_name=data.get('selected_tts_provider_voice_name'),
            selected_video_quality_label=data.get('selected_video_quality_label'),
            selected_video_model_key=data.get('selected_video_model_key'),
            selected_ad_duration_seconds=data.get('selected_ad_duration_seconds', 15),
            target_ad_duration_seconds=data.get('target_ad_duration_seconds', 15),
            selected_duration_label=data.get('selected_duration_label', '15s'),
            requested_ad_duration_seconds=data.get('requested_ad_duration_seconds'),
            actual_estimated_output_duration_seconds=data.get('actual_estimated_output_duration_seconds'),
            production_credit_estimate=data.get('production_credit_estimate'),
            production_estimated_time_label=data.get('production_estimated_time_label'),
            script_score=data.get('script_score'),
            storyboard_score=data.get('storyboard_score'),
            final_score=data.get('final_score'),
            credits_estimated=data.get('credits_estimated', 0),
            credits_consumed=data.get('credits_consumed', 0),
            final_video_url=data.get('final_video_url'),
            thumbnail_url=data.get('thumbnail_url'),
            duration_seconds=data.get('duration_seconds'),
            production_status=data.get('production_status'),
            production_task_id=data.get('production_task_id'),
            production_job_id=data.get('production_job_id'),
            production_started_at=coerce_datetime(data.get('production_started_at')),
            production_completed_at=coerce_datetime(data.get('production_completed_at')),
            production_error=data.get('production_error'),
            production_substage=data.get('production_substage'),
            stitching_status=data.get('stitching_status'),
            stitching_task_id=data.get('stitching_task_id'),
            stitching_lock=data.get('stitching_lock'),
            stitching_started_at=coerce_datetime(data.get('stitching_started_at')),
            stitching_queued_at=coerce_datetime(data.get('stitching_queued_at')),
            stitching_completed_at=coerce_datetime(data.get('stitching_completed_at')),
            qc_status=data.get('qc_status'),
            package_status=data.get('package_status'),
            final_thumbnail_url=data.get('final_thumbnail_url'),
            image_generation_started_at=coerce_datetime(data.get('image_generation_started_at')),
            created_at=coerce_datetime(data.get('created_at')),
            updated_at=coerce_datetime(data.get('updated_at')),
            completed_at=coerce_datetime(data.get('completed_at')),
        )


class StoryboardScene:
    """Data model for a single scene within a storyboard project."""

    def __init__(
        self,
        id: str,
        project_id: str,
        scene_number: int,
        scene_type: str,
        state: str,
        spoken_line: str,
        visual_description: str,
        shot_type: str,
        dialogue: str | None = None,
        voice_line: str | None = None,
        tts_text: str | None = None,
        script_line: str | None = None,
        narration: str | None = None,
        avatar_action: str | None = None,
        avatar_position: str | None = None,
        environment: str | None = None,
        mood: str | None = None,
        product_visibility: str | None = None,
        original_llm_duration_seconds: int | None = None,
        normalized_scene_duration_seconds: int | None = None,
        target_duration_seconds: int | None = None,
        duration_seconds: int = 5,
        lipsync_this_scene: bool = False,
        base_image_url: str | None = None,
        base_image_prompt: str | None = None,
        video_url: str | None = None,
        video_prompt: str | None = None,
        lipsync_video_url: str | None = None,
        user_approved: bool | None = None,
        user_feedback: str | None = None,
        regeneration_count: int = 0,
        scene_score: dict | None = None,
        image_generation_started_at: datetime | None = None,
        scene_generation_id: str | None = None,
        scene_video_status: str | None = None,
        scene_video_url: str | None = None,
        scene_video_error: str | None = None,
        scene_video_metadata: dict[str, Any] | None = None,
        scene_video_started_at: datetime | None = None,
        scene_video_completed_at: datetime | None = None,
        lipsync_status: str | None = None,
        lipsync_error: str | None = None,
        final_scene_video_url: str | None = None,
        is_active: bool = True,
        created_at: datetime | None = None,
        updated_at: datetime | None = None,
    ) -> None:
        self.id = id
        self.project_id = project_id
        self.scene_number = scene_number
        self.scene_type = scene_type
        self.state = state
        self.spoken_line = spoken_line
        self.dialogue = dialogue
        self.voice_line = voice_line
        self.tts_text = tts_text
        self.script_line = script_line
        self.narration = narration
        self.visual_description = visual_description
        self.shot_type = shot_type
        self.avatar_action = avatar_action
        self.avatar_position = avatar_position
        self.environment = environment
        self.mood = mood
        self.product_visibility = product_visibility
        self.original_llm_duration_seconds = original_llm_duration_seconds
        self.normalized_scene_duration_seconds = normalized_scene_duration_seconds
        self.target_duration_seconds = target_duration_seconds
        self.duration_seconds = duration_seconds
        self.lipsync_this_scene = lipsync_this_scene
        self.base_image_url = base_image_url
        self.base_image_prompt = base_image_prompt
        self.video_url = video_url
        self.video_prompt = video_prompt
        self.lipsync_video_url = lipsync_video_url
        self.user_approved = user_approved
        self.user_feedback = user_feedback
        self.regeneration_count = regeneration_count
        self.scene_score = scene_score
        self.image_generation_started_at = image_generation_started_at
        self.scene_generation_id = scene_generation_id
        self.scene_video_status = scene_video_status
        self.scene_video_url = scene_video_url
        self.scene_video_error = scene_video_error
        self.scene_video_metadata = scene_video_metadata
        self.scene_video_started_at = scene_video_started_at
        self.scene_video_completed_at = scene_video_completed_at
        self.lipsync_status = lipsync_status
        self.lipsync_error = lipsync_error
        self.final_scene_video_url = final_scene_video_url
        self.is_active = bool(is_active)
        self.created_at = created_at or utcnow()
        self.updated_at = updated_at or utcnow()

    def to_dict(self) -> dict[str, Any]:
        """Serialize to Firestore document."""
        return {
            'id': self.id,
            'project_id': self.project_id,
            'scene_number': self.scene_number,
            'scene_type': self.scene_type,
            'state': self.state,
            'spoken_line': self.spoken_line,
            'dialogue': self.dialogue,
            'voice_line': self.voice_line,
            'tts_text': self.tts_text,
            'script_line': self.script_line,
            'narration': self.narration,
            'visual_description': self.visual_description,
            'shot_type': self.shot_type,
            'avatar_action': self.avatar_action,
            'avatar_position': self.avatar_position,
            'environment': self.environment,
            'mood': self.mood,
            'product_visibility': self.product_visibility,
            'original_llm_duration_seconds': self.original_llm_duration_seconds,
            'normalized_scene_duration_seconds': self.normalized_scene_duration_seconds,
            'target_duration_seconds': self.target_duration_seconds,
            'duration_seconds': self.duration_seconds,
            'lipsync_this_scene': self.lipsync_this_scene,
            'base_image_url': self.base_image_url,
            'base_image_prompt': self.base_image_prompt,
            'video_url': self.video_url,
            'video_prompt': self.video_prompt,
            'lipsync_video_url': self.lipsync_video_url,
            'user_approved': self.user_approved,
            'user_feedback': self.user_feedback,
            'regeneration_count': self.regeneration_count,
            'scene_score': self.scene_score,
            'image_generation_started_at': self.image_generation_started_at,
            'scene_generation_id': self.scene_generation_id,
            'scene_video_status': self.scene_video_status,
            'scene_video_url': self.scene_video_url,
            'scene_video_error': self.scene_video_error,
            'scene_video_metadata': self.scene_video_metadata,
            'scene_video_started_at': self.scene_video_started_at,
            'scene_video_completed_at': self.scene_video_completed_at,
            'lipsync_status': self.lipsync_status,
            'lipsync_error': self.lipsync_error,
            'final_scene_video_url': self.final_scene_video_url,
            'is_active': self.is_active,
            'created_at': self.created_at,
            'updated_at': self.updated_at,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> StoryboardScene:
        """Deserialize from Firestore document."""
        return cls(
            id=data.get('id') or '',
            project_id=data.get('project_id') or '',
            scene_number=data.get('scene_number', 0),
            scene_type=data.get('scene_type') or 'default',
            state=data.get('state') or 'pending',
            spoken_line=data.get('spoken_line') or '',
            dialogue=data.get('dialogue'),
            voice_line=data.get('voice_line'),
            tts_text=data.get('tts_text'),
            script_line=data.get('script_line'),
            narration=data.get('narration'),
            visual_description=data.get('visual_description') or '',
            shot_type=data.get('shot_type') or 'medium',
            avatar_action=data.get('avatar_action'),
            avatar_position=data.get('avatar_position'),
            environment=data.get('environment'),
            mood=data.get('mood'),
            product_visibility=data.get('product_visibility'),
            original_llm_duration_seconds=data.get('original_llm_duration_seconds'),
            normalized_scene_duration_seconds=data.get('normalized_scene_duration_seconds'),
            target_duration_seconds=data.get('target_duration_seconds'),
            duration_seconds=data.get('duration_seconds', 5),
            lipsync_this_scene=data.get('lipsync_this_scene', False),
            base_image_url=data.get('base_image_url'),
            base_image_prompt=data.get('base_image_prompt'),
            video_url=data.get('video_url'),
            video_prompt=data.get('video_prompt'),
            lipsync_video_url=data.get('lipsync_video_url'),
            user_approved=data.get('user_approved'),
            user_feedback=data.get('user_feedback'),
            regeneration_count=data.get('regeneration_count', 0),
            scene_score=data.get('scene_score'),
            image_generation_started_at=coerce_datetime(data.get('image_generation_started_at')),
            scene_generation_id=data.get('scene_generation_id'),
            scene_video_status=data.get('scene_video_status'),
            scene_video_url=data.get('scene_video_url'),
            scene_video_error=data.get('scene_video_error'),
            scene_video_metadata=data.get('scene_video_metadata'),
            scene_video_started_at=coerce_datetime(data.get('scene_video_started_at')),
            scene_video_completed_at=coerce_datetime(data.get('scene_video_completed_at')),
            lipsync_status=data.get('lipsync_status'),
            lipsync_error=data.get('lipsync_error'),
            final_scene_video_url=data.get('final_scene_video_url'),
            is_active=bool(data.get('is_active', True)),
            created_at=coerce_datetime(data.get('created_at')),
            updated_at=coerce_datetime(data.get('updated_at')),
        )


class StoryboardRepository:
    """Firestore repository for storyboard projects and scenes."""

    def __init__(self) -> None:
        self.firestore = get_firestore_client()
        self.projects_collection = self.firestore.collection('storyboard_projects')

    # ===== Projects =====

    def create_project(self, **kwargs) -> StoryboardProject:
        """Create a new storyboard project."""
        project_id = kwargs.get('id') or str(uuid4())
        kwargs['id'] = project_id
        kwargs.setdefault('created_at', utcnow())
        kwargs.setdefault('updated_at', utcnow())
        kwargs.setdefault('target_ad_duration_seconds', 15)
        kwargs.setdefault('selected_duration_label', '15s')

        valid_fields = set(inspect.signature(StoryboardProject.__init__).parameters.keys()) - {'self'}
        unknown_fields = sorted([key for key in kwargs.keys() if key not in valid_fields])
        if unknown_fields:
            # Defensive sanitization so future additive payloads do not crash project init.
            logger.warning(
                'storyboard_project_model_fields_validated',
                extra={'unknown_fields': unknown_fields, 'project_id': project_id},
            )
            kwargs = {key: value for key, value in kwargs.items() if key in valid_fields}

        project = StoryboardProject(**kwargs)
        self.projects_collection.document(project_id).set(project.to_dict())
        return project

    def get_project(self, project_id: str) -> StoryboardProject | None:
        """Get a project by ID."""
        snapshot = self.projects_collection.document(project_id).get()
        if not snapshot.exists:
            return None
        data = snapshot.to_dict() or {}
        data['id'] = snapshot.id
        return StoryboardProject.from_dict(data)

    def update_project(self, project_id: str, **updates) -> StoryboardProject | None:
        """Update a project."""
        updates['updated_at'] = utcnow()
        self.projects_collection.document(project_id).update(updates)
        return self.get_project(project_id)

    def list_projects(self, user_id: str, limit: int = 100) -> list[StoryboardProject]:
        """List all projects for a user."""
        bounded_limit = max(1, min(limit, 500))
        projects = []
        query = self.projects_collection.where('user_id', '==', user_id).limit(bounded_limit)
        for snapshot in query.stream():
            data = snapshot.to_dict() or {}
            data['id'] = snapshot.id
            projects.append(StoryboardProject.from_dict(data))
        return projects

    # ===== Scenes =====

    def create_scene(self, project_id: str, **kwargs) -> StoryboardScene:
        """Create a new scene within a project."""
        scene_id = kwargs.get('id') or str(uuid4())
        kwargs['id'] = scene_id
        kwargs['project_id'] = project_id
        kwargs.setdefault('created_at', utcnow())
        kwargs.setdefault('updated_at', utcnow())

        scene = StoryboardScene(**kwargs)
        self.projects_collection.document(project_id).collection('scenes').document(scene_id).set(scene.to_dict())
        return scene

    def get_scene(self, project_id: str, scene_id: str) -> StoryboardScene | None:
        """Get a scene by ID."""
        snapshot = (
            self.projects_collection.document(project_id)
            .collection('scenes')
            .document(scene_id)
            .get()
        )
        if not snapshot.exists:
            return None
        data = snapshot.to_dict() or {}
        data['id'] = snapshot.id
        data['project_id'] = project_id
        return StoryboardScene.from_dict(data)

    def update_scene(self, project_id: str, scene_id: str, **updates) -> StoryboardScene | None:
        """Update a scene."""
        updates['updated_at'] = utcnow()
        self.projects_collection.document(project_id).collection('scenes').document(scene_id).update(updates)
        return self.get_scene(project_id, scene_id)

    def list_scenes(
        self,
        project_id: str,
        limit: int = 100,
        *,
        scene_generation_id: str | None = None,
        active_only: bool = False,
    ) -> list[StoryboardScene]:
        """List all scenes in a project."""
        bounded_limit = max(1, min(limit, 500))
        scenes = []
        query = (
            self.projects_collection.document(project_id)
            .collection('scenes')
            .limit(bounded_limit)
        )
        for snapshot in query.stream():
            data = snapshot.to_dict() or {}
            data['id'] = snapshot.id
            data['project_id'] = project_id
            scene = StoryboardScene.from_dict(data)
            if active_only and not scene.is_active:
                continue
            if scene_generation_id and str(scene.scene_generation_id or "").strip() != str(scene_generation_id).strip():
                continue
            scenes.append(scene)
        return scenes

    def delete_project(self, project_id: str) -> bool:
        """Delete a project and all its scenes."""
        # Delete all scenes first
        scenes = self.list_scenes(project_id, limit=1000)
        for scene in scenes:
            self.projects_collection.document(project_id).collection('scenes').document(scene.id).delete()

        # Delete project
        self.projects_collection.document(project_id).delete()
        return True

    def delete_scene(self, project_id: str, scene_id: str) -> bool:
        """Delete a scene."""
        self.projects_collection.document(project_id).collection('scenes').document(scene_id).delete()
        return True
