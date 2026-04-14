from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from openai import OpenAI

from app.core.config import get_settings
from app.db.firestore_utils import utcnow
from app.db.repositories.video_repository import VideoRepository
from app.pipeline.prompt_builder import build_scene_prompt
from app.pipeline.scene_planner import (
    UgcAdClientBrief,
    build_deep_explainer_scene_plan,
    build_ugc_ad_scene_plan,
    build_ugc_business_context,
    build_ugc_hook_plan,
    detect_ugc_ad_family,
    is_client_brief_mode,
    normalize_ugc_client_brief,
    plan_scenes,
)
from app.recipes.recipe_registry import EXPLAINER_RECIPE_IDS, UGC_AD_RECIPE_IDS, get_recipe, validate_recipe_inputs
from app.services.audio_service import RecipeAudioService
from app.services.image_generation_service import ImageGenerationService
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
    settings = get_settings()
    normalized_topic = _normalize_topic(topic)
    if settings.openai_api_key:
        try:
            client = OpenAI(api_key=settings.openai_api_key)
            response = client.chat.completions.create(
                model=settings.openai_model,
                temperature=0.45,
                response_format={"type": "json_object"},
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You write short social explainer narration. "
                            "Return valid JSON only with keys: narration_script, scene_beats, overlay_text. "
                            "narration_script must be one smooth spoken explainer script for the requested duration. "
                            "scene_beats must be concise visual guidance, not spoken narration. "
                            "overlay_text must be short on-screen emphasis phrases, not full spoken lines."
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"Topic: {normalized_topic}\n"
                            f"Target duration: {duration_seconds} seconds\n"
                            f"Scene count: {scene_count}\n"
                            f"Recipe id: {recipe_id}\n"
                            f"Explainer style: {explainer_style}\n"
                            "Requirements:\n"
                            "- Make the narration simple, spoken, natural, and educational.\n"
                            "- Avoid hook labels, bullet formatting, cue labels, or planning text.\n"
                            "- Do not write 'Opening shot', 'Scene 1', or anything UI-like.\n"
                            "- Keep scene beats visual and explanatory.\n"
                            "- Keep overlay_text short enough for on-screen emphasis.\n"
                            "- If this is a deep explainer, structure the explanation as: hook, concept introduction, mechanism, concrete example, implication, closing takeaway.\n"
                            "- Each scene beat should have a distinct educational role and visual objective.\n"
                        ),
                    },
                ],
            )
            parsed = json.loads((response.choices[0].message.content or "{}").strip() or "{}")
            narration_script = str(parsed.get("narration_script") or "").strip()
            scene_beats = _normalize_text_lines(parsed.get("scene_beats"), target_count=scene_count)
            overlay_text = _normalize_text_lines(parsed.get("overlay_text"), target_count=min(scene_count, 6))
            if narration_script and scene_beats:
                return ExplainerNarrationPlan(
                    narration_script=narration_script,
                    scene_beats=scene_beats,
                    overlay_text=overlay_text or _build_explainer_overlay_text(normalized_topic, scene_beats, scene_count=scene_count),
                    source_type="openai_explainer_script",
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
    settings = get_settings()
    normalized_topic = _normalize_topic(topic)
    brief = client_brief or UgcAdClientBrief()
    business_context = build_ugc_business_context(brief)
    if settings.openai_api_key:
        try:
            client = OpenAI(api_key=settings.openai_api_key)
            response = client.chat.completions.create(
                model=settings.openai_model,
                temperature=0.65,
                response_format={"type": "json_object"},
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You write high-converting creator-style UGC ad scripts for short-form vertical video. "
                            "Return valid JSON only with keys: narration_script, scene_beats, overlay_text. "
                            "narration_script must sound conversational, benefit-led, and creator-native, not corporate. "
                            "scene_beats must be short visual planning lines, not spoken copy. "
                            "overlay_text must be short on-screen emphasis phrases, not full narration."
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
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
                            "- Make scene beats useful for visual planning.\n"
                            "- Keep overlay_text short and mobile-friendly.\n"
                            "- If client brief mode is on, make the copy clearly about that real business, audience, locality, promise, trust factor, and CTA without sounding like a directory listing.\n"
                        ),
                    },
                ],
            )
            parsed = json.loads((response.choices[0].message.content or "{}").strip() or "{}")
            narration_script = str(parsed.get("narration_script") or "").strip()
            scene_beats = _normalize_text_lines(parsed.get("scene_beats"), target_count=scene_count)
            overlay_text = _normalize_text_lines(parsed.get("overlay_text"), target_count=min(scene_count, 6))
            if narration_script and scene_beats:
                return ExplainerNarrationPlan(
                    narration_script=narration_script,
                    scene_beats=scene_beats,
                    overlay_text=overlay_text or _build_ugc_overlay_text(normalized_topic, scene_beats, scene_count=scene_count),
                    source_type="openai_ugc_ad_script",
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
    progress_callback: Callable[[int], None] | None = None,
) -> RecipePipelineResult:
    recipe = get_recipe(recipe_id)
    normalized_inputs = validate_recipe_inputs(recipe, inputs)
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

    scene_beats: list[str] = []
    narration_script: str | None = None
    overlay_text: list[str] = []
    scene_narration_context: list[str] = []
    deep_explainer_style: str | None = None
    ugc_ad_style: str | None = None
    ugc_client_brief: UgcAdClientBrief | None = None
    ugc_client_brief_mode = False
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
                    aspect_ratio=recipe.generation_defaults.aspect_ratio,
                    resolution=recipe.generation_defaults.resolution,
                    duration_seconds=recipe.duration_seconds,
                    reference_image_url=reference,
                    voice=recipe.generation_defaults.voice,
                    language=recipe.generation_defaults.language,
                    captions_enabled=recipe.generation_defaults.captions_enabled,
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
                        aspect_ratio=recipe.generation_defaults.aspect_ratio,
                        resolution=recipe.generation_defaults.resolution,
                        duration_seconds=int(scene["duration_seconds"]),
                        reference_image_url=reference,
                        voice=recipe.generation_defaults.voice,
                        language=recipe.generation_defaults.language,
                        captions_enabled=recipe.generation_defaults.captions_enabled,
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
                aspect_ratio=recipe.generation_defaults.aspect_ratio,
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
            narration_text=narration_text,
            voice=voice_override or recipe.generation_defaults.voice,
            language=language_override or recipe.generation_defaults.language,
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
    total_scenes = max(len(scenes), 1)
    compiled_scene_prompts: list[dict[str, Any]] = []

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
                    "camera_framing": scene.get("camera_framing"),
                    "motion_intent": scene.get("motion_intent"),
                    "transition_intent": scene.get("transition_intent"),
                    "ending_hold_instruction": scene.get("ending_hold_instruction"),
                },
            )

        clip_result = generation.generate_video_clip(
            ClipGenerationRequest(
                video_id=f'{video_id}-{scene["scene_id"]}',
                prompt=prompt,
                model_key=recipe.generation_defaults.model_key,
                aspect_ratio=recipe.generation_defaults.aspect_ratio,
                resolution=recipe.generation_defaults.resolution,
                duration_seconds=int(scene["duration_seconds"]),
                reference_image_url=reference,
                voice=voice_override or recipe.generation_defaults.voice,
                language=language_override or recipe.generation_defaults.language,
                captions_enabled=recipe.generation_defaults.captions_enabled,
                narration_enabled=False,
                caption_style=recipe.generation_defaults.caption_style,
                metadata={
                    "recipe_id": recipe.id,
                    "scene_id": scene["scene_id"],
                    "scene_index": index,
                    "scene_beats": scene.get("beat_names"),
                },
            )
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

    if progress_callback:
        progress_callback(75)

    stitcher = VideoStitcher()
    stitched_path = stitcher.stitch_video(
        clips=clip_urls,
        render_id=video_id,
        aspect_ratio=recipe.generation_defaults.aspect_ratio,
        resolution=recipe.generation_defaults.resolution,
    )

    if progress_callback:
        progress_callback(88)

    logger.info(
        "recipe_video_stitched",
        extra={"video_id": video_id, "recipe_id": recipe.id, "output_path": str(stitched_path)},
    )
    _append_pipeline_event(
        video_id=video_id,
        kind="timeline_assembled",
        title="Timeline assembled",
        detail=(
            "All generated ad scenes were stitched into a single mobile-first timeline."
            if recipe.id in UGC_AD_RECIPE_IDS
            else "All generated clips were stitched into a single timeline."
        ),
    )

    audio_service = RecipeAudioService()
    narration_text = narration_script if recipe.id in EXPLAINER_RECIPE_IDS or recipe.id in UGC_AD_RECIPE_IDS else None

    final_path = audio_service.add_audio(
        video_path=stitched_path,
        recipe_music=recipe.config.music,
        render_id=video_id,
        narration_text=narration_text,
        voice=voice_override or recipe.generation_defaults.voice,
        language=language_override or recipe.generation_defaults.language,
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
    _merge_pipeline_metadata(
        video_id=video_id,
        render_mode="multi_shot",
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
            "multishot": True,
            "render_mode": "multi_shot",
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
