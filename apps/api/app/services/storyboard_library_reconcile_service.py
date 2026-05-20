from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from app.db.repositories.storyboard_repository import StoryboardRepository
from app.db.repositories.video_repository import VideoRepository
from app.db.firestore_utils import utcnow

logger = logging.getLogger(__name__)


def _normalize_storyboard_final_video_url(raw_url: str | None) -> str | None:
    raw = str(raw_url or "").strip()
    if not raw:
        return None
    if raw.startswith("/api/renders/"):
        return raw
    raw_norm = raw.replace("\\", "/")
    if "/data/renders/" in raw_norm or raw_norm.startswith("data/renders/"):
        name = Path(raw_norm).name
        if name:
            return f"/api/renders/{name}"
    return raw


class StoryboardLibraryReconcileService:
    """
    Admin-safe reconciliation for storyboard library records.

    This only upserts library metadata from existing project outputs and does not
    trigger generation, TTS, lipsync, or provider API calls.
    """

    def __init__(self) -> None:
        self.storyboard_repo = StoryboardRepository()
        self.video_repo = VideoRepository(None)

    def reconcile_project(self, project_id: str) -> dict[str, Any]:
        project = self.storyboard_repo.get_project(project_id)
        if not project:
            raise ValueError(f"Project not found: {project_id}")

        user_id = str(getattr(project, "user_id", "") or "").strip()
        if not user_id:
            raise ValueError(f"Project {project_id} has no user_id")

        normalized_output_url = _normalize_storyboard_final_video_url(getattr(project, "final_video_url", None))
        if not normalized_output_url:
            raise ValueError(
                f"Project {project_id} has no final_video_url to reconcile. "
                "Finish stitching/finalization first."
            )

        existing = next(
            (
                video for video in self.video_repo.list_by_user(user_id=user_id, limit=500)
                if str(getattr(video, "project_id", "") or "").strip() == project_id
                and str(getattr(video, "pipeline_mode", "") or "").strip() == "storyboard_ad"
            ),
            None,
        )

        payload = {
            "title": str(getattr(project, "product_name", "") or "Storyboard Ad").strip(),
            "template": str(getattr(project, "ad_category", "") or "storyboard_ad"),
            "language": str(getattr(project, "language", "") or "en"),
            "script": str(getattr(project, "display_script", "") or ""),
            "voice": str(getattr(project, "selected_voice", "") or "Kore"),
            "aspect_ratio": "9:16",
            "resolution": "720p",
            "duration_mode": "manual",
            "duration_seconds": int(getattr(project, "duration_seconds", 0) or 0) or None,
            "status": "completed",
            "progress": 100,
            "selected_model": str(getattr(project, "selected_video_model_key", "") or None),
            "provider_name": "storyboard_pipeline",
            "thumbnail_url": getattr(project, "final_thumbnail_url", None) or getattr(project, "thumbnail_url", None),
            "output_url": normalized_output_url,
            "project_id": project_id,
            "projectId": project_id,
            "pipeline_mode": "storyboard_ad",
            "pipeline_metadata": {
                "source": "storyboard_ad",
                "type": "storyboard_ad",
                "project_id": project_id,
                "quality_profile": str(getattr(project, "selected_video_quality_label", "") or ""),
                "credits_consumed": int(getattr(project, "credits_consumed", 0) or 0),
                "platform": str(getattr(project, "platform", "") or ""),
            },
            "updated_at": utcnow(),
        }

        action = "updated" if existing else "created"
        if existing:
            self.video_repo.update(existing, **payload)
            video_id = str(existing.id)
        else:
            created = self.video_repo.create(
                user_id=user_id,
                id=f"storyboard-{project_id}",
                captions_enabled=False,
                narration_enabled=True,
                music_mode="none",
                music_volume=0,
                duck_music=False,
                audio_sample_rate_hz=48000,
                image_urls=[],
                reference_images=[],
                recipe_inputs={},
                **payload,
            )
            video_id = str(created.id)

        logger.info(
            "storyboard_video_library_record_reconciled",
            extra={"project_id": project_id, "user_id": user_id, "action": action, "video_id": video_id},
        )
        return {
            "status": "success",
            "action": action,
            "project_id": project_id,
            "user_id": user_id,
            "video_id": video_id,
            "output_url": normalized_output_url,
        }

