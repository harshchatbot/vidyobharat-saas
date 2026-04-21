from __future__ import annotations

import json
import logging
import mimetypes
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from app.core.config import get_settings
from app.db.firestore_utils import utcnow
from app.db.repositories.video_repository import VideoRepository
from app.pipeline.prompt_builder import build_scene_prompt
from app.providers.storage import build_storage_provider
from app.pipeline.scene_planner import (
    UgcAdClientBrief,
    build_ltx_freeform_scene_plan,
    build_ltx_cinematic_montage_scene_plan,
    build_deep_explainer_scene_plan,
    build_ugc_ad_scene_plan,
    build_ugc_business_context,
    build_ugc_hook_plan,
    detect_ugc_ad_family,
    is_client_brief_mode,
    normalize_ugc_client_brief,
    plan_scenes,
)
from app.recipes.recipe_registry import EXPLAINER_RECIPE_IDS, LTX_BENCHMARK_RECIPE_IDS, LTX_FREEFORM_RECIPE_IDS, LTX_RECIPE_IDS, UGC_AD_RECIPE_IDS, get_recipe, validate_recipe_inputs
from app.services.avatar_service import AvatarService
from app.services.audio_service import RecipeAudioService
from app.services.influencer_service import InfluencerService
from app.services.image_generation_service import ImageGenerationService
from app.services.llm.base import ScriptPlan
from app.services.llm.qwen_service import QwenService
from app.services.video_generation_service import ClipGenerationRequest, VideoGenerationService
from app.services.video_pipeline import VideoPipelineService
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


def _get_pipeline_metadata(video_id: str) -> dict[str, Any]:
    repo = VideoRepository(None)
    snapshot = repo.collection.document(video_id).get()
    data = snapshot.to_dict() or {}
    return dict(data.get("pipeline_metadata") or data.get("pipelineMetadata") or {})


def _resolve_ugc_persona(*, persona_id: str | None, user_id: str, voice_override: str | None, language_override: str | None) -> dict[str, Any] | None:
    normalized_id = str(persona_id or "").strip()
    if not normalized_id:
        return None

    avatar_service = AvatarService()
    actor = avatar_service.get_actor_record(normalized_id, user_id=user_id)
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
            "default_voice_id": default_voice,
            "language_preference": language_override or (actor.language_tags[0] if actor.language_tags else "en-IN"),
            "default_behavior_prompt": actor.prompt_template or (
                f"friendly Indian creator named {actor.name} speaking naturally to camera, "
                "subtle head movement, natural blinking, calm confident expression, minimal movement"
            ),
            "negative_prompt": actor.negative_prompt,
            "reference_images": actor.reference_images,
            "default_camera_style": "selfie_medium_close",
            "preview_video_url": actor.preview_video_url,
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
            "niche": None,
            "default_voice_id": default_voice,
            "language_preference": language_override or (avatar.language_tags[0] if avatar.language_tags else "en-IN"),
            "default_behavior_prompt": (
                f"friendly Indian creator named {avatar.name} speaking naturally to camera, "
                "subtle head movement, natural blinking, calm confident expression, minimal movement"
            ),
            "default_camera_style": "selfie_medium_close",
            "preview_video_url": None,
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
            "default_voice_id": inferred_voice,
            "language_preference": language_override or "en-IN",
            "default_behavior_prompt": persona.system_prompt_template or ", ".join(part for part in behavior_parts if part),
            "default_camera_style": "selfie_medium_close",
            "preview_video_url": None,
        }

    custom_avatar = avatar_service.get_custom_avatar(normalized_id, user_id)
    if not custom_avatar:
        return None

    inferred_voice = voice_override or custom_avatar.preferred_voice or "Shubh"
    language_preference = language_override or custom_avatar.language_preference or "en-IN"
    label_bits = [bit for bit in [custom_avatar.niche, custom_avatar.style_label] if bit]
    descriptor = ", ".join(label_bits) if label_bits else "custom creator avatar"
    return {
        "persona_id": custom_avatar.id,
        "persona_source": "custom_avatar",
        "name": custom_avatar.name,
        "image_url": custom_avatar.reference_image_url,
        "thumbnail_url": custom_avatar.preview_image_url or custom_avatar.reference_image_url,
        "style_label": custom_avatar.style_label,
        "niche": custom_avatar.niche,
        "default_voice_id": inferred_voice,
        "language_preference": language_preference,
        "default_behavior_prompt": (
            f"{custom_avatar.name} as a {descriptor}, speaking directly to camera, "
            "friendly Indian creator energy, subtle head movement, natural blinking, calm confident expression, minimal movement"
        ),
        "default_camera_style": "selfie_medium_close",
        "preview_video_url": custom_avatar.preview_video_url,
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


def _build_ugc_talking_avatar_prompt(*, scene: dict[str, Any], selected_persona: dict[str, Any] | None) -> str:
    persona_name = str((selected_persona or {}).get("name") or "the selected spokesperson").strip()
    business_name = str(scene.get("business_name") or "").strip()
    business_category = str(scene.get("business_category") or "").strip()
    stage_name = str(scene.get("stage_name") or "talking scene").replace("_", " ").strip()
    topic_focus = str(scene.get("topic_focus") or "").strip()
    cta = str(scene.get("cta") or "").strip()

    context_bits = [bit for bit in [business_name, business_category, topic_focus] if bit]
    context_phrase = ", ".join(context_bits) if context_bits else "local-service UGC ad context"
    closing_phrase = f" with a clean CTA close around {cta}" if cta and stage_name == "cta" else ""
    return (
        f"{persona_name} speaking directly to camera for a {context_phrase}. "
        f"Creator-style vertical talking-head shot for the {stage_name} beat{closing_phrase}. "
        "Natural lip sync, stable identity, subtle head movement, natural blinking, calm confident expression, minimal body movement, clean ending hold."
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


def _build_ugc_ad_beats(topic: str, *, scene_count: int, family: str) -> list[str]:
    topic = _normalize_topic(topic)
    family_map = {
        "testimonial_ugc_ad": [
            f"Open with a personal hook about {topic}.",
            f"Set up the creator's before situation around {topic}.",
            f"Introduce {topic} as what changed things.",
            f"Show a believable use moment or proof for {topic}.",
            f"Land the benefit or payoff from {topic}.",
            f"Close with a direct but natural recommendation for {topic}.",
        ],
        "demo_ugc_ad": [
            f"Hook with fast product visibility for {topic}.",
            f"Clarify the need or use case for {topic}.",
            f"Introduce {topic} clearly on screen.",
            f"Demonstrate how {topic} works in one readable action.",
            f"Show the result after using {topic}.",
            f"Close with a clear creator-style CTA for {topic}.",
        ],
        "offer_hook_ugc_ad": [
            f"Lead with the strongest offer or hook for {topic}.",
            f"Clarify why viewers should care about {topic} right now.",
            f"Show the product or service behind {topic} quickly.",
            f"Use proof or demo to support the {topic} claim.",
            f"Show the main benefit from {topic}.",
            f"Close with an urgency-aware CTA for {topic}.",
        ],
    }
    default = [
        f"Hook viewers with a relatable pain point or desire around {topic}.",
        f"Show the problem or frustration that makes {topic} relevant.",
        f"Introduce {topic} as the solution before attention drops.",
        f"Show a believable demo or proof moment for {topic}.",
        f"Land the user benefit or visible result from {topic}.",
        f"Close with a simple native-feeling CTA for {topic}.",
    ]
    return _normalize_text_lines(family_map.get(family, default), target_count=scene_count)


def _build_ugc_overlay_text(topic: str, scene_beats: list[str], *, scene_count: int) -> list[str]:
    normalized_topic = _normalize_topic(topic)
    defaults = [
        f"{normalized_topic}",
        "The problem",
        "Meet the product",
        "How it works",
        "Why it helps",
        "Try it now",
    ]
    source = scene_beats or defaults
    return [str(item).replace('"', '').strip()[:56] for item in source[: max(1, min(scene_count, 6))]]


def _fallback_ugc_ad_narration(topic: str, *, scene_count: int, family: str) -> ExplainerNarrationPlan:
    normalized_topic = _normalize_topic(topic)
    family_opening = {
        "testimonial_ugc_ad": f"I did not expect {normalized_topic} to make this much difference, but it honestly changed the routine for me.",
        "demo_ugc_ad": f"If you are wondering how {normalized_topic} actually works, here is the easiest way to understand it.",
        "offer_hook_ugc_ad": f"If you were already thinking about {normalized_topic}, this is the part you need to see first.",
    }.get(family, f"If you are dealing with {normalized_topic}, this is the kind of product people wish they found sooner.")
    narration_script = (
        f"{family_opening} "
        f"The problem is usually the same: people want something fast, clear, and reliable without extra hassle. "
        f"This is where {normalized_topic} comes in, because it is designed to solve that specific need in a way that feels simple to use. "
        "Once you see it in action, the benefit becomes obvious and the result feels practical, not exaggerated. "
        "So if that sounds useful to you, this is the kind of thing worth trying now."
    )
    scene_beats = _build_ugc_ad_beats(normalized_topic, scene_count=scene_count, family=family)
    overlay_text = _build_ugc_overlay_text(normalized_topic, scene_beats, scene_count=scene_count)
    return ExplainerNarrationPlan(
        narration_script=narration_script,
        scene_beats=scene_beats,
        overlay_text=overlay_text,
        source_type="fallback_ugc_ad_template",
    )


def _fallback_client_brief_ugc_ad_narration(
    topic: str,
    *,
    scene_count: int,
    family: str,
    client_brief: UgcAdClientBrief,
) -> ExplainerNarrationPlan:
    normalized_topic = _normalize_topic(topic)
    business = client_brief.business_name or client_brief.business_category or client_brief.main_service_or_product or normalized_topic
    location = ", ".join(part for part in (client_brief.locality, client_brief.city) if part)
    audience = client_brief.target_audience or "people nearby"
    pain_point = client_brief.main_pain_point or "the common pain point people keep delaying"
    promise = client_brief.key_promise or "a simpler, more reliable experience"
    trust = client_brief.trust_factor or "a more trustworthy option"
    cta = client_brief.cta or "book your slot"
    locality_note = f" around {location}" if location else ""
    narration_script = (
        f"If you are {audience}{locality_note} and still dealing with {pain_point}, {business} is built around {promise}. "
        f"What makes it stand out is {trust}, so it does not feel like just another generic option. "
        f"You can actually see how {client_brief.main_service_or_product or client_brief.business_category or normalized_topic} fits real daily life, and why the result feels practical. "
        f"So if that sounds relevant to you, {cta}."
    )
    scene_beats = _build_ugc_ad_beats(normalized_topic, scene_count=scene_count, family=family)
    overlay_text = _build_ugc_overlay_text(normalized_topic, scene_beats, scene_count=scene_count)
    return ExplainerNarrationPlan(
        narration_script=narration_script,
        scene_beats=scene_beats,
        overlay_text=overlay_text,
        source_type="fallback_client_brief_ugc_ad_template",
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


def build_ugc_ad_narration_script(
    topic: str,
    *,
    scene_count: int,
    duration_seconds: int,
    ugc_style: str,
    family: str,
    client_brief: UgcAdClientBrief | None = None,
    client_brief_mode: bool = False,
) -> ExplainerNarrationPlan:
    normalized_topic = _normalize_topic(topic)
    brief = client_brief or UgcAdClientBrief()
    business_context = build_ugc_business_context(brief)
    try:
        qwen = QwenService(get_settings())
        result = qwen.complete_structured(
            task_type="ugc_narration",
            schema_model=ScriptPlan,
            system_prompt=(
                "You write high-converting creator-style UGC ad scripts for short-form vertical video. "
                "Return structured output only. "
                "narration_script must sound conversational, benefit-led, and creator-native, not corporate. "
                "scene_items must be short visual planning lines, not spoken copy. "
                "overlay_text must be short on-screen emphasis phrases, not full narration."
            ),
            user_prompt=(
                f"Product or service brief: {normalized_topic}\n"
                f"Target duration: {duration_seconds} seconds\n"
                f"Scene count: {scene_count}\n"
                f"UGC family: {family}\n"
                f"UGC style: {ugc_style}\n"
                f"Client brief mode: {'on' if client_brief_mode else 'off'}\n"
                f"Business identity: {business_context.get('business_identity')}\n"
                f"Location context: {business_context.get('location_context')}\n"
                f"Audience context: {business_context.get('audience_context')}\n"
                f"Promise context: {business_context.get('promise_context')}\n"
                f"Trust context: {business_context.get('trust_context')}\n"
                f"Offer context: {business_context.get('offer_context')}\n"
                f"CTA context: {business_context.get('cta_context')}\n"
                "Requirements:\n"
                "- Write like a modern creator or performance ad copywriter, not a TV commercial.\n"
                "- Use short hook energy, conversational phrasing, product clarity, believable proof, benefit-led language, and a natural CTA.\n"
                "- Avoid stiff corporate wording, abstract brand storytelling, or generic marketing filler.\n"
                "- Keep the structure native to short-form ads: hook, problem or desire, product intro, proof/demo/testimonial, benefit/result, CTA.\n"
                "- Make scene items useful for visual planning.\n"
                "- Keep overlay_text short and mobile-friendly.\n"
                "- If client brief mode is on, make the copy clearly about that real business, audience, locality, promise, trust factor, and CTA without sounding like a directory listing.\n"
            ),
            temperature=0.65,
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
                overlay_text=overlay_text or _build_ugc_overlay_text(normalized_topic, scene_beats, scene_count=scene_count),
                source_type=f"{qwen.provider_name()}_ugc_ad_script",
            )
    except Exception:
        logger.exception("ugc_ad_script_generation_failed", extra={"topic": normalized_topic, "family": family})

    if client_brief_mode:
        return _fallback_client_brief_ugc_ad_narration(normalized_topic, scene_count=scene_count, family=family, client_brief=brief)
    return _fallback_ugc_ad_narration(normalized_topic, scene_count=scene_count, family=family)


def _build_kling_v3_multi_prompt(
    *,
    recipe,
    scenes: list[dict[str, Any]],
    reference: str | None,
    normalized_inputs: dict[str, Any],
    scene_beats: list[str],
    scene_narration_context: list[str],
) -> list[dict[str, Any]]:
    multi_prompt: list[dict[str, Any]] = []
    topic = str(normalized_inputs.get("text") or "").strip()

    for index, scene in enumerate(scenes):
        scene_inputs = dict(normalized_inputs)
        if recipe.id == "time_echo_explainer":
            beat = scene_beats[index] if index < len(scene_beats) else ""
            narration_context = scene_narration_context[index] if index < len(scene_narration_context) else ""
            scene_inputs['text'] = (
                f'Topic: {_normalize_topic(topic)}. '
                f'Visual objective: {beat}. '
                f'Narration context: {narration_context}'
            ).strip()
        elif index < len(scene_beats):
            scene_inputs['text'] = scene_beats[index]

        scene_prompt = build_scene_prompt(recipe, scene, reference, scene_inputs)

        multi_prompt.append(
            {
                "prompt": scene_prompt,
                "duration": str(int(scene.get("duration_seconds") or 5)),
            }
        )

    return multi_prompt


def _join_nonempty_text(parts: list[str]) -> str:
    values = [str(part or "").strip() for part in parts if str(part or "").strip()]
    return " ".join(values).strip()


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
    requested_voice = effective_voice
    requested_language = effective_language
    requested_persona_id = str(initial_pipeline_metadata.get("persona_id") or "").strip() or None
    use_avatar_for_talking_scenes = bool(
        initial_pipeline_metadata.get("use_avatar_for_talking_scenes", bool(requested_persona_id))
    )
    selected_persona = _resolve_ugc_persona(
        persona_id=requested_persona_id,
        user_id=user_id,
        voice_override=effective_voice,
        language_override=effective_language,
    )
    logger.info(
        "ugc_persona_resolution_result",
        extra={
            "video_id": video_id,
            "recipe_id": recipe.id,
            "requested_persona_id": requested_persona_id,
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
        ugc_ad_style = _resolve_ugc_ad_style(recipe, normalized_inputs)
        ugc_client_brief = normalize_ugc_client_brief(topic=topic)
        ugc_client_brief_mode = is_client_brief_mode(ugc_client_brief)
        ugc_business_context = build_ugc_business_context(ugc_client_brief)
        ugc_hook_plan = build_ugc_hook_plan(brief=ugc_client_brief, family=detect_ugc_ad_family(topic=topic, ugc_style=ugc_ad_style or "creator_casual").family) if ugc_client_brief_mode else ""
        ugc_family_detection = detect_ugc_ad_family(topic=topic, ugc_style=ugc_ad_style or "creator_casual")
        narration_plan = build_ugc_ad_narration_script(
            topic,
            scene_count=len(scenes),
            duration_seconds=recipe.duration_seconds,
            ugc_style=ugc_ad_style or "creator_casual",
            family=ugc_family_detection.family,
            client_brief=ugc_client_brief,
            client_brief_mode=ugc_client_brief_mode,
        )
        narration_script = narration_plan.narration_script
        scene_beats = narration_plan.scene_beats
        overlay_text = narration_plan.overlay_text
        scene_narration_context = _split_narration_into_scene_context(narration_script, scene_count=len(scenes))
        scenes = build_ugc_ad_scene_plan(
            recipe=recipe,
            topic=topic,
            scene_beats=scene_beats,
            scene_narration_context=scene_narration_context,
            ugc_style=ugc_ad_style or "creator_casual",
            client_brief=ugc_client_brief,
        )
        if recipe.id == "ugc_ad":
            for scene in scenes:
                if scene.get("persona_required") and (not use_avatar_for_talking_scenes or not selected_persona):
                    scene["qa_flags"] = list(dict.fromkeys([*(scene.get("qa_flags") or []), "missing_persona_on_lip_sync_scene"]))
            requires_locked_persona = any(bool(scene.get("persona_required")) for scene in scenes)
            if requested_persona_id and use_avatar_for_talking_scenes and requires_locked_persona:
                if not selected_persona:
                    _merge_pipeline_metadata(
                        video_id=video_id,
                        selected_persona_resolution_status="failed",
                        selected_persona_error="Selected AI avatar could not be resolved for talking UGC scenes.",
                        requested_persona_id=requested_persona_id,
                    )
                    raise RuntimeError("Selected AI avatar could not be resolved for talking UGC scenes.")
                if not str(selected_persona.get("image_url") or "").strip():
                    _merge_pipeline_metadata(
                        video_id=video_id,
                        selected_persona_resolution_status="failed",
                        selected_persona_error="Selected AI avatar is missing a usable reference image.",
                        requested_persona_id=requested_persona_id,
                        selected_persona=selected_persona,
                    )
                    raise RuntimeError("Selected AI avatar is missing a usable reference image for talking UGC scenes.")
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
            ugc_ad_style=ugc_ad_style,
            ugc_client_brief_mode=ugc_client_brief_mode,
            ugc_ad_family=(scenes[0].get("ugc_ad_family") if scenes else None),
            ugc_ad_subtopic=(scenes[0].get("ugc_ad_subtopic") if scenes else None),
            ugc_ad_mode=(scenes[0].get("ugc_mode") if scenes else None),
            ugc_hook_plan=ugc_hook_plan,
            ugc_business_context=ugc_business_context,
            ugc_client_brief=ugc_client_brief.__dict__ if ugc_client_brief else {},
            selected_persona=selected_persona or {},
            selected_persona_id=(selected_persona or {}).get("persona_id"),
            resolved_avatar_source=(selected_persona or {}).get("persona_source"),
            resolved_avatar_name=(selected_persona or {}).get("name"),
            use_avatar_for_talking_scenes=bool(initial_pipeline_metadata.get("use_avatar_for_talking_scenes", False)),
            requested_voice=requested_voice,
            requested_language=requested_language,
            avatar_synced_voice=avatar_synced_voice,
            avatar_synced_language=avatar_synced_language,
            resolved_talking_voice=effective_voice,
            resolved_talking_language=effective_language,
            ugc_scene_plan=[
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
                }
                for scene in scenes
            ],
        )
        logger.info(
            "ugc_ad_script_resolved",
            extra={
                "video_id": video_id,
                "recipe_id": recipe.id,
                "narration_source_type": narration_plan.source_type,
                "narration_text_length": len(narration_script),
                "dedicated_script_generation": narration_plan.used_dedicated_script,
                "overlay_differs_from_narration": overlay_differs,
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
            detail="A dedicated creator-style UGC ad script was prepared for voiceover.",
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

    # Real multi-shot path for explainer recipes on Kling v3
    if recipe.id in EXPLAINER_RECIPE_IDS and recipe.generation_defaults.model_key == "kling_v3":
        if progress_callback:
            progress_callback(40)

        multi_prompt = _build_kling_v3_multi_prompt(
            recipe=recipe,
            scenes=scenes,
            reference=reference,
            normalized_inputs=normalized_inputs,
            scene_beats=scene_beats,
            scene_narration_context=scene_narration_context,
        )

        topic = str(normalized_inputs.get("text") or "").strip()
        master_prompt = (
            f'Create a {"long-form" if recipe.id == "deep_dive_explainer" else "short"} social-first explainer reel about "{_normalize_topic(topic)}". '
            'Use all shots as one coherent vertical reel with strong continuity, clear cause-and-effect storytelling, '
            'smooth transitions, readable composition, and a memorable final takeaway.'
        )

        logger.info(
            "recipe_multishot_generation_started",
            extra={
                "video_id": video_id,
                "recipe_id": recipe.id,
                "model_key": recipe.generation_defaults.model_key,
                "shot_count": len(multi_prompt),
                "duration_seconds": recipe.duration_seconds,
            },
        )
        _append_pipeline_event(
            video_id=video_id,
            kind="render_started",
            title="Generating explainer shots",
            detail="The pipeline is rendering the multi-shot explainer sequence.",
        )

        rendered_path: Path | None = None
        resolved_model_key = recipe.generation_defaults.model_key
        effective_duration_seconds = recipe.duration_seconds
        fallback_model_used: str | None = None
        effective_scene_count = len(scenes)

        try:
            clip_result = generation.generate_video_clip(
                ClipGenerationRequest(
                    video_id=video_id,
                    prompt=master_prompt,
                    model_key=recipe.generation_defaults.model_key,
                    aspect_ratio=effective_aspect_ratio,
                    resolution=recipe.generation_defaults.resolution,
                    duration_seconds=recipe.duration_seconds,
                    reference_image_url=reference,
                    voice=effective_voice,
                    language=effective_language,
                    captions_enabled=effective_captions_enabled,
                    narration_enabled=False,
                    caption_style=recipe.generation_defaults.caption_style,
                    metadata={
                        "recipe_id": recipe.id,
                        "scene_count": len(scenes),
                        "scene_beats": [scene.get("beat_names") for scene in scenes],
                        "narration_script": narration_script,
                        "overlay_text": overlay_text,
                        "multishot": True,
                        "render_mode": "multi_shot",
                        "recipe_label": recipe.catalog.title,
                        "recipe_duration_seconds": recipe.duration_seconds,
                        "disableModelFallbacks": recipe.id == "deep_dive_explainer",
                    },
                    multi_prompt=multi_prompt,
                )
            )

            if progress_callback:
                progress_callback(82)

            logger.info(
                "recipe_multishot_generation_completed",
                extra={
                    "video_id": video_id,
                    "recipe_id": recipe.id,
                    "model_key": recipe.generation_defaults.model_key,
                    "clip_url": clip_result.video_url,
                },
            )

            rendered_path = pipeline.ensure_local_media_path(clip_result.video_url)
            if not rendered_path:
                raise RuntimeError("Could not materialize multi-shot output locally for final audio assembly.")
        except Exception as exc:
            if recipe.id != "deep_dive_explainer":
                raise

            logger.warning(
                "recipe_multishot_primary_failed",
                extra={
                    "video_id": video_id,
                    "recipe_id": recipe.id,
                    "requested_model": recipe.generation_defaults.model_key,
                    "error": str(exc),
                },
            )
            _append_pipeline_event(
                video_id=video_id,
                kind="provider_fallback",
                title="Switching to Sora fallback",
                detail="Kling output was unavailable, so the pipeline is rebuilding the long explainer with Sora-safe 8 second scenes.",
            )

            sora_scenes, sora_scene_beats, sora_scene_context, effective_duration_seconds = _build_long_explainer_sora_fallback_plan(
                scene_beats=scene_beats,
                scene_narration_context=scene_narration_context,
            )
            clip_urls: list[str] = []
            total_fallback_scenes = max(len(sora_scenes), 1)
            resolved_model_key = "sora2"
            fallback_model_used = "sora2"
            effective_scene_count = len(sora_scenes)

            for index, scene in enumerate(sora_scenes):
                scene_progress = 40 + int((index / total_fallback_scenes) * 38)
                if progress_callback:
                    progress_callback(scene_progress)

                scene_inputs = dict(normalized_inputs)
                topic = str(normalized_inputs.get("text") or "").strip()
                beat = sora_scene_beats[index] if index < len(sora_scene_beats) else ""
                narration_context = sora_scene_context[index] if index < len(sora_scene_context) else ""
                scene_inputs["text"] = (
                    f'Topic: {_normalize_topic(topic)}. '
                    f'Visual objective: {beat}. '
                    f'Narration context: {narration_context}'
                ).strip()

                prompt = build_scene_prompt(recipe, scene, reference, scene_inputs)
                clip_result = generation.generate_video_clip(
                    ClipGenerationRequest(
                        video_id=f'{video_id}-{scene["scene_id"]}',
                        prompt=prompt,
                        model_key="sora2",
                        aspect_ratio=effective_aspect_ratio,
                        resolution=recipe.generation_defaults.resolution,
                        duration_seconds=int(scene["duration_seconds"]),
                        reference_image_url=reference,
                        voice=effective_voice,
                        language=effective_language,
                        captions_enabled=effective_captions_enabled,
                        narration_enabled=False,
                        caption_style=recipe.generation_defaults.caption_style,
                        metadata={
                            "recipe_id": recipe.id,
                            "scene_id": scene["scene_id"],
                            "scene_index": index,
                            "scene_beats": scene.get("beat_names"),
                            "render_mode": "multi_shot",
                            "recipe_label": recipe.catalog.title,
                            "recipe_duration_seconds": recipe.duration_seconds,
                            "effective_duration_seconds": effective_duration_seconds,
                            "fallback_model_used": "sora2",
                            "fallback_from_model": recipe.generation_defaults.model_key,
                        },
                    )
                )
                clip_urls.append(clip_result.video_url)

            stitcher = VideoStitcher()
            rendered_path = stitcher.stitch_video(
                clips=clip_urls,
                render_id=video_id,
                aspect_ratio=effective_aspect_ratio,
                resolution=recipe.generation_defaults.resolution,
            )

            logger.info(
                "recipe_multishot_fallback_completed",
                extra={
                    "video_id": video_id,
                    "recipe_id": recipe.id,
                    "resolved_model": resolved_model_key,
                    "effective_duration_seconds": effective_duration_seconds,
                    "clip_count": len(clip_urls),
                },
            )
            _append_pipeline_event(
                video_id=video_id,
                kind="timeline_assembled",
                title="Sora fallback timeline assembled",
                detail="Sora-safe long scenes were generated and stitched into one explainer timeline.",
            )

        if not rendered_path:
            raise RuntimeError("Could not materialize multi-shot output locally for final audio assembly.")

        if progress_callback:
            progress_callback(88)

        audio_service = RecipeAudioService()
        narration_text = narration_script or None

        final_path = audio_service.add_audio(
            video_path=rendered_path,
            recipe_music=recipe.config.music,
            render_id=video_id,
            narration_text=narration_text if effective_narration_enabled else None,
            voice=effective_voice,
            language=effective_language,
        )

        if progress_callback:
            progress_callback(92)

        logger.info(
            "recipe_audio_added",
            extra={"video_id": video_id, "recipe_id": recipe.id, "output_path": str(final_path)},
        )
        _append_pipeline_event(
            video_id=video_id,
            kind="audio_added",
            title="Narration and music mixed",
            detail="The render now includes the selected narration voice and explainer underscore.",
        )

        logger.info(
            "recipe_pipeline_completed",
            extra={
                "video_id": video_id,
                "recipe_id": recipe.id,
                "resolved_model": resolved_model_key,
                "fallback_model_used": fallback_model_used,
                "effective_duration_seconds": effective_duration_seconds,
                **pipeline.probe_media_streams(final_path),
            },
        )
        _merge_pipeline_metadata(
            video_id=video_id,
            render_mode="multi_shot",
            recipe_label=recipe.catalog.title,
            recipe_duration_seconds=recipe.duration_seconds,
            effective_duration_seconds=effective_duration_seconds,
            scene_count=effective_scene_count,
            resolved_model=resolved_model_key,
            fallback_model_used=fallback_model_used,
            fallback_used=bool(fallback_model_used),
        )
        _append_pipeline_event(
            video_id=video_id,
            kind="pipeline_completed",
            title="Final render ready",
            detail="The explainer video has been stitched, voiced, and finalized.",
        )

        return RecipePipelineResult(
            provider="recipe_pipeline",
            model_key=recipe.generation_defaults.model_key,
            video_url=f"/static/renders/{Path(final_path).name}",
            metadata={
                "recipe_id": recipe.id,
                "reference_asset": str(reference),
                "scene_count": effective_scene_count,
                "output_path": str(final_path),
                "narration_script": narration_script,
                "overlay_text": overlay_text,
                "requested_model": recipe.generation_defaults.model_key,
                "resolved_model": resolved_model_key,
                "multishot": True,
                "render_mode": "multi_shot",
                "recipe_label": recipe.catalog.title,
                "recipe_duration_seconds": recipe.duration_seconds,
                "effective_duration_seconds": effective_duration_seconds,
                "fallback_model_used": fallback_model_used,
                "fallback_used": bool(fallback_model_used),
            },
        )

    # Default old path for all other recipes
    clip_urls: list[str] = []
    ltx_scene_outputs: list[dict[str, Any]] = []
    total_scenes = max(len(scenes), 1)
    compiled_scene_prompts: list[dict[str, Any]] = []
    ugc_talking_scene_debug: list[dict[str, Any]] = []

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
        if recipe.id in EXPLAINER_RECIPE_IDS and index < len(scene_beats):
            topic = str(normalized_inputs.get("text") or "").strip()
            narration_context = scene_narration_context[index] if index < len(scene_narration_context) else ""
            scene_inputs["text"] = (
                f'Topic: {_normalize_topic(topic)}. '
                f'Visual objective: {scene_beats[index]}. '
                f'Narration context: {narration_context}'
            ).strip()
        elif recipe.id in UGC_AD_RECIPE_IDS and index < len(scene_beats):
            topic = str(normalized_inputs.get("text") or "").strip()
            narration_context = scene_narration_context[index] if index < len(scene_narration_context) else ""
            scene_inputs["text"] = (
                f'Product or service brief: {_normalize_topic(topic)}. '
                f'Ad objective: {scene_beats[index]}. '
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
                    "hook_plan": scene.get("hook_plan"),
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

        talking_audio_url: str | None = None
        talking_audio_duration_seconds: float | None = None
        if effective_narration_enabled and scene.get("render_lane") == "talking_avatar":
            talking_script = str(scene.get("local_narration_context") or scene.get("beat_summary") or "").strip()
            if talking_script:
                voice_path, voice_duration, _ = pipeline.generate_narration_track(
                    render_id=f'{video_id}-{scene["scene_id"]}-talking',
                    script=talking_script,
                    language_name=effective_language,
                    voice_name=(selected_persona or {}).get("default_voice_id") or effective_voice,
                    audio_sample_rate_hz=22050,
                    speech_rate=get_settings().avatar_tts_speech_rate,
                )
                if voice_path and voice_path.exists():
                    talking_audio_duration_seconds = float(voice_duration or 0.0) or None
                    talking_audio_url = _upload_talking_scene_audio(
                        user_id=user_id,
                        video_id=video_id,
                        scene_id=str(scene["scene_id"]),
                        voice_path=voice_path,
                    )
                    logger.info(
                        "ugc_talking_scene_audio_prepared",
                        extra={
                            "video_id": video_id,
                            "scene_id": scene.get("scene_id"),
                            "persona_id": (selected_persona or {}).get("persona_id"),
                            "persona_source": (selected_persona or {}).get("persona_source"),
                            "audio_duration_seconds": talking_audio_duration_seconds,
                            "audio_url": talking_audio_url,
                        },
                    )

        clip_prompt = prompt
        if scene.get("render_lane") == "talking_avatar":
            clip_prompt = _build_ugc_talking_avatar_prompt(scene=scene, selected_persona=selected_persona)

        clip_result = generation.generate_video_clip(
            ClipGenerationRequest(
                video_id=f'{video_id}-{scene["scene_id"]}',
                prompt=clip_prompt,
                model_key=recipe.generation_defaults.model_key,
                aspect_ratio=effective_aspect_ratio,
                resolution=recipe.generation_defaults.resolution,
                duration_seconds=int(scene["duration_seconds"]),
                reference_image_url=reference,
                voice=effective_voice,
                language=effective_language,
                captions_enabled=effective_captions_enabled,
                narration_enabled=False,
                caption_style=recipe.generation_defaults.caption_style,
                render_lane=str(scene.get("render_lane") or "cinematic_broll"),
                persona_id=(selected_persona or {}).get("persona_id") if scene.get("use_locked_persona") else None,
                persona_image_url=(selected_persona or {}).get("image_url") if scene.get("use_locked_persona") else None,
                talking_audio_url=talking_audio_url,
                talking_audio_duration_seconds=talking_audio_duration_seconds,
                talking_behavior_prompt=(selected_persona or {}).get("default_behavior_prompt") if scene.get("use_locked_persona") else None,
                talking_script=str(scene.get("local_narration_context") or scene.get("beat_summary") or "").strip() or None,
                metadata={
                    "recipe_id": recipe.id,
                    "scene_id": scene["scene_id"],
                    "scene_index": index,
                    "scene_beats": scene.get("beat_names"),
                    "scene_role": scene.get("scene_role"),
                    "talking_mode": scene.get("talking_mode"),
                    "render_lane": scene.get("render_lane"),
                    "persona_required": scene.get("persona_required"),
                    "generator_model_family": scene.get("generator_model_family"),
                    "render_mode": scene.get("render_mode"),
                    "continuity_priority": scene.get("continuity_priority"),
                    "stitch_safe_ending": scene.get("stitch_safe_ending"),
                    "selected_persona_id": (selected_persona or {}).get("persona_id") if scene.get("use_locked_persona") else None,
                    "selected_persona_source": (selected_persona or {}).get("persona_source") if scene.get("use_locked_persona") else None,
                    "talking_audio_duration_seconds": talking_audio_duration_seconds,
                    "requested_voice": requested_voice,
                    "requested_language": requested_language,
                    "avatar_synced_voice": avatar_synced_voice,
                    "avatar_synced_language": avatar_synced_language,
                    "resolved_talking_voice": (selected_persona or {}).get("default_voice_id") if scene.get("use_locked_persona") else effective_voice,
                    "resolved_talking_language": (selected_persona or {}).get("language_preference") if scene.get("use_locked_persona") else effective_language,
                    "require_talking_avatar": bool(
                        requested_persona_id
                        and use_avatar_for_talking_scenes
                        and scene.get("use_locked_persona")
                    ),
                },
            )
        )
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
                    "talking_fallback_reason": clip_meta.get("talking_avatar_fallback_reason"),
                    "talking_audio_duration_seconds": talking_audio_duration_seconds,
                    "num_frames": clip_meta.get("num_frames"),
                }
            )

        clip_urls.append(clip_result.video_url)

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
            intro_outro_watchouts=intro_outro_watchouts,
        )

    if progress_callback:
        progress_callback(75)

    stitcher = VideoStitcher()
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

    final_path = audio_service.add_audio(
        video_path=stitched_path,
        recipe_music=recipe.config.music,
        render_id=video_id,
        narration_text=narration_text if effective_narration_enabled else None,
        voice=effective_voice,
        language=effective_language,
        audio_fade_in_seconds=0.12 if recipe.id in UGC_AD_RECIPE_IDS else 0.0,
        audio_fade_out_seconds=0.22 if recipe.id in UGC_AD_RECIPE_IDS else 0.0,
        music_mix_gain=0.06 if recipe.id in UGC_AD_RECIPE_IDS else 0.08,
    )

    if progress_callback:
        progress_callback(92)

    logger.info(
        "recipe_audio_added",
        extra={"video_id": video_id, "recipe_id": recipe.id, "output_path": str(final_path)},
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

    return RecipePipelineResult(
        provider="recipe_pipeline",
        model_key=recipe.generation_defaults.model_key,
        video_url=f"/static/renders/{Path(final_path).name}",
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
