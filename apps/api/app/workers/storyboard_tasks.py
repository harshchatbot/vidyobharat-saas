"""
Celery tasks for storyboard pipeline.

Phase 2: Full implementations with service integration, state management, and credit safety.
"""
from __future__ import annotations

import logging
from typing import Any
import httpx
from uuid import uuid4
from urllib.parse import urlparse, parse_qs
from pathlib import Path
import re

from app.core.config import get_settings
from app.db.repositories.storyboard_repository import StoryboardRepository
from app.db.repositories.video_repository import VideoRepository
from app.db.firestore_utils import coerce_datetime, utcnow
from app.providers.firebase import get_firestore_client
from app.services.credit_service import CreditService
from app.services.emotion_tagging_service import EmotionTaggingService
from app.services.quality_score_service import QualityScoreService
from app.services.render_service import celery_app as app
from app.services.script_generation_service import ScriptGenerationService, detect_product_category
from app.services.storyboard_generation_service import StoryboardGenerationService
from app.services.avatar_service import AvatarService, resolve_avatar_storage_url
from app.services.storyboard_pipeline_service import SceneState, StoryboardWorkflowState
from app.services.avatar_reference_registry import resolve_golden_avatar_references
from app.services.avatar_cultural_registry import (
    build_indian_urban_grounding_guidance,
    resolve_avatar_cultural_profile,
)

logger = logging.getLogger(__name__)
settings = get_settings()

NO_TEXT_VISUAL_RULE = (
    "No text, no captions, no subtitles, no labels, no logos, no watermark, no UI buttons, "
    "no call-to-action text, no 'Shop Now' text, no typography anywhere in the image/frame."
)

_PROMPT_TEXT_INTENT_TOKENS = (
    "shop now",
    "discount",
    "text overlay",
    "logo",
    "caption",
)


def strip_storyboard_tts_metadata(text: str | None) -> str:
    """Remove metadata tag lines so only spoken text is sent to TTS."""
    source = str(text or "").strip()
    if not source:
        return ""
    lines: list[str] = []
    for raw in source.splitlines():
        line = str(raw or "").strip()
        if not line:
            continue
        lowered = line.lower()
        if lowered.startswith("[emotional context:"):
            continue
        if lowered.startswith("[language:"):
            continue
        if lowered.startswith("[delivery:"):
            continue
        lines.append(line)
    cleaned = "\n".join(lines).strip()
    return cleaned or source


def build_storyboard_tts_style(
    *,
    ad_category: str,
    language: str,
    voice: str,
    tone: str,
    generation_mode: str,
) -> dict[str, str]:
    category = str(ad_category or "").strip().lower()
    language_value = str(language or "").strip() or "English (India)"
    voice_value = str(voice or "").strip() or "Kore"
    tone_value = str(tone or "").strip().lower() or "casual"

    emotional_context_map: dict[str, str] = {
        "ugc_testimonial": "Authentic personal experience shared naturally by a real creator with relatable warmth.",
        "founder_talking_head": "Founder-led storytelling with credible authority, trust, and calm conviction.",
        "problem_solution": "Empathetic opening, reassuring middle, and confident benefit-driven resolution.",
        "product_demo_lifestyle": "Warm aspirational lifestyle storytelling with sensory and premium product feel.",
        "inner_monologue": "Introspective personal reflection with emotional honesty and thoughtful pauses.",
        "cinematic_narration": "Emotionally rich visual storytelling with premium cinematic atmosphere and reflective tone.",
        "cinematic_broll": "Heartwarming handcrafted story focused on comfort, gifting, emotional connection, and nostalgia.",
    }
    delivery_profile_map: dict[str, str] = {
        "ugc_testimonial": "Conversational, friendly, slight enthusiasm, avoid scripted delivery and announcer tone.",
        "founder_talking_head": "Clear articulation, calm authority, persuasive but never salesy.",
        "problem_solution": "Natural pacing with emotional progression from concern to reassurance to confidence.",
        "product_demo_lifestyle": "Smooth pacing, warm premium texture, allow sensory words to breathe.",
        "inner_monologue": "Intimate and reflective cadence with thoughtful pauses and personal sincerity.",
        "cinematic_narration": "Slow deliberate pacing, meaningful pauses, intimate luxury-brand narration feel.",
        "cinematic_broll": "Soft emotional narration, gentle pacing, warm nostalgic tone, let visuals breathe.",
    }

    emotional_context = emotional_context_map.get(
        category,
        "Natural, emotionally grounded storytelling suitable for social ad narration.",
    )
    delivery_profile = delivery_profile_map.get(
        category,
        "Natural pacing, clear pronunciation, conversational flow.",
    )
    if tone_value in {"energetic", "inspiring"} and category in {"ugc_testimonial", "problem_solution"}:
        delivery_profile = f"{delivery_profile} Add controlled uplift and positive momentum."

    hindi_like = bool(re.search(r"\b(hindi|hinglish|hi[-_ ]?in)\b", language_value.lower()))
    hindi_guidance = (
        " Use natural Hindi/Hinglish cadence, emotional pauses, and conversational delivery. "
        "Avoid textbook narration and robotic pronunciation."
        if hindi_like
        else ""
    )
    mode_phrase = (
        "Cinematic narration voiceover mode."
        if generation_mode == "narration_combined"
        else "Scene-level sync voice mode."
    )
    style_instruction = (
        f"{mode_phrase} {emotional_context} Delivery: {delivery_profile} "
        f"Language: {language_value}. Voice: {voice_value}.{hindi_guidance}"
    ).strip()
    return {
        "emotional_context": emotional_context,
        "delivery_profile": delivery_profile,
        "style_instruction": style_instruction,
    }


def _redact_url(value: str | None) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    try:
        parsed = urlparse(raw)
        return f"{parsed.scheme}://{parsed.netloc}{parsed.path}" if parsed.scheme and parsed.netloc else raw.split("?", 1)[0]
    except Exception:
        return raw.split("?", 1)[0]


def _is_avatar_led_scene(project, scene) -> bool:
    from app.recipes.storyboard_video import STORYBOARD_AD_CATEGORIES

    category_cfg = STORYBOARD_AD_CATEGORIES.get(str(project.ad_category or "").strip().lower())
    category_avatar_required = bool(getattr(category_cfg, "avatar_required", False)) if category_cfg else False
    scene_avatar_hint = bool(str(getattr(scene, "avatar_action", "") or "").strip())
    return category_avatar_required or scene_avatar_hint


def _resolve_avatar_identity_anchor(*, project, user_id: str) -> tuple[str | None, str | None]:
    avatar_id = str(getattr(project, "avatar_id", "") or "").strip()
    if not avatar_id:
        return None, None
    try:
        avatar = AvatarService().get_avatar(avatar_id, user_id=user_id)
        if not avatar:
            return None, None
        reference_url = str(
            getattr(avatar, "primary_image", None)
            or ((getattr(avatar, "reference_images", None) or [None])[0])
            or ""
        ).strip() or None
        avatar_name = str(getattr(avatar, "name", "") or "").strip()
        if not avatar_name:
            avatar_name = None  # Let caller use project.avatar_name fallback
        return avatar_name, reference_url
    except Exception:
        logger.warning(
            "storyboard_avatar_identity_anchor_resolution_failed",
            extra={"project_id": getattr(project, "id", None), "avatar_id": avatar_id},
            exc_info=True,
        )
        return None, None


_STORYBOARD_AVATAR_REFERENCE_FALLBACKS: dict[str, list[str]] = {
    "chitrakala": [
        "gs://rangmanch-ai-backend.firebasestorage.app/avatars/chitrakala/avatar_chitrakala_front1.jpg",
        "gs://rangmanch-ai-backend.firebasestorage.app/avatars/chitrakala/avatar_chitrakala_desk5.png",
    ],
    "charulata": [
        "gs://rangmanch-ai-backend.firebasestorage.app/avatars/charulata/avtaar_charulata.jpeg",
    ],
}


def _resolve_avatar_reference_images(*, project, user_id: str) -> tuple[str | None, list[str]]:
    avatar_id = str(getattr(project, "avatar_id", "") or "").strip()
    avatar_name = str(getattr(project, "avatar_name", "") or "").strip() or None
    golden = resolve_golden_avatar_references(avatar_id=avatar_id, avatar_name=avatar_name, limit=3)
    if golden:
        return avatar_name or avatar_id or None, golden
    configured = [str(url).strip() for url in list(getattr(project, "avatar_reference_images", []) or []) if str(url).strip()]

    resolved_urls: list[str] = [resolve_avatar_storage_url(url) for url in configured if url]
    if resolved_urls:
        return avatar_name or avatar_id or None, list(dict.fromkeys(resolved_urls))

    if avatar_id:
        try:
            avatar = AvatarService().get_avatar(avatar_id, user_id=user_id)
            if avatar:
                avatar_name = str(getattr(avatar, "name", "") or "").strip() or avatar_name or avatar_id
                variants = list(getattr(avatar, "reference_image_variants", []) or [])
                for variant in variants:
                    if isinstance(variant, dict):
                        maybe_url = str(variant.get("url") or "").strip()
                    else:
                        maybe_url = str(getattr(variant, "url", "") or "").strip()
                    if maybe_url:
                        resolved_urls.append(resolve_avatar_storage_url(maybe_url))
                for item in list(getattr(avatar, "reference_images", []) or []):
                    maybe_url = str(item or "").strip()
                    if maybe_url:
                        resolved_urls.append(resolve_avatar_storage_url(maybe_url))
                primary = str(getattr(avatar, "primary_image", "") or "").strip()
                if primary:
                    resolved_urls.insert(0, resolve_avatar_storage_url(primary))
        except Exception:
            logger.warning(
                "storyboard_avatar_reference_resolution_failed",
                extra={"project_id": getattr(project, "id", None), "avatar_id": avatar_id},
                exc_info=True,
            )

    if not resolved_urls:
        fallback_key = (avatar_id or avatar_name or "").strip().lower()
        fallback = _STORYBOARD_AVATAR_REFERENCE_FALLBACKS.get(fallback_key, [])
        resolved_urls.extend(resolve_avatar_storage_url(url) for url in fallback)

    return avatar_name or avatar_id or None, list(dict.fromkeys([url for url in resolved_urls if url]))


def _select_strong_avatar_references(reference_urls: list[str], limit: int = 2) -> list[str]:
    if not reference_urls:
        return []
    priority_tokens = ("front", "smile", "desk", "selfie")
    ranked = sorted(
        list(dict.fromkeys(reference_urls)),
        key=lambda url: (
            0 if any(token in str(url).lower() for token in priority_tokens) else 1,
            len(str(url)),
        ),
    )
    return ranked[: max(1, limit)]


def _strip_overlay_text_hints(value: str | None) -> tuple[str, bool]:
    source = str(value or "").strip()
    if not source:
        return "", False
    normalized = source
    changed = False
    removal_tokens = (
        "add text",
        "on-screen text",
        "overlay text",
        "caption",
        "cta text",
        "headline text",
        "title text",
    )
    lines = [line.strip() for line in normalized.splitlines() if line.strip()]
    kept_lines: list[str] = []
    for line in lines:
        lowered = line.lower()
        if any(token in lowered for token in removal_tokens):
            changed = True
            continue
        kept_lines.append(line)
    cleaned = " ".join(kept_lines).strip()
    return cleaned or source, changed


def _append_no_text_prompt_safety(prompt: str) -> str:
    base = str(prompt or "").strip()
    if not base:
        return NO_TEXT_VISUAL_RULE
    if NO_TEXT_VISUAL_RULE.lower() in base.lower():
        return base
    return f"{base}\n\n{NO_TEXT_VISUAL_RULE}"


def _append_text_intent_safety_if_needed(prompt: str) -> str:
    base = str(prompt or "").strip()
    lower = base.lower()
    if any(token in lower for token in _PROMPT_TEXT_INTENT_TOKENS):
        extra = (
            "Do not render this as visible text inside the image; treat it only as marketing intent."
        )
        if extra.lower() not in lower:
            return f"{base}\n\n{extra}"
    return base


def _resolve_project_cultural_grounding(project) -> tuple[str | None, str | None, str | None]:
    profile = resolve_avatar_cultural_profile(
        avatar_id=str(getattr(project, "avatar_id", "") or "").strip() or None,
        avatar_name=str(getattr(project, "avatar_name", "") or "").strip() or None,
    )
    if not profile or str(profile.nationality or "").strip().lower() != "indian":
        return None, None, None
    return (
        build_indian_urban_grounding_guidance(profile),
        profile.cultural_profile,
        profile.key,
    )


def _normalize_scene_plan_durations(
    *,
    durations: list[int],
    target_duration_seconds: int,
) -> list[int]:
    scene_count = max(1, len(durations))
    target = int(target_duration_seconds)
    exact_map: dict[tuple[int, int], list[int]] = {
        (10, 2): [5, 5],
        (15, 2): [7, 8],
        (15, 3): [5, 5, 5],
        (20, 2): [10, 10],
        (20, 4): [5, 5, 5, 5],
        (30, 4): [7, 8, 7, 8],
        (30, 5): [6, 6, 6, 6, 6],
    }
    if (target, scene_count) in exact_map:
        return list(exact_map[(target, scene_count)])

    min_scene = 3
    max_scene = 10
    safe = [max(min_scene, min(max_scene, int(value or min_scene))) for value in durations]
    total = sum(safe)
    if total <= 0:
        safe = [max(min_scene, target // scene_count) for _ in range(scene_count)]
        total = sum(safe)

    adjusted = list(safe)
    idx = 0
    while total != target and idx < 500:
        pointer = idx % scene_count
        if total < target and adjusted[pointer] < max_scene:
            adjusted[pointer] += 1
            total += 1
        elif total > target and adjusted[pointer] > min_scene:
            adjusted[pointer] -= 1
            total -= 1
        idx += 1
    if total != target:
        base = target // scene_count
        remainder = target - (base * scene_count)
        adjusted = [base + (1 if i < remainder else 0) for i in range(scene_count)]
    return adjusted


def _resolve_reference_urls_for_storyboard(urls: list[str]) -> list[str]:
    resolved: list[str] = []
    for candidate in urls:
        raw = str(candidate or "").strip()
        if not raw:
            continue
        try:
            parsed = urlparse(raw)
            query = parse_qs(parsed.query or "", keep_blank_values=True)
            stale_signed = "X-Goog-Signature" in query or "X-Goog-Date" in query or "X-Goog-Expires" in query
            if stale_signed:
                logger.info(
                    "reference_url_signed_url_detected",
                    extra={"source_url": _redact_url(raw)},
                )
            fresh = resolve_avatar_storage_url(raw)
            if fresh and str(fresh).strip():
                resolved.append(str(fresh).strip())
                logger.info(
                    "reference_url_resolved_fresh",
                    extra={"source_url": _redact_url(raw), "resolved_url": _redact_url(fresh)},
                )
                continue
            logger.warning("reference_url_skipped", extra={"source_url": _redact_url(raw)})
        except Exception:
            logger.warning("reference_url_resolve_failed", extra={"source_url": _redact_url(raw)}, exc_info=True)
    logger.info("reference_url_valid_count", extra={"count": len(resolved)})
    return resolved


def scene_requires_lipsync(scene: Any, project: Any | None = None) -> tuple[bool, str]:
    scene_number = int(getattr(scene, "scene_number", 0) or 0)
    project_id = str(getattr(scene, "project_id", "") or getattr(project, "id", "") or "")
    if bool(getattr(scene, "lipsync_this_scene", False)):
        logger.info(
            "storyboard_scene_lipsync_enabled",
            extra={
                "project_id": project_id,
                "scene_id": str(getattr(scene, "id", "") or ""),
                "scene_number": scene_number,
                "requires_lipsync": True,
                "source": "lipsync_this_scene",
            },
        )
        return True, "lipsync_this_scene"
    if bool(getattr(scene, "lipsync_required", False)):
        logger.info(
            "storyboard_scene_lipsync_enabled",
            extra={
                "project_id": project_id,
                "scene_id": str(getattr(scene, "id", "") or ""),
                "scene_number": scene_number,
                "requires_lipsync": True,
                "source": "lipsync_required",
            },
        )
        return True, "lipsync_required"
    if bool(getattr(scene, "requires_lipsync", False)):
        logger.info(
            "storyboard_scene_lipsync_enabled",
            extra={
                "project_id": project_id,
                "scene_id": str(getattr(scene, "id", "") or ""),
                "scene_number": scene_number,
                "requires_lipsync": True,
                "source": "requires_lipsync",
            },
        )
        return True, "requires_lipsync"
    logger.info(
        "storyboard_scene_lipsync_skipped",
        extra={
            "project_id": project_id,
            "scene_id": str(getattr(scene, "id", "") or ""),
            "scene_number": scene_number,
            "requires_lipsync": False,
            "source": "none",
        },
    )
    return False, "none"


def _is_cinematic_narration_mode(project: Any | None) -> bool:
    category = str(getattr(project, "ad_category", "") or "").strip().lower() if project else ""
    return category in {"cinematic_broll", "cinematic_narration"}


def _narration_audio_ready(project: Any | None) -> tuple[bool, str]:
    if not project:
        return False, ""
    narration_audio_url = str(getattr(project, "tts_audio_url", "") or "").strip()
    tts_status = str(getattr(project, "tts_status", "") or "").strip().lower()
    ready = bool(narration_audio_url) and tts_status == "completed"
    if ready:
        logger.info(
            "storyboard_narration_audio_url_present",
            extra={"project_id": str(getattr(project, "id", "") or ""), "tts_status": tts_status},
        )
    else:
        logger.info(
            "storyboard_narration_audio_missing",
            extra={
                "project_id": str(getattr(project, "id", "") or ""),
                "tts_status": tts_status,
                "audio_url_present": bool(narration_audio_url),
            },
        )
    return ready, narration_audio_url


def _should_queue_stitch_for_mode(
    *,
    cinematic_mode: bool,
    all_scene_videos_completed: bool,
    narration_ready: bool,
    all_required_lipsync_completed: bool,
) -> tuple[bool, str]:
    if not all_scene_videos_completed:
        return False, "scene_videos_incomplete"
    if cinematic_mode:
        if not narration_ready:
            return False, "waiting_for_narration"
        return True, "cinematic_ready"
    if not all_required_lipsync_completed:
        return False, "waiting_for_lipsync"
    return True, "speaking_ready"


def _create_storyboard_completion_notification(
    *,
    project_id: str,
    user_id: str,
    final_video_url: str | None,
    thumbnail_url: str | None,
) -> None:
    try:
        logger.info("storyboard_completion_notification_create_started", extra={"project_id": project_id, "user_id": user_id})
        firestore = get_firestore_client()
        existing = list(
            firestore.collection("notifications")
            .where("user_id", "==", user_id)
            .where("type", "==", "storyboard_ad_completed")
            .where("project_id", "==", project_id)
            .limit(1)
            .stream()
        )
        if existing:
            logger.info("storyboard_completion_notification_skipped_duplicate", extra={"project_id": project_id, "user_id": user_id})
            return
        firestore.collection("notifications").add(
            {
                "user_id": user_id,
                "type": "storyboard_ad_completed",
                "title": "Your storyboard ad is ready",
                "message": "Your AI storyboard ad has finished generating.",
                "project_id": project_id,
                "video_id": project_id,
                "final_video_url": final_video_url,
                "thumbnail_url": thumbnail_url,
                "target_url": f"/story-ad?projectId={project_id}",
                "metadata": {
                    "project_id": project_id,
                    "output_url": final_video_url,
                    "thumbnail_url": thumbnail_url,
                    "target_url": f"/story-ad?projectId={project_id}",
                    "provider": "storyboard",
                },
                "read": False,
                "created_at": utcnow(),
                "updated_at": utcnow(),
            }
        )
        logger.info("storyboard_completion_notification_created", extra={"project_id": project_id, "user_id": user_id})
    except Exception:
        logger.error("storyboard_completion_notification_failed", extra={"project_id": project_id, "user_id": user_id}, exc_info=True)


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


def _upsert_storyboard_video_library_record(
    *,
    project_id: str,
    user_id: str,
    project: Any,
    final_video_url: str | None,
    thumbnail_url: str | None,
    duration_seconds: int | None,
    credits_consumed: int | None,
) -> None:
    try:
        normalized_output_url = _normalize_storyboard_final_video_url(final_video_url)
        if not normalized_output_url:
            return
        repo = VideoRepository(None)  # Firestore-backed paths are used in production.
        existing = next(
            (
                video for video in repo.list_by_user(user_id=user_id, limit=200)
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
            "duration_seconds": int(duration_seconds or 0) or None,
            "status": "completed",
            "progress": 100,
            "selected_model": str(getattr(project, "selected_video_model_key", "") or None),
            "provider_name": "storyboard_pipeline",
            "thumbnail_url": thumbnail_url,
            "output_url": normalized_output_url,
            "project_id": project_id,
            "projectId": project_id,
            "pipeline_mode": "storyboard_ad",
            "pipeline_metadata": {
                "source": "storyboard_ad",
                "type": "storyboard_ad",
                "project_id": project_id,
                "quality_profile": str(getattr(project, "selected_video_quality_label", "") or ""),
                "credits_consumed": int(credits_consumed or 0),
                "platform": str(getattr(project, "platform", "") or ""),
            },
            "updated_at": utcnow(),
        }
        if existing:
            repo.update(existing, **payload)
        else:
            repo.create(
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
        logger.info("storyboard_video_library_record_upserted", extra={"project_id": project_id, "user_id": user_id})
    except Exception:
        logger.warning("storyboard_video_library_record_upsert_failed", extra={"project_id": project_id, "user_id": user_id}, exc_info=True)


def _maybe_advance_storyboard_production_after_scene(
    *,
    db: StoryboardRepository,
    project_id: str,
    user_id: str,
) -> None:
    logger.info("storyboard_scene_video_completion_check_started", extra={"project_id": project_id})
    project = db.get_project(project_id)
    if not project:
        return
    scene_generation_id = str(getattr(project, "scene_generation_id", "") or "").strip() or None
    scenes = db.list_scenes(project_id, scene_generation_id=scene_generation_id, active_only=True)
    required = [scene for scene in scenes if bool(scene.user_approved)]
    if not required:
        return
    completed = [
        scene
        for scene in required
        if str(getattr(scene, "scene_video_status", "") or "").strip().lower() == "completed"
        or bool(getattr(scene, "scene_video_url", None) or scene.video_url)
    ]
    logger.info(
        "storyboard_project_video_progress_updated",
        extra={"project_id": project_id, "completed_count": len(completed), "total_count": len(required)},
    )
    logger.info(
        "storyboard_scene_video_completion_check_pending_count",
        extra={"project_id": project_id, "pending_count": max(0, len(required) - len(completed))},
    )
    if len(completed) < len(required):
        return

    logger.info("storyboard_all_scene_videos_completed", extra={"project_id": project_id, "scene_count": len(required)})
    cinematic_mode = _is_cinematic_narration_mode(project)
    logger.info(
        "storyboard_stitch_gate_mode",
        extra={
            "project_id": project_id,
            "ad_category": str(getattr(project, "ad_category", "") or ""),
            "mode": "cinematic_narration" if cinematic_mode else "speaking_avatar",
            "videos_completed": len(completed),
            "videos_required": len(required),
        },
    )
    if cinematic_mode:
        logger.info(
            "storyboard_cinematic_narration_detected",
            extra={"project_id": project_id, "ad_category": str(getattr(project, "ad_category", "") or "")},
        )

    lipsync_required_scenes: list[Any] = []
    for scene in required:
        requires_lipsync, source = scene_requires_lipsync(scene, project)
        if requires_lipsync:
            lipsync_required_scenes.append(scene)
            logger.info("storyboard_scene_lipsync_required_detected", extra={"project_id": project_id, "scene_id": scene.id, "source": source})
    logger.info("storyboard_lipsync_required_scene_count", extra={"project_id": project_id, "count": len(lipsync_required_scenes)})
    if lipsync_required_scenes:
        tts_status = str(getattr(project, "tts_status", "") or "").strip().lower()
        if tts_status == "completed":
            scene_audio_map: dict[str, str] = {}
            for scene in lipsync_required_scenes:
                scene_audio_url = str(getattr(scene, "tts_audio_url", "") or "").strip()
                if scene_audio_url:
                    scene_audio_map[str(scene.id)] = scene_audio_url
            if len(scene_audio_map) < len(lipsync_required_scenes):
                logger.info(
                    "storyboard_stitching_skipped_until_lipsync_complete",
                    extra={"project_id": project_id, "reason": "scene_tts_missing", "scene_tts_count": len(scene_audio_map), "required_count": len(lipsync_required_scenes)},
                )
                return
            _queue_lipsync_stage(
                db=db,
                project=project,
                required_scenes=required,
                user_id=user_id,
                scene_audio_map=scene_audio_map,
            )
            logger.info("storyboard_stitching_skipped_until_lipsync_complete", extra={"project_id": project_id, "reason": "lipsync_required"})
            return
        if tts_status in {"queued", "in_progress"}:
            logger.info("storyboard_tts_stage_already_running", extra={"project_id": project_id, "tts_status": tts_status})
            logger.info("storyboard_stitching_skipped_until_lipsync_complete", extra={"project_id": project_id, "reason": "tts_running"})
            return
        language_code = (
            str(getattr(project, "selected_tts_provider_language_code", "") or "").strip()
            or str(getattr(project, "selected_tts_language_label", "") or "").strip()
            or str(getattr(project, "language", "") or "").strip()
            or "English (India)"
        )
        selected_voice = (
            str(getattr(project, "selected_tts_provider_voice_name", "") or "").strip()
            or str(getattr(project, "selected_voice", "") or "").strip()
            or "Kore"
        )
        tts_script = str(getattr(project, "tts_script", "") or getattr(project, "display_script", "") or "").strip()
        if not tts_script:
            raise RuntimeError("TTS script missing for lipsync-required production flow")
        db.update_project(
            project_id,
            production_substage="tts_in_progress",
            tts_status="queued",
            tts_error=None,
        )
        logger.info("storyboard_tts_stage_queued", extra={"project_id": project_id, "scene_count": len(lipsync_required_scenes)})
        generate_tts_task.apply_async(
            kwargs={
                "project_id": project_id,
                "user_id": user_id,
                "tts_script": tts_script,
                "selected_voice": selected_voice,
                "language_code": language_code,
            }
        )
        logger.info("storyboard_stitching_skipped_until_lipsync_complete", extra={"project_id": project_id, "reason": "tts_queued"})
        return

    # Cinematic narration mode: no lipsync, but narration audio is still required.
    if cinematic_mode:
        narration_ready, narration_audio_url = _narration_audio_ready(project)
        if narration_ready:
            logger.info(
                "storyboard_cinematic_stitch_ready",
                extra={
                    "project_id": project_id,
                    "ad_category": str(getattr(project, "ad_category", "") or ""),
                    "videos_completed": len(completed),
                    "narration_ready": True,
                    "lipsync_required_count": 0,
                    "lipsync_completed_count": 0,
                },
            )
            _queue_stitching_once(
                db=db,
                project_id=project_id,
                user_id=user_id,
                required_scenes=completed,
                narration_audio_url=narration_audio_url,
            )
            return
        tts_status = str(getattr(project, "tts_status", "") or "").strip().lower()
        if tts_status in {"queued", "in_progress"}:
            logger.info(
                "storyboard_stitching_waiting_for_narration",
                extra={"project_id": project_id, "reason": "narration_tts_running"},
            )
            return
        language_code = (
            str(getattr(project, "selected_tts_provider_language_code", "") or "").strip()
            or str(getattr(project, "selected_tts_language_label", "") or "").strip()
            or str(getattr(project, "language", "") or "").strip()
            or "English (India)"
        )
        selected_voice = (
            str(getattr(project, "selected_tts_provider_voice_name", "") or "").strip()
            or str(getattr(project, "selected_voice", "") or "").strip()
            or "Kore"
        )
        tts_script = str(getattr(project, "tts_script", "") or getattr(project, "display_script", "") or "").strip()
        if not tts_script:
            raise RuntimeError("TTS script missing for cinematic narration production flow")
        db.update_project(
            project_id,
            production_substage="tts_in_progress",
            tts_status="queued",
            tts_error=None,
        )
        logger.info("storyboard_tts_stage_queued", extra={"project_id": project_id, "mode": "narration_combined"})
        generate_tts_task.apply_async(
            kwargs={
                "project_id": project_id,
                "user_id": user_id,
                "tts_script": tts_script,
                "selected_voice": selected_voice,
                "language_code": language_code,
                "generation_mode": "narration_combined",
            }
        )
        logger.info(
            "storyboard_stitching_waiting_for_narration",
            extra={"project_id": project_id, "reason": "narration_tts_queued"},
        )
        return

    final_video_url: str | None = None
    try:
        if settings.storyboard_production_e2e_stub_finalize:
            final_video_url = _normalize_storyboard_final_video_url(
                str(getattr(completed[0], "scene_video_url", "") or completed[0].video_url or "").strip() or None
            )
            db.update_project(
                project_id,
                workflow_state=StoryboardWorkflowState.PRODUCTION_COMPLETED,
                production_status="production_completed",
                production_completed_at=utcnow(),
                package_status="package_ready",
                qc_status="qc_ready",
                final_video_url=final_video_url,
                production_stub_finalize=True,
            )
            logger.info("storyboard_final_video_ready", extra={"project_id": project_id, "fallback": True, "final_video_url_present": bool(final_video_url)})
            _create_storyboard_completion_notification(
                project_id=project_id,
                user_id=user_id,
                final_video_url=final_video_url,
                thumbnail_url=getattr(project, "final_thumbnail_url", None),
            )
            _upsert_storyboard_video_library_record(
                project_id=project_id,
                user_id=user_id,
                project=project,
                final_video_url=final_video_url,
                thumbnail_url=getattr(project, "final_thumbnail_url", None),
                duration_seconds=int(getattr(project, "duration_seconds", 0) or 0),
                credits_consumed=int(getattr(project, "credits_consumed", 0) or 0),
            )
            logger.info("storyboard_package_ready", extra={"project_id": project_id})
            return

        _queue_stitching_once(db=db, project_id=project_id, user_id=user_id, required_scenes=completed)
    except Exception as exc:
        db.update_project(
            project_id,
            workflow_state=StoryboardWorkflowState.PRODUCTION_FAILED,
            production_status="production_failed",
            production_error=f"Post-video orchestration failed: {exc}",
        )
        raise


def _queue_lipsync_stage(
    *,
    db: StoryboardRepository,
    project,
    required_scenes: list[Any],
    user_id: str,
    tts_audio_url: str | None = None,
    scene_audio_map: dict[str, str] | None = None,
) -> None:
    from celery import group

    project_id = str(project.id)
    lipsync_required_scenes: list[Any] = []
    for scene in required_scenes:
        requires_lipsync, source = scene_requires_lipsync(scene, project)
        if requires_lipsync:
            lipsync_required_scenes.append(scene)
            logger.info("storyboard_lipsync_required_field_source", extra={"project_id": project_id, "scene_id": scene.id, "source": source})
    if not lipsync_required_scenes:
        return

    db.update_project(
        project_id,
        production_substage="lipsync_in_progress",
        lipsync_status="queued",
        lipsync_error=None,
    )
    logger.info("storyboard_lipsync_stage_queued", extra={"project_id": project_id, "scene_count": len(lipsync_required_scenes)})
    for scene in required_scenes:
        requires_lipsync, _ = scene_requires_lipsync(scene, project)
        if not requires_lipsync:
            db.update_scene(
                project_id,
                scene.id,
                lipsync_status="skipped",
                final_scene_video_url=str(getattr(scene, "scene_video_url", "") or scene.video_url or "").strip() or None,
            )

    scene_audio_map = dict(scene_audio_map or {})
    lipsync_tasks = group(
        [
            apply_lipsync_task.s(
                project_id=project_id,
                scene_id=scene.id,
                user_id=user_id,
                video_url=str(getattr(scene, "scene_video_url", "") or scene.video_url or "").strip(),
                audio_url=scene_audio_map.get(str(scene.id), tts_audio_url or ""),
                lipsync_required=True,
            )
            for scene in lipsync_required_scenes
        ]
    )
    lipsync_group = lipsync_tasks.apply_async()
    db.update_project(project_id, lipsync_task_group_id=lipsync_group.id)


def _maybe_advance_storyboard_after_lipsync(*, project_id: str, user_id: str) -> None:
    db = StoryboardRepository()
    project = db.get_project(project_id)
    if not project:
        return
    scene_generation_id = str(getattr(project, "scene_generation_id", "") or "").strip() or None
    scenes = db.list_scenes(project_id, scene_generation_id=scene_generation_id, active_only=True)
    required = [scene for scene in scenes if bool(scene.user_approved)]
    if not required:
        return
    pending = []
    for scene in required:
        final_scene_video_url = str(getattr(scene, "final_scene_video_url", "") or "").strip()
        requires_lipsync, _ = scene_requires_lipsync(scene, project)
        if requires_lipsync and not final_scene_video_url:
            pending.append(scene.id)
        if (not requires_lipsync) and not final_scene_video_url:
            pending.append(scene.id)
    if pending:
        logger.info("storyboard_stitching_skipped_until_lipsync_complete", extra={"project_id": project_id, "pending_scene_ids": pending})
        return
    logger.info("storyboard_lipsync_stage_completed", extra={"project_id": project_id, "scene_count": len(required)})
    narration_audio_url = str(getattr(project, "tts_audio_url", "") or "").strip() if _is_cinematic_narration_mode(project) else None
    _queue_stitching_once(
        db=db,
        project_id=project_id,
        user_id=user_id,
        required_scenes=required,
        narration_audio_url=narration_audio_url or None,
    )


def _queue_stitching_once(
    *,
    db: StoryboardRepository,
    project_id: str,
    user_id: str,
    required_scenes: list[Any],
    narration_audio_url: str | None = None,
) -> bool:
    if not required_scenes:
        return False
    project_fresh = db.get_project(project_id)
    cinematic_mode = _is_cinematic_narration_mode(project_fresh)
    logger.info(
        "storyboard_stitch_gate_mode",
        extra={
            "project_id": project_id,
            "ad_category": str(getattr(project_fresh, "ad_category", "") or "") if project_fresh else "",
            "mode": "cinematic_narration" if cinematic_mode else "speaking_avatar",
            "videos_required": len(required_scenes),
        },
    )
    pending_scene_numbers: list[int] = []
    lipsync_required_count = 0
    lipsync_completed_count = 0
    for scene in required_scenes:
        requires_lipsync, _ = scene_requires_lipsync(scene)
        status = str(getattr(scene, "lipsync_status", "") or "").strip().lower()
        final_scene_video_url = str(getattr(scene, "final_scene_video_url", "") or "").strip()
        if cinematic_mode:
            if not final_scene_video_url:
                fallback_scene_video_url = str(getattr(scene, "scene_video_url", "") or scene.video_url or "").strip()
                if fallback_scene_video_url:
                    db.update_scene(project_id, scene.id, final_scene_video_url=fallback_scene_video_url, lipsync_status="skipped")
                else:
                    pending_scene_numbers.append(int(getattr(scene, "scene_number", 0) or 0))
        elif requires_lipsync:
            lipsync_required_count += 1
            if status not in {"completed", "skipped"} or not final_scene_video_url:
                pending_scene_numbers.append(int(getattr(scene, "scene_number", 0) or 0))
            else:
                lipsync_completed_count += 1
        else:
            if not final_scene_video_url:
                fallback_scene_video_url = str(getattr(scene, "scene_video_url", "") or scene.video_url or "").strip()
                if fallback_scene_video_url:
                    db.update_scene(project_id, scene.id, final_scene_video_url=fallback_scene_video_url, lipsync_status="skipped")
                else:
                    pending_scene_numbers.append(int(getattr(scene, "scene_number", 0) or 0))
    if pending_scene_numbers:
        logger.info(
            "storyboard_stitching_waiting_for_narration" if cinematic_mode else "storyboard_stitching_skipped_until_lipsync_complete",
            extra={"project_id": project_id, "pending_scene_numbers": pending_scene_numbers},
        )
        return False

    if cinematic_mode:
        narration_ready, resolved_narration_audio_url = _narration_audio_ready(project_fresh)
        narration_audio_url = narration_audio_url or resolved_narration_audio_url
        gate_ready, gate_reason = _should_queue_stitch_for_mode(
            cinematic_mode=True,
            all_scene_videos_completed=True,
            narration_ready=narration_ready,
            all_required_lipsync_completed=True,
        )
        if not gate_ready:
            logger.info(
                "storyboard_stitching_waiting_for_narration",
                extra={"project_id": project_id, "reason": gate_reason},
            )
            return False
        logger.info(
            "storyboard_cinematic_stitch_ready",
            extra={
                "project_id": project_id,
                "ad_category": str(getattr(project_fresh, "ad_category", "") or "") if project_fresh else "",
                "videos_completed": len(required_scenes),
                "narration_ready": True,
                "lipsync_required_count": 0,
                "lipsync_completed_count": 0,
            },
        )
    else:
        gate_ready, gate_reason = _should_queue_stitch_for_mode(
            cinematic_mode=False,
            all_scene_videos_completed=True,
            narration_ready=False,
            all_required_lipsync_completed=(lipsync_required_count == lipsync_completed_count),
        )
        if not gate_ready:
            logger.info(
                "storyboard_stitching_skipped_until_lipsync_complete",
                extra={"project_id": project_id, "reason": gate_reason},
            )
            return False
        logger.info(
            "storyboard_stitch_gate_mode",
            extra={
                "project_id": project_id,
                "ad_category": str(getattr(project_fresh, "ad_category", "") or "") if project_fresh else "",
                "mode": "speaking_avatar",
                "videos_completed": len(required_scenes),
                "lipsync_required_count": lipsync_required_count,
                "lipsync_completed_count": lipsync_completed_count,
            },
        )
    stitching_status = str(getattr(project_fresh, "stitching_status", "") or "").strip().lower() if project_fresh else ""
    stitching_lock = bool(getattr(project_fresh, "stitching_lock", False)) if project_fresh else False
    stitching_task_id = str(getattr(project_fresh, "stitching_task_id", "") or "").strip() if project_fresh else ""
    stitching_queued_at = coerce_datetime(getattr(project_fresh, "stitching_queued_at", None)) if project_fresh else None
    stitching_started_at = coerce_datetime(getattr(project_fresh, "stitching_started_at", None)) if project_fresh else None
    stitching_completed_at = coerce_datetime(getattr(project_fresh, "stitching_completed_at", None)) if project_fresh else None
    final_video_url = str(getattr(project_fresh, "final_video_url", "") or "").strip() if project_fresh else ""

    # Recover from stale stitch lock/status (e.g., worker restart or lost task) so pipeline can continue.
    now = utcnow()
    queued_age_seconds = (now - stitching_queued_at).total_seconds() if stitching_queued_at else None
    started_age_seconds = (now - stitching_started_at).total_seconds() if stitching_started_at else None
    looks_stale_queued = stitching_status == "queued" and (not stitching_task_id or (queued_age_seconds is not None and queued_age_seconds > 300))
    looks_stale_in_progress = stitching_status == "in_progress" and (not stitching_started_at or (started_age_seconds is not None and started_age_seconds > 900))
    if (stitching_lock or stitching_status in {"queued", "in_progress"}) and not final_video_url and not stitching_completed_at and (looks_stale_queued or looks_stale_in_progress):
        logger.warning(
            "storyboard_stitching_stale_lock_recovered",
            extra={
                "project_id": project_id,
                "previous_stitching_status": stitching_status,
                "had_lock": stitching_lock,
                "had_task_id": bool(stitching_task_id),
                "queued_age_seconds": queued_age_seconds,
                "started_age_seconds": started_age_seconds,
            },
        )
        db.update_project(
            project_id,
            stitching_lock=False,
            stitching_status="retry_queued",
            stitching_task_id=None,
        )
        project_fresh = db.get_project(project_id)
        stitching_status = str(getattr(project_fresh, "stitching_status", "") or "").strip().lower() if project_fresh else ""
        stitching_lock = bool(getattr(project_fresh, "stitching_lock", False)) if project_fresh else False

    if stitching_lock or stitching_status in {"queued", "in_progress", "completed"}:
        logger.info(
            "storyboard_stitching_queue_skipped_existing",
            extra={"project_id": project_id, "stitching_status": stitching_status, "stitching_lock": stitching_lock},
        )
        return False

    db.update_project(
        project_id,
        production_substage="stitching_queued",
        stitching_status="queued",
        stitching_lock=True,
        stitching_task_id=None,
        stitching_queued_at=utcnow(),
    )
    task = stitch_final_video_task.apply_async(
        kwargs={"project_id": project_id, "user_id": user_id, "audio_url": narration_audio_url}
    )
    db.update_project(project_id, stitching_task_id=str(getattr(task, "id", "") or ""))
    logger.info("storyboard_stitching_stage_queued", extra={"project_id": project_id, "task_id": str(getattr(task, "id", "") or "")})
    return True


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
        db.update_project(
            project_id,
            stitching_status="in_progress",
            stitching_started_at=utcnow(),
            stitching_lock=True,
            stitching_task_id=self.request.id,
        )

        # Generate script using ScriptGenerationService
        target_duration_seconds = int(getattr(project, "target_ad_duration_seconds", 15) or 15)
        word_ranges: dict[int, tuple[int, int]] = {
            10: (20, 28),
            15: (35, 45),
            20: (45, 60),
            30: (70, 85),
        }
        min_words, max_words = word_ranges.get(target_duration_seconds, (35, 45))
        logger.info(
            "storyboard_script_target_duration",
            extra={"project_id": project_id, "target_duration_seconds": target_duration_seconds},
        )
        logger.info(
            "storyboard_script_word_limit",
            extra={"project_id": project_id, "min_words": min_words, "max_words": max_words},
        )
        constrained_brief = (
            f"{business_brief}\n\n"
            f"Creative duration constraint: {target_duration_seconds} seconds. "
            f"Keep script between {min_words} and {max_words} words. Do not exceed this range."
        )
        script_service = ScriptGenerationService()
        script_result = script_service.generate(
            business_brief=constrained_brief,
            ad_category=project.ad_category,
            platform=platform,
            language=language,
            tone=tone,
        )

        clean_script = str(script_result.get("script", "") or "").strip()
        if not clean_script:
            raise ValueError("Script generation returned empty script")
        generated_word_count = len([w for w in clean_script.split() if w.strip()])
        logger.info(
            "storyboard_script_generated_word_count",
            extra={"project_id": project_id, "word_count": generated_word_count},
        )

        if generated_word_count > max_words:
            logger.warning(
                "storyboard_script_regeneration_retry_due_to_length",
                extra={"project_id": project_id, "word_count": generated_word_count, "max_words": max_words},
            )
            strict_prompt = (
                f"Write a {target_duration_seconds}-second ad script.\n"
                f"Maximum {max_words} words.\n"
                f"Do not exceed {max_words} words.\n"
                "Use 1-2 short sentences only.\n"
                "No filler words.\n"
                "Return only final script text."
            )
            retry_result = script_service.generate(
                business_brief=f"{business_brief}\n\n{strict_prompt}",
                ad_category=project.ad_category,
                platform=platform,
                language=language,
                tone=tone,
            )
            retry_script = str(retry_result.get("script", "") or "").strip()
            if retry_script:
                clean_script = retry_script
                generated_word_count = len([w for w in clean_script.split() if w.strip()])

        if generated_word_count > max_words:
            # Deterministic fallback for short formats to avoid blocking user flow.
            if target_duration_seconds == 10:
                brief_words = [w for w in (business_brief or "").split() if w.strip()]
                subject = "your product"
                if brief_words:
                    subject = " ".join(brief_words[:6]).strip(",. ")
                clean_script = (
                    f"Meet {subject}. Clear benefits, authentic feel, and fast everyday value in one quick scroll-stopping ad. "
                    "Tap now to try it today."
                )
                # Enforce max words deterministically while preserving product context.
                words = [w for w in clean_script.split() if w.strip()]
                clean_script = " ".join(words[:max_words]).strip()
                generated_word_count = len([w for w in clean_script.split() if w.strip()])
                logger.warning(
                    "storyboard_script_condensed_to_fit",
                    extra={"project_id": project_id, "fallback": "brief_aware_10s"},
                )
            else:
                words = [w for w in clean_script.split() if w.strip()]
                clean_script = " ".join(words[:max_words]).strip()
                generated_word_count = len([w for w in clean_script.split() if w.strip()])
                logger.warning(
                    "storyboard_script_condensed_to_fit",
                    extra={"project_id": project_id, "fallback": "trim_to_max_words"},
                )

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

        # Compute script-duration fit against creative target duration.
        word_count = len([w for w in clean_script.split() if w.strip()])
        estimated_duration_seconds = round((word_count / 150.0) * 60.0, 1)
        target_duration_seconds = int(getattr(project, "target_ad_duration_seconds", 15) or 15)
        lower_bound = target_duration_seconds * 0.8
        upper_bound = target_duration_seconds * 1.2
        if estimated_duration_seconds < lower_bound:
            script_duration_status = "too_short"
        elif estimated_duration_seconds > upper_bound:
            script_duration_status = "too_long"
        else:
            script_duration_status = "fits"
        logger.info(
            "storyboard_script_duration_status",
            extra={
                "project_id": project_id,
                "word_count": word_count,
                "estimated_duration_seconds": estimated_duration_seconds,
                "script_duration_status": script_duration_status,
            },
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
            script_word_count=word_count,
            script_estimated_duration_seconds=estimated_duration_seconds,
            target_ad_duration_seconds=target_duration_seconds,
            script_duration_status=script_duration_status,
            workflow_state=StoryboardWorkflowState.SCRIPT_AWAITING_APPROVAL,
        )

        logger.info(
            "generate_script_task_completed",
            extra={
                "project_id": project_id,
                "script_length": len(clean_script),
                "word_count": word_count,
                "target_duration_seconds": target_duration_seconds,
                "estimated_duration_seconds": estimated_duration_seconds,
                "script_duration_status": script_duration_status,
                "score": script_score.overall,
            },
        )

        return {
            "project_id": project_id,
            "status": "completed",
            "script": clean_script,
            "word_count": word_count,
            "target_duration_seconds": target_duration_seconds,
            "estimated_duration_seconds": estimated_duration_seconds,
            "script_duration_status": script_duration_status,
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
        logger.info("storyboard_scene_breakdown_task_started", extra={"project_id": project_id, "task_id": self.request.id})
        logger.info("generate_storyboard_task_started", extra={"project_id": project_id, "task_id": self.request.id})

        db = StoryboardRepository()
        project = db.get_project(project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")

        logger.info(
            "storyboard_scene_breakdown_task_input",
            extra={
                "project_id": project_id,
                "ad_category": getattr(project, "ad_category", None),
                "creation_mode": getattr(project, "creation_mode", None),
                "production_path": getattr(project, "production_path", None),
                "continuity_mode": getattr(project, "continuity_mode", None),
                "script_present": bool(getattr(project, "display_script", None)),
                "target_duration": int(getattr(project, "target_ad_duration_seconds", 15) or 15),
            },
        )
        logger.info("storyboard_scene_breakdown_category", extra={"project_id": project_id, "ad_category": getattr(project, "ad_category", None)})
        logger.info("storyboard_scene_breakdown_creation_mode", extra={"project_id": project_id, "creation_mode": getattr(project, "creation_mode", None)})
        logger.info("storyboard_scene_breakdown_production_path", extra={"project_id": project_id, "production_path": getattr(project, "production_path", None)})
        logger.info("storyboard_scene_breakdown_continuity_mode", extra={"project_id": project_id, "continuity_mode": getattr(project, "continuity_mode", None)})
        logger.info("storyboard_scene_breakdown_script_present", extra={"project_id": project_id, "script_present": bool(getattr(project, "display_script", None))})
        logger.info("storyboard_scene_breakdown_target_duration", extra={"project_id": project_id, "target_duration": int(getattr(project, "target_ad_duration_seconds", 15) or 15)})

        if not project.display_script:
            raise ValueError("No approved script available")

        avatar_name, _ = _resolve_avatar_identity_anchor(project=project, user_id=user_id)
        # Use avatar_name from project if resolution failed
        resolved_name = avatar_name or str(getattr(project, "avatar_name", "") or "").strip() or None
        avatar_description = resolved_name or "the creator avatar"
        # This ensures:
        # 1. Use resolved name from AvatarService (best)
        # 2. Fall back to project.avatar_name stored at initialization (second best)
        # 3. Fall back to generic "the creator avatar" (never show raw ID)
        cultural_guidance, cultural_profile_name, avatar_cultural_key = _resolve_project_cultural_grounding(project)
        if cultural_guidance:
            logger.info(
                "storyboard_cultural_profile_applied",
                extra={
                    "project_id": project_id,
                    "cultural_profile_applied": True,
                    "cultural_profile": cultural_profile_name,
                    "avatar_cultural_key": avatar_cultural_key,
                },
            )

        # Generate storyboard scene cards
        storyboard_service = StoryboardGenerationService()
        scene_cards = storyboard_service.generate_storyboard(
            clean_script=project.display_script,
            ad_category=project.ad_category,
            avatar_description=avatar_description,
            avatar_id=str(getattr(project, "avatar_id", "") or "").strip() or None,
            avatar_name=str(getattr(project, "avatar_name", "") or "").strip() or None,
            business_context=f"{project.business_brief}\nTarget ad duration: {int(getattr(project, 'target_ad_duration_seconds', 15) or 15)} seconds.",
            platform=project.platform,
            language=project.language,
            tone=project.tone,
        )
        logger.info("storyboard_scene_breakdown_generated_scene_count", extra={"project_id": project_id, "scene_count": len(scene_cards)})
        target_duration_seconds = int(getattr(project, "target_ad_duration_seconds", 15) or 15)
        durations_before = [int(getattr(card, "duration_seconds", 0) or 0) for card in scene_cards]
        logger.info(
            "storyboard_scene_plan_generation_active_path",
            extra={"project_id": project_id, "path": "workers.storyboard_tasks.generate_storyboard_task"},
        )
        logger.info(
            "storyboard_scene_plan_target_duration",
            extra={"project_id": project_id, "target_duration_seconds": target_duration_seconds},
        )
        logger.info(
            "storyboard_scene_plan_scene_count_before_normalization",
            extra={"project_id": project_id, "scene_count": len(scene_cards)},
        )
        logger.info(
            "storyboard_scene_plan_durations_before_normalization",
            extra={"project_id": project_id, "durations": durations_before},
        )
        normalized = _normalize_scene_plan_durations(
            durations=durations_before,
            target_duration_seconds=target_duration_seconds,
        )
        logger.info(
            "storyboard_scene_plan_durations_after_normalization",
            extra={"project_id": project_id, "durations": normalized},
        )

        scene_generation_id = str(uuid4())
        old_scenes = db.list_scenes(project_id, limit=1000)
        deleted_old_scene_count = 0
        for old_scene in old_scenes:
            db.delete_scene(project_id, old_scene.id)
            deleted_old_scene_count += 1

        # Detect product category for scene enrichment
        product_category = detect_product_category(project.business_brief or '')

        # Create scene documents in Firestore
        scene_ids = []
        for scene_index, (scene_card, normalized_duration) in enumerate(zip(scene_cards, normalized)):
            scene = db.create_scene(
                project_id=project_id,
                scene_generation_id=scene_generation_id,
                is_active=True,
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
                original_llm_duration_seconds=scene_card.duration_seconds,
                normalized_scene_duration_seconds=int(normalized_duration),
                target_duration_seconds=target_duration_seconds,
                continuity_mode=str(getattr(project, "continuity_mode", None) or ""),
                duration_seconds=int(normalized_duration),
                product_category=product_category,
                scene_index=scene_index,
                total_scenes=len(scene_cards),
            )
            scene_ids.append(scene.id)

        # Score the storyboard
        quality_service = QualityScoreService()
        storyboard_score = quality_service.score_storyboard(
            [s.to_dict() for s in [db.get_scene(project_id, sid) for sid in scene_ids]],
            project.ad_category,
        )

        # Update project with storyboard info
        total_duration = sum(int(value) for value in normalized)
        db.update_project(
            project_id,
            workflow_state=StoryboardWorkflowState.STORYBOARD_AWAITING_APPROVAL,
            duration_seconds=total_duration,
            scene_generation_id=scene_generation_id,
            storyboard_score=storyboard_score.improvement_suggestions + [
                f"Overall score: {storyboard_score.overall:.1f}/10"
            ],
        )
        logger.info("storyboard_scene_breakdown_persisted_scene_count", extra={"project_id": project_id, "scene_count": len(scene_ids)})
        logger.info("storyboard_scene_breakdown_task_completed", extra={"project_id": project_id, "scene_count": len(scene_ids)})

        logger.info(
            "generate_storyboard_task_completed",
            extra={
                "project_id": project_id,
                "scene_generation_id": scene_generation_id,
                "deleted_old_scene_count": deleted_old_scene_count,
                "active_scene_count": len(scene_ids),
                "scene_count": len(scene_ids),
                "total_duration": total_duration,
                "score": storyboard_score.overall,
            },
        )

        return {
            "project_id": project_id,
            "status": "completed",
            "scene_generation_id": scene_generation_id,
            "deleted_old_scene_count": deleted_old_scene_count,
            "active_scene_count": len(scene_ids),
            "scene_count": len(scene_ids),
            "scene_ids": scene_ids,
            "total_duration": total_duration,
            "score": storyboard_score.overall,
            "task_id": self.request.id,
        }

    except Exception as e:
        try:
            StoryboardRepository().update_project(
                project_id,
                workflow_state=StoryboardWorkflowState.STORYBOARD_FAILED,
                storyboard_generation_error=str(e),
                storyboard_generation_failed_at=utcnow(),
                storyboard_generation_recoverable=True,
                storyboard_generation_retry_action="regenerate_scene_breakdown",
            )
        except Exception:
            logger.exception("storyboard_scene_breakdown_task_failed_state_persist_error", extra={"project_id": project_id})
        logger.error("storyboard_scene_breakdown_task_failed", extra={"project_id": project_id, "task_id": self.request.id, "error": str(e)})
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
    storyboard_image_quality_mode: str | None = None,
    custom_prompt: str | None = None,
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
                "storyboard_image_quality_mode": storyboard_image_quality_mode,
                "idempotency_key": idempotency_key,
                "task_id": self.request.id,
            },
        )

        db = StoryboardRepository()
        project = db.get_project(project_id)
        scene = db.get_scene(project_id, scene_id)
        if not project or not scene:
            raise ValueError(f"Scene {scene_id} not found")

        avatar_name, avatar_reference_urls = _resolve_avatar_reference_images(project=project, user_id=user_id)
        strong_avatar_references = _resolve_reference_urls_for_storyboard(
            _select_strong_avatar_references(avatar_reference_urls, limit=2)
        )
        avatar_led_scene = _is_avatar_led_scene(project, scene)
        product_reference_images = [
            resolve_avatar_storage_url(url)
            for url in list(getattr(project, "product_reference_images", []) or [])
            if str(url).strip()
        ]
        product_image_url = str(getattr(project, "product_image_url", "") or "").strip()
        if product_image_url:
            product_reference_images.insert(0, resolve_avatar_storage_url(product_image_url))
        product_reference_images = _resolve_reference_urls_for_storyboard(product_reference_images)
        product_reference_images = list(dict.fromkeys([url for url in product_reference_images if url]))
        selected_product_reference = product_reference_images[0] if product_reference_images else None

        creation_mode = str(getattr(project, "creation_mode", "") or "").strip().lower()
        production_path = str(getattr(project, "production_path", "") or "").strip().lower()
        cultural_guidance, cultural_profile_name, avatar_cultural_key = _resolve_project_cultural_grounding(project)
        cultural_profile_applied = bool(cultural_guidance)
        is_ai_avatar_path = production_path == "ai_avatar" or creation_mode == "avatar" or bool(getattr(project, "avatar_id", None))
        requires_product_reference = is_ai_avatar_path or str(getattr(project, "ad_category", "") or "").strip().lower() == "product_demo_lifestyle"
        if not settings.storyboard_safe_test_mode:
            if is_ai_avatar_path and not strong_avatar_references:
                raise ValueError("Reference image generation is not configured for AI Avatar product ads.")
            if requires_product_reference and not product_reference_images:
                raise ValueError("Product reference image is required for this storyboard flow.")

        custom_prompt_value = str(custom_prompt or "").strip() or None
        edited_prompt_value = str(getattr(scene, "edited_image_prompt", "") or "").strip() or None
        base_prompt_value = str(getattr(scene, "base_image_prompt", "") or "").strip() or None
        prompt_source = (
            "custom_prompt"
            if custom_prompt_value
            else "edited_image_prompt"
            if edited_prompt_value
            else "base_image_prompt"
            if base_prompt_value
            else "auto_build"
        )
        logger.info(
            "storyboard_scene_effective_prompt_resolved",
            extra={
                "project_id": project_id,
                "scene_id": scene_id,
                "source": prompt_source,
                "has_custom_prompt": bool(custom_prompt_value),
                "has_edited_prompt": bool(edited_prompt_value),
                "has_base_prompt": bool(base_prompt_value),
            },
        )

        # Build prompt from visual description and metadata
        # Priority: custom_prompt > persisted edited_image_prompt > base_image_prompt > auto-build
        if custom_prompt_value:
            image_prompt = custom_prompt_value
        elif edited_prompt_value:
            image_prompt = edited_prompt_value
        elif base_prompt_value:
            image_prompt = base_prompt_value
        else:
            image_prompt = _build_image_prompt(
                scene,
                avatar_name=avatar_name if avatar_led_scene else None,
                character_lock_text=(
                    "Use the exact same woman from the provided reference photos. Preserve identical face structure, skin tone, hairstyle, and identity across all scenes."
                    if avatar_led_scene and strong_avatar_references
                    else None
                ),
                product_lock_text=(
                    "Preserve exact watch shape, dial, band color, proportions, and materials from provided product reference. Do not alter branding or product geometry."
                    if product_reference_images
                    else None
                ),
                reference_strength=float(settings.storyboard_reference_strength or 0.85),
                cultural_guidance=cultural_guidance,
            )
        image_prompt = _append_text_intent_safety_if_needed(image_prompt)
        image_prompt = _append_no_text_prompt_safety(image_prompt)

        # Determine model and dimensions based on tier
        # 9:16 aspect ratio = 720x1280 pixels
        width, height = 720, 1280
        model_key = "recraft_v3"
        reference_urls: list[str] = []
        character_reference_sheet_url = str(getattr(project, "character_reference_sheet_url", "") or "").strip()
        reference_order: list[str] = []
        if character_reference_sheet_url:
            resolved_sheet = _resolve_reference_urls_for_storyboard([character_reference_sheet_url])
            if resolved_sheet:
                reference_urls.append(resolved_sheet[0])
            reference_order.append("character_reference_sheet")
        if avatar_led_scene:
            reference_urls.extend(strong_avatar_references)
            if strong_avatar_references:
                reference_order.append("avatar_golden_refs")
        reference_urls.extend(product_reference_images)
        if product_reference_images:
            reference_order.append("product_refs")
        before_dedupe = [url for url in reference_urls if url]
        logger.info(
            "storyboard_image_reference_count_before_dedupe",
            extra={"project_id": project_id, "scene_id": scene_id, "count": len(before_dedupe)},
        )
        reference_urls = list(dict.fromkeys(before_dedupe))
        logger.info(
            "storyboard_image_reference_count_after_dedupe",
            extra={"project_id": project_id, "scene_id": scene_id, "count": len(reference_urls)},
        )
        reference_urls = reference_urls[:4]
        logger.info(
            "storyboard_image_reference_urls_sanitized_count",
            extra={"project_id": project_id, "scene_id": scene_id, "count": len(reference_urls)},
        )
        supports_reference_images = bool(reference_urls)
        quality_mode = str(
            storyboard_image_quality_mode
            or getattr(project, "storyboard_image_quality_mode", None)
            or settings.storyboard_image_quality_mode_default
            or "standard"
        ).strip().lower()
        if quality_mode not in {"draft", "standard", "premium"}:
            quality_mode = "standard"
        flux_params = {
            "draft": {"width": 512, "height": 896, "num_inference_steps": 4, "guidance_scale": 3.0},
            "standard": {"width": 512, "height": 896, "num_inference_steps": 6, "guidance_scale": 3.0},
            "premium": {"width": 768, "height": 1344, "num_inference_steps": 8, "guidance_scale": 3.2},
        }.get(quality_mode, {"width": 512, "height": 896, "num_inference_steps": 6, "guidance_scale": 3.0})
        default_model_key = str(settings.storyboard_image_default_model or "storyboard_flux_subject").strip()
        premium_model_key = str(settings.storyboard_image_premium_model or "storyboard_gemini_flash_edit").strip()
        selected_storyboard_model_key = premium_model_key if quality_mode == "premium" else default_model_key
        logger.info(
            "storyboard_image_prompt_built",
            extra={
                "project_id": project_id,
                "scene_id": scene_id,
                "storyboard_image_prompt_length": len(image_prompt),
                "storyboard_image_prompt_mode": ("reference" if supports_reference_images else "text_only"),
                "storyboard_image_quality_mode": quality_mode,
                "storyboard_image_default_model": default_model_key,
                "storyboard_image_selected_model": selected_storyboard_model_key,
            },
        )
        storyboard_provider = str(settings.storyboard_image_provider or "fal").strip().lower()
        if "openai" in storyboard_provider and not bool(settings.allow_openai_storyboard_image_provider):
            logger.warning(
                "storyboard_openai_provider_blocked",
                extra={
                    "project_id": project_id,
                    "scene_id": scene_id,
                    "storyboard_image_provider": storyboard_provider,
                },
            )
            raise ValueError(
                "OpenAI storyboard image provider is disabled. "
                "Set ALLOW_OPENAI_STORYBOARD_IMAGE_PROVIDER=true to enable explicitly."
            )

        if settings.storyboard_safe_test_mode:
            image_url = str(scene.base_image_url or project.product_image_url or "mock://storyboard/base-image")
            fal_meta = {"mode": "safe_test", "model_key": "safe_test", "provider": "mock"}
            image_generation_subject_source = None
            image_generation_subject_url = None
            fallback_used = False
            fallback_from = None
            fallback_to = None
            logger.info(
                "storyboard_safe_test_mode_image_bypass",
                extra={"project_id": project_id, "scene_id": scene_id, "image_url": image_url},
            )
        elif storyboard_provider == "fal":
            from app.services.fal_image_service import FalImageService

            fal_service = FalImageService()
            logger.info(
                "storyboard_image_provider_selected",
                extra={
                    "project_id": project_id,
                    "scene_id": scene_id,
                    "provider": "fal",
                },
            )
            image_generation_subject_source = None
            image_generation_subject_url = None
            fallback_used = False
            fallback_from = None
            fallback_to = None

            def select_flux_subject() -> tuple[str | None, str | None]:
                if character_reference_sheet_url:
                    return character_reference_sheet_url, "character_reference_sheet"
                if avatar_led_scene and strong_avatar_references:
                    return strong_avatar_references[0], "avatar_reference"
                previous_scene_images = [
                    str(item.base_image_url or "").strip()
                    for item in db.list_scenes(project_id)
                    if int(getattr(item, "scene_number", 0) or 0) < int(getattr(scene, "scene_number", 0) or 0)
                    and str(item.base_image_url or "").strip()
                ]
                if previous_scene_images:
                    return previous_scene_images[-1], "previous_scene_image"
                if bool(settings.storyboard_flux_subject_use_product_as_subject) and product_reference_images:
                    return product_reference_images[0], "product_reference"
                if avatar_reference_urls:
                    return avatar_reference_urls[0], "avatar_reference"
                if product_reference_images:
                    return product_reference_images[0], "product_reference_fallback"
                return None, None

            should_use_flux = (
                bool(settings.storyboard_flux_subject_enabled)
                and selected_storyboard_model_key == "storyboard_flux_subject"
            )
            if should_use_flux:
                subject_url, subject_source = select_flux_subject()
                logger.info(
                    "storyboard_flux_subject_selected_subject_source",
                    extra={"project_id": project_id, "scene_id": scene_id, "subject_source": subject_source},
                )
                logger.info(
                    "storyboard_flux_subject_selected_subject_url_present",
                    extra={"project_id": project_id, "scene_id": scene_id, "subject_url_present": bool(subject_url)},
                )
                logger.info(
                    "storyboard_flux_subject_product_reference_present",
                    extra={"project_id": project_id, "scene_id": scene_id, "product_reference_present": bool(product_reference_images)},
                )
                if subject_url:
                    image_generation_subject_source = subject_source
                    image_generation_subject_url = subject_url
                    flux_prompt = (
                        f"{image_prompt}\n\n"
                        "PRODUCT LOCK: Product must match uploaded product reference exactly when visible. "
                        "Do not invent a new watch/product. Keep product shape, color, strap, material, screen form, proportions, and brand cues consistent. "
                        "If product identity is uncertain, keep it partially visible rather than redesigning it."
                    )
                    try:
                        model_key = "storyboard_flux_subject"
                        fal_meta = fal_service.generate_flux_subject_image(
                            prompt=flux_prompt,
                            subject_image_url=subject_url,
                            image_size={"width": int(flux_params["width"]), "height": int(flux_params["height"])},
                            num_inference_steps=int(flux_params["num_inference_steps"]),
                            guidance_scale=float(flux_params["guidance_scale"]),
                            output_format="jpeg",
                            metadata={"project_id": project_id, "scene_id": scene_id, "user_id": user_id, "quality_mode": quality_mode},
                        )
                        image_url = str(fal_meta.get("image_url") or "").strip()
                    except Exception:
                        if not bool(settings.storyboard_flux_subject_fallback_to_gemini):
                            raise
                        logger.warning(
                            "storyboard_flux_subject_failed_falling_back",
                            extra={"project_id": project_id, "scene_id": scene_id, "fallback_to": "storyboard_gemini_flash_edit"},
                            exc_info=True,
                        )
                        fallback_used = True
                        fallback_from = "storyboard_flux_subject"
                        fallback_to = "storyboard_gemini_flash_edit"
                        should_use_flux = False
                else:
                    should_use_flux = False

            if not should_use_flux and supports_reference_images:
                model_key = str(settings.storyboard_image_reference_model or "fal-ai/gemini-25-flash-image/edit")
                if selected_storyboard_model_key == "storyboard_gemini_flash_edit" or fallback_used:
                    model_key = "storyboard_gemini_flash_edit"
                logger.info(
                    "storyboard_image_model_selected",
                    extra={
                        "project_id": project_id,
                        "scene_id": scene_id,
                        "model": model_key,
                        "storyboard_image_reference_count": len(reference_urls),
                    },
                )
                image_url, fal_meta = fal_service.generate_storyboard_image_with_references(
                    prompt=image_prompt,
                    aspect_ratio="9:16",
                    reference_urls=reference_urls,
                    metadata={"project_id": project_id, "scene_id": scene_id, "user_id": user_id},
                )
                if fallback_used:
                    fal_meta = {
                        **fal_meta,
                        "model_key": "storyboard_gemini_flash_edit",
                        "fallback_used": True,
                        "fallback_from": fallback_from,
                        "fallback_to": fallback_to,
                    }
            elif not should_use_flux:
                model_key = str(settings.storyboard_image_text_model or "fal-ai/recraft/v3/text-to-image")
                logger.info(
                    "storyboard_image_model_selected",
                    extra={
                        "project_id": project_id,
                        "scene_id": scene_id,
                        "model": model_key,
                        "storyboard_image_reference_count": 0,
                    },
                )
                image_url, fal_meta = fal_service.generate_storyboard_image_text_only(
                    prompt=image_prompt,
                    aspect_ratio="9:16",
                    metadata={"project_id": project_id, "scene_id": scene_id, "user_id": user_id},
                )
            if not str(image_url or "").strip():
                raise RuntimeError("Storyboard image generation completed without image_url")
            logger.info(
                "storyboard_reference_image_generation_payload",
                extra={
                    "project_id": project_id,
                    "scene_id": scene_id,
                    "selected_model": model_key,
                    "storyboard_image_quality_mode": quality_mode,
                    "image_generation_subject_source": image_generation_subject_source,
                    "supports_reference_images": supports_reference_images,
                    "avatar_reference_count": len(strong_avatar_references if avatar_led_scene else []),
                    "product_reference_count": len(product_reference_images),
                    "selected_avatar_reference": (_redact_url(strong_avatar_references[0]) if strong_avatar_references else None),
                    "selected_product_reference": _redact_url(selected_product_reference),
                    "character_reference_sheet_used": bool(character_reference_sheet_url),
                    "reference_order": reference_order,
                    "reference_strength": float(settings.storyboard_reference_strength or 0.85),
                    "cultural_profile_applied": cultural_profile_applied,
                    "cultural_profile": cultural_profile_name,
                    "avatar_cultural_key": avatar_cultural_key,
                    "fal_storyboard_metadata": {
                        "endpoint": fal_meta.get("endpoint"),
                        "mode": fal_meta.get("mode"),
                        "model_key": fal_meta.get("model_key") or model_key,
                        "estimated_cost_usd": fal_meta.get("estimated_cost_usd"),
                        "billable_megapixels": fal_meta.get("billable_megapixels"),
                        "fallback_used": bool(fallback_used or fal_meta.get("fallback_used")),
                        "status_url": _redact_url(fal_meta.get("status_url")),
                        "response_url": _redact_url(fal_meta.get("response_url")),
                    },
                },
            )
        else:
            raise ValueError(f"Unsupported storyboard image provider: {storyboard_provider}")

        # Deduct credits with idempotency
        from app.recipes.storyboard_video import CREDIT_COSTS
        cost = CREDIT_COSTS.base_image_generation_fast if model_tier == "fast" else CREDIT_COSTS.base_image_generation_pro
        if not settings.storyboard_safe_test_mode:
            credit_service = CreditService()
            credit_service.deduct_credits(
                user_id=user_id,
                amount=cost,
                feature_key="storyboard_video",
                metadata={
                    "project_id": project_id,
                    "scene_id": scene_id,
                    "model_tier": model_tier,
                    "storyboard_image_quality_mode": quality_mode,
                    "image_generation_model_key": fal_meta.get("model_key") or model_key,
                    "operation": "base_image_generation",
                },
                source="storyboard_base_image_generation",
                idempotency_key=idempotency_key,
            )
        else:
            cost = 0

        # Credit deducted successfully (would raise exception on failure)
        # Update scene with image
        db.update_scene(
            project_id,
            scene_id,
            base_image_url=image_url,
            base_image_prompt=image_prompt,
            last_regeneration_prompt=image_prompt,
            last_regenerated_at=utcnow(),
            image_generation_status="completed",
            image_generation_error=None,
            state=SceneState.AWAITING_APPROVAL,
            image_generation_started_at=None,
            image_generation_model_key=fal_meta.get("model_key") or model_key,
            image_generation_provider=fal_meta.get("provider") or "fal",
            image_generation_quality_mode=quality_mode,
            image_generation_cost_usd_estimate=fal_meta.get("estimated_cost_usd"),
            image_generation_subject_source=image_generation_subject_source,
            image_generation_subject_url=image_generation_subject_url,
            image_generation_fallback_used=bool(fallback_used or fal_meta.get("fallback_used")),
            image_generation_fallback_from=fallback_from or fal_meta.get("fallback_from"),
            image_generation_fallback_to=fallback_to or fal_meta.get("fallback_to"),
            image_generation_width=fal_meta.get("width"),
            image_generation_height=fal_meta.get("height"),
            image_generation_metadata={
                "endpoint": fal_meta.get("endpoint"),
                "mode": fal_meta.get("mode"),
                "estimated_megapixels": fal_meta.get("estimated_megapixels"),
                "billable_megapixels": fal_meta.get("billable_megapixels"),
                "estimated_cost_usd": fal_meta.get("estimated_cost_usd"),
                "quality_mode": quality_mode,
            },
        )

        # Auto-advance project when all scene images are available.
        all_scenes = db.list_scenes(project_id)
        if all_scenes and all(scene_item.base_image_url for scene_item in all_scenes):
            db.update_project(
                project_id,
                workflow_state=StoryboardWorkflowState.IMAGES_AWAITING_APPROVAL,
                image_generation_started_at=None,
            )

        logger.info(
            "storyboard_scene_regen_prompt_used",
            extra={
                "project_id": project_id,
                "scene_id": scene_id,
                "source": prompt_source,
                "prompt_length": len(image_prompt),
            },
        )

        logger.info(
            "generate_base_image_task_completed",
            extra={
                "project_id": project_id,
                "scene_id": scene_id,
                "image_url": image_url[:100],
                "credits_deducted": cost,
                "avatar_led_scene": avatar_led_scene,
                "avatar_reference_url_used": bool(avatar_led_scene and strong_avatar_references),
                "avatar_reference_count": len(strong_avatar_references if avatar_led_scene else []),
                "product_reference_count": len(product_reference_images),
                "selected_avatar_reference": (_redact_url(strong_avatar_references[0]) if strong_avatar_references else None),
                "selected_product_reference": _redact_url(selected_product_reference),
                "supports_reference_images": supports_reference_images,
                "selected_image_model": model_key,
                "storyboard_image_quality_mode": quality_mode,
                "image_generation_model_key": fal_meta.get("model_key") or model_key,
                "image_generation_cost_usd_estimate": fal_meta.get("estimated_cost_usd"),
                "image_generation_subject_source": image_generation_subject_source,
                "image_generation_fallback_used": bool(fallback_used or fal_meta.get("fallback_used")),
                "overlay_text_removed": bool(getattr(scene, "_overlay_text_removed", False)),
                "consistency_strategy": "reference_order_lock_v1",
                "character_reference_sheet_used": bool(character_reference_sheet_url),
                "reference_order": reference_order,
                "reference_strength": float(settings.storyboard_reference_strength or 0.85),
                "cultural_profile_applied": cultural_profile_applied,
                "cultural_profile": cultural_profile_name,
                "avatar_cultural_key": avatar_cultural_key,
            },
        )

        return {
            "project_id": project_id,
            "scene_id": scene_id,
            "status": "completed",
            "image_url": image_url,
            "credits_deducted": cost,
            "model_key": fal_meta.get("model_key") or model_key,
            "quality_mode": quality_mode,
            "estimated_cost_usd": fal_meta.get("estimated_cost_usd"),
            "task_id": self.request.id,
        }

    except Exception as e:
        db = StoryboardRepository()
        try:
            db.update_scene(
                project_id,
                scene_id,
                state=SceneState.FAILED,
                image_generation_started_at=None,
                image_generation_status="failed",
                image_generation_error=str(e),
            )
        except Exception:
            logger.warning(
                "generate_base_image_task_failed_scene_state_update_failed",
                extra={"project_id": project_id, "scene_id": scene_id},
            )
        logger.error(
            "generate_base_image_task_failed",
            extra={
                "project_id": project_id,
                "scene_id": scene_id,
                "error": str(e),
                "task_id": self.request.id,
            },
        )
        error_text = str(e).lower()
        non_retryable = any(token in error_text for token in ("422", "invalid_request", "could not generate images", "validation error"))
        if non_retryable:
            raise
        # Retry only transient failures (max 2 retries)
        raise self.retry(exc=e, countdown=10)


@app.task(bind=True, name="storyboard.generate_character_reference_sheet", max_retries=1)
def generate_character_reference_sheet_task(
    self,
    project_id: str,
    user_id: str,
) -> dict:
    try:
        from app.services.storyboard_pipeline_service import StoryboardPipelineService

        result = StoryboardPipelineService().generate_character_reference_sheet(
            project_id=project_id,
            user_id=user_id,
        )
        return {
            "project_id": project_id,
            "status": "completed",
            "character_reference_sheet_url": result.get("character_reference_sheet_url"),
            "task_id": self.request.id,
        }
    except Exception as exc:
        logger.error(
            "generate_character_reference_sheet_task_failed",
            extra={"project_id": project_id, "task_id": self.request.id, "error": str(exc)},
        )
        raise


def _build_image_prompt(
    scene,
    *,
    avatar_name: str | None = None,
    character_lock_text: str | None = None,
    product_lock_text: str | None = None,
    reference_strength: float = 0.85,
    cultural_guidance: str | None = None,
) -> str:
    """Build concise scene-specific image generation prompt."""
    cleaned_visual_description, overlay_text_removed = _strip_overlay_text_hints(scene.visual_description)
    try:
        setattr(scene, "_overlay_text_removed", overlay_text_removed)
    except Exception:
        pass

    scene_line_parts = [cleaned_visual_description]
    if scene.environment:
        scene_line_parts.append(f"Environment: {scene.environment}")
    if scene.avatar_action:
        scene_line_parts.append(f"Action: {scene.avatar_action}")
    if scene.product_visibility and scene.product_visibility != "none":
        scene_line_parts.append(f"Product visibility: {scene.product_visibility}")

    parts = [
        "Create a realistic vertical 9:16 storyboard frame.",
        f"Scene: {' '.join([p for p in scene_line_parts if p]).strip()}",
        f"Shot: {scene.shot_type}. Mood: {scene.mood}.",
    ]
    if avatar_name:
        parts.append(
            f"Identity: preserve the same woman ({avatar_name}) from avatar references. Keep face shape, skin tone, hairstyle, age impression, and overall identity consistent."
        )
    if character_lock_text:
        parts.append(f"Identity lock details: {character_lock_text}")
    if product_lock_text:
        parts.append(f"Product: {product_lock_text}")
    if cultural_guidance:
        parts.append(f"Style: {cultural_guidance}")
    parts.append("Style: contemporary urban lifestyle photography, natural lighting, realistic candid ad frame.")
    parts.append(f"Avoid: {NO_TEXT_VISUAL_RULE} Also avoid distorted hands, identity drift, and changed product design.")
    parts.append(f"Reference fidelity: {reference_strength:.2f}.")
    return _append_no_text_prompt_safety(". ".join(parts))


@app.task(bind=True, name="storyboard.generate_production", max_retries=0)
def generate_storyboard_production_task(
    self,
    project_id: str,
    user_id: str,
) -> dict:
    """Queue storyboard production scene video tasks after voice confirmation."""
    try:
        from app.services.storyboard_pipeline_service import StoryboardPipelineService

        logger.info(
            "storyboard_generate_production_task_started",
            extra={"project_id": project_id, "task_id": self.request.id, "user_id": user_id},
        )

        db = StoryboardRepository()
        project = db.get_project(project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")
        scene_generation_id = str(getattr(project, "scene_generation_id", "") or "").strip() or None
        scenes = db.list_scenes(project_id, scene_generation_id=scene_generation_id, active_only=True)
        approved_scenes = [scene for scene in scenes if bool(scene.user_approved)]

        logger.info(
            "storyboard_generate_production_task_loaded_project",
            extra={"project_id": project_id, "approved_scene_count": len(approved_scenes)},
        )
        for scene in approved_scenes:
            logger.info(
                "storyboard_generate_production_scene_started",
                extra={"project_id": project_id, "scene_id": scene.id, "scene_number": scene.scene_number},
            )

        result = StoryboardPipelineService().generate_videos(project_id=project_id, user_id=user_id)

        for scene in approved_scenes:
            logger.info(
                "storyboard_generate_production_scene_completed",
                extra={"project_id": project_id, "scene_id": scene.id, "scene_number": scene.scene_number},
            )

        logger.info(
            "storyboard_generate_production_task_completed",
            extra={
                "project_id": project_id,
                "task_id": self.request.id,
                "scene_task_group_id": result.get("task_group_id"),
            },
        )
        return {
            "project_id": project_id,
            "status": "queued",
            "task_id": self.request.id,
            "scene_task_group_id": result.get("task_group_id"),
        }
    except Exception as exc:
        logger.error(
            "storyboard_generate_production_task_failed",
            extra={"project_id": project_id, "task_id": self.request.id, "error": str(exc)},
            exc_info=True,
        )
        raise


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
    def _is_transient_video_error(exc: Exception) -> bool:
        message = str(exc or "").lower()
        if isinstance(exc, (TypeError, ValueError)):
            return False
        transient_tokens = (
            "timeout",
            "timed out",
            "temporarily unavailable",
            "connection reset",
            "connection aborted",
            "connection refused",
            "502",
            "503",
            "504",
            "429",
            "rate limit",
            "service unavailable",
        )
        return any(token in message for token in transient_tokens)

    def _build_kling_reference_video_kwargs(
        *,
        prompt: str,
        primary_image_url: str,
        model_key: str,
        duration_seconds: int,
    ) -> dict[str, Any]:
        supported_kling_reference_models = {
            "kling_o3_standard_reference",
            "kling_o3_pro_reference",
            "kling_o3_4k_reference",
            "kling_o3_reference",
        }
        resolved_model_key = model_key if model_key in supported_kling_reference_models else "kling_o3_standard_reference"
        return {
            "prompt": prompt,
            "image_urls": [primary_image_url],
            "aspect_ratio": "9:16",
            "duration": str(int(max(5, min(10, duration_seconds)))),
            "model_key": resolved_model_key,
        }

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

        requested_model_key = str(getattr(project, "selected_video_model_key", "") or "").strip()
        selected_model_key = requested_model_key
        if selected_model_key == "kling_premium":
            selected_model_key = "kling_4k"
            logger.info(
                "storyboard_video_quality_fallback_applied",
                extra={"project_id": project_id, "scene_id": scene_id, "requested_model_key": requested_model_key, "fallback_model_key": selected_model_key},
            )
        if selected_model_key not in {"ltx_23_fast", "seedance_v1", "kling_standard", "kling_4k"}:
            logger.info(
                "storyboard_video_quality_fallback_applied",
                extra={"project_id": project_id, "scene_id": scene_id, "requested_model_key": requested_model_key, "fallback_model_key": "kling_standard"},
            )
            selected_model_key = "kling_standard"
        storyboard_model_mapping = {
            "ltx_23_fast": "fal_ltx23_i2v",
            "seedance_v1": "seedance_v1_lite_reference",
            "kling_standard": "kling_o3_standard_reference",
            "kling_4k": "kling_o3_4k_reference",
        }
        model_key = storyboard_model_mapping.get(selected_model_key, selected_model_key) or MODEL_ROUTING_BY_CATEGORY.get(project.ad_category)
        if not model_key:
            raise ValueError(f"No model routing for category {project.ad_category}")

        avatar_name, _ = _resolve_avatar_identity_anchor(project=project, user_id=user_id)
        avatar_led_scene = _is_avatar_led_scene(project, scene)
        cultural_guidance, cultural_profile_name, avatar_cultural_key = _resolve_project_cultural_grounding(project)
        cultural_profile_applied = bool(cultural_guidance)

        # Build video generation prompt
        video_prompt = _build_storyboard_video_prompt(
            scene,
            project,
            avatar_name=avatar_name if avatar_led_scene else None,
            cultural_guidance=cultural_guidance,
        )

        # Get base image if available (primary storyboard frame for I2V)
        image_url = str(scene.base_image_url or "").strip()
        if not image_url:
            raise ValueError("Scene base image URL missing; cannot generate scene video")

        # Call FAL video service with appropriate model
        from app.services.fal_video_service import FalVideoService

        fal_service = FalVideoService()

        duration_seconds = int(
            getattr(scene, "normalized_scene_duration_seconds", None)
            or scene.duration_seconds
            or 5
        )
        logger.info(
            "storyboard_scene_video_model_selected",
            extra={"project_id": project_id, "scene_id": scene_id, "model_key": model_key},
        )
        logger.info(
            "storyboard_video_quality_selected",
            extra={"project_id": project_id, "scene_id": scene_id, "selected_video_model_key": selected_model_key},
        )
        logger.info(
            "storyboard_kling_model_selected",
            extra={"project_id": project_id, "scene_id": scene_id, "selected_video_model_key": selected_model_key},
        )
        logger.info(
            "storyboard_selected_duration_seconds",
            extra={"project_id": project_id, "selected_duration_seconds": int(getattr(project, "selected_ad_duration_seconds", 15) or 15)},
        )
        logger.info(
            "storyboard_scene_duration_used",
            extra={"project_id": project_id, "scene_id": scene_id, "duration_seconds": duration_seconds},
        )
        logger.info(
            "storyboard_scene_normalized_duration_used",
            extra={
                "project_id": project_id,
                "scene_id": scene_id,
                "normalized_scene_duration_seconds": int(getattr(scene, "normalized_scene_duration_seconds", duration_seconds) or duration_seconds),
            },
        )
        logger.info(
            "storyboard_scene_video_duration",
            extra={"project_id": project_id, "scene_id": scene_id, "duration_seconds": duration_seconds},
        )
        logger.info(
            "storyboard_scene_video_aspect_ratio",
            extra={"project_id": project_id, "scene_id": scene_id, "aspect_ratio": "9:16"},
        )
        logger.info(
            "storyboard_scene_video_primary_image_url_present",
            extra={"project_id": project_id, "scene_id": scene_id, "present": bool(image_url)},
        )
        logger.info(
            "storyboard_scene_video_reference_count",
            extra={"project_id": project_id, "scene_id": scene_id, "count": 1},
        )

        db.update_scene(
            project_id,
            scene_id,
            state=SceneState.VIDEO_GENERATING,
            scene_video_status="in_progress",
            scene_video_error=None,
            scene_video_started_at=utcnow(),
        )

        # Route to appropriate model
        if "kling" in model_key:
            kling_kwargs = _build_kling_reference_video_kwargs(
                prompt=video_prompt,
                primary_image_url=image_url,
                model_key=model_key,
                duration_seconds=duration_seconds,
            )
            logger.info(
                "storyboard_scene_video_call_kwargs_keys",
                extra={"project_id": project_id, "scene_id": scene_id, "keys": sorted(list(kling_kwargs.keys()))},
            )
            logger.info("storyboard_video_provider_call_started", extra={"project_id": project_id, "scene_id": scene_id, "provider_model": model_key})
            video_url, metadata = fal_service.generate_kling_reference_video(**kling_kwargs)
            logger.info("storyboard_video_provider_call_completed", extra={"project_id": project_id, "scene_id": scene_id, "provider_model": model_key})
        elif "seedance" in model_key:
            seedance_kwargs: dict[str, Any] = {
                "prompt": video_prompt,
                "reference_image_urls": [image_url],
                "aspect_ratio": "9:16",
                "duration": str(int(max(5, min(10, duration_seconds)))),
                "resolution": "720p",
            }
            logger.info(
                "storyboard_scene_video_call_kwargs_keys",
                extra={"project_id": project_id, "scene_id": scene_id, "keys": sorted(list(seedance_kwargs.keys()))},
            )
            logger.info("storyboard_video_provider_call_started", extra={"project_id": project_id, "scene_id": scene_id, "provider_model": model_key})
            video_url, metadata = fal_service.generate_seedance_lite_reference_video(**seedance_kwargs)
            logger.info("storyboard_video_provider_call_completed", extra={"project_id": project_id, "scene_id": scene_id, "provider_model": model_key})
        elif "ltx" in model_key:
            ltx_kwargs: dict[str, Any] = {
                "model_key": model_key,
                "prompt": video_prompt,
                "image_url": image_url,
                "aspect_ratio": "9:16",
                "resolution": "720p",
                "duration_seconds": duration_seconds,
            }
            logger.info(
                "storyboard_scene_video_call_kwargs_keys",
                extra={"project_id": project_id, "scene_id": scene_id, "keys": sorted(list(ltx_kwargs.keys()))},
            )
            logger.info("storyboard_video_provider_call_started", extra={"project_id": project_id, "scene_id": scene_id, "provider_model": model_key})
            video_url, metadata = fal_service.generate(**ltx_kwargs)
            logger.info("storyboard_video_provider_call_completed", extra={"project_id": project_id, "scene_id": scene_id, "provider_model": model_key})
        else:
            # Default to Kling
            kling_kwargs = _build_kling_reference_video_kwargs(
                prompt=video_prompt,
                primary_image_url=image_url,
                model_key="kling_o3_standard_reference",
                duration_seconds=duration_seconds,
            )
            logger.info(
                "storyboard_scene_video_call_kwargs_keys",
                extra={"project_id": project_id, "scene_id": scene_id, "keys": sorted(list(kling_kwargs.keys()))},
            )
            logger.info("storyboard_video_provider_call_started", extra={"project_id": project_id, "scene_id": scene_id, "provider_model": "kling_o3_standard_reference"})
            video_url, metadata = fal_service.generate_kling_reference_video(**kling_kwargs)
            logger.info("storyboard_video_provider_call_completed", extra={"project_id": project_id, "scene_id": scene_id, "provider_model": "kling_o3_standard_reference"})

        # Deduct credits with idempotency
        credit_service = CreditService()
        from app.recipes.storyboard_video import CREDIT_COSTS

        cost = CREDIT_COSTS.get_video_cost(model_key)
        credit_result = credit_service.deduct_credits(
            user_id=user_id,
            amount=cost,
            feature_key="storyboard_video",
            metadata={
                "project_id": project_id,
                "scene_id": scene_id,
                "model_key": model_key,
                "operation": "scene_video_generation",
            },
            source="storyboard_scene_video_generation",
            idempotency_key=idempotency_key,
        )

        # Credit deducted successfully (would raise exception on failure)
        # Update scene with video
        db.update_scene(
            project_id,
            scene_id,
            video_url=video_url,
            video_prompt=video_prompt,
            state=SceneState.VIDEO_GENERATED,
            scene_video_status="completed",
            scene_video_url=video_url,
            scene_video_metadata=metadata or {},
            scene_video_error=None,
            scene_video_completed_at=utcnow(),
            final_scene_video_url=video_url,
        )
        logger.info(
            "storyboard_scene_video_saved",
            extra={"project_id": project_id, "scene_id": scene_id, "scene_video_url_present": bool(video_url)},
        )
        _maybe_advance_storyboard_production_after_scene(db=db, project_id=project_id, user_id=user_id)

        logger.info(
            "generate_scene_video_task_completed",
            extra={
                "project_id": project_id,
                "scene_id": scene_id,
                "model_key": model_key,
                "video_url": video_url[:100],
                "credits_deducted": cost,
                "avatar_led_scene": avatar_led_scene,
                "cultural_profile_applied": cultural_profile_applied,
                "cultural_profile": cultural_profile_name,
                "avatar_cultural_key": avatar_cultural_key,
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
        try:
            db = StoryboardRepository()
            db.update_scene(
                project_id,
                scene_id,
                state=SceneState.FAILED,
                scene_video_status="failed",
                scene_video_error=str(e),
                scene_video_completed_at=utcnow(),
            )
            db.update_project(
                project_id,
                workflow_state=StoryboardWorkflowState.PRODUCTION_FAILED,
                production_error=f"Scene video failed ({scene_id}): {e}",
            )
        except Exception:
            logger.warning(
                "generate_scene_video_task_failure_state_update_failed",
                extra={"project_id": project_id, "scene_id": scene_id},
                exc_info=True,
            )
        if _is_transient_video_error(e) and self.request.retries < self.max_retries:
            raise self.retry(exc=e, countdown=15)
        raise

def _build_storyboard_video_prompt(
    scene,
    project,
    *,
    avatar_name: str | None = None,
    cultural_guidance: str | None = None,
) -> str:
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
        parts.append("Facial behavior: subtle natural expression changes only.")

    if scene.product_visibility and scene.product_visibility != "none":
        parts.append(f"Product: {scene.product_visibility}")

    if project.tone:
        parts.append(f"Tone: {project.tone}")
    if cultural_guidance:
        parts.append(cultural_guidance)
        parts.append(
            "Keep ambient styling and crowd demographics aligned with premium contemporary Indian urban lifestyle."
        )

    if avatar_name:
        parts.append(
            f"Identity lock: keep the exact same creator identity ({avatar_name}) consistent with other avatar scenes in this project."
        )
    requires_lipsync, _ = scene_requires_lipsync(scene, project)
    if requires_lipsync:
        parts.append(
            "Do not animate the mouth as if speaking. No talking lips, no dialogue mouth movement, no lip-sync motion. Keep lips naturally closed or with only subtle expression changes. A separate lipsync model will add speech later."
        )

    parts.append(NO_TEXT_VISUAL_RULE)
    final_prompt = ". ".join(parts)
    final_prompt = _append_text_intent_safety_if_needed(final_prompt)
    return _append_no_text_prompt_safety(final_prompt)


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
        logger.info("storyboard_lipsync_scene_started", extra={"project_id": project_id, "scene_id": scene_id})
        db = StoryboardRepository()
        scene_row = db.get_scene(project_id, scene_id)
        logger.info(
            "storyboard_scene_lipsync_started",
            extra={
                "project_id": project_id,
                "scene_id": scene_id,
                "scene_number": int(getattr(scene_row, "scene_number", 0) or 0) if scene_row else 0,
                "requires_lipsync": bool(lipsync_required),
            },
        )

        # If lipsync not required, skip and return original video
        if not lipsync_required or not audio_url:
            logger.info(
                "lipsync_skipped",
                extra={
                    "project_id": project_id,
                    "scene_id": scene_id,
                    "scene_number": int(getattr(scene_row, "scene_number", 0) or 0) if scene_row else 0,
                    "requires_lipsync": bool(lipsync_required),
                    "reason": "not_required" if not lipsync_required else "no_audio",
                },
            )
            logger.info(
                "storyboard_scene_lipsync_skipped",
                extra={
                    "project_id": project_id,
                    "scene_id": scene_id,
                    "scene_number": int(getattr(scene_row, "scene_number", 0) or 0) if scene_row else 0,
                    "requires_lipsync": bool(lipsync_required),
                    "reason": "not_required" if not lipsync_required else "no_audio",
                },
            )
            db.update_scene(
                project_id,
                scene_id,
                lipsync_status="skipped",
                final_scene_video_url=video_url,
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
        logger.info(
            "storyboard_lipsync_service_import_resolved",
            extra={
                "project_id": project_id,
                "scene_id": scene_id,
                "service_class": "LipsyncFaceService",
                "service_module": "app.services.lipsync_face_service",
            },
        )

        lipsync_service = LipsyncFaceService()
        logger.info(
            "storyboard_lipsync_provider_call_started",
            extra={"project_id": project_id, "scene_id": scene_id},
        )
        lipsync_video_url = lipsync_service.apply_lipsync(
            video_url=video_url,
            audio_url=audio_url,
            metadata={
                "project_id": project_id,
                "scene_id": scene_id,
            },
        )
        logger.info(
            "storyboard_lipsync_provider_call_completed",
            extra={
                "project_id": project_id,
                "scene_id": scene_id,
                "lipsync_video_url_present": bool(lipsync_video_url),
            },
        )

        # Deduct credits
        credit_service = CreditService()
        from app.recipes.storyboard_video import CREDIT_COSTS

        # Deduct credits for lipsync (with fallback on failure)
        try:
            credit_result = credit_service.deduct_credits(
                user_id=user_id,
                amount=CREDIT_COSTS.lipsync_per_scene,
                feature_key="storyboard_video",
                metadata={
                    "project_id": project_id,
                    "scene_id": scene_id,
                    "operation": "lipsync_application",
                },
                source="storyboard_lipsync_application",
                idempotency_key=idempotency_key,
            )
        except Exception as e:
            # Lipsync credit deduction failed - use original video as fallback
            logger.warning(
                "lipsync_credit_deduction_failed_using_original",
                extra={
                    "project_id": project_id,
                    "scene_id": scene_id,
                    "error": str(e),
                },
            )
            lipsync_video_url = video_url

        # Update scene
        db.update_scene(
            project_id,
            scene_id,
            lipsync_video_url=lipsync_video_url,
            lipsync_status="completed",
            lipsync_error=None,
            lipsync_completed_at=utcnow(),
            final_scene_video_url=lipsync_video_url,
            state=SceneState.LIPSYNC_APPLIED,
        )
        logger.info("storyboard_lipsync_scene_completed", extra={"project_id": project_id, "scene_id": scene_id})
        logger.info("storyboard_final_scene_video_url_set", extra={"project_id": project_id, "scene_id": scene_id})
        _maybe_advance_storyboard_after_lipsync(project_id=project_id, user_id=user_id)

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
            "storyboard_lipsync_provider_call_failed",
            extra={"project_id": project_id, "scene_id": scene_id, "error": str(e)},
        )
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
            lipsync_status="failed",
            lipsync_error=str(e),
            final_scene_video_url=video_url,
            state=SceneState.LIPSYNC_APPLIED,
        )
        logger.error("storyboard_lipsync_scene_failed", extra={"project_id": project_id, "scene_id": scene_id, "error": str(e)})
        _maybe_advance_storyboard_after_lipsync(project_id=project_id, user_id=user_id)
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
    generation_mode: str = "scene_lipsync",
) -> dict:
    """
    Generate scene-wise TTS audio for project.

    Phase 2: Actual implementation:
    - Call FalVideoService.generate_gemini_flash_tts() per lipsync scene
    - Deduct credits with idempotency key
    - Return aggregate scene audio duration
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
                "generation_mode": generation_mode,
                "task_id": self.request.id,
            },
        )
        logger.info("storyboard_tts_language_selected", extra={"project_id": project_id, "language": language_code})
        logger.info("storyboard_tts_provider_language_code", extra={"project_id": project_id, "provider_language_code": language_code})
        logger.info("storyboard_tts_voice_selected", extra={"project_id": project_id, "voice": selected_voice})
        logger.info("storyboard_tts_provider_voice", extra={"project_id": project_id, "provider_voice": selected_voice})
        logger.info("storyboard_tts_generation_started", extra={"project_id": project_id})

        db = StoryboardRepository()
        db.update_project(
            project_id,
            production_substage="tts_in_progress",
            tts_status="in_progress",
            tts_error=None,
        )

        # Generate scene-wise TTS using FAL Gemini Flash TTS
        from app.services.fal_video_service import FalVideoService

        fal_service = FalVideoService()
        project = db.get_project(project_id)
        scene_generation_id = str(getattr(project, "scene_generation_id", "") or "").strip() or None if project else None
        scenes = db.list_scenes(project_id, scene_generation_id=scene_generation_id, active_only=True)
        required = [scene for scene in scenes if bool(scene.user_approved)]
        ad_category = str(getattr(project, "ad_category", "") or "").strip().lower() if project else ""
        project_tone = str(getattr(project, "tone", "") or "casual").strip().lower() if project else "casual"
        tts_style = build_storyboard_tts_style(
            ad_category=ad_category,
            language=language_code,
            voice=selected_voice,
            tone=project_tone,
            generation_mode=generation_mode,
        )
        logger.info(
            "storyboard_tts_style_selected",
            extra={
                "project_id": project_id,
                "ad_category": ad_category,
                "voice": selected_voice,
                "language": language_code,
                "generation_mode": generation_mode,
                "style_instruction_length": len(str(tts_style.get("style_instruction") or "")),
            },
        )
        logger.info(
            "storyboard_tts_emotional_context_selected",
            extra={
                "project_id": project_id,
                "ad_category": ad_category,
                "voice": selected_voice,
                "language": language_code,
                "generation_mode": generation_mode,
                "emotional_context": str(tts_style.get("emotional_context") or ""),
            },
        )
        logger.info(
            "storyboard_tts_delivery_profile_selected",
            extra={
                "project_id": project_id,
                "ad_category": ad_category,
                "voice": selected_voice,
                "language": language_code,
                "generation_mode": generation_mode,
                "delivery_profile": str(tts_style.get("delivery_profile") or ""),
            },
        )

        lipsync_required_scenes: list[Any] = []
        for scene in required:
            needs_lipsync, _ = scene_requires_lipsync(scene, project)
            if needs_lipsync:
                lipsync_required_scenes.append(scene)

        def _estimate_audio_duration_seconds(text: str) -> float:
            return max(1.5, (len(str(text or "").split()) / 150.0) * 60.0)

        def _split_script(script_text: str, count: int) -> list[str]:
            words = [w for w in str(script_text or "").split() if w.strip()]
            if count <= 1:
                return [" ".join(words).strip()]
            base = len(words) // count
            rem = len(words) % count
            out: list[str] = []
            cursor = 0
            for i in range(count):
                take = base + (1 if i < rem else 0)
                out.append(" ".join(words[cursor: cursor + take]).strip())
                cursor += take
            return out

        scene_audio_map: dict[str, str] = {}
        total_audio_duration = 0.0

        narration_audio_url: str | None = None
        if generation_mode == "narration_combined":
            narration_text = strip_storyboard_tts_metadata(tts_script)
            if not narration_text:
                raise ValueError("Missing narration script for cinematic narration mode")
            narration_audio_url, _meta = fal_service.generate_gemini_flash_tts(
                text=narration_text,
                voice=selected_voice,
                language_code=language_code,
                style_instructions=str(tts_style.get("style_instruction") or ""),
            )
            total_audio_duration = _estimate_audio_duration_seconds(narration_text)
            db.update_project(
                project_id,
                tts_audio_url=narration_audio_url,
                tts_audio_duration_seconds=total_audio_duration,
            )
            logger.info(
                "storyboard_tts_narration_audio_generated",
                extra={"project_id": project_id, "audio_url_present": bool(narration_audio_url), "duration_seconds": total_audio_duration},
            )
            logger.info(
                "storyboard_narration_audio_persisted",
                extra={"project_id": project_id, "audio_url_present": bool(narration_audio_url)},
            )
        else:
            split_chunks = _split_script(tts_script, max(1, len(lipsync_required_scenes)))
            for idx, scene in enumerate(lipsync_required_scenes):
                scene_id = str(scene.id)
                scene_text = (
                    str(getattr(scene, "tts_text", "") or "").strip()
                    or str(getattr(scene, "voice_line", "") or "").strip()
                    or str(getattr(scene, "spoken_line", "") or "").strip()
                    or str(getattr(scene, "dialogue", "") or "").strip()
                    or str(getattr(scene, "narration", "") or "").strip()
                    or str(getattr(scene, "script_line", "") or "").strip()
                    or (split_chunks[idx] if idx < len(split_chunks) else "")
                ).strip()
                scene_text = strip_storyboard_tts_metadata(scene_text)
                if not scene_text:
                    raise ValueError(f"Missing scene-level TTS text for scene {scene.scene_number}")
                logger.info("storyboard_tts_scene_text_selected", extra={"project_id": project_id, "scene_id": scene_id, "text_length": len(scene_text)})
                logger.info("storyboard_tts_scene_started", extra={"project_id": project_id, "scene_id": scene_id})

                scene_audio_url, _meta = fal_service.generate_gemini_flash_tts(
                    text=scene_text,
                    voice=selected_voice,
                    language_code=language_code,
                    style_instructions=str(tts_style.get("style_instruction") or ""),
                )
                scene_audio_duration = _estimate_audio_duration_seconds(scene_text)
                scene_duration = float(getattr(scene, "duration_seconds", 0) or 0)
                if scene_audio_duration > (scene_duration + 0.5):
                    raise ValueError(
                        f"scene_audio_too_long: Scene {scene.scene_number} audio is {scene_audio_duration:.1f}s but scene duration is {scene_duration:.1f}s. Please shorten scene dialogue."
                    )
                db.update_scene(
                    project_id,
                    scene_id,
                    tts_text=scene_text,
                    tts_audio_url=scene_audio_url,
                    tts_audio_duration_seconds=scene_audio_duration,
                    tts_status="completed",
                    tts_error=None,
                    tts_completed_at=utcnow(),
                )
                logger.info("storyboard_tts_scene_audio_generated", extra={"project_id": project_id, "scene_id": scene_id, "audio_url_present": bool(scene_audio_url)})
                logger.info("storyboard_tts_scene_audio_duration", extra={"project_id": project_id, "scene_id": scene_id, "duration_seconds": scene_audio_duration})
                scene_audio_map[scene_id] = scene_audio_url
                total_audio_duration += scene_audio_duration

        # Deduct credits
        credit_service = CreditService()
        from app.recipes.storyboard_video import CREDIT_COSTS

        credit_result = credit_service.deduct_credits(
            user_id=user_id,
            amount=CREDIT_COSTS.tts_full_script,
            feature_key="storyboard_video",
            metadata={
                "project_id": project_id,
                "voice": selected_voice,
                "language": language_code,
                "word_count": len(tts_script.split()),
                "scene_count": len(scene_audio_map),
                "operation": "tts_generation",
            },
            source="storyboard_tts_generation",
            idempotency_key=idempotency_key,
        )

        # Credit deducted successfully (would raise exception on failure)
        # Update project
        db.update_project(
            project_id,
            selected_voice=selected_voice,
            tts_audio_url=narration_audio_url if generation_mode == "narration_combined" else None,
            tts_status="completed",
            tts_error=None,
            tts_completed_at=utcnow(),
        )
        logger.info("storyboard_tts_all_scenes_completed", extra={"project_id": project_id, "scene_count": len(scene_audio_map)})

        # Queue lipsync stage for scenes that require it.
        if project and generation_mode == "narration_combined":
            narration_audio_url = str(getattr(db.get_project(project_id), "tts_audio_url", "") or "").strip()
            _queue_stitching_once(
                db=db,
                project_id=project_id,
                user_id=user_id,
                required_scenes=required,
                narration_audio_url=narration_audio_url or None,
            )
        elif project and scene_audio_map:
            _queue_lipsync_stage(
                db=db,
                project=project,
                required_scenes=required,
                user_id=user_id,
                scene_audio_map=scene_audio_map,
            )
        elif project and not scene_audio_map:
            _queue_stitching_once(db=db, project_id=project_id, user_id=user_id, required_scenes=required)

        logger.info(
            "generate_tts_task_completed",
            extra={
                "project_id": project_id,
                "audio_url": narration_audio_url if generation_mode == "narration_combined" else "scene_level",
                "duration": total_audio_duration,
                "voice": selected_voice,
                "credits_deducted": CREDIT_COSTS.tts_full_script,
            },
        )
        logger.info("storyboard_tts_generation_completed", extra={"project_id": project_id})

        return {
            "project_id": project_id,
            "status": "completed",
            "audio_url": narration_audio_url if generation_mode == "narration_combined" else None,
            "duration_seconds": total_audio_duration,
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
        try:
            db = StoryboardRepository()
            db.update_project(
                project_id,
                tts_status="failed",
                tts_error=str(e),
                workflow_state=StoryboardWorkflowState.PRODUCTION_FAILED,
                production_status="production_failed",
                production_error=f"TTS stage failed: {e}",
            )
        except Exception:
            logger.warning("storyboard_generate_tts_task_failure_state_update_failed", extra={"project_id": project_id}, exc_info=True)
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
        approved_scenes = sorted([s for s in scenes if s.user_approved], key=lambda s: int(s.scene_number or 0))

        if not approved_scenes:
            raise ValueError("No approved scenes to stitch")

        # Collect final scene videos in order. For lipsync-required scenes, final_scene_video_url is mandatory.
        video_urls: list[str] = []
        for scene in approved_scenes:
            requires_lipsync, _ = scene_requires_lipsync(scene, project)
            final_scene_video_url = str(getattr(scene, "final_scene_video_url", "") or "").strip()
            if requires_lipsync and not final_scene_video_url:
                raise ValueError(f"Cannot stitch: final scene video missing for scene {scene.scene_number}")
            selected_url = final_scene_video_url or str(scene.lipsync_video_url or scene.video_url or "").strip()
            if not selected_url:
                raise ValueError(f"Cannot stitch: scene video missing for scene {scene.scene_number}")
            video_urls.append(selected_url)
        logger.info("storyboard_stitching_scene_order", extra={"project_id": project_id, "scene_order": [int(s.scene_number or 0) for s in approved_scenes]})

        if not video_urls:
            raise ValueError("No generated videos found")

        # Stitch videos using VideoPipelineService
        from app.services.video_pipeline import VideoPipelineService

        pipeline_service = VideoPipelineService()
        logger.info(
            "storyboard_stitch_pipeline_service_class",
            extra={
                "class": pipeline_service.__class__.__name__,
                "service_module": pipeline_service.__class__.__module__,
                "has_stitch_videos": hasattr(pipeline_service, "stitch_videos"),
            },
        )
        if not hasattr(pipeline_service, "stitch_videos"):
            raise AttributeError("VideoPipelineService missing stitch_videos")
        transition_type = str(getattr(project, "transition_type", "") or "crossfade").strip().lower()
        if transition_type not in {"none", "crossfade", "fade_black"}:
            transition_type = "crossfade"
        transition_duration = float(getattr(project, "transition_duration", 0.3) or 0.3)
        logger.info(
            "storyboard_transition_config_selected",
            extra={
                "project_id": project_id,
                "ad_category": str(getattr(project, "ad_category", "") or ""),
                "transition_type": transition_type,
                "transition_duration": transition_duration,
                "scene_count": len(approved_scenes),
            },
        )
        stitched_output = pipeline_service.stitch_videos(
            video_urls=video_urls,
            project_id=project_id,
            transition_type=transition_type,
            transition_duration=transition_duration,
        )
        narration_audio_url = str(audio_url or getattr(project, "tts_audio_url", "") or "").strip()
        stitched_final_source = stitched_output
        if narration_audio_url:
            logger.info(
                "storyboard_narration_audio_overlay_started",
                extra={"project_id": project_id, "audio_url_present": True},
            )
            stitched_final_source = pipeline_service.mux_audio_to_video(
                video_path=stitched_output,
                audio_path=narration_audio_url,
                output_path=str((Path("data/renders") / f"storyboard-{project_id}-narrated.mp4").resolve()),
                trim_audio_to_video=True,
            )
            logger.info(
                "storyboard_narration_audio_overlay_completed",
                extra={"project_id": project_id, "output_path": str(stitched_final_source)},
            )
        transition_probe = pipeline_service.inspect_media(stitched_final_source)
        logger.info("storyboard_ffprobe_transition_output", extra={"project_id": project_id, "probe": transition_probe})
        final_video_url = _normalize_storyboard_final_video_url(stitched_final_source)
        logger.info("storyboard_final_media_validation_started", extra={"project_id": project_id})
        final_local = pipeline_service.ensure_local_media_path(stitched_final_source)
        final_probe = pipeline_service.inspect_media(str(final_local or stitched_final_source))
        has_video_stream = bool(final_probe.get("has_video"))
        has_audio_stream = bool(final_probe.get("has_audio"))
        final_duration = float(final_probe.get("duration_seconds") or 0.0)
        logger.info("storyboard_ffprobe_final_output", extra={"project_id": project_id, "probe": final_probe})
        logger.info("storyboard_final_media_has_video", extra={"project_id": project_id, "has_video": has_video_stream})
        logger.info("storyboard_final_media_has_audio", extra={"project_id": project_id, "has_audio": has_audio_stream})
        logger.info("storyboard_final_media_duration", extra={"project_id": project_id, "duration_seconds": final_duration})
        lipsync_required_any = any(scene_requires_lipsync(s, project)[0] for s in approved_scenes)
        if not has_video_stream:
            raise ValueError("Final video validation failed: missing video stream")
        if lipsync_required_any and not has_audio_stream:
            raise ValueError("Final video is missing audio even though lipsync was required.")

        # Deduct credits
        credit_service = CreditService()
        from app.recipes.storyboard_video import CREDIT_COSTS

        credit_result = credit_service.deduct_credits(
            user_id=user_id,
            amount=CREDIT_COSTS.final_stitching,
            feature_key="storyboard_video",
            metadata={
                "project_id": project_id,
                "operation": "final_stitching",
            },
            source="storyboard_final_stitching",
            idempotency_key=idempotency_key,
        )

        # Credit deducted successfully (would raise exception on failure)
        # Calculate total duration
        total_duration = sum(s.duration_seconds for s in approved_scenes)

        # Update project
        db.update_project(
            project_id,
            final_video_url=final_video_url,
            final_thumbnail_url=getattr(project, "thumbnail_url", None),
            duration_seconds=total_duration,
            workflow_state=StoryboardWorkflowState.PRODUCTION_COMPLETED,
            production_status="production_completed",
            production_completed_at=utcnow(),
            qc_status="qc_ready",
            package_status="package_ready",
            stitching_status="completed",
            stitching_task_id=self.request.id,
            stitching_lock=False,
            stitching_completed_at=utcnow(),
            production_substage="stitching_completed",
        )
        logger.info("storyboard_qc_stage_queued", extra={"project_id": project_id})
        logger.info("storyboard_package_ready", extra={"project_id": project_id})
        logger.info("storyboard_final_video_ready", extra={"project_id": project_id, "final_video_url_present": bool(final_video_url)})
        _create_storyboard_completion_notification(
            project_id=project_id,
            user_id=user_id,
            final_video_url=final_video_url,
            thumbnail_url=getattr(project, "thumbnail_url", None),
        )
        _upsert_storyboard_video_library_record(
            project_id=project_id,
            user_id=user_id,
            project=project,
            final_video_url=final_video_url,
            thumbnail_url=getattr(project, "thumbnail_url", None),
            duration_seconds=total_duration,
            credits_consumed=int(getattr(project, "credits_consumed", 0) or 0),
        )

        logger.info(
            "stitch_final_video_task_completed",
            extra={
                "project_id": project_id,
                "final_video_url": str(final_video_url or "")[:100],
                "scene_count": len(approved_scenes),
                "total_duration": total_duration,
                "credits_deducted": CREDIT_COSTS.final_stitching,
            },
        )
        logger.info("storyboard_stitch_final_video_completed", extra={"project_id": project_id})
        logger.info("storyboard_final_video_url_saved", extra={"project_id": project_id, "final_video_url_present": bool(final_video_url)})
        logger.info("storyboard_qc_stage_queued", extra={"project_id": project_id})
        project_after = db.get_project(project_id)
        qc_status = str(getattr(project_after, "qc_status", "") or "").strip().lower() if project_after else ""
        if qc_status in {"queued", "in_progress", "completed"}:
            logger.info("storyboard_qc_queue_skipped_existing", extra={"project_id": project_id, "qc_status": qc_status})
        else:
            db.update_project(project_id, qc_status="queued")
            score_final_video_task.apply_async(
                kwargs={
                    "project_id": project_id,
                    "user_id": user_id,
                    "final_video_url": final_video_url,
                }
            )
        logger.info("storyboard_final_media_validation_passed", extra={"project_id": project_id})

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
        logger.error("storyboard_final_media_validation_failed", extra={"project_id": project_id, "error": str(e)})
        try:
            from app.services.video_pipeline import VideoPipelineService
            probe_path = locals().get("stitched_output")
            if probe_path:
                probe_service = VideoPipelineService()
                failed_probe = probe_service.inspect_media(str(probe_path))
                logger.error("storyboard_ffprobe_final_output", extra={"project_id": project_id, "probe": failed_probe})
                logger.error(
                    "storyboard_final_media_validation_failed_artifact",
                    extra={
                        "project_id": project_id,
                        "path": str(probe_path),
                        "file_size_bytes": int(Path(str(probe_path)).stat().st_size) if Path(str(probe_path)).exists() else 0,
                    },
                )
        except Exception:
            logger.warning("storyboard_final_media_validation_probe_failed", extra={"project_id": project_id}, exc_info=True)
        logger.error(
            "stitch_final_video_task_failed",
            extra={
                "project_id": project_id,
                "error": str(e),
                "task_id": self.request.id,
            },
        )
        try:
            db = StoryboardRepository()
            db.update_project(
                project_id,
                stitching_status="failed",
                stitching_lock=False,
                stitching_task_id=self.request.id,
                production_status="production_failed",
                package_status="failed",
                workflow_state=StoryboardWorkflowState.PRODUCTION_FAILED,
                production_error=f"Stitching failed: {e}",
            )
        except Exception:
            logger.warning("storyboard_stitch_failure_state_update_failed", extra={"project_id": project_id}, exc_info=True)
        non_retryable = isinstance(e, (AttributeError, TypeError, ValueError))
        transient_tokens = ("timeout", "timed out", "429", "502", "503", "504", "connection reset", "temporarily unavailable")
        is_transient = any(token in str(e).lower() for token in transient_tokens)
        if (not non_retryable) and is_transient and self.request.retries < self.max_retries:
            raise self.retry(exc=e, countdown=20)
        raise


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

        # Try to deduct scoring credits, but don't fail the task if it fails
        try:
            credit_result = credit_service.deduct_credits(
                user_id=user_id,
                amount=CREDIT_COSTS.final_scoring,
                feature_key="storyboard_video",
                metadata={
                    "project_id": project_id,
                    "operation": "final_scoring",
                },
                source="storyboard_final_scoring",
                idempotency_key=idempotency_key,
            )
        except Exception as e:
            logger.warning(
                "video_scoring_credit_deduction_failed",
                extra={
                    "project_id": project_id,
                    "error": str(e),
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
            qc_status="completed",
            qc_completed_at=utcnow(),
            package_status="package_ready",
            production_status="production_completed",
            production_substage="package_ready",
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
        logger.info("storyboard_score_final_video_completed", extra={"project_id": project_id})
        logger.info("storyboard_package_ready", extra={"project_id": project_id})
        _create_storyboard_completion_notification(
            project_id=project_id,
            user_id=user_id,
            final_video_url=final_video_url,
            thumbnail_url=getattr(project, "thumbnail_url", None),
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
