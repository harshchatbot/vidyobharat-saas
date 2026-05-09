from __future__ import annotations

import hashlib
import json
import logging
import mimetypes
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from app.core.config import get_settings
from app.cinematic.families.motion_control.builder import build_motion_control_dance_spec
from app.cinematic.families.ugc.builder import build_ugc_avatar_product_spec
from app.cinematic.orchestrator.compile_prompt import compile_cinematic_prompt
from app.db.firestore_utils import utcnow
from app.db.repositories.video_repository import VideoRepository
from app.pipeline.prompt_builder import build_scene_prompt
from app.providers.storage import build_storage_provider
from app.pipeline.scene_planner import (
    AvatarProductBrief,
    UgcAdClientBrief,
    build_avatar_product_scene_plan,
    build_ltx_freeform_scene_plan,
    build_ltx_cinematic_montage_scene_plan,
    build_deep_explainer_scene_plan,
    build_ugc_ad_scene_plan,
    build_ugc_business_context,
    detect_ugc_ad_family,
    is_client_brief_mode,
    normalize_avatar_product_brief,
    normalize_ugc_client_brief,
    plan_scenes,
)
from app.recipes.recipe_registry import EXPLAINER_RECIPE_IDS, LTX_BENCHMARK_RECIPE_IDS, LTX_FREEFORM_RECIPE_IDS, LTX_RECIPE_IDS, UGC_AD_RECIPE_IDS, get_recipe, validate_recipe_inputs
from app.services.audio_analysis_service import AudioAnalysisService
from app.services.avatar_service import (
    AvatarService,
    build_avatar_master_prompt,
    resolve_avatar_reference_variants,
    selectBestAvatarReferenceImage,
    selectBestAvatarReferenceImageWithContrast,
)
from app.services.avatar_product_tts_catalog import (
    resolve_avatar_product_gemini_language,
    resolve_avatar_product_gemini_voice,
)
from app.services.audio_service import RecipeAudioService
from app.services.credit_service import CreditService
from app.services.emotion_service import build_behavior_timeline
from app.services.hf_qwen_enhancer_service import HFQwenEnhancerInput, HFQwenEnhancerResult, HFQwenEnhancerService
from app.services.avatar_product_workflow_service import AvatarProductWorkflowService
from app.services.influencer_service import InfluencerService
from app.services.image_generation_service import ImageGenerationService
from app.services.llm.base import ScriptPlan
from app.services.llm.qwen_service import QwenService
from app.services.motion_control_media_service import MotionControlMediaService
from app.services.timing_sync_service import TimingSyncService
from app.services.video_generation_service import ClipGenerationRequest, VideoGenerationService
from app.services.video_pipeline import VideoPipelineService
from app.services.lipsync_face_service import crop_face_for_lipsync, composite_lipsync_result
from app.services.video_stitcher import VideoStitcher

logger = logging.getLogger(__name__)


@dataclass
class RecipePipelineResult:
    provider: str
    model_key: str
    video_url: str
    metadata: dict[str, Any]


@dataclass
class ExplainerNarrationPlan:
    narration_script: str
    scene_beats: list[str]
    overlay_text: list[str]
    source_type: str
    used_dedicated_script: bool = True


def _append_pipeline_event(
    *,
    video_id: str,
    kind: str,
    title: str,
    detail: str,
    state: str = "complete",
) -> None:
    repo = VideoRepository(None)
    snapshot = repo.collection.document(video_id).get()
    data = snapshot.to_dict() or {}
    metadata = dict(data.get("pipeline_metadata") or data.get("pipelineMetadata") or {})
    events = list(metadata.get("events") or [])
    events.append(
        {
            "id": f"event_{len(events) + 1}",
            "kind": kind,
            "title": title,
            "detail": detail,
            "state": state,
            "created_at": utcnow().isoformat(),
        }
    )
    metadata["events"] = events[-32:]
    repo.collection.document(video_id).set({"pipeline_metadata": metadata, "updated_at": utcnow()}, merge=True)


def _merge_pipeline_metadata(*, video_id: str, **fields: Any) -> None:
    repo = VideoRepository(None)
    snapshot = repo.collection.document(video_id).get()
    data = snapshot.to_dict() or {}
    metadata = dict(data.get("pipeline_metadata") or data.get("pipelineMetadata") or {})
    metadata.update(fields)
    repo.collection.document(video_id).set({"pipeline_metadata": metadata, "updated_at": utcnow()}, merge=True)



def _persist_final_video(
    *,
    video_id: str,
    user_id: str,
    video_url: str,
    status: str = "completed",
    metadata: dict[str, Any] | None = None,
) -> None:
    repo = VideoRepository(None)
    repo.collection.document(video_id).set(
        {
            "id": video_id,
            "video_id": video_id,
            "user_id": user_id,
            "videoUrl": video_url,
            "video_url": video_url,
            "status": status,
            "provider_status": status,
            "pipeline_metadata": metadata or {},
            "updated_at": utcnow(),
        },
        merge=True,
    )


def _resolve_probe_input(url_or_path: str) -> str | None:
    normalized = str(url_or_path or "").strip()
    if not normalized:
        return None
    if normalized.startswith("/static/"):
        candidate = Path("data") / normalized.replace("/static/", "", 1)
        return str(candidate) if candidate.exists() else None
    path = Path(normalized)
    if path.exists():
        return str(path)
    return normalized


def _probe_media_duration_seconds(url_or_path: str) -> float | None:
    probe_target = _resolve_probe_input(url_or_path)
    if not probe_target:
        return None
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                probe_target,
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        value = float((result.stdout or "").strip() or "0")
        return round(max(0.0, value), 3)
    except Exception:
        logger.warning("avatar_product_duration_probe_failed", extra={"probe_target": probe_target})
        return None


def _build_avatar_product_duration_diagnostics(
    *,
    requested_duration_seconds: int,
    base_video_duration_seconds: float | None,
    tts_audio_duration_seconds: float | None,
    final_lipsync_duration_seconds: float | None,
    resolved_video_model_key: str,
) -> dict[str, Any]:
    duration_drift_seconds = (
        round(float(final_lipsync_duration_seconds) - float(requested_duration_seconds), 3)
        if final_lipsync_duration_seconds is not None
        else None
    )
    return {
        "requested_duration_seconds": int(requested_duration_seconds),
        "base_video_duration_seconds": base_video_duration_seconds,
        "tts_audio_duration_seconds": tts_audio_duration_seconds,
        "final_lipsync_duration_seconds": final_lipsync_duration_seconds,
        "duration_drift_seconds": duration_drift_seconds,
        "resolved_video_model_key": resolved_video_model_key,
    }


def _avatar_product_prompt_profile(prompt: str) -> dict[str, int]:
    normalized = str(prompt or "").strip()
    if not normalized:
        return {"length_chars": 0, "rule_count": 0, "dedupe_count": 0}
    lowered = normalized.lower()
    separators = ['constraints:', 'must do:', 'must avoid:', ';']
    rule_count = sum(lowered.count(sep) for sep in separators)
    mouthish = sum(lowered.count(token) for token in ('mouth', 'lip', 'lips', 'chin'))
    dedupe_count = max(0, mouthish - 2)
    return {
        "length_chars": len(normalized),
        "rule_count": int(rule_count),
        "dedupe_count": int(dedupe_count),
    }


_AVATAR_POSE_CONSTRAINTS_BLOCK = (
    "Keep the product below chin level at all times. "
    "Mouth and jaw must remain fully visible throughout. "
    "Never raise the product above chest height. "
    "Hands stay at chest level or below."
)

_KlingPromptMaxLengthChars = 2500


def enforce_avatar_pose_constraints(prompt: str) -> str:
    """
    Centralized safety constraint for avatar_product base video generation.

    Idempotent: if a prior compiler already included the same constraint intent,
    we avoid appending duplicate instructions.
    """

    normalized = str(prompt or "").strip()
    if not normalized:
        return _AVATAR_POSE_CONSTRAINTS_BLOCK

    lowered = normalized.lower()
    # Idempotency check: the exact canonical phrase is enough; we keep it simple and deterministic.
    if "keep the product below chin level" in lowered and "mouth and jaw must remain fully visible" in lowered:
        return normalized

    return f"{normalized}\n\nPose constraints:\n{_AVATAR_POSE_CONSTRAINTS_BLOCK}"


def _enforce_kling_prompt_max_length(prompt: str, *, max_length: int = _KlingPromptMaxLengthChars) -> tuple[str, dict[str, Any]]:
    """
    FAL Kling endpoints validate prompt length (currently 2500 chars).
    Keep the output deterministic: preserve an ending "constraints-like" tail if present.
    """

    normalized = re.sub(r"\s+\n", "\n", str(prompt or "").strip())
    normalized = re.sub(r"\n{3,}", "\n\n", normalized)
    original_len = len(normalized)
    if original_len <= int(max_length):
        return normalized, {"original_length_chars": original_len, "clipped": False, "max_length_chars": int(max_length)}

    lowered = normalized.lower()
    # Preserve the most relevant tail block (constraints/pose constraints), as it often carries safety rules.
    tail_markers = ("pose constraints:", "\nconstraints:", "\nmust do:", "\nmust avoid:")
    tail_start = None
    for marker in tail_markers:
        idx = lowered.rfind(marker)
        if idx != -1:
            tail_start = idx
            break
    if tail_start is not None and (original_len - tail_start) <= 900:
        tail = normalized[tail_start:].strip()
    else:
        # Fallback: keep the last N chars as tail.
        tail = normalized[-700:].strip()

    budget_for_head = max(0, int(max_length) - len(tail) - 2)
    head = normalized[:budget_for_head].rstrip()
    if len(head) > 60:
        # Trim to a whitespace boundary for nicer prompts.
        cut = head.rfind(" ")
        if cut >= max(0, len(head) - 180):
            head = head[:cut].rstrip()

    clipped = (head + "\n\n" + tail).strip()
    # Hard cap (safety): in worst case, tail might still overflow.
    if len(clipped) > int(max_length):
        clipped = clipped[: int(max_length)].rstrip()

    return clipped, {
        "original_length_chars": original_len,
        "clipped_length_chars": len(clipped),
        "clipped": True,
        "max_length_chars": int(max_length),
        "tail_preserved": bool(tail_start is not None),
    }


def _get_pipeline_metadata(video_id: str) -> dict[str, Any]:
    repo = VideoRepository(None)
    snapshot = repo.collection.document(video_id).get()
    data = snapshot.to_dict() or {}
    return dict(data.get("pipeline_metadata") or data.get("pipelineMetadata") or {})


def _resolve_requested_avatar_id(
    *,
    initial_pipeline_metadata: dict[str, Any],
    normalized_inputs: dict[str, Any],
) -> str | None:
    candidates = (
        initial_pipeline_metadata.get("persona_id"),
        initial_pipeline_metadata.get("avatar_id"),
        normalized_inputs.get("avatar_id"),
    )
    for candidate in candidates:
        normalized = str(candidate or "").strip()
        if normalized:
            return normalized
    return None


def _is_chitrakala_v1(*, recipe_id: str, initial_pipeline_metadata: dict[str, Any]) -> bool:
    return recipe_id == 'avatar_product' and str(initial_pipeline_metadata.get('pipeline_version') or '').strip() == 'chitrakala_v1'


def _compact_spoken_line(text: str, *, fallback: str) -> str:
    cleaned = re.sub(r'\s+', ' ', str(text or '').strip())
    if not cleaned:
        return fallback
    cleaned = re.sub(r'^[\-\*\d\.\)\(]+\s*', '', cleaned).strip()
    cleaned = re.sub(r'^(?:hook|showcase|cta|scene\s*\d+)[:\-]\s*', '', cleaned, flags=re.IGNORECASE).strip()
    if len(cleaned) <= 140:
        return cleaned
    shortened = cleaned[:140].rsplit(' ', 1)[0].strip()
    return shortened or cleaned[:140].strip()


def _translate_avatar_product_narration_if_needed(
    script: str,
    *,
    target_language: str | None,
) -> tuple[str, bool]:
    normalized_script = re.sub(r"\s+", " ", str(script or "").strip())
    resolved_target_language = str(target_language or "").strip()
    if not normalized_script or not resolved_target_language or resolved_target_language == "English (India)":
        return normalized_script, False
    if resolved_target_language == "Hindi (India)" and re.search(r"[\u0900-\u097F]", normalized_script):
        return normalized_script, False

    translated = QwenService(get_settings()).complete_text(
        task_type="translate",
        system_prompt=(
            "Translate the provided text accurately into the requested target language. "
            "If the text is already in the target language, return it unchanged. "
            "Return only the translated text. Keep product names and brand names unchanged where appropriate."
        ),
        user_prompt=f"Target language: {resolved_target_language}\n\nText:\n{normalized_script}",
        temperature=0.2,
    )
    cleaned = re.sub(r"\s+", " ", str(translated or "").strip())
    return (cleaned or normalized_script), bool(cleaned and cleaned != normalized_script)



def _cap_spoken_script_for_duration(
    script: str,
    *,
    duration_seconds: int,
    language: str | None = None,
) -> str:
    cleaned = re.sub(r"\s+", " ", str(script or "").strip())
    if not cleaned:
        return ""

    duration = max(5, min(int(duration_seconds or 5), 30))
    language_normalized = str(language or "").strip().lower()

    # Hindi generally needs fewer words for clean lip-sync in short ads.
    if "hi" in language_normalized or "hindi" in language_normalized:
        max_words = {
            5: 10,
            10: 18,
            15: 28,
            30: 52,
        }.get(duration, max(10, int(duration * 1.9)))
    else:
        max_words = {
            5: 12,
            10: 22,
            15: 34,
            30: 60,
        }.get(duration, max(12, int(duration * 2.2)))

    words = cleaned.split()
    if len(words) <= max_words:
        return cleaned

    shortened = " ".join(words[:max_words]).strip()
    shortened = re.sub(r"[,;:\-–—]+$", "", shortened).strip()
    if shortened and shortened[-1] not in ".!?।":
        shortened += "।" if ("hi" in language_normalized or "hindi" in language_normalized) else "."
    return shortened


def _polish_avatar_product_script_for_duration(
    script: str,
    *,
    duration_seconds: int,
    language: str | None = None,
) -> str:
    cleaned = re.sub(r"\s+", " ", str(script or "").strip())
    if not cleaned:
        return ""

    duration = max(5, min(int(duration_seconds or 5), 30))
    language_normalized = str(language or "").strip().lower()
    is_hindi = "hi" in language_normalized or "hindi" in language_normalized
    sentence_pattern = r"(?<=[.!?।])\s+"
    sentences = [segment.strip() for segment in re.split(sentence_pattern, cleaned) if segment.strip()]

    if duration <= 5 and len(sentences) >= 2:
        opener = sentences[0]
        closer = sentences[-1]
        if opener == closer and len(sentences) > 1:
            closer = sentences[1]
        if is_hindi:
            if not re.search(r"(देखिए|आज|अभी|ज़रूर|चुनाव|पसंद)", closer):
                closer = "आज ही ज़रूर देखिए।"
            elif closer[-1] not in ".!?।":
                closer += "।"
        else:
            if not re.search(r"(today|now|check|shop|try|explore)", closer, flags=re.IGNORECASE):
                closer = "Check it out today."
            elif closer[-1] not in ".!?":
                closer += "."
        return f"{opener} {closer}".strip()

    if cleaned[-1] not in ".!?।":
        cleaned += "।" if is_hindi else "."
    return cleaned


def _normalize_avatar_product_name_candidate(value: str) -> str:
    cleaned = re.sub(r"\s+", " ", str(value or "").strip())
    if not cleaned:
        return ""
    cleaned = re.sub(r"^(?:a|an|the)\s+", "", cleaned, flags=re.IGNORECASE).strip()
    cleaned = re.split(r"\s+(?:with|that|which|featuring|including|using)\s+", cleaned, maxsplit=1, flags=re.IGNORECASE)[0].strip(" ,.-")
    return cleaned


def _avatar_product_short_label(
    *,
    avatar_product_brief: AvatarProductBrief | None,
    language: str | None,
) -> str:
    is_hindi = "hi" in str(language or "").lower() or "hindi" in str(language or "").lower()
    product_name = _normalize_avatar_product_name_candidate(getattr(avatar_product_brief, "product_name", "") or "")
    haystack = " ".join(
        part
        for part in [
            product_name,
            getattr(avatar_product_brief, "product_category", "") or "",
            getattr(avatar_product_brief, "product_subcategory", "") or "",
            getattr(avatar_product_brief, "category_specific_details", "") or "",
        ]
        if str(part or "").strip()
    ).lower()

    if "wall clock" in haystack or re.search(r"\bclock\b", haystack):
        return "वुडन वॉल क्लॉक" if is_hindi else "wooden wall clock"
    if "serum" in haystack or "skincare" in haystack:
        return "सीरम" if is_hindi else "serum"
    if "saas" in haystack or "software" in haystack or re.search(r"\bapp\b", haystack):
        return "AI टूल" if is_hindi else "AI tool"
    if "kurti" in haystack or "dress" in haystack or "apparel" in haystack:
        return "आउटफिट" if is_hindi else "outfit"
    if product_name:
        return product_name
    return "यह प्रोडक्ट" if is_hindi else "this product"


def _avatar_product_short_benefit_phrase(
    *,
    avatar_product_brief: AvatarProductBrief | None,
    language: str | None,
) -> str:
    is_hindi = "hi" in str(language or "").lower() or "hindi" in str(language or "").lower()
    key_promise = str(getattr(avatar_product_brief, "key_promise", "") or "").strip()
    category = str(getattr(avatar_product_brief, "product_category", "") or "").lower()
    product_name = str(getattr(avatar_product_brief, "product_name", "") or "").lower()
    haystack = " ".join(
        part for part in [key_promise, category, product_name, str(getattr(avatar_product_brief, "category_specific_details", "") or "")]
        if part
    ).lower()

    if "wall clock" in haystack or re.search(r"\bclock\b", haystack):
        return "हल्की है और लगाना आसान है" if is_hindi else "is lightweight and easy to hang"
    if "serum" in haystack or "skincare" in haystack:
        return "स्किन को हेल्दी ग्लो देती है" if is_hindi else "gives skin a healthy glow"
    if "saas" in haystack or "software" in haystack or re.search(r"\bapp\b", haystack):
        return "काम को आसान और तेज बनाता है" if is_hindi else "makes work simpler and faster"
    if "kurti" in haystack or "dress" in haystack or "apparel" in haystack:
        return "आरामदायक है और आसानी से स्टाइल होती है" if is_hindi else "feels comfortable and styles easily"

    normalized = _normalize_avatar_product_name_candidate(key_promise)
    if normalized:
        return normalized
    return "आपके रोज़मर्रा के काम को आसान बनाती है" if is_hindi else "makes everyday use easier"


def _avatar_product_short_cta(
    *,
    avatar_product_brief: AvatarProductBrief | None,
    language: str | None,
) -> str:
    is_hindi = "hi" in str(language or "").lower() or "hindi" in str(language or "").lower()
    raw = str(
        getattr(avatar_product_brief, "cta_preference", "") or getattr(avatar_product_brief, "cta", "") or ""
    ).strip()
    if raw:
        if raw[-1] not in ".!?।":
            raw += "।" if is_hindi else "."
        return raw
    return "आज ही देखिए।" if is_hindi else "Check it out today."


def _build_avatar_product_timeboxed_script(
    *,
    avatar_product_brief: AvatarProductBrief | None,
    duration_seconds: int,
    language: str | None,
) -> str:
    is_hindi = "hi" in str(language or "").lower() or "hindi" in str(language or "").lower()
    product_label = _avatar_product_short_label(
        avatar_product_brief=avatar_product_brief,
        language=language,
    )
    benefit = _avatar_product_short_benefit_phrase(
        avatar_product_brief=avatar_product_brief,
        language=language,
    )
    cta = _avatar_product_short_cta(
        avatar_product_brief=avatar_product_brief,
        language=language,
    )

    if duration_seconds <= 5:
        if is_hindi:
            return (
                f"ये {product_label} देखिए... {benefit}। "
                f"{cta}"
            ).strip()
        return (
            f"Take a look at this {product_label}... {benefit}. "
            f"{cta}"
        ).strip()

    if is_hindi:
        return (
            f"ये {product_label} सच में पसंद आएगा... {benefit} और रोज़मर्रा में काम आता है। "
            f"{cta}"
        ).strip()
    return (
        f"This {product_label} is genuinely useful... {benefit} and fits naturally into everyday use. "
        f"{cta}"
    ).strip()


def _rewrite_avatar_product_script_for_quality(
    script: str,
    *,
    avatar_product_brief: AvatarProductBrief | None,
    duration_seconds: int,
    language: str | None,
) -> tuple[str, bool]:
    """Return a higher-quality brief-grounded script and whether it is already time-bounded."""
    cleaned = re.sub(r"\s+", " ", str(script or "").strip())
    if not avatar_product_brief:
        return cleaned, False

    if duration_seconds <= 5:
        return _build_avatar_product_timeboxed_script(
            avatar_product_brief=avatar_product_brief,
            duration_seconds=duration_seconds,
            language=language,
        ), True

    return cleaned, False


def _split_chitrakala_manual_script(
    script: str,
    *,
    product_name: str,
    cta: str,
) -> dict[str, str]:
    normalized = str(script or '').strip()
    if not normalized:
        return {
            'hook_line': '',
            'showcase_line': '',
            'cta_line': '',
        }

    normalized = normalized.replace('\r', '\n')
    raw_parts = [
        segment.strip(' -\n\t')
        for segment in re.split(r'(?:\n+|(?<=[.!?])\s+)', normalized)
        if segment and segment.strip(' -\n\t')
    ]
    if len(raw_parts) < 3:
        comma_parts = [segment.strip() for segment in re.split(r'\s*,\s*', normalized) if segment.strip()]
        if len(comma_parts) >= 3:
            raw_parts = comma_parts

    while len(raw_parts) < 3:
        if not raw_parts:
            raw_parts.append(f'{product_name} is worth a quick look.')
        elif len(raw_parts) == 1:
            raw_parts.append(f'Here is what makes {product_name} easy to trust.')
        else:
            raw_parts.append(cta)

    hook_line, showcase_line, cta_line = raw_parts[:3]
    return {
        'hook_line': _compact_spoken_line(hook_line, fallback=f'{product_name} is the quick fix you want to notice today.'),
        'showcase_line': _compact_spoken_line(showcase_line, fallback=f'This is where {product_name} clearly shows why it stands out.'),
        'cta_line': _compact_spoken_line(cta_line, fallback=cta),
    }


def _build_chitrakala_showcase_prompt(
    *,
    product_name: str,
    showcase_visual_prompt: str | None,
    must_show_elements: list[str] | None,
) -> str:
    must_show_text = ', '.join(item for item in (must_show_elements or []) if str(item).strip())
    visual_prompt = str(showcase_visual_prompt or '').strip()
    base = (
        f'natural UGC product shot of {product_name}, hand holding the product, indoor Indian home lighting, '
        'realistic phone-shot ad, product clearly visible, no distorted label, vertical framing, stable product readability'
    )
    if visual_prompt:
        base = f'{base}. {visual_prompt}'
    if must_show_text:
        base = f'{base}. Required product details to preserve: {must_show_text}'
    return base


def _is_chitrakala_showcase_scene(
    *,
    recipe_id: str,
    initial_pipeline_metadata: dict[str, Any],
    scene: dict[str, Any],
) -> bool:
    return _is_chitrakala_v1(
        recipe_id=recipe_id,
        initial_pipeline_metadata=initial_pipeline_metadata,
    ) and str(scene.get('stage_name') or '').strip().lower() == 'showcase'


def _apply_chitrakala_v1_scene_strategy(
    *,
    scenes: list[dict[str, Any]],
    showcase_visual_prompt: str | None,
    product_name: str,
) -> list[dict[str, Any]]:
    updated_scenes: list[dict[str, Any]] = []
    for scene in scenes:
        updated = dict(scene)
        stage_name = str(updated.get('stage_name') or '').strip().lower()
        if stage_name == 'showcase':
            updated['render_lane'] = 'cinematic_broll'
            updated['talking_mode'] = 'voiceover_safe'
            updated['persona_required'] = False
            updated['use_locked_persona'] = False
            updated['generator_model_family'] = 'ltx'
            updated['model_key'] = 'fal_ltx23_i2v'
            updated['visual_objective'] = (
                f'Create one clean believable showcase beat for {product_name} with the product clearly readable and hero-framed.'
            )
            updated['showcase_visual_prompt'] = showcase_visual_prompt or updated.get('showcase_visual_prompt')
            updated['motion_intent'] = 'subtle handheld realism with stable product framing and a clean hero reveal'
            updated['camera_framing'] = 'close-up or medium close-up hero product framing with one natural hand interaction'
        else:
            updated['render_lane'] = 'talking_avatar'
            updated['persona_required'] = True
            updated['use_locked_persona'] = True
        updated_scenes.append(updated)
    return updated_scenes


def _persona_provider_fields(raw: dict[str, Any] | None, *, default_provider: str = 'fal') -> dict[str, Any]:
    source = dict(raw or {})
    provider = str(source.get('provider') or '').strip().lower() or default_provider
    provider_avatar_id = str(
        source.get('provider_avatar_id')
        or source.get('avatar_provider_id')
        or ''
    ).strip() or None
    provider_voice_id = str(source.get('provider_voice_id') or source.get('voice_id') or '').strip() or None
    voice_provider = str(source.get('voice_provider') or '').strip().lower() or 'sarvam'
    return {
        'provider': provider,
        'provider_avatar_id': provider_avatar_id,
        'provider_voice_id': provider_voice_id,
        'voice_provider': voice_provider,
        'provider_api_version': str(source.get('provider_api_version') or '').strip() or None,
        'avatar_family': str(source.get('avatar_family') or '').strip() or None,
        'avatar_type': str(source.get('avatar_type') or '').strip() or None,
        'ownership': str(source.get('ownership') or '').strip() or None,
        'supports_avatar_video_generation': (
            bool(source.get('supports_avatar_video_generation'))
            if source.get('supports_avatar_video_generation') is not None
            else None
        ),
    }


def _resolve_ugc_persona(*, persona_id: str | None, user_id: str, voice_override: str | None, language_override: str | None) -> dict[str, Any] | None:
    normalized_id = str(persona_id or "").strip()
    if not normalized_id:
        return None

    settings = get_settings()
    avatar_service = AvatarService()
    chitrakala_persona_id = str(settings.chitrakala_persona_id or '').strip()
    actor = avatar_service.get_actor_record(normalized_id, user_id=user_id)
    if normalized_id == chitrakala_persona_id and not actor:
        image_url = str(settings.chitrakala_avatar_image_url or '').strip()
        primary_image, reference_images, reference_image_variants = resolve_avatar_reference_variants(
            avatar_id=chitrakala_persona_id,
            base_url=settings.public_asset_base_url,
            primary_image=image_url or None,
            raw_reference_images=[image_url] if image_url else [],
            fallback_reference_image_url=image_url or None,
        )
        image_url = primary_image or image_url
        thumbnail_url = str(settings.chitrakala_avatar_thumbnail_url or image_url).strip() or image_url
        if not image_url:
            return None
        return {
            "persona_id": chitrakala_persona_id,
            "persona_source": "chitrakala_v1",
            "name": str(settings.chitrakala_avatar_name or 'Chitrakala').strip() or 'Chitrakala',
            "image_url": image_url,
            "thumbnail_url": thumbnail_url,
            "style_label": "fixed_brand_avatar",
            "niche": "product_ad",
            "gender": "female",
            "default_voice_id": voice_override or str(settings.chitrakala_voice or 'Priya').strip() or 'Priya',
            "language_preference": language_override or str(settings.chitrakala_language or 'en-IN').strip() or 'en-IN',
            "default_behavior_prompt": (
                str(settings.chitrakala_avatar_prompt_template or '').strip()
                or 'friendly Indian creator named Chitrakala speaking naturally to camera, subtle head movement, persuasive calm expression, minimal movement'
            ),
            "negative_prompt": str(settings.chitrakala_avatar_negative_prompt or '').strip() or None,
            "reference_images": reference_images or [image_url],
            "reference_image_variants": [
                {'id': item.id, 'url': item.url, 'tags': item.tags}
                for item in reference_image_variants
            ],
            "voice_profile": None,
            "default_camera_style": "selfie_medium_close",
            "preview_video_url": None,
            "provider": "fal",
            "provider_avatar_id": None,
            "provider_voice_id": None,
            "voice_provider": "sarvam",
            "provider_api_version": None,
            "avatar_family": "fixed_avatar",
            "avatar_type": "image_reference",
            "ownership": "app",
            "supports_avatar_video_generation": True,
        }

    if actor:
        default_voice = voice_override or actor.recommended_voice or ("Priya" if "female" in actor.style.lower() else "Shubh")
        reference_image = actor.primary_image or (actor.reference_images[0] if actor.reference_images else actor.thumbnail_url)
        return {
            "persona_id": actor.id,
            "persona_source": "preset_avatar" if actor.source == "preset" else "actor_library",
            "name": actor.name,
            "image_url": reference_image,
            "thumbnail_url": actor.thumbnail_url,
            "style_label": actor.style,
            "niche": actor.category,
            "gender": actor.gender,
            "default_voice_id": default_voice,
            "language_preference": language_override or (actor.language_tags[0] if actor.language_tags else "en-IN"),
            "default_behavior_prompt": actor.prompt_template or (
                f"friendly Indian creator named {actor.name} speaking naturally to camera, "
                "subtle head movement, natural blinking, calm confident expression, minimal movement"
            ),
            "negative_prompt": actor.negative_prompt,
            "reference_images": actor.reference_images,
            "reference_image_variants": [
                {'id': item.id, 'url': item.url, 'tags': item.tags}
                for item in actor.reference_image_variants
            ],
            "voice_profile": actor.voice_profile,
            "default_camera_style": "selfie_medium_close",
            "preview_video_url": actor.preview_video_url,
            **_persona_provider_fields(actor.raw, default_provider='fal'),
        }

    if normalized_id.startswith("av-"):
        avatar = avatar_service.get_avatar(normalized_id, user_id=user_id)
        if not avatar:
            return None
        default_voice = voice_override or ("Priya" if "female" not in avatar.style.lower() else "Priya")
        return {
            "persona_id": avatar.id,
            "persona_source": "preset_avatar",
            "name": avatar.name,
            "image_url": avatar.thumbnail_url,
            "thumbnail_url": avatar.thumbnail_url,
            "style_label": avatar.style,
            "gender": getattr(avatar, "gender", None),
            "niche": None,
            "default_voice_id": default_voice,
            "language_preference": language_override or (avatar.language_tags[0] if avatar.language_tags else "en-IN"),
            "default_behavior_prompt": (
                f"friendly Indian creator named {avatar.name} speaking naturally to camera, "
                "subtle head movement, natural blinking, calm confident expression, minimal movement"
            ),
            "reference_images": list(getattr(avatar, "reference_images", []) or []),
            "reference_image_variants": [
                {
                    'id': str(item.get('id') or ''),
                    'url': str(item.get('url') or ''),
                    'tags': [str(tag) for tag in list(item.get('tags') or []) if str(tag)],
                }
                for item in list(getattr(avatar, "reference_image_variants", []) or [])
                if str(item.get('url') or '').strip()
            ],
            "voice_profile": None,
            "default_camera_style": "selfie_medium_close",
            "preview_video_url": None,
            "provider": "fal",
            "provider_avatar_id": None,
            "provider_voice_id": None,
            "voice_provider": "sarvam",
        }

    try:
        persona = InfluencerService(None).get_persona(normalized_id, user_id)
    except LookupError:
        persona = None
    except Exception:
        logger.exception("ugc_persona_saved_persona_resolution_failed", extra={"persona_id": normalized_id, "user_id": user_id})
        persona = None

    if persona:
        inferred_voice = voice_override or ("Priya" if str(persona.gender_identity or "").lower().startswith("f") else "Shubh")
        behavior_parts = [
            f"{persona.name} speaking naturally to camera",
            f"tone: {persona.tone}" if persona.tone else "",
            "subtle head movement",
            "natural blinking",
            "minimal movement",
        ]
        return {
            "persona_id": persona.id,
            "persona_source": "saved_persona",
            "name": persona.name,
            "image_url": persona.reference_image_url,
            "thumbnail_url": persona.reference_image_url,
            "style_label": persona.tone,
            "niche": persona.niche,
            "gender": persona.gender_identity,
            "default_voice_id": inferred_voice,
            "language_preference": language_override or "en-IN",
            "default_behavior_prompt": persona.system_prompt_template or ", ".join(part for part in behavior_parts if part),
            "reference_images": [persona.reference_image_url] if persona.reference_image_url else [],
            "voice_profile": None,
            "default_camera_style": "selfie_medium_close",
            "preview_video_url": None,
            "provider": "fal",
            "provider_avatar_id": None,
            "provider_voice_id": None,
            "voice_provider": "sarvam",
        }

    custom_avatar = avatar_service.get_custom_avatar(normalized_id, user_id)
    if not custom_avatar:
        return None

    inferred_voice = voice_override or custom_avatar.preferred_voice or ("Priya" if str(custom_avatar.gender or "").lower() == "female" else "Shubh")
    language_preference = language_override or custom_avatar.language_preference or "en-IN"
    label_bits = [bit for bit in [custom_avatar.niche, custom_avatar.style_label] if bit]
    descriptor = ", ".join(label_bits) if label_bits else "custom creator avatar"
    return {
        "persona_id": custom_avatar.id,
        "persona_source": "custom_avatar",
        "name": custom_avatar.name,
        "image_url": custom_avatar.primary_image or custom_avatar.reference_image_url,
        "thumbnail_url": custom_avatar.preview_image_url or custom_avatar.primary_image or custom_avatar.reference_image_url,
        "style_label": custom_avatar.style_label,
        "niche": custom_avatar.niche,
        "default_voice_id": inferred_voice,
        "language_preference": language_preference,
        "gender": custom_avatar.gender,
        "default_behavior_prompt": (
            f"{custom_avatar.name} as a {descriptor}, speaking directly to camera, "
            "friendly Indian creator energy, subtle head movement, natural blinking, calm confident expression, minimal movement"
        ),
        "voice_profile": custom_avatar.voice_profile,
        "default_camera_style": "selfie_medium_close",
        "preview_video_url": custom_avatar.preview_video_url,
        "negative_prompt": custom_avatar.negative_prompt,
        "reference_images": custom_avatar.reference_images,
        "reference_image_variants": [
            {'id': item.id, 'url': item.url, 'tags': item.tags}
            for item in custom_avatar.reference_image_variants
        ],
        **_persona_provider_fields(custom_avatar.raw, default_provider='fal'),
    }


def _upload_talking_scene_audio(
    *,
    user_id: str,
    video_id: str,
    scene_id: str,
    voice_path: Path,
) -> str:
    storage = build_storage_provider(get_settings())
    content_type = mimetypes.guess_type(voice_path.name)[0] or "audio/wav"
    signed = storage.upload_bytes(
        voice_path.name,
        voice_path.read_bytes(),
        content_type=content_type,
        kind=f"users/{user_id}/generated/audio/{video_id}/{scene_id}",
    )
    return signed.public_url


def _upload_video_asset(
    *,
    user_id: str,
    video_id: str,
    local_path: Path,
    kind_suffix: str,
) -> str:
    storage = build_storage_provider(get_settings())
    content_type = mimetypes.guess_type(local_path.name)[0] or "video/mp4"
    signed = storage.upload_bytes(
        local_path.name,
        local_path.read_bytes(),
        content_type=content_type,
        kind=f"users/{user_id}/generated/videos/{video_id}/{kind_suffix}",
    )
    return signed.public_url


def _generate_timed_talking_audio(
    *,
    pipeline: VideoPipelineService,
    render_id: str,
    script: str,
    language_name: str | None,
    voice_name: str,
    voice_profile: dict[str, Any] | None,
    speech_rate: float,
) -> tuple[Path | None, float | None, list[dict[str, Any]] | None]:
    cleaned_script = str(script or "").strip()
    if not cleaned_script:
        return None, None, None

    timing_service = TimingSyncService()
    try:
        lines = timing_service.split_script(cleaned_script)
        if len(lines) <= 1:
            voice_path, voice_duration, _ = pipeline.generate_narration_track(
                render_id=render_id,
                script=cleaned_script,
                language_name=language_name,
                voice_name=voice_name,
                audio_sample_rate_hz=22050,
                speech_rate=speech_rate,
                voice_profile=voice_profile,
            )
            if not voice_path or not voice_path.exists():
                return None, None, None
            duration_ms = int(max(1.0, float(voice_duration or 0.0) * 1000))
            return voice_path, float(voice_duration or 0.0) or None, [
                {"text": cleaned_script, "start_ms": 0, "end_ms": duration_ms, "duration_ms": duration_ms}
            ]

        segment_counter = {"value": 0}

        def _tts_func(line: str) -> Path | None:
            segment_counter["value"] += 1
            voice_path, _, _ = pipeline.generate_narration_track(
                render_id=f"{render_id}-seg-{segment_counter['value']}",
                script=line,
                language_name=language_name,
                voice_name=voice_name,
                audio_sample_rate_hz=22050,
                speech_rate=speech_rate,
                voice_profile=voice_profile,
            )
            return voice_path

        segments = timing_service.generate_audio_segments(lines, _tts_func)
        timing_map = timing_service.build_timing_map(segments)
        merged_path = timing_service.merge_audio(segments, Path("data/renders") / f"{render_id}-timed.wav")
        total_duration_seconds = (timing_map[-1]["end_ms"] / 1000.0) if timing_map else 0.0
        return merged_path, total_duration_seconds or None, timing_map
    except Exception:
        logger.exception("ugc_talking_timing_sync_failed", extra={"render_id": render_id})
        voice_path, voice_duration, _ = pipeline.generate_narration_track(
            render_id=render_id,
            script=cleaned_script,
            language_name=language_name,
            voice_name=voice_name,
            audio_sample_rate_hz=22050,
            speech_rate=speech_rate,
            voice_profile=voice_profile,
        )
        return voice_path, (float(voice_duration or 0.0) or None), None


def _apply_timing_to_ugc_scene(scene: dict[str, Any], timing_map: list[dict[str, Any]] | None) -> dict[str, Any]:
    if not timing_map or str(scene.get("render_lane") or "") != "talking_avatar":
        return scene

    updated = dict(scene)
    first_segment = timing_map[0]
    total_duration_seconds = max(1.0, float((timing_map[-1].get("end_ms") or 0) / 1000.0))
    first_duration_ms = int(first_segment.get("duration_ms") or 0)
    updated["timed_duration_seconds"] = round(total_duration_seconds, 2)
    updated["duration_seconds"] = max(1, int(round(total_duration_seconds)))
    updated["hook_line"] = str(first_segment.get("text") or "").strip()
    updated["hook_duration_ms"] = first_duration_ms
    updated["talking_duration_hint_seconds"] = max(1, int(round(total_duration_seconds)))

    if first_duration_ms < 1500:
        updated["camera_framing"] = "tight close-up with strong face readability and direct eye contact"
        updated["motion_intent"] = "minimal movement with stable mouth readability and a crisp speaking beat"
        updated["timing_visual_rhythm"] = "short_segment_close_up"
    else:
        updated["camera_framing"] = "medium shot with subtle movement and readable direct-to-camera delivery"
        updated["motion_intent"] = "medium shot with subtle movement and smooth conversational pacing"
        updated["timing_visual_rhythm"] = "long_segment_subtle_motion"

    return updated


def _apply_behavior_to_ugc_scene(scene: dict[str, Any], behavior_timeline: list[dict[str, Any]] | None) -> dict[str, Any]:
    if not behavior_timeline or str(scene.get("render_lane") or "") != "talking_avatar":
        return scene

    updated = dict(scene)
    first = behavior_timeline[0]
    emotion = str(first.get("smoothed_emotion") or first.get("emotion") or "neutral")
    head_motion = str(first.get("smoothed_head_motion") or first.get("head_motion") or "micro_tilt")
    updated["behavior_timeline"] = behavior_timeline
    updated["behavior_emotion"] = emotion
    updated["behavior_head_motion"] = head_motion
    updated["behavior_transition_type"] = str(first.get("transition_type") or "steady")
    updated["audio_intensity"] = first.get("audio_intensity")

    if emotion == "excited":
        updated["expression_guidance"] = "slight smile, bright eyes, engaged eyebrows, still realistic and subtle"
    elif emotion == "serious":
        updated["expression_guidance"] = "focused expression, reduced smile, stronger eye focus, subtle seriousness"
    elif emotion == "confident":
        updated["expression_guidance"] = "confident soft smile, steady eye contact, persuasive calm"
    elif emotion == "transition_excited":
        updated["expression_guidance"] = "natural transition from neutral warmth into a slight energized smile, still subtle and realistic"
    elif emotion == "transition_serious":
        updated["expression_guidance"] = "natural transition into a more focused slightly serious expression without abrupt change"
    elif emotion == "transition_confident":
        updated["expression_guidance"] = "natural transition into a calm confident persuasive smile"
    else:
        updated["expression_guidance"] = "neutral warm expression with subtle natural friendliness"

    if head_motion == "slight_nod":
        updated["camera_framing"] = "stable close-up with strong facial readability"
    elif head_motion == "micro_tilt":
        updated["camera_framing"] = "subtle dynamic framing with clear face readability"

    intensity = str(((first.get("audio_intensity") or {}).get("intensity")) or "")
    if intensity == "high":
        updated["motion_intent"] = "slightly more expressive speaking with wider but still realistic mouth movement"
    elif intensity == "low":
        updated["motion_intent"] = "soft subtle speaking motion with controlled mouth movement"

    return updated


def _fallback_timing_map_for_scene(*, script: str, duration_seconds: float | None) -> list[dict[str, Any]] | None:
    cleaned_script = " ".join(str(script or "").split())
    effective_duration_seconds = float(duration_seconds or 0.0)
    if not cleaned_script or effective_duration_seconds <= 0.0:
        return None
    duration_ms = int(max(1.0, effective_duration_seconds * 1000.0))
    return [
        {
            "text": cleaned_script,
            "start_ms": 0,
            "end_ms": duration_ms,
            "duration_ms": duration_ms,
            "pause_after_ms": 0,
        }
    ]


def _derive_avatar_product_behavior_hints(
    *,
    narration_script: str | None,
    duration_seconds: int | float | None,
) -> dict[str, Any]:
    timing_map = _fallback_timing_map_for_scene(
        script=narration_script or "",
        duration_seconds=float(duration_seconds or 0.0),
    )
    behavior_timeline = build_behavior_timeline(timing_map)
    if not behavior_timeline:
        return {
            "creator_energy_hint": "warm conversational creator delivery with subtle smile and calm gestures",
            "visual_mood_hint": "realistic creator recommendation, relaxed and human",
            "behavior_timeline": [],
            "dominant_emotion": "neutral",
        }

    first = behavior_timeline[0]
    emotion = str(first.get("smoothed_emotion") or first.get("emotion") or "neutral")
    energy_hint = {
        "excited": "warm delight with subtle smile and restrained enthusiasm",
        "transition_excited": "natural warm transition into a slight energized smile",
        "serious": "calm focused recommendation with gentle eye contact",
        "transition_serious": "natural transition into focused calm clarity",
        "confident": "confident but relaxed recommendation tone with believable warmth",
        "transition_confident": "natural transition into calm confident recommendation energy",
    }.get(emotion, "warm conversational creator delivery with subtle smile and calm gestures")
    visual_mood_hint = {
        "excited": "friendly creator recommendation with natural positive sentiment",
        "transition_excited": "creator recommendation with gradual positive emotional lift",
        "serious": "trust-focused creator recommendation with grounded realism",
        "transition_serious": "grounded creator recommendation with a focused emotional beat",
        "confident": "trustworthy creator recommendation with calm authority",
        "transition_confident": "creator recommendation that settles into calm confidence",
    }.get(emotion, "realistic creator recommendation, relaxed and human")

    return {
        "creator_energy_hint": energy_hint,
        "visual_mood_hint": visual_mood_hint,
        "behavior_timeline": behavior_timeline,
        "dominant_emotion": emotion,
    }


def _merge_scene_timing_maps(
    scene_audio_tracks: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], int]:
    merged: list[dict[str, Any]] = []
    current_offset_ms = 0
    for track in scene_audio_tracks:
        timing_map = list(track.get("timing_map") or [])
        for item in timing_map:
            merged.append(
                {
                    **item,
                    "scene_id": track.get("scene_id"),
                    "stage_name": track.get("stage_name"),
                    "start_ms": int(item.get("start_ms") or 0) + current_offset_ms,
                    "end_ms": int(item.get("end_ms") or 0) + current_offset_ms,
                }
            )
        current_offset_ms += int(track.get("duration_ms") or 0)
    return merged, current_offset_ms


def _compose_avatar_product_narration_script(enhancer_result: HFQwenEnhancerResult) -> str:
    parts = [
        str(enhancer_result.hook_line or "").strip(),
        str(enhancer_result.showcase_line or "").strip(),
        str(enhancer_result.cta_line or "").strip(),
    ]
    return " ".join(part for part in parts if part).strip()



def _repair_avatar_product_narration_for_category(
    script: str,
    *,
    product_category_hint: str,
    product_name: str = "",
) -> tuple[str, list[str], bool]:
    category = str(product_category_hint or "").strip().lower()
    text = str(script or "")

    if not any(word in category for word in ["clothing", "apparel", "fashion", "kurti", "dress", "top", "shirt", "saree", "lehenga"]):
        return text, [], False

    forbidden_terms = [
        "handmade earrings",
        "handmade earring",
        "earrings",
        "earring",
        "jewellery",
        "jewelry",
        "necklace",
        "pendant",
        "ring",
        "bracelet",
        "crochet",
        "serum",
        "skincare",
        "bottle",
        "gadget",
        "charger",
    ]

    found_terms = [term for term in forbidden_terms if term in text.lower()]

    if not found_terms:
        return text, [], False

    safe_product_name = product_name.strip() or "this product"

    repaired = (
        f"{safe_product_name} is soft, breathable, and perfect for everyday wear. "
        "Style it for office, college, or casual outings. "
        f"Check out {safe_product_name} today."
    )

    return repaired, found_terms, True


def _is_avatar_product_clothing_category(category: str) -> bool:
    normalized = str(category or "").strip().lower()
    return any(word in normalized for word in ["clothing", "apparel", "fashion", "kurti", "dress", "top", "shirt", "saree", "lehenga"])


def _avatar_product_hero_reveal_guidance(product_category_hint: str) -> str:
    if _is_avatar_product_clothing_category(product_category_hint):
        return (
            "TIMED HERO PRODUCT REVEAL:\n"
            "- Between second 1 and second 3, the creator must complete a clear hero reveal of the product.\n"
            "- Start with the garment folded or partly held at chest level, then unfold/open it with both hands toward the camera.\n"
            "- By second 3, the full front side of the garment must be clearly visible: neckline, button placket, sleeves, color, motifs/print, and fabric texture.\n"
            "- After the reveal, hold the product steady and front-facing for at least 2 seconds.\n"
            "- Keep the creator's face visible above or beside the garment; do not let the garment fully cover the face.\n"
            "- Avoid random waving, casual dangling, or hiding the product."
        )

    return (
        "TIMED HERO PRODUCT REVEAL:\n"
        "- The product must be visible from the first frame and remain clearly readable while the creator speaks.\n"
        "- Between second 1 and second 3, the creator must complete one clean hero reveal by lifting, angling, or bringing the product closer to camera.\n"
        "- After the reveal, keep the product steady, front-facing, and unobstructed for at least 2 seconds.\n"
        "- Keep the creator's face visible and unobstructed while the product stays in hand.\n"
        "- Avoid random waving, fast swings, hiding the product, or letting it leave the frame."
    )



def _apply_avatar_product_enhancer_to_scenes(
    *,
    scenes: list[dict[str, Any]],
    enhancer_result: HFQwenEnhancerResult,
) -> list[dict[str, Any]]:
    updated_scenes: list[dict[str, Any]] = []

    for scene in scenes:
        updated = dict(scene)
        stage_name = str(updated.get("stage_name") or "").strip().lower()

        updated["enhancer_voice_tone"] = enhancer_result.voice_tone
        updated["enhancer_notes"] = list(enhancer_result.notes or [])

        if stage_name == "single_shot":
            full_script = _compose_avatar_product_narration_script(enhancer_result)

            updated["spoken_line"] = full_script
            updated["showcase_visual_prompt"] = enhancer_result.showcase_visual_prompt
            updated["visual_objective"] = enhancer_result.showcase_visual_prompt or updated.get("visual_objective")
            updated["topic_focus"] = full_script or updated.get("topic_focus")

            notes = [str(note).strip() for note in enhancer_result.notes if str(note).strip()]
            if notes:
                existing = str(updated.get("anti_repetition_note") or "").strip()
                updated["anti_repetition_note"] = " ".join(
                    part for part in [existing, *notes] if part
                ).strip()

                avoid_guidance = str(updated.get("extra_avoid_guidance") or "").strip()
                updated["extra_avoid_guidance"] = " ".join(
                    part for part in [avoid_guidance, *notes] if part
                ).strip()

        elif stage_name == "hook":
            updated["spoken_line"] = enhancer_result.hook_line
            updated["topic_focus"] = enhancer_result.hook_line or updated.get("topic_focus")

        elif stage_name == "showcase":
            updated["spoken_line"] = enhancer_result.showcase_line
            updated["showcase_visual_prompt"] = enhancer_result.showcase_visual_prompt
            updated["visual_objective"] = enhancer_result.showcase_visual_prompt or updated.get("visual_objective")
            updated["topic_focus"] = enhancer_result.showcase_line or updated.get("topic_focus")

            notes = [str(note).strip() for note in enhancer_result.notes if str(note).strip()]
            if notes:
                existing = str(updated.get("anti_repetition_note") or "").strip()
                updated["anti_repetition_note"] = " ".join(
                    part for part in [existing, *notes] if part
                ).strip()

                avoid_guidance = str(updated.get("extra_avoid_guidance") or "").strip()
                updated["extra_avoid_guidance"] = " ".join(
                    part for part in [avoid_guidance, *notes] if part
                ).strip()

        elif stage_name == "cta":
            updated["spoken_line"] = enhancer_result.cta_line
            updated["topic_focus"] = enhancer_result.cta_line or updated.get("topic_focus")

        updated_scenes.append(updated)

    return updated_scenes


def _avatar_product_enhancer_metadata(
    *,
    enhancer_result: HFQwenEnhancerResult | None,
    enhancer_input: HFQwenEnhancerInput,
    error: str | None = None,
) -> dict[str, Any]:
    metadata: dict[str, Any] = {
        "source": "hf_qwen_enhancer",
        "status": "success" if enhancer_result else "failed",
        "avatar_product_input_summary": {
            "product_name": enhancer_input.product_name,
            "brand_name": enhancer_input.brand_name,
            "product_type": enhancer_input.product_type,
            "product_subcategory": enhancer_input.product_subcategory,
            "campaign_objective": enhancer_input.campaign_objective,
            "platform": enhancer_input.platform,
            "duration_seconds": enhancer_input.duration_seconds,
            "language": enhancer_input.language,
            "target_audience": enhancer_input.target_audience,
            "audience_age_range": enhancer_input.audience_age_range,
            "audience_lifestyle": enhancer_input.audience_lifestyle,
            "main_benefit": enhancer_input.main_benefit,
            "secondary_benefit": enhancer_input.secondary_benefit,
            "key_problem_solved": enhancer_input.key_problem_solved,
            "desired_feeling": enhancer_input.desired_feeling,
            "avatar_style": enhancer_input.avatar_style,
            "brand_tone": enhancer_input.brand_tone,
            "voice_style": enhancer_input.voice_style,
            "cta_preference": enhancer_input.cta_preference,
            "tagline": enhancer_input.tagline,
            "offer_text": enhancer_input.offer_text,
            "brief": enhancer_input.brief,
            "avatar_prompt_template": enhancer_input.avatar_prompt_template,
            "recommended_voice": enhancer_input.recommended_voice,
            "has_product_image": enhancer_input.has_product_image,
            "reference_image_count": enhancer_input.reference_image_count,
            "must_show_elements": list(enhancer_input.must_show_elements or []),
            "must_avoid_elements": list(enhancer_input.must_avoid_elements or []),
            "compliance_notes": enhancer_input.compliance_notes,
            "claims_to_avoid": list(enhancer_input.claims_to_avoid or []),
            "category_specific_details": enhancer_input.category_specific_details,
            "script_mode": enhancer_input.script_mode,
            "provided_script": enhancer_input.provided_script,
            "strict_script_lock": enhancer_input.strict_script_lock,
        },
    }
    if enhancer_result:
        metadata.update(
            {
                "model": enhancer_result.model,
                "provider": enhancer_result.provider,
                "hook_line": enhancer_result.hook_line,
                "showcase_line": enhancer_result.showcase_line,
                "cta_line": enhancer_result.cta_line,
                "showcase_visual_prompt": enhancer_result.showcase_visual_prompt,
                "voice_tone": enhancer_result.voice_tone,
                "notes": list(enhancer_result.notes or []),
            }
        )
    if error:
        metadata["error"] = error
    return metadata


def _build_ugc_scene_plan_metadata(
    *,
    scenes: list[dict[str, Any]],
    requested_voice: str,
    requested_language: str,
    avatar_synced_voice: str | None,
    avatar_synced_language: str | None,
    effective_voice: str,
    effective_language: str,
    avatar_product_brief: AvatarProductBrief | None,
) -> list[dict[str, Any]]:
    return [
        {
            "scene_id": scene.get("scene_id"),
            "stage_name": scene.get("stage_name"),
            "stage_label": scene.get("stage_label"),
            "ugc_ad_family": scene.get("ugc_ad_family"),
            "ugc_ad_subtopic": scene.get("ugc_ad_subtopic"),
            "ugc_mode": scene.get("ugc_mode"),
            "shot_archetype": scene.get("shot_archetype"),
            "subtopic_visual_anchor": scene.get("subtopic_visual_anchor"),
            "qa_flags": scene.get("qa_flags"),
            "scene_type": scene.get("scene_type"),
            "topic_focus": scene.get("topic_focus"),
            "visual_objective": scene.get("visual_objective"),
            "camera_framing": scene.get("camera_framing"),
            "motion_intent": scene.get("motion_intent"),
            "timed_duration_seconds": scene.get("timed_duration_seconds"),
            "hook_duration_ms": scene.get("hook_duration_ms"),
            "timing_visual_rhythm": scene.get("timing_visual_rhythm"),
            "transition_intent": scene.get("transition_intent"),
            "ending_hold_instruction": scene.get("ending_hold_instruction"),
            "sora_negative_guidance": scene.get("sora_negative_guidance"),
            "anti_repetition_note": scene.get("anti_repetition_note"),
            "client_brief_mode": scene.get("client_brief_mode"),
            "business_name": scene.get("business_name"),
            "business_category": scene.get("business_category"),
            "city": scene.get("city"),
            "locality": scene.get("locality"),
            "target_audience": scene.get("target_audience"),
            "key_promise": scene.get("key_promise"),
            "trust_factor": scene.get("trust_factor"),
            "offer": scene.get("offer"),
            "cta": scene.get("cta"),
            "ad_goal": scene.get("ad_goal"),
            "talking_mode": scene.get("talking_mode"),
            "render_lane": scene.get("render_lane"),
            "persona_required": scene.get("persona_required"),
            "use_locked_persona": scene.get("use_locked_persona"),
            "requested_voice": requested_voice,
            "requested_language": requested_language,
            "avatar_synced_voice": avatar_synced_voice,
            "avatar_synced_language": avatar_synced_language,
            "resolved_talking_voice": effective_voice,
            "resolved_talking_language": effective_language,
            "avatar_name": avatar_product_brief.avatar_name if avatar_product_brief else None,
            "product_name": avatar_product_brief.product_name if avatar_product_brief else None,
            "spoken_line": scene.get("spoken_line"),
            "showcase_visual_prompt": scene.get("showcase_visual_prompt"),
            "enhancer_notes": scene.get("enhancer_notes"),
            "enhancer_voice_tone": scene.get("enhancer_voice_tone"),
            "platform": scene.get("platform"),
            "campaign_objective": scene.get("campaign_objective"),
            "brand_tone": scene.get("brand_tone"),
            "category_specific_details": scene.get("category_specific_details"),
            "script_mode": scene.get("script_mode"),
        }
        for scene in scenes
    ]


def _build_ugc_talking_avatar_prompt(
    *,
    scene: dict[str, Any],
    selected_persona: dict[str, Any] | None,
    behavior_timeline: list[dict[str, Any]] | None = None,
) -> str:
    persona_name = str((selected_persona or {}).get("name") or "the selected spokesperson").strip()
    business_name = str(scene.get("business_name") or "").strip()
    business_category = str(scene.get("business_category") or "").strip()
    stage_name = str(scene.get("stage_name") or "talking scene").replace("_", " ").strip()
    topic_focus = str(scene.get("topic_focus") or "").strip()
    cta = str(scene.get("cta") or "").strip()

    context_bits = [bit for bit in [business_name, business_category, topic_focus] if bit]
    context_phrase = ", ".join(context_bits) if context_bits else "local-service UGC ad context"
    closing_phrase = f" with a clean CTA close around {cta}" if cta and stage_name == "cta" else ""
    behavior_line = ""
    if behavior_timeline:
        first = behavior_timeline[0]
        emotion = str(first.get("smoothed_emotion") or first.get("emotion") or "neutral")
        motion = str(first.get("smoothed_head_motion") or first.get("head_motion") or "micro_tilt")
        if emotion == "excited":
            behavior_line = "Use a slightly smiling energetic expression with bright attentive eyes."
        elif emotion == "serious":
            behavior_line = "Use a focused expression with a slightly serious face and stronger eye focus."
        elif emotion == "confident":
            behavior_line = "Use a confident expression with a natural persuasive smile."
        elif emotion == "transition_excited":
            behavior_line = "Use a natural transition from neutral warmth into a slight bright smile."
        elif emotion == "transition_serious":
            behavior_line = "Use a natural transition into a more focused slightly serious expression."
        elif emotion == "transition_confident":
            behavior_line = "Use a natural transition into a calm confident persuasive smile."
        else:
            behavior_line = "Use a calm neutral expression with subtle warmth."

        behavior_line += " " + {
            "slight_nod": "Keep head movement to a subtle slight nod.",
            "micro_tilt": "Use a restrained micro head tilt.",
            "slow_shift": "Use a very slow natural head shift.",
        }.get(motion, "Keep head movement subtle and natural.")
        intensity = str(((first.get("audio_intensity") or {}).get("intensity")) or "medium")
        behavior_line += " " + {
            "high": "Use more expressive speaking with slightly wider mouth movement.",
            "low": "Use softer subtle speaking motion.",
            "medium": "Keep the speaking motion balanced and conversational.",
        }.get(intensity, "Keep the speaking motion balanced and conversational.")
    scene_context = (
        f"{persona_name} speaking directly to camera for a {context_phrase}. "
        f"Creator-style vertical talking-head shot for the {stage_name} beat{closing_phrase}. "
        f"Keep natural lip sync, stable identity, minimal body movement, and a clean ending hold. {behavior_line}".strip()
    )
    return build_avatar_master_prompt(
        gender=(selected_persona or {}).get("gender"),
        custom_prompt=(selected_persona or {}).get("default_behavior_prompt"),
        negative_prompt=(selected_persona or {}).get("negative_prompt"),
        context_line=scene_context,
    )


def _normalize_topic(topic: str) -> str:
    cleaned = ' '.join(str(topic or '').strip().split())
    if not cleaned:
        return 'this topic'
    return cleaned


def _build_explainer_beats(topic: str, *, scene_count: int) -> list[str]:
    topic = _normalize_topic(topic)
    if scene_count >= 6:
        return [
            f'Hook viewers with a relatable curiosity moment about "{topic}".',
            f'Introduce what "{topic}" is with a simple overview that orients the viewer.',
            f'Show the mechanism behind "{topic}" in a concrete step-by-step way.',
            f'Use a real-life example to make "{topic}" easy to picture.',
            f'Show the implication of "{topic}" and why it matters in the real world.',
            f'Close with a clear takeaway that makes "{topic}" feel memorable and understandable.',
        ]
    return [
        (
            f'Hook shot about "{topic}". Open with a scroll-stopping introduction and immediate curiosity.'
        ),
        (
            f'Immediate consequence of "{topic}". Show the first major cause-and-effect shift clearly and concretely.'
        ),
        (
            f'Wider world-level or human-level impact of "{topic}". Make the consequences feel serious, real, and understandable.'
        ),
        (
            f'Final takeaway about "{topic}". End with a memorable conclusion that feels insightful and complete.'
        ),
    ]


def _resolve_deep_explainer_style(recipe, inputs: dict[str, Any]) -> str:
    default_style = str(recipe.metadata.get("default_explainer_style") or "educational").strip()
    supported_styles = {
        str(item).strip()
        for item in (recipe.metadata.get("supported_explainer_styles") or ())
        if str(item).strip()
    }
    requested_style = str(inputs.get("explainerStyle") or "").strip()
    if requested_style and requested_style in supported_styles:
        return requested_style
    return default_style


def _resolve_ugc_ad_style(recipe, inputs: dict[str, Any]) -> str:
    default_style = str(recipe.metadata.get("default_ugc_style") or "creator_casual").strip()
    supported_styles = {
        str(item).strip()
        for item in (recipe.metadata.get("supported_ugc_styles") or ())
        if str(item).strip()
    }
    requested_style = str(inputs.get("ugcStyle") or inputs.get("adStyle") or "").strip()
    if requested_style and requested_style in supported_styles:
        return requested_style
    return default_style


def clean_ugc_script(script_text: str) -> str:
    cleaned = str(script_text or "").strip()
    if not cleaned:
        return ""

    cleaned = re.sub(r"^\s*(hook|problem|solution|cta)\s*:\s*", "", cleaned, flags=re.IGNORECASE | re.MULTILINE)
    cleaned = re.sub(r"^\s*[-*•]+\s*", "", cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r"\b(scene\s*\d+|narrator|voiceover)\s*:\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def generate_ugc_raw_script(topic: str, ugc_style: str) -> str:
    qwen = QwenService(get_settings())
    return str(
        qwen.complete_text(
            task_type="ugc_raw_script",
            system_prompt="""
You are a high-converting Instagram UGC creator.

STRICT RULES:
- Output ONLY spoken script
- No scene breakdown
- No labels
- No narrator
- No camera directions
- No bullet points
- No formatting

STYLE:
- Human
- Conversational
- Slightly emotional
- Fast-paced

STRUCTURE:
Hook
Problem
Solution
CTA

Write like a real person speaking to camera.
""",
            user_prompt=f"""
Topic: {topic}
Style: {ugc_style}
""",
            temperature=0.7,
        )
        or ""
    ).strip()



def _fallback_avatar_product_script(
    *,
    product_name: str,
    product_category_hint: str,
    main_benefit: str | None = None,
    cta: str | None = None,
    language: str | None = None,
) -> str:
    safe_product_name = str(product_name or "").strip() or "this product"
    category = str(product_category_hint or "").strip().lower()
    benefit = str(main_benefit or "").strip()
    cta_text = str(cta or "").strip() or f"Check out {safe_product_name} today"
    language_normalized = str(language or "").strip().lower()

    if "hi" in language_normalized or "hindi" in language_normalized:
        if any(word in category for word in ["toy", "kids", "children", "baby"]):
            return f"{safe_product_name} बच्चों के लिए क्यूट और मज़ेदार है। {cta_text}।"
        if any(word in category for word in ["shoe", "sneaker", "footwear"]):
            return f"{safe_product_name} स्टाइलिश और कम्फर्टेबल है। {cta_text}।"
        if any(word in category for word in ["clothing", "kurti", "fashion", "apparel"]):
            return f"{safe_product_name} सॉफ्ट, स्टाइलिश और डेली वियर के लिए परफेक्ट है। {cta_text}।"
        return f"{safe_product_name} आपके लिए एक स्मार्ट और उपयोगी पसंद है। {cta_text}।"

    if any(word in category for word in ["toy", "kids", "children", "baby"]):
        return f"{safe_product_name} is cute, fun, and perfect for little kids. {cta_text}."
    if any(word in category for word in ["shoe", "sneaker", "footwear"]):
        return f"{safe_product_name} is stylish, comfortable, and easy for daily wear. {cta_text}."
    if any(word in category for word in ["clothing", "kurti", "fashion", "apparel"]):
        return f"{safe_product_name} is soft, stylish, and perfect for everyday wear. {cta_text}."

    if benefit:
        return f"{safe_product_name} is designed for {benefit}. {cta_text}."

    return f"{safe_product_name} is simple, useful, and worth checking out. {cta_text}."


def _extract_ugc_talking_excerpt(narration_script: str, *, max_sentences: int = 2, max_chars: int = 220) -> str:
    normalized_script = " ".join(str(narration_script or "").split())
    if not normalized_script:
        return ""

    sentences = [segment.strip() for segment in re.split(r"(?<=[.!?])\s+", normalized_script) if segment.strip()]
    excerpt = " ".join(sentences[:max_sentences]).strip() if sentences else normalized_script
    if len(excerpt) <= max_chars:
        return excerpt

    trimmed = excerpt[: max_chars - 1].rsplit(" ", 1)[0].strip()
    return (trimmed or excerpt[: max_chars - 1].strip()) + "…"


def _normalize_text_lines(value: Any, *, target_count: int) -> list[str]:
    items = [str(item or "").strip() for item in (value or []) if str(item or "").strip()]
    if not items:
        return []
    if len(items) >= target_count:
        return items[:target_count]
    padded = list(items)
    while len(padded) < target_count:
        padded.append(padded[-1])
    return padded


def _build_explainer_overlay_text(topic: str, scene_beats: list[str], *, scene_count: int) -> list[str]:
    normalized_topic = _normalize_topic(topic)
    defaults = (
        [
            f"{normalized_topic}",
            "What it is",
            "How it works",
            "Real example",
            "Why it matters",
            "Key takeaway",
        ]
        if scene_count >= 6
        else [
            f"What if {normalized_topic}?",
            "What it is",
            "How it works",
            "Why it matters",
        ]
    )
    source = scene_beats or defaults
    return [str(item).replace('"', '').strip()[:72] for item in source[: max(1, min(scene_count, 6))]]


def _split_narration_into_scene_context(narration_script: str, *, scene_count: int) -> list[str]:
    normalized_script = " ".join(str(narration_script or "").split())
    if not normalized_script:
        return []

    sentences = [segment.strip() for segment in re.split(r"(?<=[.!?])\s+", normalized_script) if segment.strip()]
    if not sentences:
        return [normalized_script] * scene_count

    if len(sentences) >= scene_count:
        chunk_size = max(1, len(sentences) // scene_count)
        chunks: list[str] = []
        index = 0
        for scene_index in range(scene_count):
            remaining_scenes = scene_count - scene_index
            remaining_sentences = len(sentences) - index
            take = max(1, remaining_sentences // remaining_scenes)
            chunk = " ".join(sentences[index:index + take]).strip()
            if chunk:
                chunks.append(chunk)
            index += take
        return _normalize_text_lines(chunks, target_count=scene_count)

    return _normalize_text_lines(sentences, target_count=scene_count)


def _fallback_explainer_narration(topic: str, *, scene_count: int) -> ExplainerNarrationPlan:
    normalized_topic = _normalize_topic(topic)
    if scene_count >= 6:
        narration_script = (
            f"Let's understand {normalized_topic} in a simple way. "
            'First, focus on the main job it does and why it matters every second. '
            'Then look at how its different parts work together, almost like a team passing messages. '
            'A relatable example helps show how those signals guide memory, movement, and decisions. '
            f'That is why {normalized_topic} affects so much more than most people realize.'
        )
    else:
        narration_script = (
            f'What would happen if {normalized_topic}? Even a few seconds could trigger much bigger consequences than most people expect. '
            'The first shock would appear almost instantly, then the effects would spread through people, systems, and the wider world. '
            f"That is why {normalized_topic} would matter far beyond the first moment."
        )
    scene_beats = _normalize_text_lines(_build_explainer_beats(normalized_topic, scene_count=scene_count), target_count=scene_count)
    overlay_text = _build_explainer_overlay_text(normalized_topic, scene_beats, scene_count=scene_count)
    return ExplainerNarrationPlan(
        narration_script=narration_script,
        scene_beats=scene_beats,
        overlay_text=overlay_text,
        source_type="fallback_template",
    )


def build_explainer_narration_script(
    topic: str,
    *,
    scene_count: int,
    duration_seconds: int,
    recipe_id: str,
    explainer_style: str,
) -> ExplainerNarrationPlan:
    normalized_topic = _normalize_topic(topic)
    try:
        qwen = QwenService(get_settings())
        result = qwen.complete_structured(
            task_type="explainer_narration",
            schema_model=ScriptPlan,
            system_prompt=(
                "You write short social explainer narration. "
                "Return structured output only. "
                "narration_script must be one smooth spoken explainer script for the requested duration. "
                "scene_items must be concise visual guidance, not spoken narration. "
                "overlay_text must be short on-screen emphasis phrases, not full spoken lines."
            ),
            user_prompt=(
                f"Topic: {normalized_topic}\n"
                f"Target duration: {duration_seconds} seconds\n"
                f"Scene count: {scene_count}\n"
                f"Recipe id: {recipe_id}\n"
                f"Explainer style: {explainer_style}\n"
                "Requirements:\n"
                "- Make the narration simple, spoken, natural, and educational.\n"
                "- Avoid hook labels, bullet formatting, cue labels, or planning text.\n"
                "- Do not write 'Opening shot', 'Scene 1', or anything UI-like.\n"
                "- Keep scene items visual and explanatory.\n"
                "- Keep overlay_text short enough for on-screen emphasis.\n"
                "- If this is a deep explainer, structure the explanation as: hook, concept introduction, mechanism, concrete example, implication, closing takeaway.\n"
                "- Each scene item should have a distinct educational role and visual objective.\n"
            ),
            temperature=0.45,
        )
        narration_script = str(result.narration_script or "").strip()
        scene_beats = _normalize_text_lines(
            [item.visual_goal or item.title or item.narration or "" for item in result.scene_items],
            target_count=scene_count,
        )
        overlay_text = _normalize_text_lines(result.overlay_text, target_count=min(scene_count, 6))
        if narration_script and scene_beats:
            return ExplainerNarrationPlan(
                narration_script=narration_script,
                scene_beats=scene_beats,
                overlay_text=overlay_text or _build_explainer_overlay_text(normalized_topic, scene_beats, scene_count=scene_count),
                source_type=f"{qwen.provider_name()}_explainer_script",
            )
    except Exception:
        logger.exception("explainer_narration_generation_failed", extra={"topic": normalized_topic})

    return _fallback_explainer_narration(normalized_topic, scene_count=scene_count)


def _join_nonempty_text(parts: list[str]) -> str:
    values = [str(part or "").strip() for part in parts if str(part or "").strip()]
    return " ".join(values).strip()



def _avatar_product_category_hint(normalized_inputs: dict[str, Any], avatar_product_brief: AvatarProductBrief | None) -> str:
    category = str(
        normalized_inputs.get("product_category")
        or normalized_inputs.get("productCategory")
        or (avatar_product_brief.product_category if avatar_product_brief else "")
        or ""
    ).strip().lower()

    subcategory = str(
        normalized_inputs.get("product_subcategory")
        or normalized_inputs.get("productSubcategory")
        or (avatar_product_brief.product_subcategory if avatar_product_brief else "")
        or ""
    ).strip().lower()

    product_name = str(
        normalized_inputs.get("product_name")
        or normalized_inputs.get("productName")
        or (avatar_product_brief.product_name if avatar_product_brief else "")
        or ""
    ).strip().lower()

    combined = " ".join(part for part in [category, subcategory, product_name] if part).strip()

    if any(term in combined for term in ["cloth", "clothing", "fashion", "apparel", "kurti", "dress", "top", "shirt", "saree", "lehenga"]):
        return "clothing women kurti" if "kurti" in combined else "clothing apparel"

    if any(term in combined for term in ["earring", "earrings"]):
        return "jewellery earrings"

    if any(term in combined for term in ["necklace", "pendant"]):
        return "jewellery pendant necklace"

    if any(term in combined for term in ["jewel", "jewellery", "jewelry", "ring", "bracelet", "bangle"]):
        return "jewellery"

    if any(term in combined for term in ["skin", "skincare", "beauty", "serum", "cream", "cosmetic", "makeup"]):
        return "beauty skincare"

    if any(term in combined for term in ["food", "beverage", "drink", "snack", "juice", "coffee", "tea"]):
        return "food beverage"

    if any(term in combined for term in ["electronic", "gadget", "charger", "phone", "power bank", "earbuds", "speaker"]):
        return "electronics gadget"

    return combined or "general product"


def _build_avatar_product_category_preservation_rules(*, product_category_hint: str) -> str:
    category = str(product_category_hint or "").strip().lower()

    if any(word in category for word in ["clothing", "apparel", "fashion", "kurti", "dress", "top", "shirt", "saree", "lehenga"]):
        return (
            "STRICT PRODUCT CATEGORY LOCK: Product is clothing/apparel only. "
            "If the subcategory says kurti, describe it only as a kurti or clothing item. "
            "Preserve the clothing silhouette, fabric texture, color, neckline, sleeve style, button details, print/motifs, and daily-wear styling from Image 2. "
            "The script and visual prompt must talk about fabric, comfort, fit, styling, daily wear, office, college, casual outings, neckline, sleeves, and clothing details only. "
            "Hero reveal timing: the kurti must be opened/unfolded clearly between second 1 and second 3. "
            "By second 3, show the full front side of the kurti with neckline, button placket, sleeves, motifs, and fabric texture clearly visible. "
            "After reveal, hold the kurti steady and front-facing for at least 2 seconds. "
            "Keep the creator's face visible above or beside the garment; do not cover the full face with the kurti. "
            "Do not mention earrings..."
        )

    if any(word in category for word in ["skincare", "beauty", "cosmetic", "serum", "cream", "lotion", "bottle", "packaging"]):
        return "Preserve bottle/tube/jar shape, cap, color, packaging, material, front orientation, and label area from Image 2. Do not mirror, rotate, redesign, rewrite label, or invent fake text."

    if any(word in category for word in ["earring", "earrings"]):
        return (
            "Product is earrings only. Preserve the exact earring shape, pair structure, blue stone color, metal color, shine, size, and drop design from Image 2. "
            "Show the earrings held between fingers near the face or near the ear area as a jewellery showcase. "
            "Do not turn earrings into a pendant, necklace, ring, bracelet, watch, serum bottle, skincare product, or packaging. "
            "Do not show a serum bottle or unrelated product in hand."
        )

    if any(word in category for word in ["ring", "rings"]):
        return (
            "Product is a ring only. Preserve the exact ring shape, stone, metal color, size, shine, and design from Image 2. "
            "Show the ring held between fingers close to the camera as a jewellery showcase. "
            "Do not turn the ring into earrings, necklace, pendant, bracelet, watch, bottle, or skincare product."
        )

    if any(word in category for word in ["necklace", "pendant"]):
        return (
            "Product is a COMPLETE necklace with a pendant. Preserve the exact full necklace structure from Image 2: "
            "the visible gold chain, the centered blue teardrop pendant, the gold border, and the small white stones. "
            "CRITICAL: The gold chain MUST remain visible and connected to the pendant at all times. "
            "Show the necklace carefully presented with both hands close to the camera, creating a 'U' shape with the chain. "
            "The pendant must be centered and facing the camera directly. "
            "DO NOT turn it into earrings, ring, bracelet, or a serum bottle. "
            "DO NOT show the necklace worn on the neck. "
            "DO NOT let the pendant casually dangle from one hand."
        )

    if any(word in category for word in ["bracelet", "bangle"]):
        return (
            "Product is a bracelet or bangle only. Preserve the exact bracelet shape, metal color, stones, size, shine, and design from Image 2. "
            "Show it held near the wrist or close to the camera as a jewellery showcase. "
            "Do not turn it into earrings, necklace, pendant, ring, watch, bottle, or skincare product."
        )

    if any(word in category for word in ["jewellery", "jewelry", "earring", "earrings", "necklace", "ring", "bracelet", "pendant"]):
        return "Preserve jewellery type, metal color, stones, shape, size, shine, and design from Image 2. The jewellery must be ONLY in the creator's hand near the camera. The creator must NOT wear jewellery on ears, neck, wrist, or fingers. No earrings worn, no necklace worn, no pendant worn, no jewellery on body. Do not add matching earrings, necklace, pendant, ring, chain, pearls, or extra jewellery."

    if any(word in category for word in ["shoe", "shoes", "sneaker", "sneakers", "sandal", "sandals", "footwear"]):
        return """
            Preserve the exact shoe shape, sole, color, material, laces/strap pattern, logo area, and pair structure from Image 2.
            Do not make the avatar wear the shoes.
            Show the shoes held in hand or presented beside the avatar.
            Do not change the shoe into a different style, color, or footwear type.
            """.strip()

    if any(word in category for word in ["toy", "toys", "kids", "children", "baby"]):
        return """
            Preserve the toy shape, colors, character features, material, size, and playful design from Image 2.
            Show the toy safely held or presented near the camera.
            Do not add children, babies, extra people, or unsafe interactions.
            Do not transform the toy into a different character or object.
            """.strip()

    if any(word in category for word in ["kurti", "saree", "sari", "dress", "clothing", "apparel", "fashion", "fabric"]):
        return """
            Preserve the fabric color, print, embroidery, border, texture, pattern, and garment type from Image 2.
            Do not make the avatar wear the garment in this single-shot ad.
            Show the clothing/fabric neatly held or presented in hand.
            Do not change a saree into a kurti, dress, dupatta, or another garment type.
            """.strip()

    if any(word in category for word in ["handmade", "handcrafted", "crochet", "decor", "home", "craft", "handicraft"]):
        return """
            Preserve the handmade shape, thread/fabric texture, color pattern, beads, tassels, stitching, and craft details from Image 2.
            Show the handcrafted item held near the camera or gently presented in hand.
            Do not place it on a pouch, card, bag, box, or unrelated accessory unless it exists in Image 2.
            Do not transform it into a different decor item.
            """.strip()

    return "Preserve the exact product shape, color, material, size, texture, and visible design details from Image 2."


def _pick_avatar_product_ugc_variant(*, video_id: str, product_category_hint: str) -> dict[str, str]:
    category = str(product_category_hint or "").strip().lower()

    if any(word in category for word in ["skincare", "beauty", "cosmetic", "serum", "cream", "lotion", "bottle", "packaging"]):
        variants = [
            {
                "setting": "clean dressing table or skincare vanity corner with soft daylight",
                "wardrobe": "soft pastel cream or peach casual top, clean skincare creator look, no loud patterns",
                "camera": "medium close-up selfie framing, product held beside face",
                "movement": "gentle product lift once toward camera, small smile, steady grip",
            },
            {
                "setting": "bright bathroom vanity corner with neutral clean background",
                "wardrobe": "simple light pink or off-white casual top, fresh minimal styling",
                "camera": "chest-up vertical phone-shot framing, product centered near camera",
                "movement": "subtle product tilt, calm head nod, minimal hand movement",
            },
            {
                "setting": "window-side bedroom corner with soft natural light",
                "wardrobe": "soft beige or cream top, natural everyday creator styling",
                "camera": "close creator framing, product held at lower center then raised near face",
                "movement": "natural talking expression, one slow product showcase movement",
            },
        ]


    elif any(word in category for word in ["jewellery", "jewelry", "necklace", "pendant"]):
        variants = [
            {
                "setting": "premium indoor vanity or soft luxury dressing corner with warm neutral light",
                "wardrobe": "plain elegant cream, beige, or black top; no extra jewellery or distracting accessories",
                "camera": "tight vertical creator framing, both hands presenting the full necklace close to the camera",
                "movement": "careful two-handed jewellery presentation, chain held neatly to create a 'U' shape, pendant centered, premium showcase feel",
            },
            {
                "setting": "minimal luxury setup with soft window daylight and neutral background",
                "wardrobe": "simple black or champagne elegant top, clean premium styling, no jewellery worn",
                "camera": "close-up vertical framing focusing on the hands and the necklace",
                "movement": "hands holding both ends of the chain, presenting the centered pendant toward the camera, steady and elegant",
            }
        ]



    elif any(word in category for word in ["shoe", "shoes", "sneaker", "sneakers", "sandal", "sandals", "footwear"]):
        variants = [
            {
                "setting": "clean living room or entryway corner with daylight",
                "wardrobe": "casual white, denim, or neutral outfit, simple everyday styling",
                "camera": "chest-up vertical framing, shoes held beside the avatar",
                "movement": "gentle product lift, small smile, stable hand position",
            },
            {
                "setting": "minimal home hallway or wardrobe corner",
                "wardrobe": "simple casual neutral top, no loud prints, clean lifestyle look",
                "camera": "medium shot with product clearly centered",
                "movement": "slow shoe tilt once to show shape, no walking or wearing",
            },
        ]

    elif any(word in category for word in ["toy", "toys", "kids", "children", "baby"]):
        variants = [
            {
                "setting": "bright clean playroom-style shelf background",
                "wardrobe": "soft pastel friendly casual top, warm approachable styling",
                "camera": "medium close-up creator framing, toy held near camera",
                "movement": "small playful product gesture, warm smile, stable hands",
            },
            {
                "setting": "cozy family room corner with colorful but clean background",
                "wardrobe": "simple cheerful casual outfit, soft colors, no distracting patterns",
                "camera": "vertical phone-shot framing, toy centered and clearly visible",
                "movement": "gentle toy lift, no children or extra people",
            },
        ]


    elif any(word in category for word in ["kurti", "saree", "sari", "dress", "clothing", "apparel", "fashion", "fabric"]):
        variants = [
            {
                "setting": "clean wardrobe or dressing area with soft daylight",
                "wardrobe": "plain neutral simple outfit that does not compete with the clothing product",
                "camera": "medium vertical creator framing, creator face visible above or beside the garment",
                "movement": (
                    "start with the folded kurti visible at chest level, then between second 1 and second 3 "
                    "unfold and raise it with both hands into a clear front-facing hero reveal; keep neckline, button placket, sleeves, motifs, and fabric visible; "
                    "do not cover the creator's full face"
                ),
            },
            {
                "setting": "simple bedroom or wardrobe corner with neutral wall and warm light",
                "wardrobe": "simple solid cream, beige, or black top, minimal styling",
                "camera": "chest-up phone-shot framing, full front of garment visible during reveal",
                "movement": (
                    "within the first 1 to 3 seconds, open the kurti fully toward the camera as the hero product reveal; "
                    "hold it steady after reveal with both hands, face still partially visible, product centered and readable"
                ),
            },
        ]


    elif any(word in category for word in ["handmade", "handcrafted", "crochet", "decor", "home", "craft", "handicraft"]):
        variants = [
            {
                "setting": "cozy home decor shelf corner with soft daylight",
                "wardrobe": "earthy beige, rust, olive, or cream casual top, cozy handmade creator style",
                "camera": "medium close-up creator framing, handmade item held near camera",
                "movement": "slow product tilt, relaxed smile, stable hand grip",
            },
            {
                "setting": "warm living room corner with simple Indian home decor",
                "wardrobe": "warm neutral casual top, simple natural styling, no loud patterns",
                "camera": "vertical phone-shot framing, product centered beside face",
                "movement": "gentle product lift once, small pointing gesture",
            },
            {
                "setting": "minimal desk or craft table setup with warm lamp light",
                "wardrobe": "plain cream or earthy casual outfit, handmade creator look",
                "camera": "close creator framing, handmade texture clearly visible",
                "movement": "steady product presentation, no fast movement",
            },
        ]

    else:
        variants = [
            {
                "setting": "bright living room corner with neutral background",
                "wardrobe": "simple neutral casual top, clean creator styling",
                "camera": "chest-up handheld creator framing, product centered near camera",
                "movement": "gentle hand gesture, product tilt once to catch light",
            },
            {
                "setting": "minimal home desk setup with warm lamp lighting",
                "wardrobe": "plain cream, beige, or soft pastel top, no distracting patterns",
                "camera": "close creator framing, product held at lower center then raised near face",
                "movement": "natural talking expression, subtle product showcase movement",
            },
            {
                "setting": "simple Indian home balcony or window-side corner with daylight",
                "wardrobe": "simple everyday neutral outfit, authentic creator look",
                "camera": "stable vertical mobile shot, creator and product both visible",
                "movement": "product held steady, small pointing gesture, natural blink and smile",
            },
        ]

    seed_text = f"{video_id}:{category}"
    index = int(hashlib.sha256(seed_text.encode("utf-8")).hexdigest(), 16) % len(variants)
    return variants[index]

def _trim_kling_prompt(prompt: str, *, max_chars: int = 2400) -> str:
    cleaned = re.sub(r"\s+", " ", str(prompt or "")).strip()
    if len(cleaned) <= max_chars:
        return cleaned
    return cleaned[:max_chars].rsplit(" ", 1)[0].strip()




def _build_avatar_product_single_shot_kling_prompt(
    *,
    avatar_name: str,
    product_name: str,
    product_category_hint: str,
    narration_script: str | None,
    video_id: str,
) -> tuple[str, dict[str, str], str]:
    category_preservation_rules = _build_avatar_product_category_preservation_rules(
        product_category_hint=product_category_hint,
    )
    ugc_variant = _pick_avatar_product_ugc_variant(
        video_id=video_id,
        product_category_hint=product_category_hint,
    )

    hero_reveal_guidance = _avatar_product_hero_reveal_guidance(product_category_hint)

    prompt = f"""
        Image 1 is ONLY the creator identity reference for {avatar_name}. Use it for face, identity, hairstyle, age, skin tone, and expression only. Ignore any product, bottle, jewellery, accessory, or object visible in Image 1.

        Image 2 is the ONLY product reference. Use Image 2 as the exact product being promoted. {category_preservation_rules}

        The product must be visible from the first frame/first second and stay clearly visible with the creator throughout the video.

        {hero_reveal_guidance}

        The product must remain only in the creator's hand. Do not show the creator wearing the product or wearing any matching version of the product. Keep it as a handheld showcase item only.

        Balance and framing:
        Keep equal attention on the creator face and the product in the same frame.
        The creator face should stay readable while the product stays clearly visible near face or chest level.
        Do not let the product dominate the entire frame for too long, and do not let the face dominate while the product becomes tiny or blurry.
        In the final second, hold both face and product steady in the same composition for a clean resolved ending.

        Scene variation:
        Setting: {ugc_variant["setting"]}.
        Wardrobe: {ugc_variant["wardrobe"]}.
        Camera: {ugc_variant["camera"]}.
        Movement: {ugc_variant["movement"]}.

        Style: Indian creator-style UGC, realistic indoor creator setup, soft natural lighting, stable handheld phone-shot feel, natural skin texture, no glossy TV commercial look, no scene cuts, no b-roll, no extra characters. Same creator identity and hairstyle must remain unchanged; only outfit color/style and room setup may vary to match the product category.

        Performance intent:
        The creator appears to be speaking naturally to camera while presenting the product.
        Keep mouth movement subtle, face stable, and expression realistic for later lip-sync.
        Do not add captions, subtitles, or on-screen text.
        Script meaning: {_extract_ugc_talking_excerpt(str(narration_script or ""), max_sentences=2, max_chars=180)}

        Avoid: identity drift, face mutation, extra people, extra fingers, warped hands, distorted grip, blurry product, product changing into another object, serum bottle, skincare bottle, cosmetic tube, unrelated packaging, wrong jewellery type, fake unreadable text, mirror flip, plastic skin, exaggerated AI glow.
        """.strip()

    return _trim_kling_prompt(prompt), ugc_variant, category_preservation_rules


def _build_avatar_product_seedance_lite_prompt(
    *,
    base_prompt: str,
    product_category_hint: str,
    narration_script: str | None,
) -> str:
    category = str(product_category_hint or "").strip().lower()
    script_preview = " ".join(str(narration_script or "").split())[:260]

    reference_rules = (
        "Use Reference Image 1 only as the creator/avatar identity reference. "
        "Use Reference Image 2 only as the exact product reference. "
        "Do not merge the product into the creator identity. "
        "Do not change the product category, color, shape, design, or visible details. "
    )

    speaking_motion = (
        "The creator looks directly into the lens as if speaking naturally to camera while presenting the product. "
        "Keep the face frontal, stable, and clearly visible for later lip-sync. "
        "Use only very subtle mouth movement, natural blinking, a soft smile, and minimal head movement. "
        "Do not exaggerate mouth shapes, do not turn the face sideways, and do not let hands or product cover the mouth. "
        "Maintain a clean chest-up or medium close-up framing where the lips, jawline, and face remain easy to track. "
        "Keep both the creator face and the product visible together for most of the shot, with a stable final one-second hold."
    )

    if any(word in category for word in ["sneaker", "shoe", "shoes", "footwear", "sandal"]):
        product_motion = (
            "The product is footwear. The creator holds the pair of shoes with both hands near chest level. "
            "The shoes are held steadily in the foreground, facing the camera. "
            "The product must remain visible from the first second. "
            "Do not show the creator wearing the shoes. "
            "Do not turn the shoes into heels, sandals, boots, bags, jewellery, clothing, bottles, or any other product. "
        )
    elif any(word in category for word in ["kurti", "clothing", "apparel", "fashion", "dress", "saree", "fabric"]):
        product_motion = (
            "The product is clothing. The creator holds the garment with both hands and presents it clearly. "
            "Between second 1 and second 3, she opens or raises the garment for a hero reveal. "
            "Keep her face visible above or beside the garment. "
            "Do not turn the clothing product into jewellery, skincare, shoes, bag, or bottle. "
        )
    elif any(word in category for word in ["jewellery", "jewelry", "earring", "necklace", "pendant", "ring", "bracelet"]):
        product_motion = (
            "The product is jewellery. The creator holds it steadily at chest level, clearly below the chin. "
            "She brings it slightly closer to camera for a reveal but never raises it above chin level — "
            "the face and mouth must stay fully visible above the product at all times. "
            "Do not add extra jewellery on the body. Do not transform the jewellery into skincare, shoes, clothing, or a bottle. "
        )
    elif any(word in category for word in ["skincare", "beauty", "serum", "cream", "cosmetic", "bottle"]):
        product_motion = (
            "The product is a beauty or skincare item. The creator holds the bottle/tube/jar at chest level beside or below her face. "
            "Keep the product below chin level so the face remains fully visible. "
            "Do not transform it into jewellery, clothing, shoes, or a gadget. "
        )
    else:
        product_motion = (
            "The creator holds the product steadily at chest level and presents it clearly to the camera. "
            "Keep the product below chin level at all times — never raise it toward the face or eyes. "
            "The product remains visible from the first second and stays visible while she speaks. "
            "Between second 1 and second 3, she tilts or brings the product slightly closer to camera for a clean hero reveal, then holds it steady. "
            "After the reveal, keep the face and product equally readable in the same frame and avoid pushing into an extreme product-only close-up. "
        )

    script_context = (
        f"The visual performance should match this short spoken ad script, but do not add captions or text overlays: {script_preview}. "
        if script_preview
        else ""
    )

    return _trim_kling_prompt(
        (
            f"{base_prompt}\n\n"
            f"{reference_rules}\n"
            f"{speaking_motion}\n"
            f"{product_motion}\n"
            f"{script_context}\n"
            "Soft natural indoor lighting, realistic skin textures, stable handheld framing, premium casual UGC ad style, "
            "720p, 9:16 vertical composition, no captions, no subtitles, no text overlays, no random logos."
        ),
        max_chars=2600,
    )


def _build_long_explainer_sora_fallback_plan(
    *,
    scene_beats: list[str],
    scene_narration_context: list[str],
) -> tuple[list[dict[str, Any]], list[str], list[str], int]:
    grouped = (
        ("scene_1_hook_core", ("hook", "core_idea"), (0, 1)),
        ("scene_2_mechanism_example", ("mechanism", "example"), (2, 3)),
        ("scene_3_impact", ("impact",), (4,)),
        ("scene_4_takeaway", ("takeaway", "ending"), (5,)),
    )
    scenes: list[dict[str, Any]] = []
    merged_beats: list[str] = []
    merged_contexts: list[str] = []

    for scene_id, beat_names, indexes in grouped:
        scenes.append(
            {
                "scene_id": scene_id,
                "beat_names": list(beat_names),
                "duration_seconds": 8,
            }
        )
        merged_beats.append(_join_nonempty_text([scene_beats[index] for index in indexes if index < len(scene_beats)]))
        merged_contexts.append(
            _join_nonempty_text([scene_narration_context[index] for index in indexes if index < len(scene_narration_context)])
        )

    return scenes, merged_beats, merged_contexts, sum(int(scene["duration_seconds"]) for scene in scenes)



def _smart_model_router(
    *,
    scene: dict[str, Any],
    recipe_id: str,
    quality_profile: str,
    is_chitrakala: bool,
) -> str:

    stage = str(scene.get("stage_name") or "").lower()
    render_lane = str(scene.get("render_lane") or "").lower()

    # ---------------------------------------
    # 🚨 CHITRAKALA → ALWAYS CONSISTENT
    # ---------------------------------------
    if is_chitrakala:
        if render_lane == "talking_avatar":
            return "kling_o3_reference"
        return "fal_ltx23_i2v"

    # ---------------------------------------
    # 🎯 AVATAR PRODUCT (MAIN MONEY FLOW)
    # ---------------------------------------
    if recipe_id == "avatar_product":

        if quality_profile == "premium":
            if render_lane == "talking_avatar":
                return "kling_o3_reference"   # 🔥 identity lock
            return "kling_v16_pro_elements"   # 💰 showcase cheaper

        if quality_profile == "high":
            return "kling_v16_pro_elements"

        return "fal_ltx23_i2v"

    # ---------------------------------------
    # 🎬 UGC ADS
    # ---------------------------------------
    if recipe_id in UGC_AD_RECIPE_IDS:
        if render_lane == "talking_avatar":
            return "kling_o3_reference"
        return "kling_v16_standard_elements"

    # ---------------------------------------
    # 🎥 EXPLAINERS
    # ---------------------------------------
    if recipe_id in EXPLAINER_RECIPE_IDS:
        return "sora_2"

    # fallback
    return "fal_ltx23_i2v"


# ---------------------------------------
# 🔁 SCENE RETRY DETECTOR
# ---------------------------------------
def _should_retry_scene(meta: dict) -> bool:
    issues = [
        "face_distortion",
        "extra_fingers",
        "identity_drift",
        "blur_product",
    ]
    return any(issue in str(meta).lower() for issue in issues)


# ---------------------------------------
# 🚀 MAIN PIPELINE
# ---------------------------------------

def run_recipe_pipeline(
    recipe_id: str,
    inputs: dict[str, Any],
    *,
    video_id: str,
    user_id: str,
    voice_override: str | None = None,
    language_override: str | None = None,
    aspect_ratio_override: str | None = None,
    captions_override: bool | None = None,
    narration_override: bool | None = None,
    progress_callback: Callable[[int], None] | None = None,
) -> RecipePipelineResult:
    recipe = get_recipe(recipe_id)
    normalized_inputs = validate_recipe_inputs(recipe, inputs)
    initial_pipeline_metadata = _get_pipeline_metadata(video_id)
    effective_voice = voice_override or recipe.generation_defaults.voice
    effective_language = language_override or recipe.generation_defaults.language
    effective_aspect_ratio = aspect_ratio_override or recipe.generation_defaults.aspect_ratio
    effective_captions_enabled = recipe.generation_defaults.captions_enabled if captions_override is None else bool(captions_override)
    effective_narration_enabled = recipe.generation_defaults.narration_enabled if narration_override is None else bool(narration_override)
    avatar_product_requires_voice = recipe.id == "avatar_product"
    requested_voice = effective_voice
    requested_language = effective_language
    metadata_persona_id = str(initial_pipeline_metadata.get("persona_id") or "").strip() or None
    metadata_avatar_id = str(initial_pipeline_metadata.get("avatar_id") or "").strip() or None
    requested_avatar_id = _resolve_requested_avatar_id(
        initial_pipeline_metadata=initial_pipeline_metadata,
        normalized_inputs=normalized_inputs,
    )
    use_avatar_for_talking_scenes = bool(
        initial_pipeline_metadata.get("use_avatar_for_talking_scenes", bool(requested_avatar_id))
    )
    selected_persona = _resolve_ugc_persona(
        persona_id=requested_avatar_id,
        user_id=user_id,
        voice_override=effective_voice,
        language_override=effective_language,
    )
    logger.info(
        "ugc_persona_resolution_result",
        extra={
            "video_id": video_id,
            "recipe_id": recipe.id,
            "metadata_persona_id": metadata_persona_id,
            "metadata_avatar_id": metadata_avatar_id,
            "requested_avatar_id": requested_avatar_id,
            "use_avatar_for_talking_scenes": use_avatar_for_talking_scenes,
            "resolved_persona_id": (selected_persona or {}).get("persona_id"),
            "resolved_persona_source": (selected_persona or {}).get("persona_source"),
            "resolved_persona_name": (selected_persona or {}).get("name"),
        },
    )
    logger.info("recipe_pipeline_started", extra={"video_id": video_id, "recipe_id": recipe.id})
    _append_pipeline_event(
        video_id=video_id,
        kind="pipeline_started",
        title="Recipe loaded",
        detail=f"{recipe.catalog.title} is preparing the scene plan and execution steps.",
    )

    pipeline = VideoPipelineService()
    reference = _prepare_reference_asset(
        recipe_id=recipe.id,
        inputs=normalized_inputs,
        user_id=user_id,
        video_id=video_id,
        strategy=recipe.reference_strategy,
    )
    if progress_callback:
        progress_callback(20)

    logger.info(
        "recipe_reference_prepared",
        extra={"video_id": video_id, "recipe_id": recipe.id, "reference_asset": str(reference)},
    )
    _append_pipeline_event(
        video_id=video_id,
        kind="reference_ready",
        title="Inputs prepared",
        detail="Reference assets and recipe context are ready for generation.",
    )

    scenes = plan_scenes(recipe)
    avatar_synced_voice: str | None = None
    avatar_synced_language: str | None = None
    if recipe.id in UGC_AD_RECIPE_IDS and selected_persona and use_avatar_for_talking_scenes:
        avatar_synced_voice = str((selected_persona or {}).get("default_voice_id") or "").strip() or None
        avatar_synced_language = str((selected_persona or {}).get("language_preference") or "").strip() or None
        effective_voice = avatar_synced_voice or effective_voice
        effective_language = avatar_synced_language or effective_language

    scene_beats: list[str] = []
    narration_script: str | None = None
    overlay_text: list[str] = []
    scene_narration_context: list[str] = []
    deep_explainer_style: str | None = None
    ugc_ad_style: str | None = None
    ugc_client_brief: UgcAdClientBrief | None = None
    ugc_client_brief_mode = False
    avatar_product_brief: AvatarProductBrief | None = None
    ltx_scene_plan_debug: list[dict[str, Any]] = []
    if recipe.id in EXPLAINER_RECIPE_IDS:
        topic = str(normalized_inputs.get("text") or "").strip()
        if recipe.id == "deep_dive_explainer":
            deep_explainer_style = _resolve_deep_explainer_style(recipe, normalized_inputs)
        narration_plan = build_explainer_narration_script(
            topic,
            scene_count=len(scenes),
            duration_seconds=recipe.duration_seconds,
            recipe_id=recipe.id,
            explainer_style=deep_explainer_style or "educational",
        )
        narration_script = narration_plan.narration_script
        scene_beats = narration_plan.scene_beats
        overlay_text = narration_plan.overlay_text
        scene_narration_context = _split_narration_into_scene_context(narration_script, scene_count=len(scenes))
        if recipe.id == "deep_dive_explainer":
            scenes = build_deep_explainer_scene_plan(
                recipe=recipe,
                topic=topic,
                scene_beats=scene_beats,
                scene_narration_context=scene_narration_context,
                explainer_style=deep_explainer_style or "educational",
            )
        overlay_differs = " ".join(overlay_text).strip() != narration_script.strip()
        _merge_pipeline_metadata(
            video_id=video_id,
            narration_script=narration_script,
            overlay_text=overlay_text,
            narration_source_type=narration_plan.source_type,
            narration_text_length=len(narration_script),
            narration_uses_dedicated_script=narration_plan.used_dedicated_script,
            overlay_differs_from_narration=overlay_differs,
            scene_beats=scene_beats,
            scene_narration_context=scene_narration_context,
            deep_explainer_style=deep_explainer_style,
            deep_explainer_family=(scenes[0].get("explainer_family") if recipe.id == "deep_dive_explainer" and scenes else None),
            deep_explainer_subtopic=(scenes[0].get("explainer_subtopic") if recipe.id == "deep_dive_explainer" and scenes else None),
            deep_explainer_educational_mode=(scenes[0].get("educational_mode") if recipe.id == "deep_dive_explainer" and scenes else None),
            deep_scene_plan=(
                [
                    {
                        "scene_id": scene.get("scene_id"),
                        "stage_name": scene.get("stage_name"),
                        "stage_label": scene.get("stage_label"),
                        "explainer_family": scene.get("explainer_family"),
                        "explainer_subtopic": scene.get("explainer_subtopic"),
                        "educational_mode": scene.get("educational_mode"),
                        "shot_archetype": scene.get("shot_archetype"),
                        "subtopic_visual_anchor": scene.get("subtopic_visual_anchor"),
                        "qa_flags": scene.get("qa_flags"),
                        "scene_type": scene.get("scene_type"),
                        "topic_focus": scene.get("topic_focus"),
                        "visual_objective": scene.get("visual_objective"),
                        "camera_framing": scene.get("camera_framing"),
                        "motion_intent": scene.get("motion_intent"),
                        "transition_intent": scene.get("transition_intent"),
                        "ending_hold_instruction": scene.get("ending_hold_instruction"),
                        "sora_negative_guidance": scene.get("sora_negative_guidance"),
                        "anti_repetition_note": scene.get("anti_repetition_note"),
                    }
                    for scene in scenes
                ]
                if recipe.id == "deep_dive_explainer"
                else None
            ),
        )
        logger.info(
            "explainer_narration_resolved",
            extra={
                "video_id": video_id,
                "recipe_id": recipe.id,
                "narration_source_type": narration_plan.source_type,
                "narration_text_length": len(narration_script),
                "dedicated_script_generation": narration_plan.used_dedicated_script,
                "overlay_differs_from_narration": overlay_differs,
                "deep_explainer_style": deep_explainer_style,
                "deep_explainer_family": scenes[0].get("explainer_family") if recipe.id == "deep_dive_explainer" and scenes else None,
            },
        )
        if recipe.id == "deep_dive_explainer":
            logger.info(
                "deep_explainer_scene_plan_built",
                extra={
                    "video_id": video_id,
                    "recipe_id": recipe.id,
                    "scene_count": len(scenes),
                    "scene_plan": [
                        {
                            "scene_id": scene.get("scene_id"),
                            "stage_name": scene.get("stage_name"),
                            "explainer_family": scene.get("explainer_family"),
                            "scene_type": scene.get("scene_type"),
                            "topic_focus": scene.get("topic_focus"),
                            "visual_objective": scene.get("visual_objective"),
                            "shot_archetype": scene.get("shot_archetype"),
                            "subtopic_visual_anchor": scene.get("subtopic_visual_anchor"),
                            "qa_flags": scene.get("qa_flags"),
                        }
                        for scene in scenes
                    ],
                },
            )
        _append_pipeline_event(
            video_id=video_id,
            kind="narration_script_ready",
            title="Narration script drafted",
            detail="A dedicated explainer narration script was prepared for voiceover.",
        )
    elif recipe.id in UGC_AD_RECIPE_IDS:
        topic = str(normalized_inputs.get("text") or "").strip()
        is_chitrakala_v1 = _is_chitrakala_v1(recipe_id=recipe.id, initial_pipeline_metadata=initial_pipeline_metadata)
        ugc_ad_style = _resolve_ugc_ad_style(recipe, normalized_inputs)
        avatar_product_workflow: dict[str, Any] | None = None
        workflow_result = None

        if recipe.id == "avatar_product":
            if is_chitrakala_v1:
                logger.info(
                    'chitrakala_v1_started',
                    extra={'video_id': video_id, 'recipe_id': recipe.id, 'requested_avatar_id': requested_avatar_id, 'has_reference': bool(reference)},
                )
                _append_pipeline_event(
                    video_id=video_id,
                    kind='chitrakala_started',
                    title='Chitrakala ad started',
                    detail='Preparing the fixed 3-scene Chitrakala product ad workflow.',
                )
            workflow_service = AvatarProductWorkflowService()
            workflow_result = workflow_service.assess(
                message=topic,
                inputs={
                    **dict(initial_pipeline_metadata.get("inputs") or {}),
                    **dict(normalized_inputs or {}),
                    "avatar_id": requested_avatar_id or "",
                    "avatar_name": initial_pipeline_metadata.get("avatar_name") or initial_pipeline_metadata.get("persona_name") or "",
                },
                image_urls=[
                    str(item).strip()
                    for item in [
                        normalized_inputs.get("image"),
                        *(normalized_inputs.get("imageUrls") or [] if isinstance(normalized_inputs.get("imageUrls"), list) else []),
                    ]
                    if str(item or "").strip()
                ],
                avatar_id=requested_avatar_id,
                advanced_controls=dict(normalized_inputs.get("advanced_controls") or {}) if isinstance(normalized_inputs.get("advanced_controls"), dict) else None,
            )
            avatar_product_workflow = workflow_service.export_fields(workflow_result.fields)
            avatar_product_brief = normalize_avatar_product_brief(
                topic=topic,
                explicit={
                    **avatar_product_workflow,

                    "avatar_name": (
                        initial_pipeline_metadata.get("avatar_name")
                        or initial_pipeline_metadata.get("persona_name")
                        or (selected_persona or {}).get("name")
                        or ""
                    ),

                    "product_name": (
                        normalized_inputs.get("product_name")
                        or normalized_inputs.get("productName")
                        or avatar_product_workflow.get("product_name")
                        or initial_pipeline_metadata.get("product_name")
                        or ""
                    ),
                    "product_category": (
                        normalized_inputs.get("product_category")
                        or normalized_inputs.get("productCategory")
                        or avatar_product_workflow.get("product_category")
                        or initial_pipeline_metadata.get("product_category")
                        or ""
                    ),
                    "product_subcategory": (
                        normalized_inputs.get("product_subcategory")
                        or normalized_inputs.get("productSubcategory")
                        or avatar_product_workflow.get("product_subcategory")
                        or initial_pipeline_metadata.get("product_subcategory")
                        or ""
                    ),
                    "target_audience": (
                        normalized_inputs.get("target_audience")
                        or normalized_inputs.get("targetAudience")
                        or avatar_product_workflow.get("target_audience")
                        or initial_pipeline_metadata.get("target_audience")
                        or ""
                    ),
                    "key_promise": (
                        normalized_inputs.get("main_benefit")
                        or normalized_inputs.get("mainBenefit")
                        or avatar_product_workflow.get("main_benefit")
                        or initial_pipeline_metadata.get("key_promise")
                        or topic
                    ),
                    "pain_point": (
                        normalized_inputs.get("key_problem_solved")
                        or normalized_inputs.get("keyProblemSolved")
                        or avatar_product_workflow.get("key_problem_solved")
                        or initial_pipeline_metadata.get("pain_point")
                        or ""
                    ),
                    "cta": (
                        normalized_inputs.get("cta_preference")
                        or normalized_inputs.get("ctaPreference")
                        or avatar_product_workflow.get("cta_preference")
                        or initial_pipeline_metadata.get("cta")
                        or "shop now"
                    ),
                },
            )


            product_category_hint = _avatar_product_category_hint(
                normalized_inputs=normalized_inputs,
                avatar_product_brief=avatar_product_brief,
            )

            category_preservation_rules_for_script = _build_avatar_product_category_preservation_rules(
                product_category_hint=product_category_hint,
            )

            logger.info(
                "avatar_product_category_lock",
                extra={
                    "video_id": video_id,
                    "product_category_hint": product_category_hint,
                    "product_category": normalized_inputs.get("product_category"),
                    "product_subcategory": normalized_inputs.get("product_subcategory"),
                    "product_name": normalized_inputs.get("product_name"),
                    "brief_product_category": avatar_product_brief.product_category,
                    "brief_product_subcategory": avatar_product_brief.product_subcategory,
                    "brief_product_name": avatar_product_brief.product_name,
                    "must_show_elements": normalized_inputs.get("must_show_elements"),
                    "must_avoid_elements": normalized_inputs.get("must_avoid_elements"),
                },
            )



            ugc_client_brief = UgcAdClientBrief(
                business_name="",
                business_category=avatar_product_brief.product_category,
                city="",
                locality="",
                target_audience=avatar_product_brief.target_audience,
                main_service_or_product=avatar_product_brief.product_name,
                main_pain_point=avatar_product_brief.pain_point,
                key_promise=avatar_product_brief.key_promise,
                trust_factor="",
                offer="",
                cta=avatar_product_brief.cta,
                tone="creator_confident_friendly",
                ad_goal="purchase",
            )
            ugc_client_brief_mode = False
            ugc_business_context = {}
        else:
            ugc_client_brief = normalize_ugc_client_brief(topic=topic)
            ugc_client_brief_mode = is_client_brief_mode(ugc_client_brief)
            ugc_business_context = build_ugc_business_context(ugc_client_brief)

        if recipe.id == "avatar_product":
            scenes = build_avatar_product_scene_plan(
                recipe=recipe,
                topic=topic,
                avatar_product_brief=avatar_product_brief or AvatarProductBrief(),
            )

            requested_duration_seconds = int(
                normalized_inputs.get("duration_seconds")
                or normalized_inputs.get("durationSeconds")
                or (avatar_product_brief.duration_seconds if avatar_product_brief else None)
                or initial_pipeline_metadata.get("duration_seconds")
                or initial_pipeline_metadata.get("durationSeconds")
                or recipe.duration_seconds
                or 5
            )

            if requested_duration_seconds not in {5, 10}:
                requested_duration_seconds = 5

            scenes = [
                {
                    **scene,
                    "duration_seconds": requested_duration_seconds,
                    "talking_duration_hint_seconds": requested_duration_seconds,
                }
                for scene in scenes
            ]
        else:
            scenes = build_ugc_ad_scene_plan(
                recipe=recipe,
                topic=topic,
                ugc_style=ugc_ad_style or "creator_casual",
                client_brief=ugc_client_brief,
            )

        enhancer_metadata: dict[str, Any] | None = None
        if recipe.id == "avatar_product":
            raw_category_rules = workflow_service.category_rules(avatar_product_brief.product_category)

            if isinstance(raw_category_rules, dict):
                category_prompt_rules = {
                    **raw_category_rules,
                    "category_context": _join_nonempty_text([
                        str(raw_category_rules.get("category_context") or ""),
                        category_preservation_rules_for_script,
                    ]),
                    "category_lock": category_preservation_rules_for_script,
                    "product_category_hint": product_category_hint,
                }
            else:
                category_prompt_rules = {
                    "category_context": _join_nonempty_text([
                        str(raw_category_rules or ""),
                        category_preservation_rules_for_script,
                    ]),
                    "category_lock": category_preservation_rules_for_script,
                    "product_category_hint": product_category_hint,
                }
            enhancer_input = HFQwenEnhancerInput(
                product_name=avatar_product_brief.product_name or topic or "the product",
                brand_name=avatar_product_brief.brand_name or None,
                product_type=avatar_product_brief.product_category or None,
                product_subcategory=avatar_product_brief.product_subcategory or None,
                campaign_objective=avatar_product_brief.campaign_objective or None,
                platform=avatar_product_brief.platform or None,
                duration_seconds=avatar_product_brief.duration_seconds or recipe.duration_seconds,
                language=avatar_product_brief.language or effective_language or None,
                target_audience=avatar_product_brief.target_audience or None,
                audience_age_range=avatar_product_brief.audience_age_range or None,
                audience_lifestyle=avatar_product_brief.audience_lifestyle or None,
                main_benefit=avatar_product_brief.key_promise or None,
                secondary_benefit=avatar_product_brief.secondary_benefit or None,
                key_problem_solved=avatar_product_brief.pain_point or None,
                desired_feeling=avatar_product_brief.desired_feeling or None,
                avatar_style=str((selected_persona or {}).get("style_label") or (selected_persona or {}).get("default_behavior_prompt") or avatar_product_brief.avatar_name or "").strip() or None,
                brand_tone=avatar_product_brief.brand_tone or ugc_ad_style or "creator_casual",
                voice_style=avatar_product_brief.voice_style or None,
                cta_preference=avatar_product_brief.cta_preference or avatar_product_brief.cta or None,
                tagline=avatar_product_brief.tagline or None,
                offer_text=avatar_product_brief.offer_text or None,
                brief=avatar_product_brief.key_promise or topic,
                avatar_prompt_template=str((selected_persona or {}).get("default_behavior_prompt") or "").strip() or None,
                recommended_voice=str((selected_persona or {}).get("default_voice_id") or effective_voice or "").strip() or None,
                has_product_image=bool(reference),
                reference_image_count=avatar_product_brief.product_image_count,
                must_show_elements=list(avatar_product_brief.must_show_elements or []),
                must_avoid_elements=list(avatar_product_brief.must_avoid_elements or []),
                compliance_notes=avatar_product_brief.compliance_notes or None,
                claims_to_avoid=list(avatar_product_brief.claims_to_avoid or []),
                category_specific_details=avatar_product_brief.category_specific_details or None,
                script_mode=avatar_product_brief.script_mode or "auto_generate",
                provided_script=avatar_product_brief.provided_script or None,
                strict_script_lock=avatar_product_brief.strict_script_lock,
                category_prompt_rules=category_prompt_rules,
            )
            provided_script = str(avatar_product_brief.provided_script or '').strip()
            if is_chitrakala_v1 and provided_script:
                split_lines = _split_chitrakala_manual_script(
                    provided_script,
                    product_name=avatar_product_brief.product_name or topic or 'the product',
                    cta=avatar_product_brief.cta or 'Shop now',
                )

                full_manual_script = " ".join(
                    line
                    for line in [
                        split_lines["hook_line"],
                        split_lines["showcase_line"],
                        split_lines["cta_line"],
                    ]
                    if line
                ).strip()

                scenes = [
                    {
                        **scene,
                        "spoken_line": (
                            full_manual_script
                            if str(scene.get("stage_name") or "").strip().lower() == "single_shot"
                            else split_lines["hook_line"]
                            if str(scene.get("stage_name") or "").strip().lower() == "hook"
                            else split_lines["showcase_line"]
                            if str(scene.get("stage_name") or "").strip().lower() == "showcase"
                            else split_lines["cta_line"]
                        ),
                        "showcase_visual_prompt": (
                            _build_chitrakala_showcase_prompt(
                                product_name=avatar_product_brief.product_name or topic or "the product",
                                showcase_visual_prompt=scene.get("showcase_visual_prompt"),
                                must_show_elements=list(scene.get("must_show_elements") or []),
                            )
                            if str(scene.get("stage_name") or "").strip().lower() in {"showcase", "single_shot"}
                            else scene.get("showcase_visual_prompt")
                        ),
                    }
                    for scene in scenes
                ]

                narration_script = full_manual_script

                narration_script, forbidden_terms_found, script_repaired = _repair_avatar_product_narration_for_category(
                    narration_script,
                    product_category_hint=product_category_hint,
                    product_name=avatar_product_brief.product_name or topic or "this product",
                )

                logger.info(
                    "avatar_product_script_category_validation",
                    extra={
                        "video_id": video_id,
                        "product_category_hint": product_category_hint,
                        "forbidden_terms_found": forbidden_terms_found,
                        "script_repaired": script_repaired,
                        "source": "manual_script",
                        "narration_script": narration_script[:220],
                    },
                )


                enhancer_metadata = {
                    'status': 'manual_script_split',
                    'hook_line': split_lines['hook_line'],
                    'showcase_line': split_lines['showcase_line'],
                    'cta_line': split_lines['cta_line'],
                    "showcase_visual_prompt": next(
                        (
                            str(scene.get("showcase_visual_prompt") or "").strip()
                            for scene in scenes
                            if str(scene.get("stage_name") or "").strip().lower() in {"showcase", "single_shot"}
                        ),
                        "",
                    ),
                }
                logger.info(
                    'chitrakala_script_ready',
                    extra={'video_id': video_id, 'source': 'manual_script', **split_lines},
                )
                _append_pipeline_event(
                    video_id=video_id,
                    kind='chitrakala_script_ready',
                    title='Script prepared',
                    detail='Your script was normalized into hook, showcase, and CTA lines for cleaner lip sync.',
                )
            else:
                try:
                    enhancer_result = HFQwenEnhancerService(settings=get_settings()).enhance_avatar_product_ad(enhancer_input)
                    scenes = _apply_avatar_product_enhancer_to_scenes(scenes=scenes, enhancer_result=enhancer_result)
                    narration_script = _compose_avatar_product_narration_script(enhancer_result)

                    product_name_for_script = str(
                        avatar_product_brief.product_name
                        or normalized_inputs.get("product_name")
                        or normalized_inputs.get("productName")
                        or "this product"
                    ).strip()

                    narration_script, forbidden_terms_found, script_repaired = _repair_avatar_product_narration_for_category(
                        narration_script,
                        product_category_hint=product_category_hint,
                        product_name=product_name_for_script,
                    )

                    logger.info(
                        "avatar_product_script_category_validation",
                        extra={
                            "video_id": video_id,
                            "product_category_hint": product_category_hint,
                            "forbidden_terms_found": forbidden_terms_found,
                            "script_repaired": script_repaired,
                            "narration_script": narration_script[:220],
                        },
                    )

                    enhancer_metadata = _avatar_product_enhancer_metadata(
                        enhancer_result=enhancer_result,
                        enhancer_input=enhancer_input,
                    )
                    enhancer_metadata["script_category_validation"] = {
                        "product_category_hint": product_category_hint,
                        "forbidden_terms_found": forbidden_terms_found,
                        "script_repaired": script_repaired,
                        "final_narration_script": narration_script,
                    }
                    if is_chitrakala_v1:
                        logger.info(
                            'chitrakala_script_ready',
                            extra={
                                'video_id': video_id,
                                'source': 'hf_qwen',
                                'hook_line': enhancer_result.hook_line,
                                'showcase_line': enhancer_result.showcase_line,
                                'cta_line': enhancer_result.cta_line,
                            },
                        )
                    _append_pipeline_event(
                        video_id=video_id,
                        kind="avatar_product_enhanced",
                        title="Avatar ad enhanced",
                        detail="HF Qwen prepared hook, showcase, and CTA guidance for the avatar product recipe.",
                    )
                except Exception as exc:
                    logger.exception(
                        "avatar_product_enhancer_failed",
                        extra={"video_id": video_id, "recipe_id": recipe.id, "product_name": enhancer_input.product_name},
                    )
                    enhancer_metadata = _avatar_product_enhancer_metadata(
                        enhancer_result=None,
                        enhancer_input=enhancer_input,
                        error=str(exc),
                    )

            if is_chitrakala_v1:
                scenes = _apply_chitrakala_v1_scene_strategy(
                    scenes=scenes,
                    showcase_visual_prompt=(
                        str((enhancer_metadata or {}).get('showcase_visual_prompt') or '').strip() or None
                    ),
                    product_name=avatar_product_brief.product_name or topic or 'the product',
                )

        if not narration_script:
            try:
                narration_script = clean_ugc_script(
                    generate_ugc_raw_script(
                        topic=topic,
                        ugc_style=ugc_ad_style or "creator_casual",
                    )
                )
            except Exception:
                logger.exception("ugc_raw_script_generation_failed")

                if recipe.id == "avatar_product" and avatar_product_brief:
                    narration_script = _fallback_avatar_product_script(
                        product_name=avatar_product_brief.product_name,
                        product_category_hint=product_category_hint,
                        main_benefit=avatar_product_brief.key_promise,
                        cta=avatar_product_brief.cta,
                        language=effective_language,
                    )
                else:
                    narration_script = _fallback_ugc_raw_script(topic)

        if recipe.id in {"ugc_ad", "avatar_product"}:
            for scene in scenes:
                if scene.get("persona_required") and (not use_avatar_for_talking_scenes or not selected_persona):
                    scene["qa_flags"] = list(
                        dict.fromkeys([*(scene.get("qa_flags") or []), "missing_persona_on_lip_sync_scene"])
                    )

            requires_locked_persona = any(bool(scene.get("persona_required")) for scene in scenes)
            strict_avatar_recipe = recipe.id == "avatar_product" and requires_locked_persona


            if recipe.id == "avatar_product" and avatar_product_brief:
                product_category_hint_for_repair = _avatar_product_category_hint(
                    normalized_inputs=normalized_inputs,
                    avatar_product_brief=avatar_product_brief,
                )

                narration_script, forbidden_terms_found, script_repaired = _repair_avatar_product_narration_for_category(
                    narration_script or "",
                    product_category_hint=product_category_hint_for_repair,
                    product_name=avatar_product_brief.product_name or topic or "this product",
                )

                logger.info(
                    "avatar_product_script_category_validation",
                    extra={
                        "video_id": video_id,
                        "product_category_hint": product_category_hint_for_repair,
                        "forbidden_terms_found": forbidden_terms_found,
                        "script_repaired": script_repaired,
                        "source": "post_fallback_or_final_script",
                        "narration_script": (narration_script or "")[:220],
                    },
                )



            if strict_avatar_recipe and not selected_persona:
                _merge_pipeline_metadata(
                    video_id=video_id,
                    selected_persona_resolution_status="failed",
                    selected_persona_error="Avatar Product requires a selected AI avatar for all talking scenes.",
                    requested_avatar_id=requested_avatar_id,
                )
                raise RuntimeError("Avatar Product requires a selected AI avatar for all talking scenes.")

            if (requested_avatar_id and use_avatar_for_talking_scenes and requires_locked_persona) or strict_avatar_recipe:
                if not selected_persona:
                    _merge_pipeline_metadata(
                        video_id=video_id,
                        selected_persona_resolution_status="failed",
                        selected_persona_error="Selected AI avatar could not be resolved for talking UGC scenes.",
                        requested_avatar_id=requested_avatar_id,
                    )
                    raise RuntimeError("Selected AI avatar could not be resolved for talking UGC scenes.")

                if not str(selected_persona.get("image_url") or "").strip():
                    _merge_pipeline_metadata(
                        video_id=video_id,
                        selected_persona_resolution_status="failed",
                        selected_persona_error="Selected AI avatar is missing a usable reference image.",
                        requested_avatar_id=requested_avatar_id,
                        selected_persona=selected_persona,
                    )
                    raise RuntimeError("Selected AI avatar is missing a usable reference image for talking UGC scenes.")

        _merge_pipeline_metadata(
            video_id=video_id,
            narration_script=narration_script,
            narration_source_type=(
                "avatar_product_enhancer"
                if recipe.id == "avatar_product" and enhancer_metadata and enhancer_metadata.get("status") == "success"
                else "ugc_raw"
            ),
            narration_text_length=len(narration_script),
            script_type=(
                "avatar_product_enhanced"
                if recipe.id == "avatar_product" and enhancer_metadata and enhancer_metadata.get("status") == "success"
                else "ugc_raw"
            ),
            ugc_ad_style=ugc_ad_style,
            ugc_client_brief_mode=ugc_client_brief_mode,
            ugc_ad_family=(scenes[0].get("ugc_ad_family") if scenes else None),
            ugc_ad_subtopic=(scenes[0].get("ugc_ad_subtopic") if scenes else None),
            ugc_ad_mode=(scenes[0].get("ugc_mode") if scenes else None),
            ugc_business_context=ugc_business_context,
            ugc_client_brief=ugc_client_brief.__dict__ if ugc_client_brief else {},
            avatar_product_brief=avatar_product_brief.__dict__ if avatar_product_brief else {},
            avatar_product_workflow=avatar_product_workflow or {},
            avatar_product_script_summary=(
                {
                    "script_mode": avatar_product_brief.script_mode,
                    "strict_script_lock": avatar_product_brief.strict_script_lock,
                    "provided_script": avatar_product_brief.provided_script,
                    "original_script": avatar_product_brief.original_script or avatar_product_brief.provided_script,
                    "final_script": narration_script,
                    "script_modified": bool(
                        avatar_product_brief.provided_script
                        and " ".join(str(avatar_product_brief.provided_script or "").split())
                        != " ".join(str(narration_script or "").split())
                    ),
                }
                if avatar_product_brief
                else {}
            ),
            advanced_controls_summary=(workflow_result.advanced_controls_summary if recipe.id == "avatar_product" else {}),
            enhancer=enhancer_metadata,
            selected_persona=selected_persona or {},
            selected_persona_id=(selected_persona or {}).get("persona_id"),
            requested_avatar_id=requested_avatar_id,
            resolved_avatar_source=(selected_persona or {}).get("persona_source"),
            resolved_avatar_name=(selected_persona or {}).get("name"),
            use_avatar_for_talking_scenes=bool(initial_pipeline_metadata.get("use_avatar_for_talking_scenes", False)),
            requested_voice=requested_voice,
            requested_language=requested_language,
            avatar_synced_voice=avatar_synced_voice,
            avatar_synced_language=avatar_synced_language,
            resolved_talking_voice=effective_voice,
            resolved_talking_language=effective_language,
            ugc_scene_plan=_build_ugc_scene_plan_metadata(
                scenes=scenes,
                requested_voice=requested_voice,
                requested_language=requested_language,
                avatar_synced_voice=avatar_synced_voice,
                avatar_synced_language=avatar_synced_language,
                effective_voice=effective_voice,
                effective_language=effective_language,
                avatar_product_brief=avatar_product_brief,
            ),
        )

        logger.info(
            "ugc_ad_script_resolved",
            extra={
                "video_id": video_id,
                "recipe_id": recipe.id,
                "narration_source_type": (
                    "avatar_product_enhancer"
                    if recipe.id == "avatar_product" and enhancer_metadata and enhancer_metadata.get("status") == "success"
                    else "ugc_raw"
                ),
                "narration_text_length": len(narration_script),
                "ugc_ad_style": ugc_ad_style,
                "ugc_ad_family": scenes[0].get("ugc_ad_family") if scenes else None,
                "ugc_client_brief_mode": ugc_client_brief_mode,
                "ugc_business_name": ugc_client_brief.business_name if ugc_client_brief else None,
            },
        )

        logger.info(
            "ugc_ad_scene_plan_built",
            extra={
                "video_id": video_id,
                "recipe_id": recipe.id,
                "scene_count": len(scenes),
                "scene_plan": [
                    {
                        "scene_id": scene.get("scene_id"),
                        "stage_name": scene.get("stage_name"),
                        "ugc_ad_family": scene.get("ugc_ad_family"),
                        "scene_type": scene.get("scene_type"),
                        "topic_focus": scene.get("topic_focus"),
                        "visual_objective": scene.get("visual_objective"),
                        "shot_archetype": scene.get("shot_archetype"),
                        "subtopic_visual_anchor": scene.get("subtopic_visual_anchor"),
                        "qa_flags": scene.get("qa_flags"),
                        "talking_mode": scene.get("talking_mode"),
                        "render_lane": scene.get("render_lane"),
                    }
                    for scene in scenes
                ],
            },
        )

        _append_pipeline_event(
            video_id=video_id,
            kind="narration_script_ready",
            title="Ad script drafted",
            detail=(
                "HF Qwen prepared avatar-product hook, showcase, and CTA lines for voiceover."
                if recipe.id == "avatar_product" and enhancer_metadata and enhancer_metadata.get("status") == "success"
                else "A creator-style raw UGC script was prepared for voiceover."
            ),
        )
    elif recipe.id in LTX_BENCHMARK_RECIPE_IDS:
        scenes = build_ltx_cinematic_montage_scene_plan(recipe=recipe)
        ltx_scene_plan_debug = [
            {
                "scene_id": scene.get("scene_id"),
                "scene_role": scene.get("scene_role"),
                "stage_label": scene.get("stage_label"),
                "duration_seconds": scene.get("duration_seconds"),
                "camera_motion_type": scene.get("camera_motion_type"),
                "continuity_anchor": scene.get("continuity_anchor"),
                "continuity_priority": scene.get("continuity_priority"),
                "negative_guidance": scene.get("negative_guidance"),
            }
            for scene in scenes
        ]
        _merge_pipeline_metadata(
            video_id=video_id,
            ltx_benchmark_scene_plan=ltx_scene_plan_debug,
            render_mode="scene_stitch",
            generator_model_family="ltx",
            continuity_priority="high",
        )
        logger.info(
            "ltx_cinematic_montage_scene_plan_built",
            extra={
                "video_id": video_id,
                "recipe_id": recipe.id,
                "scene_count": len(scenes),
                "scene_plan": ltx_scene_plan_debug,
            },
        )
        _append_pipeline_event(
            video_id=video_id,
            kind="scene_plan_ready",
            title="Benchmark scene plan ready",
            detail="Three continuity-locked LTX benchmark scenes were prepared for sequential render and stitch.",
        )
    
    elif recipe.id in LTX_FREEFORM_RECIPE_IDS:
        topic = str(normalized_inputs.get("text") or "").strip()
        scenes = build_ltx_freeform_scene_plan(recipe=recipe, topic=topic)
        ltx_scene_plan_debug = [
            {
                "scene_id": scene.get("scene_id"),
                "scene_role": scene.get("scene_role"),
                "stage_label": scene.get("stage_label"),
                "duration_seconds": scene.get("duration_seconds"),
                "story_mode": scene.get("story_mode"),
                "story_subtopic": scene.get("story_subtopic"),
                "camera_motion_type": scene.get("camera_motion_type"),
                "continuity_anchor": scene.get("continuity_anchor"),
            }
            for scene in scenes
        ]
        _merge_pipeline_metadata(
            video_id=video_id,
            ltx_storyboard_scene_plan=ltx_scene_plan_debug,
            render_mode="scene_stitch",
            generator_model_family="ltx",
            continuity_priority="high",
            ltx_story_mode=scenes[0].get("story_mode") if scenes else None,
        )
        logger.info(
            "ltx_storyboard_scene_plan_built",
            extra={
                "video_id": video_id,
                "recipe_id": recipe.id,
                "scene_count": len(scenes),
                "scene_plan": ltx_scene_plan_debug,
            },
        )
        _append_pipeline_event(
            video_id=video_id,
            kind="scene_plan_ready",
            title="LTX scene plan ready",
            detail="Three stitched LTX scenes were planned from the composer prompt.",
        )

    if progress_callback:
        progress_callback(30)

    logger.info(
        "recipe_scenes_planned",
        extra={"video_id": video_id, "recipe_id": recipe.id, "scene_count": len(scenes)},
    )
    _append_pipeline_event(
        video_id=video_id,
        kind="scenes_planned",
        title="Scene plan assembled",
        detail=(
            f"The UGC ad was split into {len(scenes)} scene blocks for render orchestration."
            if recipe.id in UGC_AD_RECIPE_IDS
            else f"The LTX video was split into {len(scenes)} stitched scene blocks."
            if recipe.id in LTX_RECIPE_IDS
            else f"The explainer was split into {len(scenes)} scene blocks for render orchestration."
        ),
    )

    generation = VideoGenerationService(get_settings())

    # Default old path for all other recipes
    clip_urls: list[str] = []
    ltx_scene_outputs: list[dict[str, Any]] = []
    total_scenes = max(len(scenes), 1)
    compiled_scene_prompts: list[dict[str, Any]] = []
    ugc_talking_scene_debug: list[dict[str, Any]] = []
    ugc_talking_timing_maps: list[dict[str, Any]] = []
    ugc_talking_audio_tracks: list[dict[str, Any]] = []

    if recipe.id == "make_anything_dance":
        from app.services.fal_video_service import FalVideoService

        fal_service = FalVideoService()
        motion_media = MotionControlMediaService()
        character_image_url = str(normalized_inputs.get("character_image") or "").strip()
        dance_video_url = str(normalized_inputs.get("dance_video") or "").strip()
        if not character_image_url:
            raise RuntimeError("Make Anything Dance requires an uploaded character image.")
        if not dance_video_url:
            raise RuntimeError("Make Anything Dance requires an uploaded dance video.")

        analysis = motion_media.analyze_reference_video(dance_video_url)
        motion_media.validate_supported_duration(analysis)
        keep_original_sound_requested = bool(normalized_inputs.get("keep_original_sound"))
        keep_original_sound = keep_original_sound_requested and analysis.has_audio
        resolved_aspect_ratio = str(normalized_inputs.get("aspect_ratio") or effective_aspect_ratio or "9:16").strip() or "9:16"

        cinematic_spec = build_motion_control_dance_spec(
            character_description=str(normalized_inputs.get("character_description") or "").strip() or "uploaded character",
            user_prompt=str(normalized_inputs.get("user_prompt") or "").strip(),
            dance_style=str(normalized_inputs.get("dance_style") or "Funny"),
            character_energy=str(normalized_inputs.get("character_energy") or "Playful"),
            visual_style=str(normalized_inputs.get("visual_style") or "Realistic"),
            motion_fidelity=str(normalized_inputs.get("motion_fidelity") or "Balanced"),
            character_orientation=str(normalized_inputs.get("character_orientation") or "video"),
            keep_original_sound=keep_original_sound,
            duration_seconds=int(analysis.billed_duration_seconds),
            aspect_ratio=resolved_aspect_ratio,
            has_audio=analysis.has_audio,
        )
        cinematic_compiled_prompt, cinematic_compiler_metadata = compile_cinematic_prompt(
            family="motion_control_dance",
            model_key="kling_v26_standard_motion_control",
            spec=cinematic_spec,
        )
        estimated_provider_cost_usd = round(float(analysis.billed_duration_seconds) * 0.07, 6)
        estimated_credit_charge = CreditService().estimate(
            "video_create",
            {
                "recipeId": recipe.id,
                "modelKey": "kling_v26_standard_motion_control",
                "modelFamily": "motion_control",
                "durationSeconds": int(analysis.billed_duration_seconds),
                "quality": "standard",
                "resolution": "720p",
                "audioMode": "auto_scene_sound" if keep_original_sound else "silent",
                "audioSettings": {"nativeAudioEnabled": keep_original_sound},
                "inputs": dict(normalized_inputs),
            },
        ).required_credits
        _merge_pipeline_metadata(
            video_id=video_id,
            recipe_family="motion_control_dance",
            recipe_version="v1",
            cinematic_framework="STAR-C",
            cinematic_spec=cinematic_spec.to_dict(),
            cinematic_compiler_metadata=cinematic_compiler_metadata,
            cinematic_compiled_prompt=cinematic_compiled_prompt,
            motion_reference_video_duration=analysis.duration_seconds,
            detected_audio=analysis.has_audio,
            estimated_provider_cost_usd=estimated_provider_cost_usd,
            estimated_credit_charge=estimated_credit_charge,
            aspect_ratio=resolved_aspect_ratio,
            keep_original_sound=keep_original_sound,
            generation_mode="reference_driven",
        )
        _append_pipeline_event(
            video_id=video_id,
            kind="motion_control_ready",
            title="Dance motion prepared",
            detail="Character image, dance video timing, and motion-control prompt are ready for generation.",
        )
        final_video_url, provider_meta = fal_service.generate_kling_motion_control_video(
            prompt=cinematic_compiled_prompt,
            image_url=character_image_url,
            video_url=dance_video_url,
            aspect_ratio=resolved_aspect_ratio,
            character_orientation=str(normalized_inputs.get("character_orientation") or "video"),
            keep_original_sound=keep_original_sound,
        )
        generated_output_duration = _probe_media_duration_seconds(final_video_url)
        _merge_pipeline_metadata(
            video_id=video_id,
            generated_output_duration=generated_output_duration,
            motion_control_provider_meta=provider_meta,
        )
        _persist_final_video(
            video_id=video_id,
            user_id=user_id,
            video_url=final_video_url,
            metadata={
                "recipe_id": recipe.id,
                "pipeline_version": "make_anything_dance_v1",
                "render_mode": "reference_driven_motion_control",
                "final_video_url": final_video_url,
            },
        )
        _append_pipeline_event(
            video_id=video_id,
            kind="motion_control_completed",
            title="Dance reel ready",
            detail="Your character has been animated using the uploaded dance reference.",
        )
        return RecipePipelineResult(
            provider="fal",
            model_key="kling_v26_standard_motion_control",
            video_url=final_video_url,
            metadata={
                "recipe_id": recipe.id,
                "recipe_family": "motion_control_dance",
                "recipe_version": "v1",
                "generation_mode": "reference_driven",
                "motion_reference_video_duration": analysis.duration_seconds,
                "generated_output_duration": generated_output_duration,
                "detected_audio": analysis.has_audio,
                "keep_original_sound": keep_original_sound,
                "estimated_provider_cost_usd": estimated_provider_cost_usd,
                "estimated_credit_charge": estimated_credit_charge,
            },
        )

    if recipe.id == "avatar_product":
        from app.services.fal_video_service import FalVideoService

        fal_service = FalVideoService()

        product_name = avatar_product_brief.product_name if avatar_product_brief else (topic or "the product")
        product_category_hint = product_category_hint or _avatar_product_category_hint(
            normalized_inputs=normalized_inputs,
            avatar_product_brief=avatar_product_brief,
        )
        product_image_url = str(reference or "").strip()
        avatar_reference_selection = selectBestAvatarReferenceImageWithContrast(
            avatar=selected_persona or {},
            recipe_id=recipe.id,
            product_image_url=product_image_url,
            product_category=product_category_hint,
            scene_type="single_shot_avatar_product",
            prompt_text=narration_script or topic,
        )
        avatar_image_url = str(
            avatar_reference_selection.selected_url
            or (selected_persona or {}).get("image_url")
            or ""
        ).strip()
        avatar_name = str((selected_persona or {}).get("name") or "the selected avatar").strip()

        if selected_persona and avatar_image_url:
            selected_persona = {
                **selected_persona,
                "image_url": avatar_image_url,
            }

        logger.info(
            "avatar_product_reference_image_selected",
            extra={
                "video_id": video_id,
                "recipe_id": recipe.id,
                "avatar_id": (selected_persona or {}).get("persona_id"),
                "product_category_hint": product_category_hint,
                "selected_reference_image_id": avatar_reference_selection.selected_id,
                "selected_reference_image_tags": avatar_reference_selection.selected_tags,
                "selected_reference_image_url": avatar_image_url or None,
                "candidate_count": avatar_reference_selection.candidate_count,
                "selection_reason": avatar_reference_selection.reason,
                "fallback_mode": avatar_reference_selection.fallback_mode,
            },
        )
        _merge_pipeline_metadata(
            video_id=video_id,
            selected_persona=selected_persona or {},
            avatar_product_selected_reference_image_id=avatar_reference_selection.selected_id,
            avatar_product_selected_reference_image_url=avatar_image_url or None,
            avatar_product_selected_reference_image_tags=avatar_reference_selection.selected_tags,
            avatar_product_reference_image_candidate_count=avatar_reference_selection.candidate_count,
            avatar_product_reference_image_selection_reason=avatar_reference_selection.reason,
            avatar_product_reference_image_selection_fallback_mode=avatar_reference_selection.fallback_mode,
            avatar_product_color_contrast_delta_e=avatar_reference_selection.contrast_delta_e,
            avatar_product_color_contrast_variant_id=avatar_reference_selection.contrast_selected_variant_id,
            avatar_product_color_contrast_variant_url=avatar_reference_selection.contrast_selected_variant_url,
            avatar_product_color_contrast_threshold_triggered=avatar_reference_selection.contrast_threshold_triggered,
        )

        if not avatar_image_url:
            raise RuntimeError("Avatar Product requires a selected avatar image for single-shot generation.")

        if not product_image_url:
            raise RuntimeError("Avatar Product requires an uploaded product image for single-shot generation.")

        kling_prompt, ugc_variant, category_preservation_rules = _build_avatar_product_single_shot_kling_prompt(
            avatar_name=avatar_name,
            product_name=product_name,
            product_category_hint=product_category_hint,
            narration_script=narration_script,
            video_id=video_id,
        )

        logger.info(
            "chitrakala_kling_started",
            extra={
                "video_id": video_id,
                "product_category_hint": product_category_hint,
                "ugc_variant": ugc_variant,
                "kling_prompt_length": len(kling_prompt),
            },
        )

        requested_duration = int(
            normalized_inputs.get("duration_seconds")
            or normalized_inputs.get("durationSeconds")
            or 5
        )

        kling_duration = "10" if requested_duration >= 10 else "5"

        quality_profile = str(
            normalized_inputs.get("quality_profile")
            or normalized_inputs.get("qualityProfile")
            or "standard"
        ).strip().lower()

        requested_video_model_key = str(
            normalized_inputs.get("video_model_key")
            or normalized_inputs.get("model_key")
            or normalized_inputs.get("modelKey")
            or ""
        ).strip()

        allowed_avatar_product_models = {
            "seedance_v1_lite_reference",
            "fal_ltx23_i2v",
            "kling_o3_standard_reference",
            "kling_o3_pro_reference",
            "kling_o3_4k_reference",

            # Legacy fallback models
            "kling_v16_standard_elements",
            "kling_v16_pro_elements",

            # Backward compatibility only
            "kling_o3_reference",
        }

        if requested_video_model_key in allowed_avatar_product_models:
            resolved_video_model_key = requested_video_model_key
        elif quality_profile == "affordable":
            resolved_video_model_key = "seedance_v1_lite_reference"
        elif quality_profile in {"high", "high_quality"}:
            resolved_video_model_key = "kling_o3_pro_reference"
        elif quality_profile == "premium":
            # Cost-safe for now. Do not auto-use 4K yet.
            resolved_video_model_key = "kling_o3_pro_reference"
        else:
            resolved_video_model_key = "kling_o3_standard_reference"

        # Backward compatibility: old generic O3 key means O3 Standard now.
        if resolved_video_model_key == "kling_o3_reference":
            resolved_video_model_key = "kling_o3_standard_reference"

        # Cost guard: only block accidental 4K for non-premium profiles.
        if quality_profile != "premium" and resolved_video_model_key == "kling_o3_4k_reference":
            resolved_video_model_key = "kling_o3_standard_reference"


        logger.info(
            "chitrakala_model_selection",
            extra={
                "video_id": video_id,
                "quality_profile": quality_profile,
                "requested_video_model_key": requested_video_model_key,
                "resolved_video_model_key": resolved_video_model_key,
                "normalized_inputs_model_key": normalized_inputs.get("video_model_key"),
            },
        )

        seedance_prompt = None
        cinematic_spec = None
        cinematic_compiler_metadata: dict[str, Any] | None = None
        cinematic_compiled_prompt: str | None = None
        speaking_frame_safety_enabled = False
        product_face_spacing_strategy = "standard_recipe_framing"
        avatar_product_framing_priority = "balanced"
        behavior_hints = _derive_avatar_product_behavior_hints(
            narration_script=narration_script,
            duration_seconds=requested_duration,
        )
        narrated_avatar_run = bool((narration_script or "").strip())
        if narrated_avatar_run:
            avatar_product_framing_priority = "speech_first"
        cinematic_architecture_enabled = bool(get_settings().use_new_cinematic_architecture) or str(
            normalized_inputs.get("cinematic_architecture_version")
            or initial_pipeline_metadata.get("cinematic_architecture_version")
            or ""
        ).strip().lower() == "v2"
        if cinematic_architecture_enabled:
            cinematic_spec = build_ugc_avatar_product_spec(
                avatar_name=avatar_name,
                product_name=product_name,
                product_category_hint=product_category_hint,
                narration_script=narration_script,
                duration_seconds=requested_duration,
                creator_energy=behavior_hints.get("creator_energy_hint"),
                visual_mood=behavior_hints.get("visual_mood_hint"),
            )
            cinematic_compiled_prompt, cinematic_compiler_metadata = compile_cinematic_prompt(
                family="ugc_avatar_product",
                model_key=resolved_video_model_key,
                spec=cinematic_spec,
            )
            speaking_frame_safety_enabled = bool(cinematic_spec.metadata.get("speaking_frame_safety_enabled"))
            product_face_spacing_strategy = str(
                cinematic_spec.metadata.get("product_face_spacing_strategy") or "standard_recipe_framing"
            )
            _merge_pipeline_metadata(
                video_id=video_id,
                cinematic_architecture_enabled=True,
                cinematic_framework="STAR-C",
                recipe_family="ugc_avatar_product",
                recipe_version="v2",
                cinematic_spec=cinematic_spec.to_dict(),
                cinematic_compiler_metadata=cinematic_compiler_metadata,
                cinematic_compiled_prompt=cinematic_compiled_prompt,
                avatar_product_speaking_frame_safety_enabled=speaking_frame_safety_enabled,
                avatar_product_product_face_spacing_strategy=product_face_spacing_strategy,
                avatar_product_framing_priority=avatar_product_framing_priority,
                avatar_product_behavior_timeline=behavior_hints.get("behavior_timeline"),
                avatar_product_behavior_dominant_emotion=behavior_hints.get("dominant_emotion"),
            )

        if resolved_video_model_key == "seedance_v1_lite_reference":
            seedance_prompt = (
                cinematic_compiled_prompt
                if cinematic_architecture_enabled and cinematic_compiled_prompt
                else _build_avatar_product_seedance_lite_prompt(
                    base_prompt=kling_prompt,
                    product_category_hint=product_category_hint,
                    narration_script=narration_script or "",
                )
            )
            if cinematic_architecture_enabled and narrated_avatar_run and seedance_prompt:
                prompt_profile = _avatar_product_prompt_profile(seedance_prompt)
                logger.info("avatar_product_prompt_profile", extra={"video_id": video_id, "model_key": "seedance_v1_lite_reference", **prompt_profile})
                _merge_pipeline_metadata(video_id=video_id, avatar_product_prompt_profile=prompt_profile)

            if seedance_prompt:
                constrained = enforce_avatar_pose_constraints(seedance_prompt)
                if constrained != seedance_prompt:
                    logger.info("avatar_product_seedance_pose_constraints_applied", extra={"video_id": video_id})
                seedance_prompt = constrained
                seedance_prompt, _ = _enforce_kling_prompt_max_length(seedance_prompt, max_length=2600)

            kling_video_url, kling_meta = fal_service.generate_seedance_lite_reference_video(
                prompt=seedance_prompt,
                reference_image_urls=[url for url in [avatar_image_url, product_image_url] if url],
                aspect_ratio="9:16",
                resolution="720p",
                duration=kling_duration,
                camera_fixed=False,
            )
        elif resolved_video_model_key == "fal_ltx23_i2v":
            ltx_prompt = (
                cinematic_compiled_prompt
                if cinematic_architecture_enabled and cinematic_compiled_prompt
                else _build_avatar_product_seedance_lite_prompt(
                    base_prompt=kling_prompt,
                    product_category_hint=product_category_hint,
                    narration_script=narration_script or "",
                )
            )
            if cinematic_architecture_enabled and narrated_avatar_run and ltx_prompt:
                prompt_profile = _avatar_product_prompt_profile(ltx_prompt)
                logger.info("avatar_product_prompt_profile", extra={"video_id": video_id, "model_key": "fal_ltx23_i2v", **prompt_profile})
                _merge_pipeline_metadata(video_id=video_id, avatar_product_prompt_profile=prompt_profile)

            if ltx_prompt:
                constrained = enforce_avatar_pose_constraints(ltx_prompt)
                if constrained != ltx_prompt:
                    logger.info("avatar_product_ltx_pose_constraints_applied", extra={"video_id": video_id})
                ltx_prompt = constrained

            kling_video_url, kling_meta = fal_service.generate(
                model_key="fal_ltx23_i2v",
                prompt=ltx_prompt,
                aspect_ratio="9:16",
                resolution="1080p",
                duration_seconds=requested_duration,
                image_url=avatar_image_url,
                generate_audio=False,
                request_context={
                    "recipe_id": recipe.id,
                    "video_id": video_id,
                    "avatar_product_model_lane": "ltx_experimental",
                    "avatar_product_source_avatar_image_url": avatar_image_url,
                    "avatar_product_source_product_image_url": product_image_url,
                },
            )
        else:
            provider_prompt = (
                cinematic_compiled_prompt
                if cinematic_architecture_enabled and cinematic_compiled_prompt
                else kling_prompt
            )
            if cinematic_architecture_enabled and narrated_avatar_run and provider_prompt:
                prompt_profile = _avatar_product_prompt_profile(provider_prompt)
                logger.info("avatar_product_prompt_profile", extra={"video_id": video_id, "model_key": resolved_video_model_key, **prompt_profile})
                _merge_pipeline_metadata(video_id=video_id, avatar_product_prompt_profile=prompt_profile)

            if provider_prompt:
                constrained_prompt = enforce_avatar_pose_constraints(provider_prompt)
                if constrained_prompt != provider_prompt:
                    logger.info(
                        "avatar_product_kling_pose_constraints_applied",
                        extra={
                            "video_id": video_id,
                            "recipe_id": recipe.id,
                            "model_key": resolved_video_model_key,
                        },
                    )
                provider_prompt = constrained_prompt

                provider_prompt, clip_meta = _enforce_kling_prompt_max_length(provider_prompt)
                if clip_meta.get("clipped"):
                    logger.warning(
                        "avatar_product_kling_prompt_clipped",
                        extra={
                            "video_id": video_id,
                            "recipe_id": recipe.id,
                            "model_key": resolved_video_model_key,
                            **clip_meta,
                        },
                    )
                    _merge_pipeline_metadata(
                        video_id=video_id,
                        avatar_product_kling_prompt_clipped=True,
                        avatar_product_kling_prompt_clip_metadata=clip_meta,
                    )
            kling_video_url, kling_meta = fal_service.generate_kling_reference_video(
                prompt=provider_prompt,
                image_urls=[url for url in [avatar_image_url, product_image_url] if url],
                aspect_ratio="9:16",
                duration=kling_duration,
                model_key=resolved_video_model_key,
            )

        base_video_duration_seconds = _probe_media_duration_seconds(kling_video_url)

        resolved_gemini_voice = resolve_avatar_product_gemini_voice(
            voice_key=str((selected_persona or {}).get("default_voice_id") or effective_voice or "").strip() or None,
            gender=(selected_persona or {}).get("gender"),
        )
        resolved_gemini_language = resolve_avatar_product_gemini_language(effective_language)

        narration_script, script_is_timebounded = _rewrite_avatar_product_script_for_quality(
            narration_script or "",
            avatar_product_brief=avatar_product_brief,
            duration_seconds=requested_duration,
            language=resolved_gemini_language,
        )

        translated_narration_script, translation_applied = _translate_avatar_product_narration_if_needed(
            narration_script or "",
            target_language=resolved_gemini_language,
        )
        if translation_applied:
            logger.info(
                "avatar_product_tts_script_translated",
                extra={
                    "video_id": video_id,
                    "requested_language": effective_language,
                    "resolved_gemini_language": resolved_gemini_language,
                    "translated_script": translated_narration_script[:260],
                },
            )
            _merge_pipeline_metadata(
                video_id=video_id,
                avatar_product_tts_translation_applied=True,
                avatar_product_tts_translated_language=resolved_gemini_language,
                avatar_product_tts_translated_script=translated_narration_script,
            )

        original_narration_script_for_tts = str(translated_narration_script or "").strip()

        if script_is_timebounded:
            narration_script = original_narration_script_for_tts
        else:
            narration_script = _cap_spoken_script_for_duration(
                translated_narration_script or "",
                duration_seconds=requested_duration,
                language=resolved_gemini_language,
            )
            narration_script = _polish_avatar_product_script_for_duration(
                narration_script,
                duration_seconds=requested_duration,
                language=resolved_gemini_language,
            )

        _merge_pipeline_metadata(
            video_id=video_id,
            narration_script=narration_script,
            avatar_product_final_tts_script=narration_script,
        )

        if narration_script != original_narration_script_for_tts:
            logger.info(
                "avatar_product_tts_script_capped",
                extra={
                    "video_id": video_id,
                    "requested_duration": requested_duration,
                    "language": effective_language,
                    "original_word_count": len(original_narration_script_for_tts.split()),
                    "final_word_count": len(narration_script.split()),
                    "final_script": narration_script,
                },
            )

        logger.info(
            "chitrakala_gemini_tts_started",
            extra={
                "video_id": video_id,
                "resolved_gemini_voice": resolved_gemini_voice,
                "resolved_gemini_language": resolved_gemini_language,
            },
        )
        audio_url, tts_meta = fal_service.generate_gemini_flash_tts(
            text=narration_script or "",
            voice=resolved_gemini_voice,
            language_code=resolved_gemini_language,
            style_instructions=(
                f"Speak entirely in {resolved_gemini_language}. "
                "Warm Indian creator voice, natural talking-head product ad delivery. "
                "Use clear, slightly slower pacing suitable for lip-sync. "
                "Avoid rushing words, avoid dramatic pauses, and keep delivery friendly and confident. "
                "No English unless the original product or brand name requires it."
            )
        )
        tts_audio_duration_seconds = _probe_media_duration_seconds(audio_url)

        logger.info(
            "avatar_product_lipsync_inputs",
            extra={
                "video_id": video_id,
                "base_video_url": kling_video_url,
                "audio_url": audio_url,
                "resolved_video_model_key": resolved_video_model_key,
                "resolved_gemini_voice": resolved_gemini_voice,
                "resolved_gemini_language": resolved_gemini_language,
                "script_word_count": len((narration_script or "").split()),
                "script_char_count": len(narration_script or ""),
                "requested_duration": requested_duration,
                "base_video_duration_seconds": base_video_duration_seconds,
                "tts_audio_duration_seconds": tts_audio_duration_seconds,
            },
        )

        logger.info("chitrakala_lipsync_started", extra={"video_id": video_id})

        pipeline_local = VideoPipelineService()
        local_base_path = pipeline_local.ensure_local_media_path(kling_video_url)
        if not local_base_path:
            raise RuntimeError("Could not download base video for face-only lipsync preprocessing.")

        face_crop_path_str, face_track = crop_face_for_lipsync(str(local_base_path))
        face_crop_path = Path(face_crop_path_str)
        face_crop_url = _upload_video_asset(
            user_id=user_id,
            video_id=video_id,
            local_path=face_crop_path,
            kind_suffix="lipsync/face_crop",
        )

        lipsynced_face_url, lipsync_meta = fal_service.generate_sync_lipsync_v2(
            video_url=face_crop_url,
            audio_url=audio_url,
        )

        local_lipsynced_face = pipeline_local.ensure_local_media_path(lipsynced_face_url)
        if not local_lipsynced_face:
            raise RuntimeError("Could not download lipsynced face video for compositing.")

        composited_path_str = composite_lipsync_result(
            str(local_base_path),
            str(local_lipsynced_face),
            face_track,
        )
        composited_path = Path(composited_path_str)
        local_audio_path = pipeline_local.ensure_local_media_path(audio_url)
        if not local_audio_path:
            raise RuntimeError("Could not download TTS audio for lipsync composite mux.")

        muxed_path = Path("data/renders") / f"{video_id}_lipsync_composited_muxed.mp4"
        muxed_path = pipeline_local.merge_narration_with_video(
            input_video_path=composited_path,
            output_video_path=muxed_path,
            voice_path=local_audio_path,
            render_id=video_id,
        )

        final_video_url = _upload_video_asset(
            user_id=user_id,
            video_id=video_id,
            local_path=muxed_path,
            kind_suffix="lipsync/final_composited",
        )
        _merge_pipeline_metadata(
            video_id=video_id,
            avatar_product_lipsync_mode="face_only_composite_v1",
            avatar_product_face_track_stats=face_track.get("stats"),
            avatar_product_lipsync_face_crop_url=face_crop_url,
            avatar_product_lipsync_face_result_url=lipsynced_face_url,
        )
        final_lipsync_duration_seconds = _probe_media_duration_seconds(final_video_url)
        duration_diagnostics = _build_avatar_product_duration_diagnostics(
            requested_duration_seconds=requested_duration,
            base_video_duration_seconds=base_video_duration_seconds,
            tts_audio_duration_seconds=tts_audio_duration_seconds,
            final_lipsync_duration_seconds=final_lipsync_duration_seconds,
            resolved_video_model_key=resolved_video_model_key,
        )
        duration_drift_seconds = duration_diagnostics["duration_drift_seconds"]
        if duration_drift_seconds is not None and abs(duration_drift_seconds) >= 0.75:
            logger.warning(
                "avatar_product_duration_drift_detected",
                extra={"video_id": video_id, **duration_diagnostics},
            )

        _merge_pipeline_metadata(
            video_id=video_id,
            pipeline_version="avatar_product_single_shot_v1",
            avatar_product_single_output=True,
            cinematic_architecture_enabled=cinematic_architecture_enabled,
            avatar_product_audio_strategy="tts_then_sync_lipsync",
            avatar_product_speaking_frame_safety_enabled=speaking_frame_safety_enabled,
            avatar_product_product_face_spacing_strategy=product_face_spacing_strategy,
            avatar_product_framing_priority=avatar_product_framing_priority,
            avatar_product_product_category_hint=product_category_hint,
            avatar_product_ugc_variant=ugc_variant,
            avatar_product_category_preservation_rules=category_preservation_rules,
            avatar_product_hero_reveal_timing="Hero reveal should happen between second 1 and second 3, with product held steady after reveal.",
            avatar_product_kling_prompt=kling_prompt,
            avatar_product_kling_video_url=kling_video_url,
            avatar_product_base_video_model=resolved_video_model_key,
            avatar_product_requested_duration_seconds=requested_duration,
            avatar_product_base_video_duration_seconds=base_video_duration_seconds,
            avatar_product_affordable_lane=resolved_video_model_key == "seedance_v1_lite_reference",
            avatar_product_seedance_prompt=seedance_prompt,
            avatar_product_tts_audio_url=audio_url,
            avatar_product_tts_voice=resolved_gemini_voice,
            avatar_product_tts_language=resolved_gemini_language,
            avatar_product_tts_audio_duration_seconds=tts_audio_duration_seconds,
            avatar_product_lipsync_video_url=final_video_url,
            avatar_product_final_lipsync_duration_seconds=final_lipsync_duration_seconds,
            avatar_product_duration_drift_seconds=duration_drift_seconds,
            avatar_product_lipsync_inputs={
                "base_video_url": kling_video_url,
                "audio_url": audio_url,
                "resolved_video_model_key": resolved_video_model_key,
                "resolved_gemini_voice": resolved_gemini_voice,
                "resolved_gemini_language": resolved_gemini_language,
                "script_word_count": len((narration_script or "").split()),
                "script_char_count": len(narration_script or ""),
                "requested_duration": requested_duration,
                **duration_diagnostics,
            },
            avatar_product_kling_meta=kling_meta,
            avatar_product_tts_meta=tts_meta,
            avatar_product_lipsync_meta=lipsync_meta,
            completion_notification={
                "title": "Your avatar product ad is ready.",
                "message": "Your avatar product ad is ready.",
            },
        )
        if cinematic_architecture_enabled and cinematic_spec and cinematic_compiler_metadata and cinematic_compiled_prompt:
            _merge_pipeline_metadata(
                video_id=video_id,
                cinematic_framework="STAR-C",
                recipe_family="ugc_avatar_product",
                recipe_version="v2",
                cinematic_spec=cinematic_spec.to_dict(),
                cinematic_compiler_metadata=cinematic_compiler_metadata,
                cinematic_compiled_prompt=cinematic_compiled_prompt,
            )

        _persist_final_video(
            video_id=video_id,
            user_id=user_id,
            video_url=final_video_url,
            metadata={
                "recipe_id": recipe.id,
                "pipeline_version": "avatar_product_single_shot_v1",
                "render_mode": "single_ad",
                "final_video_url": final_video_url,
                "kling_video_url": kling_video_url,
                "tts_audio_url": audio_url,
            },
        )

        _append_pipeline_event(
            video_id=video_id,
            kind="avatar_product_completed",
            title="Avatar product ad ready",
            detail="Your avatar product ad is ready.",
        )

        return RecipePipelineResult(
            provider="fal",
            model_key=f"{resolved_video_model_key} + fal-ai/gemini-3.1-flash-tts + fal-ai/sync-lipsync/v2",
            video_url=final_video_url,
            metadata={
                "recipe_id": recipe.id,
                "pipeline_version": "avatar_product_single_shot_v1",
                "reference_asset": str(reference),
                "scene_count": 1,
                "narration_script": narration_script,
                "requested_model": requested_video_model_key,
                "resolved_model": resolved_video_model_key,
                "product_category_hint": product_category_hint,
                "ugc_variant": ugc_variant,
                "render_mode": "single_ad",
                "fallback_used": False,
            },
        )


    for index, scene in enumerate(scenes):
        scene_progress = 35 + int((index / total_scenes) * 35)
        if progress_callback:
            progress_callback(scene_progress)

        logger.info(
            "recipe_scene_generation_started",
            extra={
                "video_id": video_id,
                "recipe_id": recipe.id,
                "scene_id": scene["scene_id"],
                "duration_seconds": scene["duration_seconds"],
                "model_key": recipe.generation_defaults.model_key,
            },
        )
        _append_pipeline_event(
            video_id=video_id,
            kind="scene_started",
            title=f'Generating {scene["scene_id"]}',
            detail=f'Rendering scene {index + 1} of {total_scenes}.',
        )

        scene_inputs = dict(normalized_inputs)
        talking_audio_url: str | None = None
        talking_audio_duration_seconds: float | None = None
        talking_timing_map: list[dict[str, Any]] | None = None
        speaking_segments: list[dict[str, int]] | None = None
        audio_reactive_timeline: list[dict[str, Any]] | None = None
        behavior_timeline: list[dict[str, Any]] | None = None
        talking_voice_path: Path | None = None
        talking_script = ""
        if recipe.id in UGC_AD_RECIPE_IDS and scene.get("render_lane") == "talking_avatar":
            talking_script = str(scene.get("spoken_line") or "").strip() or _extract_ugc_talking_excerpt(narration_script or "")
        if (effective_narration_enabled or avatar_product_requires_voice) and scene.get("render_lane") == "talking_avatar" and talking_script:
            talking_voice_path, voice_duration, talking_timing_map = _generate_timed_talking_audio(
                pipeline=pipeline,
                render_id=f'{video_id}-{scene["scene_id"]}-talking',
                script=talking_script,
                language_name=effective_language,
                voice_name=(selected_persona or {}).get("default_voice_id") or effective_voice,
                voice_profile=(selected_persona or {}).get("voice_profile"),
                speech_rate=get_settings().avatar_tts_speech_rate,
            )
            if not talking_timing_map:
                talking_timing_map = _fallback_timing_map_for_scene(
                    script=talking_script,
                    duration_seconds=voice_duration,
                )
            scene = _apply_timing_to_ugc_scene(scene, talking_timing_map)
            speaking_segments = TimingSyncService().build_speaking_segments(talking_timing_map)
            behavior_timeline = build_behavior_timeline(talking_timing_map)
            if talking_voice_path and talking_voice_path.exists():
                audio_analysis = AudioAnalysisService()
                audio_reactive_timeline = audio_analysis.analyze_audio_reactivity(
                    audio_path=talking_voice_path,
                    timing_map=talking_timing_map,
                )
                behavior_timeline = audio_analysis.merge_with_behavior(behavior_timeline, audio_reactive_timeline)
            scene = _apply_behavior_to_ugc_scene(scene, behavior_timeline)
            if talking_voice_path and talking_voice_path.exists():
                talking_audio_duration_seconds = float(voice_duration or 0.0) or None
                talking_audio_url = _upload_talking_scene_audio(
                    user_id=user_id,
                    video_id=video_id,
                    scene_id=str(scene["scene_id"]),
                    voice_path=talking_voice_path,
                )
                logger.info(
                    "ugc_talking_scene_audio_prepared",
                    extra={
                        "video_id": video_id,
                        "scene_id": scene.get("scene_id"),
                        "persona_id": (selected_persona or {}).get("persona_id"),
                        "persona_source": (selected_persona or {}).get("persona_source"),
                        "audio_duration_seconds": talking_audio_duration_seconds,
                        "audio_local_path": str(talking_voice_path),
                        "audio_url": talking_audio_url,
                        "timing_segment_count": len(talking_timing_map or []),
                        "audio_reactive_segment_count": len(audio_reactive_timeline or []),
                        "behavior_segment_count": len(behavior_timeline or []),
                    },
                )
        if recipe.id in EXPLAINER_RECIPE_IDS and index < len(scene_beats):
            topic = str(normalized_inputs.get("text") or "").strip()
            narration_context = scene_narration_context[index] if index < len(scene_narration_context) else ""
            scene_inputs["text"] = (
                f'Topic: {_normalize_topic(topic)}. '
                f'Visual objective: {scene_beats[index]}. '
                f'Narration context: {narration_context}'
            ).strip()

        prompt = build_scene_prompt(recipe, scene, reference, scene_inputs)
        if recipe.id == "deep_dive_explainer":
            compiled_scene_prompts.append(
                {
                    "scene_id": scene.get("scene_id"),
                    "stage_name": scene.get("stage_name"),
                    "explainer_family": scene.get("explainer_family"),
                    "explainer_subtopic": scene.get("explainer_subtopic"),
                    "educational_mode": scene.get("educational_mode"),
                    "shot_archetype": scene.get("shot_archetype"),
                    "subtopic_visual_anchor": scene.get("subtopic_visual_anchor"),
                    "qa_flags": scene.get("qa_flags"),
                    "visual_objective": scene.get("visual_objective"),
                    "camera_framing": scene.get("camera_framing"),
                    "motion_intent": scene.get("motion_intent"),
                    "transition_intent": scene.get("transition_intent"),
                    "ending_hold_instruction": scene.get("ending_hold_instruction"),
                    "avoid_guidance": scene.get("sora_negative_guidance"),
                    "compiled_prompt": prompt,
                }
            )
            logger.info(
                "deep_explainer_sora_prompt_compiled",
                extra={
                    "video_id": video_id,
                    "recipe_id": recipe.id,
                    "scene_id": scene.get("scene_id"),
                    "stage_name": scene.get("stage_name"),
                    "explainer_family": scene.get("explainer_family"),
                    "explainer_subtopic": scene.get("explainer_subtopic"),
                    "shot_archetype": scene.get("shot_archetype"),
                    "qa_flags": scene.get("qa_flags"),
                    "camera_framing": scene.get("camera_framing"),
                    "motion_intent": scene.get("motion_intent"),
                    "transition_intent": scene.get("transition_intent"),
                    "ending_hold_instruction": scene.get("ending_hold_instruction"),
                },
            )
        

        elif recipe.id in UGC_AD_RECIPE_IDS:
            compiled_scene_prompts.append(
                {
                    "scene_id": scene.get("scene_id"),
                    "stage_name": scene.get("stage_name"),
                    "ugc_ad_family": scene.get("ugc_ad_family"),
                    "ugc_ad_subtopic": scene.get("ugc_ad_subtopic"),
                    "ugc_mode": scene.get("ugc_mode"),
                    "shot_archetype": scene.get("shot_archetype"),
                    "subtopic_visual_anchor": scene.get("subtopic_visual_anchor"),
                    "qa_flags": scene.get("qa_flags"),
                    "visual_objective": scene.get("visual_objective"),
                    "camera_framing": scene.get("camera_framing"),
                    "motion_intent": scene.get("motion_intent"),
                    "transition_intent": scene.get("transition_intent"),
                    "ending_hold_instruction": scene.get("ending_hold_instruction"),
                    "client_brief_mode": scene.get("client_brief_mode"),
                    "business_name": scene.get("business_name"),
                    "business_category": scene.get("business_category"),
                    "city": scene.get("city"),
                    "locality": scene.get("locality"),
                    "target_audience": scene.get("target_audience"),
                    "key_promise": scene.get("key_promise"),
                    "trust_factor": scene.get("trust_factor"),
                    "offer": scene.get("offer"),
                    "cta": scene.get("cta"),
                    "talking_mode": scene.get("talking_mode"),
                    "render_lane": scene.get("render_lane"),
                    "persona_required": scene.get("persona_required"),
                    "continuity_subject_role": scene.get("continuity_subject_role"),
                    "continuity_subject_label": scene.get("continuity_subject_label"),
                    "continuity_anchor": scene.get("continuity_anchor"),
                    "must_preserve_subject_identity": scene.get("must_preserve_subject_identity"),
                    "must_avoid_new_spokesperson": scene.get("must_avoid_new_spokesperson"),
                    "school_testimonial_mode": scene.get("school_testimonial_mode"),
                    "avoid_guidance": scene.get("sora_negative_guidance"),
                    "compiled_prompt": prompt,
                }
            )
            logger.info(
                "ugc_ad_sora_prompt_compiled",
                extra={
                    "video_id": video_id,
                    "recipe_id": recipe.id,
                    "scene_id": scene.get("scene_id"),
                    "stage_name": scene.get("stage_name"),
                    "ugc_ad_family": scene.get("ugc_ad_family"),
                    "ugc_ad_subtopic": scene.get("ugc_ad_subtopic"),
                    "shot_archetype": scene.get("shot_archetype"),
                    "qa_flags": scene.get("qa_flags"),
                    "talking_mode": scene.get("talking_mode"),
                    "render_lane": scene.get("render_lane"),
                    "continuity_subject_role": scene.get("continuity_subject_role"),
                    "continuity_anchor": scene.get("continuity_anchor"),
                    "must_preserve_subject_identity": scene.get("must_preserve_subject_identity"),
                    "must_avoid_new_spokesperson": scene.get("must_avoid_new_spokesperson"),
                    "school_testimonial_mode": scene.get("school_testimonial_mode"),
                    "camera_framing": scene.get("camera_framing"),
                    "motion_intent": scene.get("motion_intent"),
                    "transition_intent": scene.get("transition_intent"),
                    "ending_hold_instruction": scene.get("ending_hold_instruction"),
                },
            )


        elif recipe.id in LTX_RECIPE_IDS:
            compiled_scene_prompts.append(
                {
                    "scene_id": scene.get("scene_id"),
                    "scene_role": scene.get("scene_role"),
                    "stage_name": scene.get("stage_name"),
                    "duration_seconds": scene.get("duration_seconds"),
                    "story_mode": scene.get("story_mode"),
                    "story_subtopic": scene.get("story_subtopic"),
                    "camera_motion_type": scene.get("camera_motion_type"),
                    "continuity_anchor": scene.get("continuity_anchor"),
                    "continuity_priority": scene.get("continuity_priority"),
                    "negative_guidance": scene.get("negative_guidance"),
                    "compiled_prompt": prompt,
                }
            )
            logger.info(
                "ltx_benchmark_scene_prompt_compiled",
                extra={
                    "video_id": video_id,
                    "recipe_id": recipe.id,
                    "scene_id": scene.get("scene_id"),
                    "scene_role": scene.get("scene_role"),
                    "duration_seconds": scene.get("duration_seconds"),
                    "story_mode": scene.get("story_mode"),
                    "camera_motion_type": scene.get("camera_motion_type"),
                    "continuity_anchor": scene.get("continuity_anchor"),
                },
            )

        clip_prompt = prompt
        if _is_chitrakala_showcase_scene(
            recipe_id=recipe.id,
            initial_pipeline_metadata=initial_pipeline_metadata,
            scene=scene,
        ):
            clip_prompt = _build_chitrakala_showcase_prompt(
                product_name=avatar_product_brief.product_name if avatar_product_brief else (topic or 'the product'),
                showcase_visual_prompt=str(scene.get('showcase_visual_prompt') or '').strip() or None,
                must_show_elements=list(scene.get('must_show_elements') or []),
            )
        if scene.get("render_lane") == "talking_avatar" and not _is_chitrakala_v1(
            recipe_id=recipe.id,
            initial_pipeline_metadata=initial_pipeline_metadata,
        ):
            clip_prompt = _build_ugc_talking_avatar_prompt(
                scene=scene,
                selected_persona=selected_persona,
                behavior_timeline=behavior_timeline,
            )
        if compiled_scene_prompts:
            compiled_scene_prompts[-1]["compiled_prompt"] = clip_prompt

        
        quality_profile = str(normalized_inputs.get("quality_profile") or "standard").lower()

        duration = int(scene.get("duration_seconds") or 5)

        scene_model_key = _smart_model_router(
            scene=scene,
            recipe_id=recipe.id,
            quality_profile=quality_profile,
            is_chitrakala=_is_chitrakala_v1(
                recipe_id=recipe.id,
                initial_pipeline_metadata=initial_pipeline_metadata,
            ),
        )


        # 🚨 COST GUARD: Prevent accidental O3 usage
        if quality_profile != "premium" and scene_model_key == "kling_o3_reference":
            scene_model_key = "kling_v16_standard_elements"


        # 🔥 duration-based override (cost control)
        if duration >= 10:
            if quality_profile == "premium":
                scene_model_key = "kling_o3_reference"
            else:
                scene_model_key = "kling_v16_standard_elements"


        if _is_chitrakala_v1(recipe_id=recipe.id, initial_pipeline_metadata=initial_pipeline_metadata):
            scene_stage = str(scene.get("stage_name") or "").strip().lower()
            logger.info(
                f'chitrakala_scene_{index + 1}_started',
                extra={
                    'video_id': video_id,
                    'scene_id': scene.get('scene_id'),
                    'stage_name': scene_stage,
                    'render_lane': scene.get('render_lane'),
                    'model_key': scene_model_key,
                },
            )



        clip_request = ClipGenerationRequest(
            video_id=f'{video_id}-{scene["scene_id"]}',
            prompt=clip_prompt,
            model_key=scene_model_key,
            aspect_ratio=effective_aspect_ratio,
            resolution=recipe.generation_defaults.resolution,
            duration_seconds=int(scene["duration_seconds"]),
            reference_image_url=(
                reference if scene_model_key != "kling_o3_reference" else None
            ),
            voice=effective_voice,
            language=effective_language,
            captions_enabled=effective_captions_enabled,
            narration_enabled=False,
            render_lane=str(scene.get("render_lane") or "cinematic_broll"),
            persona_id=(selected_persona or {}).get("persona_id") if scene.get("use_locked_persona") else None,
            persona_image_url=(selected_persona or {}).get("image_url") if scene.get("use_locked_persona") else None,
            persona_provider=(selected_persona or {}).get("provider") if scene.get("use_locked_persona") else None,
            persona_avatar_id=(selected_persona or {}).get("provider_avatar_id") if scene.get("use_locked_persona") else None,
            persona_voice_id=(selected_persona or {}).get("provider_voice_id") if scene.get("use_locked_persona") else None,
            voice_provider=(selected_persona or {}).get("voice_provider") if scene.get("use_locked_persona") else None,
            talking_audio_url=talking_audio_url,
            talking_audio_duration_seconds=talking_audio_duration_seconds,
            timing_map=talking_timing_map,
            speaking_segments=speaking_segments,
            audio_reactive_timeline=audio_reactive_timeline,
            talking_behavior_prompt=(selected_persona or {}).get("default_behavior_prompt") if scene.get("use_locked_persona") else None,
            talking_script=talking_script or None,
            metadata={}
        )

        clip_result = None

        # ---------------------------------------
        # 🔁 AUTO RETRY LOGIC
        # ---------------------------------------
        clip_result = None

        for attempt in range(2):
            clip_result = generation.generate_video_clip(clip_request)

            if not _should_retry_scene(clip_result.metadata):
                break

            clip_request = clip_request.copy(update={
                "model_key": "kling_o3_reference",
                "prompt": clip_prompt + "\n\nFix face, hands, identity consistency."
            })


        if recipe.id in LTX_RECIPE_IDS:
            logger.info(
                "ltx_benchmark_scene_render_completed",
                extra={
                    "video_id": video_id,
                    "recipe_id": recipe.id,
                    "scene_id": scene.get("scene_id"),
                    "scene_role": scene.get("scene_role"),
                    "scene_prompt": prompt,
                    "model_used": getattr(clip_result, "model_key", None),
                    "provider_used": getattr(clip_result, "provider", None),
                    "duration_requested": scene.get("duration_seconds"),
                    "output_path": clip_result.video_url,
                },
            )
            clip_meta = dict(getattr(clip_result, "metadata", {}) or {})
            ltx_scene_outputs.append(
                {
                    "scene_id": scene.get("scene_id"),
                    "scene_role": scene.get("scene_role"),
                    "duration_seconds": int(scene.get("duration_seconds") or 0),
                    "provider": getattr(clip_result, "provider", None),
                    "model_key": getattr(clip_result, "model_key", None),
                    "clip_url": clip_result.video_url,
                    "external_job_id": clip_meta.get("external_job_id"),
                    "output_name": clip_meta.get("output_name"),
                    "provider_status_url": clip_meta.get("status_url"),
                    "provider_video_url": clip_meta.get("video_url"),
                }
            )
        if recipe.id in UGC_AD_RECIPE_IDS and str(scene.get("render_lane") or "") == "talking_avatar":
            clip_meta = dict(getattr(clip_result, "metadata", {}) or {})
            if talking_voice_path and talking_voice_path.exists() and talking_audio_duration_seconds:
                ugc_talking_audio_tracks.append(
                    {
                        "scene_id": scene.get("scene_id"),
                        "stage_name": scene.get("stage_name"),
                        "audio_path": str(talking_voice_path),
                        "duration_ms": int(max(1.0, talking_audio_duration_seconds * 1000.0)),
                        "timing_map": talking_timing_map or [],
                        "spoken_line": talking_script,
                    }
                )
            if talking_timing_map:
                ugc_talking_timing_maps.append(
                    {
                        "scene_id": scene.get("scene_id"),
                        "stage_name": scene.get("stage_name"),
                        "timing_map": talking_timing_map,
                        "audio_reactive_timeline": audio_reactive_timeline,
                        "behavior_timeline": behavior_timeline,
                    }
                )
            ugc_talking_scene_debug.append(
                {
                    "scene_id": scene.get("scene_id"),
                    "stage_name": scene.get("stage_name"),
                    "resolved_avatar_source": (selected_persona or {}).get("persona_source"),
                    "resolved_avatar_id": (selected_persona or {}).get("persona_id"),
                    "resolved_avatar_name": (selected_persona or {}).get("name"),
                    "requested_voice": requested_voice,
                    "requested_language": requested_language,
                    "avatar_synced_voice": avatar_synced_voice,
                    "avatar_synced_language": avatar_synced_language,
                    "resolved_talking_voice": (selected_persona or {}).get("default_voice_id") if scene.get("use_locked_persona") else effective_voice,
                    "resolved_talking_language": (selected_persona or {}).get("language_preference") if scene.get("use_locked_persona") else effective_language,
                    "talking_provider": str(getattr(clip_result, "model_key", "") or ""),
                    "talking_provider_label": str(getattr(clip_result, "provider", "") or ""),
                    "talking_request_id": clip_meta.get("request_id"),
                    "talking_fallback_reason": clip_meta.get("talking_avatar_fallback_reason"),
                    "talking_audio_duration_seconds": talking_audio_duration_seconds,
                    "timing_segment_count": len(talking_timing_map or []),
                    "timing_map": talking_timing_map,
                    "speaking_segments": speaking_segments,
                    "audio_reactive_timeline": audio_reactive_timeline,
                    "behavior_timeline": behavior_timeline,
                    "behavior_emotion": scene.get("behavior_emotion"),
                    "behavior_head_motion": scene.get("behavior_head_motion"),
                    "behavior_transition_type": scene.get("behavior_transition_type"),
                    "audio_intensity": scene.get("audio_intensity"),
                    "num_frames": clip_meta.get("num_frames"),
                }
            )

        clip_urls.append(clip_result.video_url)

        if _is_chitrakala_v1(recipe_id=recipe.id, initial_pipeline_metadata=initial_pipeline_metadata):
            logger.info(
                f'chitrakala_scene_{index + 1}_completed',
                extra={
                    'video_id': video_id,
                    'scene_id': scene.get('scene_id'),
                    'stage_name': scene.get('stage_name'),
                    'render_lane': scene.get('render_lane'),
                    'model_key': scene_model_key,
                    'provider': getattr(clip_result, 'provider', None),
                    'video_url': clip_result.video_url,
                },
            )

        scene_done_progress = 35 + int(((index + 1) / total_scenes) * 35)
        if progress_callback:
            progress_callback(scene_done_progress)

        logger.info(
            "recipe_scene_generation_completed",
            extra={
                "video_id": video_id,
                "recipe_id": recipe.id,
                "scene_id": scene["scene_id"],
                "duration_seconds": scene["duration_seconds"],
                "model_key": recipe.generation_defaults.model_key,
                "clip_url": clip_result.video_url,
            },
        )

    if recipe.id in UGC_AD_RECIPE_IDS:
        intro_outro_watchouts: list[dict[str, Any]] = []
        for scene in scenes:
            scene_flags = [str(flag) for flag in (scene.get("qa_flags") or []) if str(flag).strip()]
            focused = [flag for flag in scene_flags if flag in {"intro_abrupt_motion_risk", "outro_resolution_risk"}]
            if not focused:
                continue
            intro_outro_watchouts.append(
                {
                    "scene_id": scene.get("scene_id"),
                    "stage_name": scene.get("stage_name"),
                    "flags": focused,
                }
            )
        merged_scene_timing_map, merged_scene_audio_duration_ms = _merge_scene_timing_maps(ugc_talking_audio_tracks)
        _merge_pipeline_metadata(
            video_id=video_id,
            resolved_avatar_source=(selected_persona or {}).get("persona_source"),
            resolved_avatar_id=(selected_persona or {}).get("persona_id"),
            resolved_avatar_name=(selected_persona or {}).get("name"),
            requested_voice=requested_voice,
            requested_language=requested_language,
            avatar_synced_voice=avatar_synced_voice,
            avatar_synced_language=avatar_synced_language,
            resolved_talking_voice=effective_voice,
            resolved_talking_language=effective_language,
            ugc_talking_scene_debug=ugc_talking_scene_debug,
            timing_map=ugc_talking_timing_maps[0]["timing_map"] if ugc_talking_timing_maps else None,
            ugc_talking_timing_maps=ugc_talking_timing_maps,
            ugc_talking_audio_tracks=ugc_talking_audio_tracks,
            merged_talking_timing_map=merged_scene_timing_map,
            merged_talking_audio_duration_ms=merged_scene_audio_duration_ms,
            audio_reactive_timeline=ugc_talking_timing_maps[0]["audio_reactive_timeline"] if ugc_talking_timing_maps else None,
            behavior_timeline=ugc_talking_timing_maps[0]["behavior_timeline"] if ugc_talking_timing_maps else None,
            ugc_talking_behavior_timelines=ugc_talking_timing_maps,
            script_type="ugc_timed" if ugc_talking_timing_maps else "ugc_raw",
            intro_outro_watchouts=intro_outro_watchouts,
        )

    if progress_callback:
        progress_callback(75)

    stitcher = VideoStitcher()
    if _is_chitrakala_v1(recipe_id=recipe.id, initial_pipeline_metadata=initial_pipeline_metadata):
        logger.info('chitrakala_stitch_started', extra={'video_id': video_id, 'clip_count': len(clip_urls)})
    if recipe.id in LTX_RECIPE_IDS:
        logger.info(
            "ltx_benchmark_stitch_started",
            extra={
                "video_id": video_id,
                "recipe_id": recipe.id,
                "clip_count": len(clip_urls),
            },
        )
    stitched_path = stitcher.stitch_video(
        clips=clip_urls,
        render_id=video_id,
        aspect_ratio=effective_aspect_ratio,
        resolution=recipe.generation_defaults.resolution,
    )

    if progress_callback:
        progress_callback(88)

    logger.info(
        "recipe_video_stitched",
        extra={"video_id": video_id, "recipe_id": recipe.id, "output_path": str(stitched_path)},
    )
    if _is_chitrakala_v1(recipe_id=recipe.id, initial_pipeline_metadata=initial_pipeline_metadata):
        logger.info('chitrakala_stitch_completed', extra={'video_id': video_id, 'output_path': str(stitched_path)})
    if recipe.id in LTX_RECIPE_IDS:
        logger.info(
            "ltx_benchmark_stitch_completed",
            extra={"video_id": video_id, "recipe_id": recipe.id, "output_path": str(stitched_path)},
        )
    _append_pipeline_event(
        video_id=video_id,
        kind="timeline_assembled",
        title="Timeline assembled",
        detail=(
            "All generated ad scenes were stitched into a single mobile-first timeline."
            if recipe.id in UGC_AD_RECIPE_IDS
            else "All three LTX scenes were stitched into a single cinematic timeline."
            if recipe.id in LTX_RECIPE_IDS
            else "All generated clips were stitched into a single timeline."
        ),
    )

    audio_service = RecipeAudioService()
    narration_text = narration_script if recipe.id in EXPLAINER_RECIPE_IDS or recipe.id in UGC_AD_RECIPE_IDS else None
    merged_avatar_narration_path: Path | None = None
    merged_avatar_timing_map: list[dict[str, Any]] | None = None
    if recipe.id == "avatar_product" and ugc_talking_audio_tracks:
        timing_service = TimingSyncService(pause_after_line_ms=0)
        merged_avatar_narration_path = timing_service.merge_audio(
            [
                {
                    "text": str(track.get("spoken_line") or ""),
                    "audio_path": str(track["audio_path"]),
                    "duration_ms": int(track["duration_ms"]),
                }
                for track in ugc_talking_audio_tracks
            ],
            Path("data/renders") / f"{video_id}-merged-avatar-narration.wav",
        )
        merged_avatar_timing_map, merged_audio_duration_ms = _merge_scene_timing_maps(ugc_talking_audio_tracks)
        logger.info(
            "avatar_product_talking_audio_merged",
            extra={
                "video_id": video_id,
                "scene_count": len(ugc_talking_audio_tracks),
                "merged_audio_path": str(merged_avatar_narration_path),
                "merged_timing_segment_count": len(merged_avatar_timing_map),
                "merged_audio_duration_ms": merged_audio_duration_ms,
            },
        )

    final_path = audio_service.add_audio(
        video_path=stitched_path,
        recipe_music=recipe.config.music,
        render_id=video_id,
        narration_path=merged_avatar_narration_path if recipe.id == "avatar_product" and (effective_narration_enabled or avatar_product_requires_voice) else None,
        narration_text=narration_text if effective_narration_enabled and recipe.id != "avatar_product" else None,
        voice=effective_voice,
        voice_profile=(selected_persona or {}).get("voice_profile") if recipe.id in UGC_AD_RECIPE_IDS else None,
        language=effective_language,
        audio_fade_in_seconds=0.12 if recipe.id in UGC_AD_RECIPE_IDS else 0.0,
        audio_fade_out_seconds=0.22 if recipe.id in UGC_AD_RECIPE_IDS else 0.0,
        music_mix_gain=0.06 if recipe.id in UGC_AD_RECIPE_IDS else 0.08,
    )

    if recipe.id == "avatar_product" and effective_captions_enabled:
        caption_output = Path("data/renders") / f"{video_id}-captions.mp4"
        final_path = pipeline.burn_overlays_on_video(
            input_video_path=final_path,
            output_video_path=caption_output,
            title=recipe.catalog.title,
            script=narration_script or "",
            captions_enabled=True,
            caption_style=recipe.generation_defaults.caption_style,
            timing_map=merged_avatar_timing_map,
        )

    if progress_callback:
        progress_callback(92)

    logger.info(
        "recipe_audio_added",
        extra={"video_id": video_id, "recipe_id": recipe.id, "output_path": str(final_path)},
    )
    if _is_chitrakala_v1(recipe_id=recipe.id, initial_pipeline_metadata=initial_pipeline_metadata):
        logger.info('chitrakala_v1_completed', extra={'video_id': video_id, 'output_path': str(final_path)})
        _merge_pipeline_metadata(
            video_id=video_id,
            completion_notification={
                'title': 'Your Chitrakala product ad is ready.',
                'message': 'Your Chitrakala product ad is ready.',
            },
            pipeline_version='chitrakala_v1',
        )
        _append_pipeline_event(
            video_id=video_id,
            kind='chitrakala_completed',
            title='Chitrakala ad ready',
            detail='Your Chitrakala product ad is ready.',
        )
    _append_pipeline_event(
        video_id=video_id,
        kind="audio_added",
        title="Narration and music mixed",
        detail=(
            "Voiceover and BGM were added to the UGC ad timeline."
            if recipe.id in UGC_AD_RECIPE_IDS
            else "No narration or BGM were added; the stitched benchmark montage was finalized as-is."
            if recipe.id in LTX_RECIPE_IDS
            else "Voiceover and BGM were added to the explainer timeline."
        ),
    )

    logger.info(
        "recipe_pipeline_completed",
        extra={
            "video_id": video_id,
            "recipe_id": recipe.id,
            **pipeline.probe_media_streams(final_path),
        },
    )
    _append_pipeline_event(
        video_id=video_id,
        kind="pipeline_completed",
        title="Final render ready",
        detail=(
            "The UGC ad render completed successfully."
            if recipe.id in UGC_AD_RECIPE_IDS
            else "The LTX stitched render completed successfully."
            if recipe.id in LTX_RECIPE_IDS
            else "The explainer render completed successfully."
        ),
    )
    if recipe.id == "deep_dive_explainer":
        _merge_pipeline_metadata(
            video_id=video_id,
            compiled_sora_scene_prompts=compiled_scene_prompts,
        )
    elif recipe.id in UGC_AD_RECIPE_IDS:
        _merge_pipeline_metadata(
            video_id=video_id,
            compiled_sora_scene_prompts=compiled_scene_prompts,
        )
    elif recipe.id in LTX_RECIPE_IDS:
        _merge_pipeline_metadata(
            video_id=video_id,
            compiled_ltx_scene_prompts=compiled_scene_prompts,
            ltx_scene_outputs=ltx_scene_outputs,
            stitched_output_url=f"/static/renders/{Path(final_path).name}",
            stitched_scene_count=len(clip_urls),
        )
    _merge_pipeline_metadata(
        video_id=video_id,
        render_mode="scene_stitch" if recipe.id in LTX_RECIPE_IDS else "multi_shot",
        recipe_label=recipe.catalog.title,
        recipe_duration_seconds=recipe.duration_seconds,
        effective_duration_seconds=sum(int(scene["duration_seconds"]) for scene in scenes),
        scene_count=len(scenes),
        resolved_model=recipe.generation_defaults.model_key,
        fallback_model_used=None,
        fallback_used=False,
    )



    final_url = f"/static/renders/{Path(final_path).name}"

    _persist_final_video(
        video_id=video_id,
        user_id=user_id,
        video_url=final_url,
        metadata={
            "recipe_id": recipe.id,
            "recipe_label": recipe.catalog.title,
            "scene_count": len(scenes),
            "render_mode": "scene_stitch" if recipe.id in LTX_RECIPE_IDS else "multi_shot",
            "final_output_path": str(final_path),
        },
    )

    return RecipePipelineResult(
        provider="recipe_pipeline",
        model_key=recipe.generation_defaults.model_key,
        video_url=final_url,
        metadata={
            "recipe_id": recipe.id,
            "reference_asset": str(reference),
            "scene_count": len(scenes),
            "output_path": str(final_path),
            "narration_script": narration_script,
            "overlay_text": overlay_text,
            "requested_model": recipe.generation_defaults.model_key,
            "resolved_model": recipe.generation_defaults.model_key,
            "multishot": False if recipe.id in LTX_RECIPE_IDS else True,
            "render_mode": "scene_stitch" if recipe.id in LTX_RECIPE_IDS else "multi_shot",
            "recipe_label": recipe.catalog.title,
            "recipe_duration_seconds": recipe.duration_seconds,
            "effective_duration_seconds": sum(int(scene["duration_seconds"]) for scene in scenes),
            "fallback_model_used": None,
            "fallback_used": False,
        },
    )




def _prepare_reference_asset(
    *,
    recipe_id: str,
    inputs: dict[str, Any],
    user_id: str,
    video_id: str,
    strategy: str,
) -> str | None:
    image_url = str(inputs.get("image") or "").strip()
    if not image_url:
        return None

    if strategy == "passthrough":
        return image_url

    if strategy == "stylize":
        service = ImageGenerationService()
        result = service.generate_variation(
            reference_image_url=image_url,
            prompt=f"Create a stylized version for recipe {recipe_id}",
            user_id=user_id,
            request_id=video_id,
        )
        return result.get("image_url") or image_url

    return image_url
