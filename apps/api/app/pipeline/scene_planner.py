from __future__ import annotations

from dataclasses import dataclass, field
import re
from typing import Any

from app.recipes.recipe_registry import RecipeConfig


@dataclass(frozen=True)
class ExplainerFamilyDetection:
    family: str
    subtopic: str
    educational_mode: str


@dataclass(frozen=True)
class UgcAdFamilyDetection:
    family: str
    subtopic: str
    ugc_mode: str


@dataclass(frozen=True)
class UgcAdClientBrief:
    business_name: str = ""
    business_category: str = ""
    city: str = ""
    locality: str = ""
    address_hint: str = ""
    area_landmark: str = ""
    target_audience: str = ""
    main_service_or_product: str = ""
    main_pain_point: str = ""
    key_promise: str = ""
    trust_factor: str = ""
    offer: str = ""
    cta: str = ""
    tone: str = ""
    ad_goal: str = ""
    brand_colors: str = ""
    website_or_booking_target: str = ""
    phone_or_contact_cta: str = ""
    price_point: str = ""
    creator_gender_preference: str = ""
    language_preference: str = ""


@dataclass(frozen=True)
class AvatarProductBrief:
    avatar_name: str = ""
    product_name: str = ""
    brand_name: str = ""
    product_category: str = ""
    product_subcategory: str = ""
    campaign_objective: str = ""
    platform: str = ""
    duration_seconds: int = 15
    language: str = "English"
    target_audience: str = ""
    audience_age_range: str = ""
    audience_lifestyle: str = ""
    key_promise: str = ""
    secondary_benefit: str = ""
    pain_point: str = ""
    desired_feeling: str = ""
    brand_tone: str = ""
    avatar_id: str = ""
    avatar_style: str = ""
    voice_style: str = ""
    cta: str = ""
    cta_preference: str = ""
    tagline: str = ""
    offer_text: str = ""
    product_image_uploaded: bool = False
    product_image_count: int = 0
    logo_uploaded: bool = False
    reference_ad_links: list[str] = field(default_factory=list)
    must_show_elements: list[str] = field(default_factory=list)
    must_avoid_elements: list[str] = field(default_factory=list)
    compliance_notes: str = ""
    claims_to_avoid: list[str] = field(default_factory=list)
    category_specific_details: str = ""
    script_mode: str = "auto_generate"
    provided_script: str = ""
    strict_script_lock: bool = False
    script_modified: bool = False
    original_script: str = ""
    final_script: str = ""
    music_vibe: str = ""
    category_confidence: str = "low"


@dataclass(frozen=True)
class LtxStoryDetection:
    mode: str
    subtopic: str


def plan_scenes(recipe: RecipeConfig) -> list[dict[str, Any]]:
    return [
        {
            'scene_id': scene.scene_id,
            'beat_names': list(scene.beat_names),
            'duration_seconds': int(scene.duration_seconds),
            'index': index,
        }
        for index, scene in enumerate(recipe.scene_strategy.render_scenes)
    ]


def build_ltx_cinematic_montage_scene_plan(*, recipe: RecipeConfig) -> list[dict[str, Any]]:
    continuity_anchor = (
        "same woman, same cream sweater, same dark jeans, same rainy cafe, same late afternoon lighting"
    )
    scene_blueprint: tuple[dict[str, str | int], ...] = (
        {
            "stage_name": "establish",
            "stage_label": "Establish",
            "scene_type": "environment_establishing",
            "scene_role": "establish",
            "topic_focus": "rainy cafe atmosphere, same subject continuity, and quiet emotional introduction",
            "visual_objective": "Establish the same woman in the same rainy cafe, then move closer enough to introduce her emotional presence without breaking continuity.",
            "subject_description": "the same woman in a cream sweater and dark jeans, first readable in a medium-wide composition and then subtly more intimate near the same rain-speckled window",
            "environment_description": "a warm modern cafe in the late afternoon with a large rain-speckled window, subtle reflections, polished wood, calm intimate atmosphere, and continuity-safe lighting",
            "camera_framing": "begin in a medium-wide composition and settle into a medium portrait while keeping the woman and rain-speckled window clearly visible",
            "motion_intent": "slow subtle push inward with calm controlled motion as the woman looks outside and slightly acknowledges the camera",
            "transition_intent": "open gently, establish the same person and place, and hand off into a tighter continuity-safe scene",
            "ending_hold_instruction": "resolve softly into a stable medium portrait beat for clean stitching",
            "camera_motion_type": "slow_push_in",
        },
        {
            "stage_name": "hero_detail_main_proof",
            "stage_label": "Hero / Detail / Main Proof",
            "scene_type": "hero_detail_proof",
            "scene_role": "hero_detail_main_proof",
            "topic_focus": "same subject hero continuity, tactile detail texture, and subtle motion variation in the same cafe world",
            "visual_objective": "Blend a stronger hero portrait with tactile cafe detail and one elegant side-angle motion beat while preserving the same woman, wardrobe, lighting, and emotional tone.",
            "subject_description": "the same woman beside the same rain-speckled window, same wardrobe and hair, with detail emphasis on sweater sleeve texture, hand near a ceramic coffee cup, notebook, and elegant profile continuity",
            "environment_description": "the same rainy modern cafe corner and tabletop environment with warm late-afternoon light, glass reflections, polished wood, and controlled depth",
            "camera_framing": "begin in a medium portrait, shift into a close detail emphasis, and finish in an elegant side-angle three-quarter portrait",
            "motion_intent": "smooth slow dolly inward, gentle sideways glide, and restrained lateral movement with no abrupt pose change or complex object interaction",
            "transition_intent": "move from emotional portrait into tactile proof and subtle angle variation without changing identity or environment family",
            "ending_hold_instruction": "end on a stable hero-detail portrait beat with no cup lifting, no stirring, and no abrupt motion",
            "camera_motion_type": "hybrid_dolly_glide",
        },
        {
            "stage_name": "closing_payoff",
            "stage_label": "Closing Payoff",
            "scene_type": "closing_portrait",
            "scene_role": "closing_payoff",
            "topic_focus": "final calm portrait resolution in the same cafe",
            "visual_objective": "End on a calm final portrait that resolves cleanly and stays visually stable for export and stitching.",
            "subject_description": "the same woman by the same rain-speckled window, same wardrobe, same calm reflective tone",
            "environment_description": "the same warm modern cafe with stable late-afternoon rainy ambience and continuity-safe composition",
            "camera_framing": "stable medium shot with calm final portrait composition",
            "motion_intent": "almost imperceptible gentle pull-back with visually stable ending and no new action introduced",
            "transition_intent": "resolve the montage without introducing any new idea or abrupt motion",
            "ending_hold_instruction": "final seconds visually stable for stitch and export, no abrupt motion, no pose change, clean resolve",
            "camera_motion_type": "gentle_pull_back",
        },
    )
    planned: list[dict[str, Any]] = []
    for index, base_scene in enumerate(plan_scenes(recipe)):
        blueprint = scene_blueprint[index]
        planned.append(
            {
                **base_scene,
                **blueprint,
                "generator_model_family": "ltx",
                "render_mode": "scene_stitch",
                "continuity_priority": "high",
                "persona_lock_required": True,
                "same_subject_required": True,
                "same_wardrobe_required": True,
                "same_environment_family": True,
                "continuity_anchor": continuity_anchor,
                "max_action_complexity": "low",
                "emotion_style": "calm_reflective",
                "visual_style": "cinematic_realistic",
                "location_family": "rainy_modern_cafe",
                "stitch_safe_ending": True,
                "local_narration_context": "",
                "transition_from_previous": "preserve the same subject, wardrobe, environment, and mood from the previous shot" if index > 0 else "open gently with the established rainy cafe continuity anchor",
                "transition_to_next": "hand off smoothly to the next stitched scene with the same subject and environment continuity" if index < len(scene_blueprint) - 1 else "resolve cleanly for the final stitched export",
                "negative_guidance": (
                    "no speaking; no lip sync; no abrupt fast motion; no complex hand-object interaction; "
                    "no crowded choreography; no extreme pose changes; maintain same person and wardrobe; "
                    "maintain same cafe environment; keep motion smooth and controlled"
                ),
                "qa_flags": [],
            }
        )
    return planned


def detect_ltx_story_mode(*, topic: str) -> LtxStoryDetection:
    normalized_topic = " ".join(str(topic or "").lower().split())
    if not normalized_topic:
        return LtxStoryDetection(mode="cinematic", subtopic="cinematic")

    ugc_detection = detect_ugc_ad_family(topic=normalized_topic)
    if (
        ugc_detection.family != "problem_solution_ugc_ad"
        or any(token in normalized_topic for token in ("ad", "ugc", "product", "service", "offer", "cta", "shop now", "book now"))
    ):
        return LtxStoryDetection(mode="ugc_ad", subtopic=ugc_detection.subtopic)

    if any(pattern in normalized_topic for pattern in ("explain", "what if", "how does", "how do", "why does", "why do", "history of", "science of")):
        return LtxStoryDetection(mode="explainer", subtopic=detect_explainer_family(topic=normalized_topic).subtopic)

    return LtxStoryDetection(mode="cinematic", subtopic=normalized_topic[:80] or "cinematic")


def build_ltx_freeform_scene_plan(*, recipe: RecipeConfig, topic: str) -> list[dict[str, Any]]:
    detection = detect_ltx_story_mode(topic=topic)
    continuity_anchor = (
        f"same core subject, same wardrobe family, same environment family, same lighting mood, same narrative world for {topic.strip() or 'the prompt'}"
    )
    if detection.mode == "explainer":
        scene_blueprint: tuple[dict[str, str], ...] = (
            {
                "stage_name": "hook_intro",
                "stage_label": "Hook + Intro",
                "scene_role": "hook_intro",
                "scene_type": "concept_hook",
                "topic_focus": f"Introduce {topic.strip() or 'the topic'} clearly and immediately",
                "visual_objective": "Open with one strong visual hook and introduce the core concept in the same continuity-safe world.",
                "camera_framing": "readable medium-wide or medium framing with one clear focal subject",
                "motion_intent": "smooth controlled opening motion with immediate concept readability",
                "transition_intent": "move from hook into explanation without changing the visual world",
                "ending_hold_instruction": "end on a stable explanatory beat for a clean stitch",
                "camera_motion_type": "guided_push_in",
            },
            {
                "stage_name": "mechanism_example",
                "stage_label": "Mechanism + Example",
                "scene_role": "mechanism_example",
                "scene_type": "mechanism_demo",
                "topic_focus": f"Show how {topic.strip() or 'the topic'} works with one concrete example",
                "visual_objective": "Blend mechanism and example into one dense but readable mid-scene without overloading motion.",
                "camera_framing": "medium to close explanatory framing with one concrete visual example",
                "motion_intent": "steady explanatory motion that reveals cause and effect clearly",
                "transition_intent": "expand understanding without introducing a new visual identity",
                "ending_hold_instruction": "finish on a stable explanatory payoff beat",
                "camera_motion_type": "explanatory_glide",
            },
            {
                "stage_name": "implication_closing",
                "stage_label": "Implication + Closing",
                "scene_role": "implication_closing",
                "scene_type": "closing_takeaway",
                "topic_focus": f"Land the implication and closing takeaway for {topic.strip() or 'the topic'}",
                "visual_objective": "Resolve the idea with one final visual implication and a stable closing beat.",
                "camera_framing": "stable medium closing composition with clear takeaway energy",
                "motion_intent": "minimal closing motion with calm resolution",
                "transition_intent": "resolve the explanation cleanly without introducing a new concept at the end",
                "ending_hold_instruction": "final second visually stable, clean resolve for export",
                "camera_motion_type": "gentle_pull_back",
            },
        )
    elif detection.mode == "ugc_ad":
        scene_blueprint = (
            {
                "stage_name": "hook_problem",
                "stage_label": "Hook + Problem",
                "scene_role": "hook_problem",
                "scene_type": "ad_hook",
                "topic_focus": f"Open with the problem and immediate relevance for {topic.strip() or 'the offer'}",
                "visual_objective": "Make the problem and hook instantly readable in one native-feeling opening scene.",
                "camera_framing": "mobile-first medium framing with fast clarity and authentic realism",
                "motion_intent": "controlled creator-style motion with a stable first beat",
                "transition_intent": "move from hook into product proof without losing relevance",
                "ending_hold_instruction": "end on a stable problem-to-solution handoff beat",
                "camera_motion_type": "creator_push_in",
            },
            {
                "stage_name": "product_proof",
                "stage_label": "Product + Proof",
                "scene_role": "product_proof",
                "scene_type": "product_demo",
                "topic_focus": f"Show the product or service and one strong proof beat for {topic.strip() or 'the ad'}",
                "visual_objective": "Combine intro and proof into one dense but readable service or product scene.",
                "camera_framing": "medium or close proof framing with product or service context clearly visible",
                "motion_intent": "calm action-led proof motion with one clear demonstration beat",
                "transition_intent": "turn the proof into a believable benefit without changing the visual world",
                "ending_hold_instruction": "finish with proof still visually readable for clean stitching",
                "camera_motion_type": "demo_glide",
            },
            {
                "stage_name": "benefit_cta",
                "stage_label": "Benefit + CTA",
                "scene_role": "benefit_cta",
                "scene_type": "closing_cta",
                "topic_focus": f"Land the benefit and CTA for {topic.strip() or 'the ad'}",
                "visual_objective": "Resolve with benefit clarity and a calm CTA ending, without introducing a new idea in the last beat.",
                "camera_framing": "stable medium closing composition with readable service or booking context",
                "motion_intent": "minimal closing motion and stable CTA hold",
                "transition_intent": "resolve the ad around one clear benefit and CTA",
                "ending_hold_instruction": "last second visually stable, CTA context still visible, no abrupt ending",
                "camera_motion_type": "cta_hold",
            },
        )
    else:
        scene_blueprint = (
            {
                "stage_name": "establish",
                "stage_label": "Establish",
                "scene_role": "establish",
                "scene_type": "environment_establishing",
                "topic_focus": f"Establish the cinematic world for {topic.strip() or 'the prompt'}",
                "visual_objective": "Open with one strong atmospheric establishing beat that sets subject, environment, and tone.",
                "camera_framing": "medium-wide to medium cinematic composition with clear visual anchor",
                "motion_intent": "slow controlled opening motion with strong continuity",
                "transition_intent": "move from atmosphere into a denser hero scene without breaking continuity",
                "ending_hold_instruction": "resolve into a stable handoff beat",
                "camera_motion_type": "slow_push_in",
            },
            {
                "stage_name": "hero_detail_main_proof",
                "stage_label": "Hero / Detail / Main Proof",
                "scene_role": "hero_detail_main_proof",
                "scene_type": "hero_detail_proof",
                "topic_focus": f"Carry the main visual proof and detail richness for {topic.strip() or 'the prompt'}",
                "visual_objective": "Condense the strongest hero and detail storytelling into one rich middle scene.",
                "camera_framing": "medium to close cinematic framing with one primary hero angle and tactile details",
                "motion_intent": "smooth, controlled motion with detail richness and no action spikes",
                "transition_intent": "move from hero proof into final emotional payoff without changing the world",
                "ending_hold_instruction": "finish on a stable hero-detail beat for a clean final handoff",
                "camera_motion_type": "hybrid_dolly_glide",
            },
            {
                "stage_name": "closing_payoff",
                "stage_label": "Closing Payoff",
                "scene_role": "closing_payoff",
                "scene_type": "closing_portrait",
                "topic_focus": f"Resolve the cinematic payoff for {topic.strip() or 'the prompt'}",
                "visual_objective": "Land the final payoff with a stable closing composition and calm visual resolve.",
                "camera_framing": "stable medium closing composition",
                "motion_intent": "almost imperceptible gentle pull-back with no new action introduced",
                "transition_intent": "resolve without introducing a new visual idea",
                "ending_hold_instruction": "final second visually stable, clean resolve for export",
                "camera_motion_type": "gentle_pull_back",
            },
        )

    planned: list[dict[str, Any]] = []
    base_scenes = plan_scenes(recipe)
    for index, base_scene in enumerate(base_scenes):
        blueprint = scene_blueprint[index]
        planned.append(
            {
                **base_scene,
                **blueprint,
                "generator_model_family": "ltx",
                "render_mode": "scene_stitch",
                "continuity_priority": "high",
                "persona_lock_required": True,
                "same_subject_required": True,
                "same_wardrobe_required": True,
                "same_environment_family": True,
                "continuity_anchor": continuity_anchor,
                "max_action_complexity": "low",
                "emotion_style": "controlled_coherent",
                "visual_style": "cinematic_realistic",
                "location_family": "prompt_driven_continuity_world",
                "stitch_safe_ending": True,
                "story_mode": detection.mode,
                "story_subtopic": detection.subtopic,
                "source_prompt": topic.strip(),
                "subject_description": f"the same core subject and visual identity from the prompt: {topic.strip() or 'the prompt'}",
                "environment_description": "the same environment family, same lighting family, and same visual world across all three scenes",
                "local_narration_context": "",
                "transition_from_previous": "preserve the same subject, environment family, wardrobe family, and emotional tone from the previous scene" if index > 0 else "open clearly with one stable continuity anchor",
                "transition_to_next": "hand off smoothly to the next stitched scene without changing the visual world" if index < len(scene_blueprint) - 1 else "resolve cleanly for the final stitched export",
                "negative_guidance": (
                    "no speaking; no lip sync; no abrupt fast motion; no crowded choreography; no extreme pose changes; "
                    "maintain same subject, wardrobe family, and environment family; keep motion smooth and controlled"
                ),
                "qa_flags": [],
            }
        )
    return planned


def derive_visual_objective_for_stage(*, stage_name: str, topic: str, topic_focus: str) -> str:
    normalized_topic = " ".join(str(topic or "").split()) or "the topic"
    stage_objectives = {
        "hook": f"Open with a smooth, curiosity-building introduction that makes {normalized_topic} feel immediate and relatable.",
        "concept_introduction": f"Explain what {normalized_topic} is with a clear visual overview before moving into detail.",
        "mechanism": f"Break down how {normalized_topic} works step by step with visible process and cause-and-effect.",
        "concrete_example": f"Ground {normalized_topic} in a practical real-world example viewers can immediately understand.",
        "implication": f"Show what happens next and why {normalized_topic} matters beyond the core mechanism.",
        "closing_takeaway": f"End with a calm, memorable summary that gives visual closure and reinforces the main idea of {normalized_topic}.",
    }
    objective = stage_objectives.get(stage_name, f"Teach one clear part of {normalized_topic} in a concrete visual way.")
    return f"{objective} Focus on {topic_focus}."


def apply_scene_diversity_rules(scene_plan: list[dict[str, Any]]) -> list[dict[str, Any]]:
    generic_repetitive_motifs = [
        "glowing neuron mesh",
        "generic synapse tunnel",
        "abstract brain-light network",
    ]
    previous_scene_type = ""
    previous_focus = ""

    for scene in scene_plan:
        avoid = list(scene.get("avoid_motifs") or [])
        avoid.extend(generic_repetitive_motifs)
        if previous_scene_type:
            avoid.append(f"repeating the exact same {previous_scene_type} composition as the previous scene")
        if previous_focus:
            avoid.append(f"overusing the exact same {previous_focus} visual metaphor as the previous scene")
        deduped = []
        for item in avoid:
            value = str(item or "").strip()
            if value and value not in deduped:
                deduped.append(value)
        scene["avoid_motifs"] = deduped
        scene["anti_repetition_note"] = (
            f"Change the visual treatment from the previous {previous_scene_type or 'scene'} and introduce a new explanatory angle."
        )
        scene["qa_flags"] = _build_scene_plan_qa_flags(
            scene=scene,
            previous_scene_type=previous_scene_type,
            previous_focus=previous_focus,
        )
        previous_scene_type = str(scene.get("scene_type") or "").strip()
        previous_focus = str(scene.get("topic_focus") or "").strip()

    return scene_plan


def detect_explainer_family(*, topic: str, explainer_style: str = "educational") -> ExplainerFamilyDetection:
    normalized_topic = " ".join(str(topic or "").lower().split())

    family_keywords: tuple[tuple[str, tuple[str, ...]], ...] = (
        ("what_if_explainer", ("what if", "imagine if", "suppose earth", "suppose humans")),
        ("historical_event_explainer", ("war", "revolution", "empire", "independence", "civilization", "battle", "movement")),
        ("historical_character_explainer", ("who was", "scientist", "inventor", "freedom fighter", "king", "queen", "reformer", "leader")),
        ("how_it_works_explainer", ("how does", "how do", "how airplanes fly", "how the internet works", "how rockets launch", "how electricity reaches homes", "how it works")),
        ("body_system_explainer", ("digestive system", "immune system", "nervous system", "circulatory system", "respiratory system")),
        ("organ_anatomy_explainer", ("heart", "lungs", "lung", "liver", "kidney", "kidneys", "stomach", "small intestine", "large intestine", "brain")),
        ("biology_process_explainer", ("memory formation", "photosynthesis", "digestion", "infection response", "cell division", "nutrient absorption", "absorbs nutrients", "immune response")),
        ("physics_space_explainer", ("gravity", "black hole", "solar system", "planet", "planets", "stars", "moon", "earth", "seasons", "eclipse", "orbit", "space")),
        ("geography_earth_explainer", ("layers of the earth", "earthquakes", "volcano", "volcanoes", "water cycle", "weather", "climate", "continents", "oceans", "tectonic", "earth's crust")),
    )

    family = "general_educational_explainer"
    subtopic = normalized_topic or "general topic"
    for candidate_family, keywords in family_keywords:
        match = next((keyword for keyword in keywords if keyword in normalized_topic), None)
        if match:
            family = candidate_family
            subtopic = match
            break

    if "for kids" in normalized_topic or "12 year old" in normalized_topic or "like i'm 12" in normalized_topic or "like i am 12" in normalized_topic:
        educational_mode = "simple_for_kids"
    elif explainer_style in {"science_documentary", "cinematic_educational"}:
        educational_mode = explainer_style
    else:
        educational_mode = "educational"

    return ExplainerFamilyDetection(
        family=family,
        subtopic=subtopic,
        educational_mode=educational_mode,
    )


def detect_ugc_ad_family(*, topic: str, ugc_style: str = "creator_casual") -> UgcAdFamilyDetection:
    normalized_topic = " ".join(str(topic or "").lower().split())
    family_keywords: tuple[tuple[str, tuple[str, ...]], ...] = (
        ("before_after_ugc_ad", ("before after", "before-and-after", "transformation", "results in", "used to")),
        ("testimonial_ugc_ad", ("testimonial", "review", "i tried", "i was skeptical", "my experience", "personally")),
        ("demo_ugc_ad", ("demo", "show how", "use it", "works like this", "how to use", "watch this")),
        ("offer_hook_ugc_ad", ("limited time", "discount", "sale", "offer", "free trial", "book now", "sign up today")),
        ("founder_story_ugc_ad", ("founder", "we built", "our story", "why we started", "behind this brand")),
        ("local_service_ugc_ad", ("clinic", "salon", "spa", "restaurant", "cafe", "gym", "repair", "plumber", "electrician", "dentist", "school", "daycare", "play school", "playschool", "preschool", "kindergarten", "tuition", "coaching")),
        ("app_software_ugc_ad", ("app", "software", "saas", "dashboard", "website", "tool", "platform")),
        ("how_to_use_ugc_ad", ("how to use", "step by step", "use this for", "apply this", "set it up")),
        ("listicle_benefit_ugc_ad", ("3 reasons", "5 reasons", "benefits", "why this is", "top reasons")),
        ("problem_solution_ugc_ad", ("struggling", "problem", "pain point", "fix", "solution", "tired of", "finally found")),
    )

    family = "problem_solution_ugc_ad"
    subtopic = normalized_topic or "product or service"
    for candidate_family, keywords in family_keywords:
        match = next((keyword for keyword in keywords if keyword in normalized_topic), None)
        if match:
            family = candidate_family
            subtopic = match
            break

    category_keywords: tuple[str, ...] = (
        "skincare",
        "skin care",
        "serum",
        "sunscreen",
        "face wash",
        "cleanser",
        "moisturizer",
        "acne",
        "pimple",
        "beauty",
        "makeup",
        "lipstick",
        "foundation",
        "shampoo",
        "hair oil",
        "hair serum",
        "salon",
        "spa",
        "clinic",
        "dentist",
        "gym",
        "restaurant",
        "cafe",
        "repair",
        "plumber",
        "electrician",
        "school",
        "daycare",
        "play school",
        "playschool",
        "preschool",
        "kindergarten",
        "tuition",
        "coaching",
    )
    category_match = next((keyword for keyword in category_keywords if keyword in normalized_topic), None)
    if category_match:
        subtopic = category_match

    if ugc_style in {"testimonial", "documentary_social", "premium_ugc", "offer_heavy_performance_ad"}:
        ugc_mode = ugc_style
    else:
        ugc_mode = "creator_casual"

    return UgcAdFamilyDetection(family=family, subtopic=subtopic, ugc_mode=ugc_mode)


def normalize_ugc_client_brief(*, topic: str, explicit: dict[str, Any] | None = None) -> UgcAdClientBrief:
    raw_text = " ".join(str(topic or "").split())
    normalized = raw_text.lower()
    explicit = dict(explicit or {})

    business_category = str(explicit.get("business_category") or _infer_business_category(normalized)).strip()
    business_name = str(explicit.get("business_name") or _extract_business_name(raw_text, business_category)).strip()
    locality, city = _extract_location(raw_text)
    locality = str(explicit.get("locality") or locality).strip()
    city = str(explicit.get("city") or city).strip()
    target_audience = str(explicit.get("target_audience") or _extract_target_audience(raw_text)).strip()
    key_promise = str(explicit.get("key_promise") or _extract_after_marker(raw_text, ("focused on", "known for", "offering", "with"))).strip()
    main_pain_point = str(explicit.get("main_pain_point") or _extract_after_marker(raw_text, ("because", "worried about", "struggling with", "dealing with"))).strip()
    trust_factor = str(explicit.get("trust_factor") or _extract_after_marker(raw_text, ("trusted for", "backed by", "with ", "led by"))).strip()
    offer = str(explicit.get("offer") or _extract_offer(raw_text)).strip()
    cta = str(explicit.get("cta") or _extract_cta(raw_text, business_category)).strip()
    language_preference = str(explicit.get("language_preference") or _extract_language_preference(normalized)).strip()
    creator_gender_preference = str(explicit.get("creator_gender_preference") or _extract_creator_preference(normalized)).strip()
    main_service_or_product = str(
        explicit.get("main_service_or_product")
        or _extract_service_or_product(raw_text, business_category, business_name)
    ).strip()
    ad_goal = str(explicit.get("ad_goal") or _infer_ad_goal(cta=cta, business_category=business_category)).strip()
    tone = str(explicit.get("tone") or _infer_brief_tone(business_category, ad_goal)).strip()
    address_hint = str(explicit.get("address_hint") or "").strip()
    area_landmark = str(explicit.get("area_landmark") or "").strip()
    brand_colors = str(explicit.get("brand_colors") or "").strip()
    website_or_booking_target = str(explicit.get("website_or_booking_target") or "").strip()
    phone_or_contact_cta = str(explicit.get("phone_or_contact_cta") or "").strip()
    price_point = str(explicit.get("price_point") or "").strip()

    return UgcAdClientBrief(
        business_name=business_name,
        business_category=business_category,
        city=city,
        locality=locality,
        address_hint=address_hint,
        area_landmark=area_landmark,
        target_audience=target_audience,
        main_service_or_product=main_service_or_product,
        main_pain_point=main_pain_point,
        key_promise=key_promise,
        trust_factor=trust_factor,
        offer=offer,
        cta=cta,
        tone=tone,
        ad_goal=ad_goal,
        brand_colors=brand_colors,
        website_or_booking_target=website_or_booking_target,
        phone_or_contact_cta=phone_or_contact_cta,
        price_point=price_point,
        creator_gender_preference=creator_gender_preference,
        language_preference=language_preference,
    )


def normalize_avatar_product_brief(*, topic: str, explicit: dict[str, Any] | None = None) -> AvatarProductBrief:
    explicit = dict(explicit or {})
    raw_text = " ".join(str(topic or "").split())
    def _list_value(*keys: str) -> list[str]:
        for key in keys:
            value = explicit.get(key)
            if isinstance(value, list):
                return [str(item).strip() for item in value if str(item).strip()]
            if str(value or "").strip():
                return [segment.strip() for segment in re.split(r"[,\n]+", str(value or "")) if segment.strip()]
        return []

    def _bool_value(*keys: str) -> bool:
        for key in keys:
            value = explicit.get(key)
            if isinstance(value, bool):
                return value
            if str(value or "").strip().lower() in {"1", "true", "yes", "on"}:
                return True
        return False

    def _int_value(*keys: str, default: int) -> int:
        for key in keys:
            try:
                parsed = int(explicit.get(key))
            except (TypeError, ValueError):
                continue
            if parsed > 0:
                return parsed
        return default

    return AvatarProductBrief(
        avatar_name=str(explicit.get("avatar_name") or explicit.get("avatarName") or "").strip(),
        product_name=str(explicit.get("product_name") or explicit.get("productName") or "").strip(),
        brand_name=str(explicit.get("brand_name") or explicit.get("brandName") or "").strip(),
        product_category=str(explicit.get("product_category") or explicit.get("productCategory") or "").strip(),
        product_subcategory=str(explicit.get("product_subcategory") or explicit.get("productSubcategory") or "").strip(),
        campaign_objective=str(explicit.get("campaign_objective") or explicit.get("campaignObjective") or "").strip(),
        platform=str(explicit.get("platform") or "").strip(),
        duration_seconds=_int_value("duration_seconds", "durationSeconds", default=15),
        language=str(explicit.get("language") or "English").strip() or "English",
        target_audience=str(explicit.get("target_audience") or explicit.get("targetAudience") or "").strip(),
        audience_age_range=str(explicit.get("audience_age_range") or explicit.get("audienceAgeRange") or "").strip(),
        audience_lifestyle=str(explicit.get("audience_lifestyle") or explicit.get("audienceLifestyle") or "").strip(),
        key_promise=str(explicit.get("key_promise") or explicit.get("keyPromise") or raw_text).strip(),
        secondary_benefit=str(explicit.get("secondary_benefit") or explicit.get("secondaryBenefit") or "").strip(),
        pain_point=str(explicit.get("pain_point") or explicit.get("painPoint") or "").strip(),
        desired_feeling=str(explicit.get("desired_feeling") or explicit.get("desiredFeeling") or "").strip(),
        brand_tone=str(explicit.get("brand_tone") or explicit.get("brandTone") or "").strip(),
        avatar_id=str(explicit.get("avatar_id") or explicit.get("avatarId") or "").strip(),
        avatar_style=str(explicit.get("avatar_style") or explicit.get("avatarStyle") or "").strip(),
        voice_style=str(explicit.get("voice_style") or explicit.get("voiceStyle") or "").strip(),
        cta=str(explicit.get("cta") or explicit.get("cta_preference") or explicit.get("ctaPreference") or "shop now").strip(),
        cta_preference=str(explicit.get("cta_preference") or explicit.get("ctaPreference") or "").strip(),
        tagline=str(explicit.get("tagline") or "").strip(),
        offer_text=str(explicit.get("offer_text") or explicit.get("offerText") or "").strip(),
        product_image_uploaded=_bool_value("product_image_uploaded", "productImageUploaded"),
        product_image_count=_int_value("product_image_count", "productImageCount", default=0),
        logo_uploaded=_bool_value("logo_uploaded", "logoUploaded"),
        reference_ad_links=_list_value("reference_ad_links", "referenceAdLinks"),
        must_show_elements=_list_value("must_show_elements", "mustShowElements"),
        must_avoid_elements=_list_value("must_avoid_elements", "mustAvoidElements"),
        compliance_notes=str(explicit.get("compliance_notes") or explicit.get("complianceNotes") or "").strip(),
        claims_to_avoid=_list_value("claims_to_avoid", "claimsToAvoid"),
        category_specific_details=str(explicit.get("category_specific_details") or explicit.get("categorySpecificDetails") or "").strip(),
        script_mode=str(explicit.get("script_mode") or explicit.get("scriptMode") or "auto_generate").strip() or "auto_generate",
        provided_script=str(explicit.get("provided_script") or explicit.get("providedScript") or "").strip(),
        strict_script_lock=_bool_value("strict_script_lock", "strictScriptLock"),
        script_modified=_bool_value("script_modified", "scriptModified"),
        original_script=str(explicit.get("original_script") or explicit.get("originalScript") or "").strip(),
        final_script=str(explicit.get("final_script") or explicit.get("finalScript") or "").strip(),
        music_vibe=str(explicit.get("music_vibe") or explicit.get("musicVibe") or "").strip(),
        category_confidence=str(explicit.get("category_confidence") or explicit.get("categoryConfidence") or "low").strip() or "low",
    )


def is_client_brief_mode(brief: UgcAdClientBrief) -> bool:
    signal_count = sum(
        1
        for value in (
            brief.business_name,
            brief.business_category,
            brief.city,
            brief.locality,
            brief.target_audience,
            brief.key_promise,
            brief.cta,
            brief.offer,
            brief.trust_factor,
        )
        if str(value or "").strip()
    )
    return signal_count >= 4


def build_ugc_business_context(brief: UgcAdClientBrief) -> dict[str, str]:
    location = ", ".join(part for part in (brief.locality, brief.city) if part)
    business_identity = " ".join(part for part in (brief.business_name, brief.business_category) if part).strip()
    return {
        "business_identity": business_identity or brief.business_category or brief.main_service_or_product or "the business",
        "location_context": location,
        "audience_context": brief.target_audience,
        "promise_context": brief.key_promise,
        "trust_context": brief.trust_factor,
        "offer_context": brief.offer,
        "cta_context": brief.cta,
        "service_context": brief.main_service_or_product or brief.business_category or "the product or service",
        "local_business_context": " ".join(part for part in (business_identity, location) if part).strip(),
    }


def _ugc_is_school_like_local_service(*, family: str, subtopic: str, client_brief: UgcAdClientBrief) -> bool:
    if family != "local_service_ugc_ad":
        return False
    school_tokens = (
        "school",
        "daycare",
        "play school",
        "playschool",
        "preschool",
        "kindergarten",
        "coaching",
        "education center",
        "tuition",
    )
    subtopic_text = " ".join(
        part for part in (
            str(subtopic or "").lower().strip(),
            str(client_brief.business_category or "").lower().strip(),
            str(client_brief.main_service_or_product or "").lower().strip(),
            str(client_brief.business_name or "").lower().strip(),
        )
        if part
    )
    return any(token in subtopic_text for token in school_tokens)


def _ugc_continuity_metadata_for_stage(
    *,
    stage_name: str,
    family: str,
    subtopic: str,
    client_brief: UgcAdClientBrief,
) -> dict[str, Any]:
    is_school_context = _ugc_is_school_like_local_service(
        family=family,
        subtopic=subtopic,
        client_brief=client_brief,
    )
    if family != "local_service_ugc_ad":
        return {
            "continuity_subject_role": "creator",
            "continuity_subject_label": "same spokesperson",
            "continuity_anchor": "same spokesperson and same product logic",
            "must_preserve_subject_identity": stage_name in {"hook", "cta"},
            "must_avoid_new_spokesperson": stage_name in {"proof", "benefit", "cta"},
            "school_testimonial_mode": False,
        }

    if is_school_context:
        return {
            "continuity_subject_role": "parent_spokesperson",
            "continuity_subject_label": client_brief.creator_gender_preference or "same parent spokesperson",
            "continuity_anchor": "same parent spokesperson, same child/family context, same school trust story",
            "must_preserve_subject_identity": stage_name in {"hook", "problem", "benefit", "cta"},
            "must_avoid_new_spokesperson": stage_name in {"problem", "product_intro", "proof", "benefit", "cta"},
            "school_testimonial_mode": True,
        }

    return {
        "continuity_subject_role": "customer_spokesperson",
        "continuity_subject_label": "same local customer or creator spokesperson",
        "continuity_anchor": "same local customer trust story and same service context",
        "must_preserve_subject_identity": stage_name in {"hook", "benefit", "cta"},
        "must_avoid_new_spokesperson": stage_name in {"product_intro", "proof", "benefit", "cta"},
        "school_testimonial_mode": False,
    }


def _apply_local_service_continuity_overrides(
    *,
    prompt_context: dict[str, str],
    stage_name: str,
    family: str,
    subtopic: str,
    client_brief: UgcAdClientBrief,
) -> dict[str, str]:
    adjusted = dict(prompt_context)
    is_school_context = _ugc_is_school_like_local_service(
        family=family,
        subtopic=subtopic,
        client_brief=client_brief,
    )
    if family != "local_service_ugc_ad":
        return adjusted

    negative_bits = [str(adjusted.get("sora_negative_guidance") or "").strip()]
    continuity_bits = [str(adjusted.get("continuity_guidance") or "").strip()]

    if is_school_context:
        if stage_name == "product_intro":
            adjusted["subject_description"] = (
                "the same school environment and trust context, shown through campus, classroom, staff, and parent-child arrival cues instead of a new solo parent face"
            )
            adjusted["environment_description"] = (
                "the same Indian school or preschool environment with recognisable entry gate, reception, classroom, or activity area continuity"
            )
            adjusted["camera_framing"] = (
                "medium-wide or wide school-environment framing that keeps the setting readable and avoids introducing a new spokesperson close-up"
            )
        elif stage_name == "proof":
            adjusted["subject_description"] = (
                "the same child or family context experiencing believable classroom engagement, teacher interaction, school activity, or parent-child proof without switching to a new solo mother face"
            )
            adjusted["environment_description"] = (
                "the same Indian school, preschool, or classroom environment with authentic activity, learning materials, and family-safe continuity"
            )
            adjusted["camera_framing"] = (
                "observational medium or wide proof framing focused on classroom activity, parent-child interaction, or school trust moments, not a new direct-to-camera creator shot"
            )
            adjusted["motion_intent"] = (
                "calm observational motion with one clear school-proof beat and stable family continuity"
            )
        elif stage_name == "benefit":
            adjusted["subject_description"] = (
                "the same parent and child context showing confidence, comfort, learning progress, or emotional reassurance without introducing a fresh spokesperson identity"
            )
            adjusted["environment_description"] = (
                "the same school-adjacent or home-to-school family environment with stable parent-child continuity"
            )
            adjusted["camera_framing"] = (
                "medium parent-child or child-result framing with readable emotional payoff and no isolated new-face creator close-up"
            )
        elif stage_name == "cta":
            adjusted["subject_description"] = (
                "a continuity-safe school CTA using the same family context, school environment, phone or visit-now cue, and trust signal without generating a new talking mother"
            )
            adjusted["environment_description"] = (
                "the same school or parent-facing environment with clear booking or visit context and stable closing composition"
            )
            adjusted["camera_framing"] = (
                "stable medium or environmental CTA framing with school context or booking cue visible, avoiding a fresh solo face reveal"
            )
            adjusted["motion_intent"] = "minimal motion with a calm school-trust close"
            adjusted["ending_hold_instruction"] = (
                "last second visually stable, school context or booking cue still visible, no new parent face reveal, no abrupt CTA cut"
            )
            adjusted["cta_style"] = "school_parent_voiceover_safe_close"

        continuity_bits.append(
            "Keep one parent spokesperson and one child/family context across the ad; non-talking scenes should reinforce the same family trust story rather than introducing a new mother."
        )
        negative_bits.append(
            "avoid introducing a second parent spokesperson; avoid changing the mother's facial identity across scenes; avoid standalone creator close-ups in proof scenes when the ad is testimonial-led"
        )
    elif stage_name == "cta":
        continuity_bits.append(
            "Do not reveal a fresh spokesperson in the CTA; close using the same local trust context, service environment, or customer story."
        )
        negative_bits.append("avoid introducing a second local-service spokesperson in the CTA")

    adjusted["continuity_guidance"] = " ".join(bit for bit in continuity_bits if bit).strip()
    adjusted["sora_negative_guidance"] = "; ".join(bit for bit in negative_bits if bit).strip("; ")
    return adjusted


def build_ugc_hook_plan(*, brief: UgcAdClientBrief, family: str) -> str:
    location = ", ".join(part for part in (brief.locality, brief.city) if part)
    audience = brief.target_audience or "people like you"
    business = brief.business_name or brief.business_category or brief.main_service_or_product or "this brand"
    pain_point = brief.main_pain_point or "the usual frustration people keep putting off"
    promise = brief.key_promise or "a simpler and more trustworthy option"
    trust = brief.trust_factor or "something that feels credible from the start"

    if family == "local_service_ugc_ad":
        if location:
            return f"If you are around {location} and still dealing with {pain_point}, {business} is pitching {promise} with {trust}."
        return f"If you are still dealing with {pain_point}, {business} is pitching {promise} with {trust}."
    if family == "testimonial_ugc_ad":
        return f"I did not expect {business} to help with {pain_point}, but {promise} is why it stood out for {audience}."
    if family == "offer_hook_ugc_ad" and brief.offer:
        return f"{brief.offer} sounds great, but the real reason {audience} will care is {promise} from {business}."
    return f"If you are {audience} and tired of {pain_point}, {business} is leaning into {promise} with {trust}."


def build_deep_explainer_scene_plan(
    *,
    recipe: RecipeConfig,
    topic: str,
    scene_beats: list[str],
    scene_narration_context: list[str],
    explainer_style: str,
) -> list[dict[str, Any]]:
    normalized_topic = " ".join(str(topic or "").split()) or "the topic"
    family_detection = detect_explainer_family(topic=normalized_topic, explainer_style=explainer_style)
    family = family_detection.family
    subtopic = family_detection.subtopic
    educational_mode = family_detection.educational_mode
    stage_blueprint = _scene_grammar_for_family(family)

    planned: list[dict[str, Any]] = []
    base_scenes = plan_scenes(recipe)

    for index, scene in enumerate(base_scenes):
        stage_name, stage_label, scene_type, stage_goal = stage_blueprint[index]
        topic_focus = _topic_focus_for_stage(family=family, stage_name=stage_name, topic=normalized_topic)
        local_narration = scene_narration_context[index] if index < len(scene_narration_context) else ""
        previous_stage = stage_blueprint[index - 1][1] if index > 0 else ""
        next_stage = stage_blueprint[index + 1][1] if index < len(stage_blueprint) - 1 else ""
        visual_objective = derive_visual_objective_for_stage(
            stage_name=stage_name,
            topic=normalized_topic,
            topic_focus=topic_focus,
        )
        prompt_context = build_deep_explainer_prompt_context(
            stage_name=stage_name,
            topic=normalized_topic,
            topic_focus=topic_focus,
            scene_type=scene_type,
            family=family,
            subtopic=subtopic,
            index=index,
            total_scenes=len(base_scenes),
        )

        planned.append(
            {
                **scene,
                "stage_name": stage_name,
                "stage_label": stage_label,
                "scene_type": scene_type,
                "stage_goal": stage_goal,
                "topic_focus": topic_focus,
                "visual_objective": visual_objective,
                "local_narration_context": local_narration,
                **_transition_template_for_stage(
                    family=family,
                    stage_name=stage_name,
                    stage_label=stage_label,
                    previous_stage=previous_stage,
                    next_stage=next_stage,
                ),
                "beat_summary": scene_beats[index] if index < len(scene_beats) else "",
                "explainer_style": explainer_style,
                "avoid_motifs": _avoid_motifs_for_stage(stage_name=stage_name, family=family),
                "explainer_family": family,
                "explainer_subtopic": subtopic,
                "educational_mode": educational_mode,
                **prompt_context,
            }
        )

    return apply_scene_diversity_rules(planned)


def build_ugc_ad_scene_plan(
    *,
    recipe: RecipeConfig,
    topic: str,
    ugc_style: str,
    client_brief: UgcAdClientBrief | None = None,
    timing_map: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    normalized_topic = " ".join(str(topic or "").split()) or "the product or service"
    family_detection = detect_ugc_ad_family(topic=normalized_topic, ugc_style=ugc_style)
    family = family_detection.family
    subtopic = family_detection.subtopic
    ugc_mode = family_detection.ugc_mode
    resolved_brief = client_brief or normalize_ugc_client_brief(topic=normalized_topic)
    client_brief_mode = is_client_brief_mode(resolved_brief)
    business_context = build_ugc_business_context(resolved_brief)

    single_creator_mode = family in {"local_service_ugc_ad", "testimonial_ugc_ad"} or subtopic in {
        "salon", "spa", "clinic", "dentist", "skincare", "skin care", "serum", "beauty", "acne", "pimple"
    }
    creator_anchor = (
        "same spokesperson across hook, recommendation, and CTA scenes"
        if single_creator_mode
        else "multiple faces allowed only if clearly montage/testimonial style"
    )
    stage_blueprint = _ugc_scene_grammar_for_family(family)
    base_scenes = plan_scenes(recipe)
    planned: list[dict[str, Any]] = []
    previous_scene_type = ""
    previous_focus = ""
    lip_sync_scene_count = 0
    has_service_intro_scene = False
    has_proof_scene = False

    for index, scene in enumerate(base_scenes):
        stage_name, stage_label, scene_type, stage_goal = stage_blueprint[index]
        topic_focus = _ugc_topic_focus_for_stage(
            family=family,
            stage_name=stage_name,
            topic=normalized_topic,
            client_brief=resolved_brief,
            client_brief_mode=client_brief_mode,
        )
        previous_stage = stage_blueprint[index - 1][1] if index > 0 else ""
        next_stage = stage_blueprint[index + 1][1] if index < len(stage_blueprint) - 1 else ""
        prompt_context = build_ugc_ad_prompt_context(
            stage_name=stage_name,
            topic=normalized_topic,
            topic_focus=topic_focus,
            scene_type=scene_type,
            family=family,
            subtopic=subtopic,
            index=index,
            total_scenes=len(base_scenes),
            client_brief=resolved_brief,
            client_brief_mode=client_brief_mode,
            business_context=business_context,
        )
        prompt_context = _apply_local_service_continuity_overrides(
            prompt_context=prompt_context,
            stage_name=stage_name,
            family=family,
            subtopic=subtopic,
            client_brief=resolved_brief,
        )
        avoid_motifs = _ugc_avoid_motifs_for_stage(stage_name=stage_name, family=family)
        if previous_scene_type:
            avoid_motifs.append(f"repeating the exact same {previous_scene_type} setup as the previous ad scene")
        if previous_focus:
            avoid_motifs.append(f"reusing the exact same {previous_focus} sales angle as the previous scene")

        talking_mode = _ugc_talking_mode_for_stage(
            stage_name=stage_name,
            family=family,
            cta=resolved_brief.cta,
        )
        render_lane = _ugc_render_lane_for_talking_mode(talking_mode)
        persona_required = talking_mode == "lip_sync_required"
        if persona_required:
            lip_sync_scene_count += 1
        if stage_name == "product_intro":
            has_service_intro_scene = True
        if stage_name == "proof":
            has_proof_scene = True

        planned_scene = {
            **scene,
            "stage_name": stage_name,
            "stage_label": stage_label,
            "scene_type": scene_type,
            "stage_goal": stage_goal,
            "topic_focus": topic_focus,
            "visual_objective": _ugc_visual_objective_for_stage(stage_name=stage_name, topic=normalized_topic, topic_focus=topic_focus),
            "transition_intent": _ugc_transition_intent_for_family(family=family, stage_name=stage_name, previous_stage=previous_stage, next_stage=next_stage),
            "transition_from_previous": _ugc_transition_from_previous(family=family, previous_stage=previous_stage, stage_label=stage_label),
            "transition_to_next": _ugc_transition_to_next(family=family, next_stage=next_stage),
            "ugc_ad_family": family,
            "ugc_ad_subtopic": subtopic,
            "ugc_mode": ugc_mode,
            "ugc_style": ugc_style,
            "client_brief_mode": client_brief_mode,
            "single_creator_mode": single_creator_mode,
            "creator_anchor": creator_anchor,
            **_ugc_continuity_metadata_for_stage(
                stage_name=stage_name,
                family=family,
                subtopic=subtopic,
                client_brief=resolved_brief,
            ),
            "business_name": resolved_brief.business_name,
            "business_category": resolved_brief.business_category,
            "city": resolved_brief.city,
            "locality": resolved_brief.locality,
            "target_audience": resolved_brief.target_audience,
            "main_service_or_product": resolved_brief.main_service_or_product,
            "main_pain_point": resolved_brief.main_pain_point,
            "key_promise": resolved_brief.key_promise,
            "trust_factor": resolved_brief.trust_factor,
            "offer": resolved_brief.offer,
            "cta": resolved_brief.cta,
            "tone": resolved_brief.tone,
            "ad_goal": resolved_brief.ad_goal,
            "brief_location_context": business_context.get("location_context"),
            "brief_service_context": business_context.get("service_context"),
            "avoid_motifs": list(dict.fromkeys([item for item in avoid_motifs if str(item).strip()])),
            "shot_scale": _ugc_shot_scale_for_stage(stage_name=stage_name, family=family),
            "talking_mode": talking_mode,
            "render_lane": render_lane,
            "persona_required": persona_required,
            "use_locked_persona": persona_required,
            "talking_duration_hint_seconds": min(5, max(3, int(scene.get("duration_seconds") or 4))),
            **prompt_context,
        }
        if timing_map and planned_scene.get("render_lane") == "talking_avatar":
            first_segment = timing_map[0] if timing_map else {}
            total_duration_seconds = max(1.0, float((timing_map[-1].get("end_ms") or 0) / 1000.0)) if timing_map else float(scene.get("duration_seconds") or 0)
            first_duration_ms = int(first_segment.get("duration_ms") or 0)
            planned_scene["timed_duration_seconds"] = round(total_duration_seconds, 2)
            planned_scene["duration_seconds"] = max(1, int(round(total_duration_seconds)))
            planned_scene["hook_line"] = str(first_segment.get("text") or "").strip()
            planned_scene["hook_duration_ms"] = first_duration_ms
            planned_scene["talking_duration_hint_seconds"] = max(1, int(round(total_duration_seconds)))
            if first_duration_ms < 1500:
                planned_scene["camera_framing"] = "tight close-up with strong face readability and direct eye contact"
                planned_scene["motion_intent"] = "minimal movement with stable mouth readability and a crisp speaking beat"
                planned_scene["timing_visual_rhythm"] = "short_segment_close_up"
            else:
                planned_scene["camera_framing"] = "medium shot with subtle movement and readable direct-to-camera delivery"
                planned_scene["motion_intent"] = "medium shot with subtle movement and smooth conversational pacing"
                planned_scene["timing_visual_rhythm"] = "long_segment_subtle_motion"
        planned_scene["anti_repetition_note"] = (
            f"Shift the ad treatment away from the previous {previous_scene_type or 'scene'} and keep the product story moving forward."
        )
        planned_scene["qa_flags"] = _build_ugc_scene_plan_qa_flags(
            scene=planned_scene,
            previous_scene_type=previous_scene_type,
            previous_focus=previous_focus,
            client_brief=resolved_brief,
            client_brief_mode=client_brief_mode,
        )
        if family == "local_service_ugc_ad" and stage_name == "product_intro":
            planned_scene["must_include_environment_context"] = True
            planned_scene["environment_priority"] = "storefront_or_service_space"

        if family == "local_service_ugc_ad" and stage_name == "proof":
            planned_scene["must_show_service_action"] = True
        planned.append(planned_scene)
        previous_scene_type = scene_type
        previous_focus = topic_focus

    if family == "local_service_ugc_ad":
        extra_talking_scene_seen = False
        for planned_scene in planned:
            if str(planned_scene.get("render_lane") or "") != "talking_avatar":
                continue
            if not extra_talking_scene_seen:
                extra_talking_scene_seen = True
                continue
            planned_scene["talking_mode"] = "voiceover_safe"
            planned_scene["render_lane"] = "broll_safe"
            planned_scene["persona_required"] = False
            planned_scene["use_locked_persona"] = False
            planned_scene["qa_flags"] = list(
                dict.fromkeys([*(planned_scene.get("qa_flags") or []), "too_many_talking_avatar_scenes"])
            )
        for planned_scene in planned:
            qa_flags = list(planned_scene.get("qa_flags") or [])
            if lip_sync_scene_count > 1:
                qa_flags.append("too_many_lip_sync_required_scenes")
                qa_flags.append("excessive_talking_head_risk")
            if not has_proof_scene:
                qa_flags.append("no_proof_scene")
            if not has_service_intro_scene:
                qa_flags.append("no_service_intro_scene")
            planned_scene["qa_flags"] = list(dict.fromkeys(qa_flags))

    return planned


def build_avatar_product_scene_plan(
    *,
    recipe: RecipeConfig,
    topic: str,
    avatar_product_brief: AvatarProductBrief,
) -> list[dict[str, Any]]:
    base_scenes = plan_scenes(recipe)

    avatar_name = avatar_product_brief.avatar_name or "the selected avatar"
    product_name = avatar_product_brief.product_name or "the product"
    product_category = avatar_product_brief.product_category or "product"
    target_audience = avatar_product_brief.target_audience or "the target audience"
    key_promise = avatar_product_brief.key_promise or topic or "the core product benefit"
    pain_point = avatar_product_brief.pain_point or "the user need"
    cta = avatar_product_brief.cta or "shop now"
    platform = avatar_product_brief.platform or "Instagram Reels"
    campaign_objective = avatar_product_brief.campaign_objective or "drive_purchases"
    brand_tone = avatar_product_brief.brand_tone or "creator_casual"
    category_specific_details = avatar_product_brief.category_specific_details or ""
    must_show = ", ".join(avatar_product_brief.must_show_elements or [])
    must_avoid = ", ".join(avatar_product_brief.must_avoid_elements or [])

    if len(base_scenes) == 1:
        scene = base_scenes[0]

        planned_scene = {
            **scene,
            "stage_name": "single_shot",
            "stage_label": "Single Shot",
            "scene_type": "avatar_product_single_shot",
            "stage_goal": "create one continuous avatar-led product ad with hook, product reveal, benefit, and CTA in the same shot",
            "topic_focus": (
                f"{avatar_name} presents {product_name} for {target_audience}, "
                f"showing {key_promise} with a natural CTA: {cta}"
            ),
            "visual_objective": (
                f"Create one continuous creator-style UGC shot where {avatar_name} stays visible, "
                f"{product_name} is clearly shown from the first second, and the ad feels like a real social product recommendation."
            ),
            "transition_intent": "No scene transition. Keep one continuous shot from opening hook to product reveal to CTA.",
            "transition_from_previous": "Start naturally with the selected avatar and uploaded product already visible.",
            "transition_to_next": "No next scene. End with a stable product-visible creator recommendation.",
            "ugc_ad_family": "avatar_product_ad",
            "ugc_ad_subtopic": product_category,
            "ugc_mode": "avatar_product",
            "ugc_style": "creator_casual",
            "client_brief_mode": False,
            "single_creator_mode": True,
            "creator_anchor": "same selected avatar throughout one continuous shot",
            "continuity_subject_role": "avatar_spokesperson",
            "continuity_subject_label": avatar_name,
            "continuity_anchor": "same selected avatar, same uploaded product, same creator environment, one continuous shot",
            "must_preserve_subject_identity": True,
            "must_avoid_new_spokesperson": True,
            "school_testimonial_mode": False,
            "business_name": "",
            "business_category": product_category,
            "city": "",
            "locality": "",
            "target_audience": target_audience,
            "main_service_or_product": product_name,
            "main_pain_point": pain_point,
            "key_promise": key_promise,
            "trust_factor": "",
            "offer": "",
            "cta": cta,
            "platform": platform,
            "campaign_objective": campaign_objective,
            "brand_tone": brand_tone,
            "category_specific_details": category_specific_details,
            "must_show_elements": list(avatar_product_brief.must_show_elements or []),
            "must_avoid_elements": list(avatar_product_brief.must_avoid_elements or []),
            "compliance_notes": avatar_product_brief.compliance_notes,
            "claims_to_avoid": list(avatar_product_brief.claims_to_avoid or []),
            "script_mode": avatar_product_brief.script_mode,
            "provided_script": avatar_product_brief.provided_script,
            "strict_script_lock": avatar_product_brief.strict_script_lock,
            "tone": "creator_confident_friendly",
            "ad_goal": "purchase",
            "brief_location_context": "",
            "brief_service_context": product_name,
            "avoid_motifs": [
                "changing to a different spokesperson",
                "product hidden for too long",
                "glossy TV-commercial polish",
                "random stock-footage drift",
                "introducing a new face",
                "scene cuts",
                "b-roll montage",
            ],
            "shot_scale": "medium",
            "talking_mode": "lip_sync_required",
            "render_lane": "talking_avatar",
            "persona_required": True,
            "use_locked_persona": True,
            "talking_duration_hint_seconds": min(10, max(5, int(scene.get("duration_seconds") or 5))),
            "subject_description": (
                f"the same avatar {avatar_name} speaking naturally to camera while holding and presenting {product_name}"
            ),
            "environment_description": "a realistic indoor Indian creator-style environment with clean product visibility",
            "camera_framing": "medium close-up or chest-up vertical phone-shot framing with avatar face and product visible together",
            "motion_intent": "natural speaking motion, subtle smile, small head nod, one clean product reveal, then stable product hold",
            "ending_hold_instruction": "last 1.5 seconds visually stable, same avatar and product still visible, no abrupt cut",
            "shot_archetype": "avatar_product_single_shot",
            "subtopic_visual_anchor": f"{product_name} visible with the same avatar in one continuous product recommendation shot",
            "extra_avoid_guidance": "avoid identity drift, avoid product replacement, avoid scene cuts, avoid b-roll, avoid new people",
            "indian_context_note": (
                "Prefer Indian creator styling, Indian indoor home or creator-room context, and realistic Indian social-media ad aesthetics."
            ),
            "sora_negative_guidance": (
                "avoid changing the face; avoid introducing a second spokesperson; avoid weak product visibility; "
                "avoid glossy TV-commercial polish; avoid unreadable text in frame; avoid swapping the uploaded product; "
                "avoid b-roll, montage cuts, or scene changes"
            ),
            "continuity_guidance": (
                f"Preserve the same avatar identity and the same {product_name} throughout one continuous shot."
            ),
            "anti_repetition_note": "Single-shot recipe: do not create multiple visual scenes or stage changes.",
            "qa_flags": [
                flag
                for flag in [
                    "must_show_elements_present" if must_show else "",
                    "must_avoid_elements_present" if must_avoid else "",
                    "strict_script_lock" if avatar_product_brief.strict_script_lock else "",
                    "single_shot_avatar_product",
                ]
                if flag
            ],
        }

        return [planned_scene]

    stage_blueprint = (
        ("hook", "Hook", "avatar_hook", "open with the avatar introducing the product quickly"),
        ("showcase", "Showcase", "product_showcase", "show the avatar naturally presenting or using the product"),
        ("cta", "CTA", "avatar_cta", "close with the same avatar giving a clear recommendation and CTA"),
    )
    

    planned: list[dict[str, Any]] = []

    for index, scene in enumerate(base_scenes):
        stage_name, stage_label, scene_type, stage_goal = stage_blueprint[index]

        if stage_name == "hook":
            topic_focus = f"{avatar_name} introduces {product_name} for {target_audience} with a quick hook around {key_promise} on {platform}"
            visual_objective = f"Stop the scroll quickly and introduce {product_name} through the same avatar."
            subject_description = f"the same avatar {avatar_name} speaking directly to camera and introducing {product_name} naturally"
            environment_description = "a realistic indoor creator-style environment with clean product visibility"
            camera_framing = "medium close-up or selfie-style framing with strong face readability and product context"
            motion_intent = "light natural creator motion with a stable opening beat"
            talking_mode = "lip_sync_required"
            render_lane = "talking_avatar"
            shot_scale = "medium"
            shot_archetype = "avatar_product_hook"
            subtopic_visual_anchor = f"{product_name} introduced quickly by the same avatar"
        elif stage_name == "showcase":
            topic_focus = f"{product_name} is shown clearly in hand or in use by {avatar_name}, proving {key_promise}. {category_specific_details}".strip()
            visual_objective = f"Keep the same avatar on screen while making {product_name} clearly visible and believable through one clean showcase moment."
            subject_description = f"the same avatar {avatar_name} clearly visible on screen, naturally holding, using, or presenting {product_name}"
            environment_description = "the same indoor environment with continuity-safe creator realism and clear product visibility"
            camera_framing = "medium shot or medium close-up with both avatar face and product visible together whenever possible"
            motion_intent = "controlled demo-style motion with visible product handling, same avatar continuity, and no abrupt movement"
            talking_mode = "lip_sync_required"
            render_lane = "talking_avatar"
            shot_scale = "medium"
            shot_archetype = "avatar_product_showcase"
            subtopic_visual_anchor = f"{product_name} clearly visible with the same avatar on screen"
        else:
            topic_focus = f"{avatar_name} closes with a natural recommendation for {product_name} and CTA: {cta}, aligned to {campaign_objective}"
            visual_objective = f"End with the same avatar clearly on screen in a creator-style recommendation close, with stable CTA framing for {product_name}."
            subject_description = f"the same avatar {avatar_name} clearly visible on screen, wrapping up the recommendation with {product_name} still visible"
            environment_description = "the same indoor creator environment with stable closing composition and continuity-safe product framing"
            camera_framing = "stable medium close-up with avatar face and product visible together in the same frame"
            motion_intent = "minimal motion with calm CTA close, same-avatar continuity, and stable ending"
            talking_mode = "lip_sync_required"
            render_lane = "talking_avatar"
            shot_scale = "medium"
            shot_archetype = "avatar_product_cta"
            subtopic_visual_anchor = f"{product_name} visible with the same avatar in the final recommendation close"

        planned_scene = {
            **scene,
            "stage_name": stage_name,
            "stage_label": stage_label,
            "scene_type": scene_type,
            "stage_goal": stage_goal,
            "topic_focus": topic_focus,
            "visual_objective": visual_objective,
            "transition_intent": (
                "Start with a stable first beat and move naturally into the product showcase."
                if stage_name == "hook"
                else "Turn product visibility into trust and recommendation."
                if stage_name == "showcase"
                else "Resolve into a calm native-feeling CTA ending with stable product visibility."
            ),
            "transition_from_previous": (
                "Ease in naturally with the same selected avatar and product."
                if index == 0
                else f"Continue naturally from {stage_blueprint[index - 1][1]} with the same avatar, same product, and same creator environment."
            ),
            "transition_to_next": (
                "Finish with enough stability to hand off naturally into Showcase."
                if stage_name == "hook"
                else "Finish with enough stability to hand off naturally into CTA."
                if stage_name == "showcase"
                else "Settle cleanly and hold long enough for the ad close to feel intentional."
            ),
            "ugc_ad_family": "avatar_product_ad",
            "ugc_ad_subtopic": product_category,
            "ugc_mode": "avatar_product",
            "ugc_style": "creator_casual",
            "client_brief_mode": False,
            "single_creator_mode": True,
            "creator_anchor": "same selected avatar across all scenes",
            "continuity_subject_role": "avatar_spokesperson",
            "continuity_subject_label": avatar_name,
            "continuity_anchor": "same selected avatar clearly visible on screen, same product, same indoor creator environment",
            "must_preserve_subject_identity": True,
            "must_avoid_new_spokesperson": True,
            "school_testimonial_mode": False,
            "business_name": "",
            "business_category": product_category,
            "city": "",
            "locality": "",
            "target_audience": target_audience,
            "main_service_or_product": product_name,
            "main_pain_point": pain_point,
            "key_promise": key_promise,
            "trust_factor": "",
            "offer": "",
            "cta": cta,
            "platform": platform,
            "campaign_objective": campaign_objective,
            "brand_tone": brand_tone,
            "category_specific_details": category_specific_details,
            "must_show_elements": list(avatar_product_brief.must_show_elements or []),
            "must_avoid_elements": list(avatar_product_brief.must_avoid_elements or []),
            "compliance_notes": avatar_product_brief.compliance_notes,
            "claims_to_avoid": list(avatar_product_brief.claims_to_avoid or []),
            "script_mode": avatar_product_brief.script_mode,
            "provided_script": avatar_product_brief.provided_script,
            "strict_script_lock": avatar_product_brief.strict_script_lock,
            "qa_flags": [
                flag
                for flag in [
                    "must_show_elements_present" if must_show else "",
                    "must_avoid_elements_present" if must_avoid else "",
                    "strict_script_lock" if avatar_product_brief.strict_script_lock else "",
                ]
                if flag
            ],
            "tone": "creator_confident_friendly",
            "ad_goal": "purchase",
            "brief_location_context": "",
            "brief_service_context": product_name,
            "avoid_motifs": [
                "changing to a different spokesperson",
                "product hidden for too long",
                "glossy TV-commercial polish",
                "random stock-footage drift",
                "introducing a new face in CTA",
            ],
            "shot_scale": shot_scale,
            "talking_mode": talking_mode,
            "render_lane": render_lane,
            "persona_required": True,
            "use_locked_persona": True,
            "talking_duration_hint_seconds": min(5, max(3, int(scene.get("duration_seconds") or 5))),
            "subject_description": subject_description,
            "environment_description": environment_description,
            "camera_framing": camera_framing,
            "motion_intent": motion_intent,
            "ending_hold_instruction": (
                "last 1.5 seconds visually stable, same avatar and product still visible, no abrupt CTA cut, no new visual idea in the final second"
                if stage_name == "cta"
                else "scene ending resolves cleanly with a brief stable hold for stitching"
            ),
            "shot_archetype": shot_archetype,
            "subtopic_visual_anchor": subtopic_visual_anchor,
            "extra_avoid_guidance": "avoid identity drift and avoid replacing the uploaded product with a different unrelated item",
            "indian_context_note": (
                "Prefer Indian creator styling, Indian indoor home or creator-room context, and realistic Indian social-media ad aesthetics when humans appear."
            ),
            "sora_negative_guidance": (
                "avoid changing the face between scenes; avoid introducing a second spokesperson; "
                "avoid weak product visibility; avoid glossy TV-commercial polish; "
                "avoid unreadable text in frame; avoid swapping the uploaded product with a different item"
            ),
            "continuity_guidance": f"Preserve the same avatar identity and the same {product_name} across all scenes, and keep the avatar visibly present on screen in each scene.",
            "anti_repetition_note": (
                "Keep the product story moving forward while preserving the same avatar and same product continuity."
            )
        }

        planned.append(planned_scene)

    return planned


def _ugc_talking_mode_for_stage(*, stage_name: str, family: str, cta: str | None = None) -> str:
    if family != "local_service_ugc_ad":
        return "none"
    if stage_name == "hook":
        return "lip_sync_required"
    if stage_name == "problem":
        return "voiceover_safe"
    if stage_name == "product_intro":
        return "none"
    if stage_name == "proof":
        return "none"
    if stage_name == "benefit":
        return "voiceover_safe"
    if stage_name == "cta":
        return "voiceover_safe"
    return "none"


def _ugc_render_lane_for_talking_mode(talking_mode: str) -> str:
    if talking_mode == "lip_sync_required":
        return "talking_avatar"
    if talking_mode == "voiceover_safe":
        return "broll_safe"
    return "cinematic_broll"


def _ugc_scene_grammar_for_family(family: str) -> tuple[tuple[str, str, str, str], ...]:
    grammars = {
        "local_service_ugc_ad": (
            ("hook", "Hook", "local creator opener", "start with a relatable local need or trust hook"),
            ("problem", "Local Need", "daily-life problem setup", "show the real-world issue or desire the local service solves"),
            ("product_intro", "Service Intro", "service reveal", "introduce the service, business, or location clearly"),
            ("proof", "Trust Or Demo", "trust-building proof", "show believable service proof, treatment, or result in action"),
            ("benefit", "Result", "local payoff shot", "show the practical outcome or convenience after using the service"),
            ("cta", "CTA", "local business close", "close with a clear local-booking CTA"),
        ),
        "testimonial_ugc_ad": (
            ("hook", "Hook", "selfie testimonial opener", "start with a personal payoff or surprising result"),
            ("problem", "Personal Context", "creator context", "show the before state or friction point quickly"),
            ("product_intro", "What Changed", "product reveal", "introduce the product or service as the turning point"),
            ("proof", "Use Moment", "proof or demo", "show believable usage or proof"),
            ("benefit", "Benefit", "result shot", "land the emotional or practical benefit"),
            ("cta", "CTA", "creator close", "close with a simple native-feeling CTA"),
        ),
        "demo_ugc_ad": (
            ("hook", "Hook", "product-in-hand opener", "show the product quickly with immediate curiosity"),
            ("problem", "Need State", "desire setup", "clarify what problem or need this solves"),
            ("product_intro", "Product Intro", "quick reveal", "anchor the product clearly in the frame"),
            ("proof", "How It Works", "demo close-up", "show the main use moment step by step"),
            ("benefit", "Result", "payoff shot", "show what users get after using it"),
            ("cta", "CTA", "creator close", "end with a direct creator-style CTA"),
        ),
        "offer_hook_ugc_ad": (
            ("hook", "Offer Hook", "offer-first opener", "lead with the strongest offer or scroll-stopping claim"),
            ("problem", "Need", "fast pain point", "show why the offer matters right now"),
            ("product_intro", "Product Intro", "quick reveal", "introduce the product fast so the ad feels concrete"),
            ("proof", "Proof", "proof or demo", "show credibility through demo or social proof"),
            ("benefit", "Result", "benefit shot", "show the benefit that makes the offer feel worth acting on"),
            ("cta", "CTA", "offer close", "land a clear urgency-aware CTA"),
        ),
    }
    return grammars.get(
        family,
        (
            ("hook", "Hook", "creator opener", "start with a quick native hook"),
            ("problem", "Problem", "pain point setup", "show the friction or desire clearly"),
            ("product_intro", "Product Intro", "product reveal", "introduce the product or service before the ad drifts"),
            ("proof", "Proof", "demo or social proof", "show believable proof, demo, or use moment"),
            ("benefit", "Benefit", "result shot", "show the benefit or result in a human way"),
            ("cta", "CTA", "creator close", "end with a calm but clear CTA"),
        ),
    )


def _ugc_topic_focus_for_stage(
    *,
    family: str,
    stage_name: str,
    topic: str,
    client_brief: UgcAdClientBrief | None = None,
    client_brief_mode: bool = False,
) -> str:
    brief = client_brief or UgcAdClientBrief()
    stage_focus = {
        "hook": f"the fastest scroll-stopping angle for {topic}",
        "problem": f"the main pain point, desire, or context around {topic}",
        "product_intro": f"the core product or service promise in {topic}",
        "proof": f"the most believable demo, use moment, or proof for {topic}",
        "benefit": f"the clearest result or user benefit from {topic}",
        "cta": f"the easiest next step viewers should take for {topic}",
    }
    family_hint = {
        "problem_solution_ugc_ad": "with a clear before-to-after problem-solution angle",
        "testimonial_ugc_ad": "through personal creator-style experience",
        "demo_ugc_ad": "through product use clarity",
        "offer_hook_ugc_ad": "through offer-led urgency and product visibility",
    }.get(family, "through native short-form ad clarity")
    if client_brief_mode:
        business = brief.business_name or brief.business_category or brief.main_service_or_product or topic
        audience = brief.target_audience or "the target audience"
        location = ", ".join(part for part in (brief.locality, brief.city) if part)
        promise = brief.key_promise or "the main business promise"
        cta = brief.cta or "the next action"
        localized = f" for {business}"
        if stage_name == "hook":
            return f"the most relevant scroll-stopping local hook{localized} for {audience}, centered on {promise}" + (f" in {location}" if location else "")
        if stage_name == "problem":
            return f"the pain point or desire that matters most to {audience}" + (f" around {location}" if location else "") + f", especially {brief.main_pain_point or promise}"
        if stage_name == "product_intro":
            return f"the clearest introduction of {business} and its promise of {promise}"
        if stage_name == "proof":
            return f"the most believable proof, trust signal, or demo for {business}" + (f", using {brief.trust_factor}" if brief.trust_factor else "")
        if stage_name == "benefit":
            return f"the practical result {audience} should expect from {business} because of {promise}"
        if stage_name == "cta":
            return f"the clearest next step for {audience}: {cta}"
    return f'{stage_focus.get(stage_name, f"the key selling point for {topic}")} {family_hint}.'


def _ugc_visual_objective_for_stage(*, stage_name: str, topic: str, topic_focus: str) -> str:
    objectives = {
        "hook": f"Stop the scroll in the first second and make {topic} feel immediately relevant.",
        "problem": f"Clarify the problem, desire, or frustration that makes {topic} worth watching.",
        "product_intro": f"Introduce {topic} early with strong product or service visibility.",
        "proof": f"Show believable proof or demo so viewers trust the main claim about {topic}.",
        "benefit": f"Visualize the payoff and result from {topic} in a simple human way.",
        "cta": f"Close with a clear call to action and a calm visually resolved end for {topic}.",
    }
    return f"{objectives.get(stage_name, f'Show one strong conversion-oriented beat for {topic}.')} Focus on {topic_focus}"


def build_ugc_ad_prompt_context(
    *,
    stage_name: str,
    topic: str,
    topic_focus: str,
    scene_type: str,
    family: str,
    subtopic: str,
    index: int,
    total_scenes: int,
    client_brief: UgcAdClientBrief | None = None,
    client_brief_mode: bool = False,
    business_context: dict[str, str] | None = None,
) -> dict[str, str]:
    brief = client_brief or UgcAdClientBrief()
    business_context = dict(business_context or {})
    shot_pack = _ugc_shot_pack(family=family, subtopic=subtopic)
    stage_override = shot_pack.get(stage_name, {})
    return {
        "subject_description": str(
            stage_override.get("subject_description")
            or _ugc_subject_description_for_stage(
                stage_name=stage_name,
                topic=topic,
                family=family,
                client_brief=brief,
                client_brief_mode=client_brief_mode,
            )
        ),
        "environment_description": str(
            stage_override.get("environment_description")
            or _ugc_environment_description_for_stage(
                stage_name=stage_name,
                family=family,
                client_brief=brief,
                client_brief_mode=client_brief_mode,
                business_context=business_context,
            )
        ),
        "camera_framing": str(
            stage_override.get("camera_framing")
            or _ugc_lipsync_safe_framing(
                stage_name=stage_name,
                family=family,
                client_brief_mode=client_brief_mode,
            )
        ),
        "motion_intent": str(stage_override.get("motion_intent") or _ugc_motion_intent_for_stage(stage_name=stage_name)),
        "ending_hold_instruction": str(stage_override.get("ending_hold_instruction") or _ugc_ending_hold_instruction_for_stage(stage_name=stage_name, index=index, total_scenes=total_scenes)),
        "shot_archetype": str(stage_override.get("shot_archetype") or f"{family}:{stage_name}"),
        "subtopic_visual_anchor": str(stage_override.get("subtopic_visual_anchor") or topic_focus),
        "extra_avoid_guidance": str(stage_override.get("extra_avoid_guidance") or "").strip(),
        "indian_context_note": _ugc_indian_context_note_for_stage(family=family, stage_name=stage_name, scene_type=scene_type, subtopic=subtopic),
        "sora_negative_guidance": _ugc_negative_guidance(stage_name=stage_name, family=family),
        "continuity_guidance": _ugc_continuity_guidance(stage_name=stage_name, index=index, total_scenes=total_scenes, topic_focus=topic_focus),
        "cta_style": str(stage_override.get("cta_style") or "native_creator_close"),
        "shot_scale": _ugc_shot_scale_for_stage(stage_name=stage_name, family=family),
    }


def _ugc_subject_description_for_stage(
    *,
    stage_name: str,
    topic: str,
    family: str,
    client_brief: UgcAdClientBrief,
    client_brief_mode: bool,
) -> str:
    if not client_brief_mode:
        return f"a creator-style subject making {topic} feel clear and believable"
    business = client_brief.business_name or client_brief.business_category or client_brief.main_service_or_product or topic
    audience = client_brief.target_audience or "the target audience"
    promise = client_brief.key_promise or "the core promise"
    if stage_name == "hook":
        return f"a creator or customer framing why {business} matters to {audience}, with the hook anchored in {client_brief.main_pain_point or promise}"
    if stage_name == "product_intro":
        return f"{business} introduced clearly as the solution, with the service or product visible and tied to {promise}"
    if stage_name == "proof":
        return f"a believable proof moment for {business}, showing {client_brief.main_service_or_product or client_brief.business_category or 'the offer'} in action"
    if stage_name == "benefit":
        return f"the audience visibly benefiting from {business} because of {promise}"
    if stage_name == "cta":
        return f"a creator or customer closing naturally around {business} with a clear next step to {client_brief.cta or 'act now'}"
    return f"a creator-style subject grounding {business} in real life for {audience}"


def _ugc_environment_description_for_stage(
    *,
    stage_name: str,
    family: str,
    client_brief: UgcAdClientBrief,
    client_brief_mode: bool,
    business_context: dict[str, str],
) -> str:
    if not client_brief_mode:
        return "a grounded mobile-first environment with clean product visibility"
    location_context = business_context.get("location_context") or "the relevant local area"
    category = client_brief.business_category or "the business category"
    if family == "local_service_ugc_ad":
        return (
            f"a believable Indian local-business environment for {category}, grounded in {location_context}, with real storefront, interior, neighborhood, or provider cues"
        )
    if category in {"dental clinic", "local clinic"}:
        return f"an Indian clinic environment in or around {location_context}, with reception, consultation, or treatment-room realism and no hospital-drama styling"
    if category in {"salon / beauty studio"}:
        return f"an Indian salon or beauty-studio environment around {location_context}, with believable mirrors, chairs, tools, and creator-trial context"
    if category in {"gym / fitness studio"}:
        return f"an Indian gym or fitness-studio environment around {location_context}, with real workout or trainer-led cues and no luxury promo look"
    if category in {"restaurant / cafe"}:
        return f"an Indian neighborhood cafe or restaurant context around {location_context}, with walk-in, table, counter, or food-service realism"
    if category in {"coaching / education center"}:
        return f"an Indian classroom, coaching center, desk, or student environment around {location_context}, with believable study context"
    return f"a grounded Indian environment connected to {business_context.get('local_business_context') or category}, with believable daily-life realism"


def _ugc_shot_pack(*, family: str, subtopic: str) -> dict[str, dict[str, str]]:
    normalized_subtopic = str(subtopic or "").lower().strip()

    if normalized_subtopic in {
        "skincare",
        "skin care",
        "serum",
        "sunscreen",
        "face wash",
        "cleanser",
        "moisturizer",
        "acne",
        "pimple",
        "beauty",
        "makeup",
        "lipstick",
        "foundation",
        "shampoo",
        "hair oil",
        "hair serum",
    }:
        return {
            "hook": {
                "shot_archetype": "beauty_skincare_hook",
                "subtopic_visual_anchor": "a creator reacting to a visible beauty, skin, or hair concern in a native mirror or selfie moment",
                "subject_description": "a creator in a believable bathroom, vanity, or bedroom setup showing a real beauty or skincare frustration or desire",
                "environment_description": "an Indian bathroom, vanity, bedroom mirror area, or natural dressing-table setup with lived-in realism",
                "camera_framing": "selfie-style medium close-up or mirror-shot close-up with strong face readability",
                "motion_intent": "light handheld realism and quick emotional clarity in the first second",
                "extra_avoid_guidance": "avoid luxury beauty-commercial slow motion or sterile studio makeup-table styling",
            },
            "product_intro": {
                "shot_archetype": "beauty_skincare_product_intro",
                "subtopic_visual_anchor": "the product clearly visible in-hand with packaging, texture, or applicator readable",
                "subject_description": "the creator revealing the skincare, beauty, or hair product clearly in hand with immediate use context",
                "environment_description": "the same bathroom, vanity, or bedroom setting with natural creator realism",
                "camera_framing": "close-up or medium close-up with product and hand readability",
                "motion_intent": "smooth reveal into stable product visibility",
                "extra_avoid_guidance": "avoid making the product look like a floating glossy packshot disconnected from the creator",
            },
            "proof": {
                "shot_archetype": "beauty_skincare_demo",
                "subtopic_visual_anchor": "a real application, texture, blend, or use moment that shows how the product works",
                "subject_description": "the creator applying, using, or demonstrating the product in a believable way with visible texture or routine context",
                "environment_description": "a natural personal-care environment with clean but non-commercial realism",
                "camera_framing": "close-up application framing with hands, face, hair, or product action clearly readable",
                "motion_intent": "controlled step-by-step application motion with one clear proof beat",
                "extra_avoid_guidance": "avoid impossible instant transformation or over-retouched skin and hair",
            },
            "benefit": {
                "shot_archetype": "beauty_skincare_result",
                "subtopic_visual_anchor": "the visible post-use payoff in confidence, texture, finish, or routine simplicity",
                "subject_description": "the creator showing the result naturally, such as cleaner skin, smoother routine, fresher look, or more confidence",
                "environment_description": "the same grounded personal space for continuity and trust",
                "camera_framing": "medium close-up result shot with face or hair clearly readable",
                "motion_intent": "small payoff motion followed by a soft settle",
            },
            "cta": {
                "shot_archetype": "beauty_skincare_cta",
                "subtopic_visual_anchor": "a calm creator recommendation close with product still visible",
                "subject_description": "the same creator wrapping up naturally with the product visible and a clear recommendation or try-it close",
                "environment_description": "the same believable personal-care setting for continuity",
                "camera_framing": "stable medium close-up or selfie framing with product in frame",
                "motion_intent": "minimal motion and calm final resolution",
                "ending_hold_instruction": "last second visually stable, face and product both readable, no abrupt glamour cut",
                "cta_style": "beauty_creator_recommendation_close",
            },
        }

    if family == "local_service_ugc_ad" or normalized_subtopic in {
        "salon",
        "spa",
        "clinic",
        "dentist",
        "gym",
        "restaurant",
        "cafe",
        "repair",
        "plumber",
        "electrician",
    }:
        return {
            "hook": {
                "shot_archetype": "local_service_hook",
                "subtopic_visual_anchor": "a relatable local problem or result spoken by a creator or customer in a real neighborhood context",
                "subject_description": "a creator or customer in a believable local setting highlighting the everyday problem or need this service solves",
                "environment_description": "an Indian apartment, Indian street, neighborhood storefront, Indian salon, clinic, cafe, gym, or service location with real local context",
                "camera_framing": "selfie-style medium close-up or observational medium shot with clear local context",
                "motion_intent": "light handheld realism with immediate daily-life relevance",
                "extra_avoid_guidance": "avoid generic luxury showroom or foreign stock-business lobbies",
            },
            "product_intro": {
                "shot_archetype": "local_service_intro",
                "subtopic_visual_anchor": "the local service, business front, or provider introduced clearly and quickly",
                "subject_description": "the local service provider, storefront, treatment room, work setup, or team shown clearly as the solution",
                "environment_description": "an Indian neighborhood business environment with recognizable local trust cues",
                "camera_framing": "medium-wide or wide reveal showing storefront, clinic, team, or service environment clearly, not face-only framing",
                "motion_intent": "smooth reveal into stable service visibility",
                "extra_avoid_guidance": "avoid abstract branding shots with no actual business or provider context",
            },
            "proof": {
                "shot_archetype": "local_service_proof",
                "subtopic_visual_anchor": "the service happening in real time or the outcome being shown clearly",
                "subject_description": "a believable treatment, repair, consultation, meal prep, workout, or service delivery moment that proves the business claim",
                "environment_description": "the real service environment with authentic local detail and no overproduction",
                "camera_framing": "detail shot, observational medium shot, or service-action framing that shows treatment, consultation, booking, or provider proof clearly",
                "motion_intent": "action-led motion with one readable service-proof beat",
                "extra_avoid_guidance": "avoid fake testimonial montage with no visible business proof",
            },
            "benefit": {
                "shot_archetype": "local_service_result",
                "subtopic_visual_anchor": "the local convenience, confidence, comfort, or outcome after using the service",
                "subject_description": "the customer or creator experiencing the practical benefit after the service, with the local setting still believable",
                "environment_description": "the same neighborhood business or daily-life environment for continuity and trust",
                "camera_framing": "medium shot with clear human payoff and readable setting",
                "motion_intent": "natural payoff motion followed by a soft settle",
            },
            "cta": {
                "shot_archetype": "local_service_cta",
                "subtopic_visual_anchor": "a local-booking or visit-now CTA that still feels creator-native and trustworthy",
                "subject_description": "the creator or customer wrapping up with the service context visible and a clear next step like visit, book, or call",
                "environment_description": "the same Indian local-business environment with stable trust-building continuity",
                "camera_framing": "stable medium shot or 3/4 creator framing with clinic or service context still visible, avoid extreme face close-up",
                "motion_intent": "minimal motion and calm local-business resolution",
                "ending_hold_instruction": "last second visually stable, service context still visible, no abrupt CTA cut",
                "cta_style": "local_service_booking_close",
            },
        }

    if family == "testimonial_ugc_ad":
        return {
            "hook": {
                "shot_archetype": "testimonial_hook_selfie",
                "subtopic_visual_anchor": "a creator talking directly to camera with an immediate personal result or reaction",
                "subject_description": "a believable creator-like person speaking directly to camera, feeling relieved, impressed, or excited",
                "environment_description": "a real bedroom, bathroom, desk, vanity, kitchen, or casual home setting with no polished studio look",
                "camera_framing": "selfie-style medium close-up with handheld realism and clean face readability",
                "motion_intent": "light natural handheld motion with a confident first-second hook",
                "extra_avoid_guidance": "avoid polished presenter-commercial delivery",
            },
            "proof": {
                "shot_archetype": "testimonial_proof_use_moment",
                "subtopic_visual_anchor": "a believable use moment or proof detail that supports the personal claim",
                "subject_description": "the creator using the product or showing a believable proof moment tied to their experience",
                "environment_description": "a grounded daily-life environment with strong product visibility and no stock-footage drift",
                "camera_framing": "close-up or medium close-up with product and face both readable when possible",
                "motion_intent": "controlled natural motion with visible proof rather than generic beauty movement",
            },
            "cta": {
                "shot_archetype": "testimonial_cta_close",
                "subtopic_visual_anchor": "a calm direct-to-camera creator close with product still visible",
                "subject_description": "the same creator wrapping up with a natural recommendation and a simple next step",
                "environment_description": "the same believable environment for continuity and trust",
                "camera_framing": "selfie or medium close-up with stable final hold",
                "motion_intent": "minimal movement and clear final resolution",
                "ending_hold_instruction": "last second visually stable, product still visible, no abrupt CTA cut",
                "cta_style": "personal_recommendation_close",
            },
        }
    if family == "demo_ugc_ad":
        return {
            "hook": {
                "shot_archetype": "demo_fast_product_hook",
                "subtopic_visual_anchor": "the product shown clearly in-hand or in-use within the first second",
                "subject_description": "a creator revealing the product quickly with an immediate use-case cue",
                "environment_description": "a real mobile-first environment like a bedroom, bathroom, desk, kitchen, or car interior",
                "camera_framing": "close-up or medium close-up with product dominating the frame early",
                "motion_intent": "snappy but controlled reveal motion with no chaotic shake",
            },
            "proof": {
                "shot_archetype": "demo_how_it_works",
                "subtopic_visual_anchor": "a close-up practical demo showing exactly how the product works",
                "subject_description": "hands, product, and one clear action demonstrating the core product use moment",
                "environment_description": "a real use-case environment where the product naturally belongs",
                "camera_framing": "close-up demo framing with readable hands and product details",
                "motion_intent": "clear directional action showing one step at a time",
            },
            "benefit": {
                "shot_archetype": "demo_result_payoff",
                "subtopic_visual_anchor": "the visible result after using the product",
                "subject_description": "the user experiencing the payoff or improved outcome after the demo",
                "environment_description": "the same use-case environment, now showing the result clearly",
                "camera_framing": "medium shot or close-up result reveal with clean composition",
                "motion_intent": "small payoff motion, then a soft settle",
            },
        }
    if family == "offer_hook_ugc_ad":
        return {
            "hook": {
                "shot_archetype": "offer_hook_creator_open",
                "subtopic_visual_anchor": "a creator-style offer hook that still shows the product early",
                "subject_description": "a creator speaking directly to camera with offer urgency and immediate product context",
                "environment_description": "a believable creator environment, not a polished showroom",
                "camera_framing": "selfie or medium close-up with product entering frame quickly",
                "motion_intent": "light handheld realism and quick but readable opening energy",
                "extra_avoid_guidance": "avoid product appearing only after the offer line is over",
            },
            "cta": {
                "shot_archetype": "offer_hook_cta_endcard",
                "subtopic_visual_anchor": "a strong but native-feeling CTA close with clear next step",
                "subject_description": "the creator landing the final offer with product visible and a calm direct ask",
                "environment_description": "the same grounded environment for continuity and trust",
                "camera_framing": "stable medium close-up with product and face clearly readable",
                "motion_intent": "calm end hold with minimal motion",
                "ending_hold_instruction": "last second visually stable with the product visible and no abrupt urgency cut",
                "cta_style": "offer_driven_close",
            },
        }
    return {
        "hook": {
            "shot_archetype": "problem_solution_hook",
            "subtopic_visual_anchor": "a relatable scroll-stopping frustration or desire with fast product relevance",
            "subject_description": "a creator-like person reacting to a real pain point or desire that the product solves",
            "environment_description": "a grounded home, desk, bathroom, kitchen, shop, or day-to-day setting",
            "camera_framing": "selfie or medium close-up with immediate facial readability",
            "motion_intent": "light handheld realism and a quick clear pattern interrupt",
        },
        "product_intro": {
            "shot_archetype": "problem_solution_product_intro",
            "subtopic_visual_anchor": "the product or service entering clearly before the ad loses momentum",
            "subject_description": "the product or service revealed clearly in the creator's hands or environment",
            "environment_description": "the actual use environment where the product makes sense",
            "camera_framing": "close-up or medium close-up with strong product visibility",
            "motion_intent": "smooth reveal into a stable product read",
        },
        "proof": {
            "shot_archetype": "problem_solution_demo_proof",
            "subtopic_visual_anchor": "a visible use moment or proof detail that supports the core claim",
            "subject_description": "one believable demo or use moment showing why the product solves the problem",
            "environment_description": "a real-world setting that supports the claim naturally",
            "camera_framing": "close-up demo framing or over-the-shoulder use shot",
            "motion_intent": "clear action-driven motion with visible before-to-after logic",
        },
        "cta": {
            "shot_archetype": "problem_solution_cta_close",
            "subtopic_visual_anchor": "a creator-style CTA close that still feels native and product-led",
            "subject_description": "the creator wrapping the ad with the product visible and a clear recommendation",
            "environment_description": "the same grounded environment to preserve authenticity",
            "camera_framing": "medium close-up with stable final hold",
            "motion_intent": "minimal motion and a calm resolution",
            "ending_hold_instruction": "last second visually stable, product visible, no abrupt CTA cut",
            "cta_style": "native_creator_close",
        },
    }


def _ugc_avoid_motifs_for_stage(*, stage_name: str, family: str) -> list[str]:
    stage_specific = {
        "hook": ["slow cinematic beauty-shot openings", "product hidden for too long", "text-heavy title card scenes"],
        "problem": ["generic vague lifestyle filler", "pain point with no clear relevance to the product"],
        "product_intro": ["introducing the product too late", "weak product visibility", "floating unreadable text in frame"],
        "proof": ["proof with no visible product use", "fake-looking stock-footage demo", "overly polished commercial macro beauty shots"],
        "benefit": ["benefit scene disconnected from the product claim", "random luxury montage drift"],
        "cta": ["abrupt CTA cut", "hard commercial end card look", "final frame without product visibility"],
    }
    family_specific = {
        "problem_solution_ugc_ad": ["pain point that feels scripted instead of native", "product reveal delayed until the very end"],
        "testimonial_ugc_ad": ["multiple inconsistent creators across scenes", "corporate spokesperson energy"],
        "demo_ugc_ad": ["demo scenes with no clear action", "aesthetic-only product spins"],
        "offer_hook_ugc_ad": ["offer-only scenes with no product context", "fake urgency graphics inside the generated shot"],
    }
    return [*stage_specific.get(stage_name, []), *family_specific.get(family, [])]



def _ugc_lipsync_safe_framing(
    *,
    stage_name: str,
    family: str,
    client_brief_mode: bool,
) -> str:
    if stage_name == "hook":
        return "medium shot or 3/4 angle creator framing with visible environment context, avoid tight lips-visible talking close-up"
    if stage_name == "problem":
        return "medium shot, over-shoulder, or observational creator framing, avoid direct mouth-dominant close-up"
    if stage_name == "product_intro":
        return "medium or medium-wide framing with product or service context clearly visible, not face-only framing"
    if stage_name == "proof":
        return "detail shot, service-action shot, hands shot, booking shot, or observational medium shot with clear proof"
    if stage_name == "benefit":
        return "medium or medium-wide payoff shot with environment context and human result"
    if stage_name == "cta":
        return "stable medium shot or 3/4 creator framing with clinic, product, or service context, avoid tight face-only close-up"
    return "medium shot with natural environment context and no tight lips-visible talking framing"



def _ugc_shot_scale_for_stage(*, stage_name: str, family: str) -> str:
    mapping = {
        "hook": "medium",
        "problem": "medium",
        "product_intro": "wide" if family == "local_service_ugc_ad" else "medium",
        "proof": "detail",
        "benefit": "medium_wide",
        "cta": "medium",
    }
    return mapping.get(stage_name, "medium")


def _ugc_camera_framing_for_stage(*, stage_name: str, scene_type: str) -> str:
    mappings = {
        "hook": "selfie-style medium close-up or product-in-hand close-up with fast readability",
        "problem": "medium shot or selfie framing that keeps the creator emotion clear",
        "product_intro": "close-up or medium close-up with strong product visibility",
        "proof": "close-up demo framing or over-the-shoulder use shot with clear action",
        "benefit": "medium shot showing the result with face, product, or outcome readable",
        "cta": "stable medium close-up with product visible and a clean end hold",
    }
    return mappings.get(stage_name, f"{scene_type} framed for vertical creator-style clarity")


def _ugc_motion_intent_for_stage(*, stage_name: str) -> str:
    return {
        "hook": "light handheld realism or a quick but controlled reveal with a stable first beat that feels native to short-form creators",
        "problem": "natural human motion that keeps the pain point readable without melodrama",
        "product_intro": "smooth reveal into stable product readability",
        "proof": "clear action-led motion showing one demo step or proof beat at a time",
        "benefit": "natural payoff motion followed by a soft settle",
        "cta": "minimal motion and a stable finish with no new visual idea in the final second so the CTA lands cleanly",
    }.get(stage_name, "controlled creator-style motion with mobile-first readability")


def _ugc_ending_hold_instruction_for_stage(*, stage_name: str, index: int, total_scenes: int) -> str:
    if stage_name == "cta" or index == total_scenes - 1:
        return "last 1.5 seconds visually stable, product or service context still visible, no new visual idea in the final second, no abrupt CTA cut"
    return "end the shot cleanly with enough stability for the next scene to stitch naturally"


def _ugc_continuity_guidance(*, stage_name: str, index: int, total_scenes: int, topic_focus: str) -> str:
    if index == 0:
        return f"Open quickly but naturally, making {topic_focus} feel like the first beat of one continuous creator ad."
    if index == total_scenes - 1:
        return f"Resolve the ad cleanly around {topic_focus} so the final CTA feels intentional, continuity-safe, and does not introduce a new spokesperson."
    return f"Continue the same creator, product logic, and native short-form rhythm while moving into {topic_focus}."


def _ugc_transition_intent_for_family(*, family: str, stage_name: str, previous_stage: str, next_stage: str) -> str:
    if stage_name == "hook":
        return f"Start with a stable first beat, then move quickly from curiosity into a clear {next_stage or 'problem'} beat without losing product relevance."
    if stage_name == "proof":
        return f"Turn visible proof into a believable benefit so the ad feels trustworthy, not over-produced."
    if stage_name == "cta":
        return "Resolve into a calm native-feeling CTA ending with stable product visibility."
    return f"Carry the same creator-style realism from {previous_stage or 'the opening'} into {next_stage or 'the close'}."


def _ugc_transition_from_previous(*, family: str, previous_stage: str, stage_label: str) -> str:
    if not previous_stage:
        return "Ease in naturally like a creator continuing one thought on camera."
    return f"Continue naturally from {previous_stage} into {stage_label} with the same creator, setting, and product logic."


def _ugc_transition_to_next(*, family: str, next_stage: str) -> str:
    if not next_stage:
        return "Settle cleanly and hold long enough for the ad close to feel intentional."
    return f"Finish with enough stability to hand off naturally into {next_stage}."


def _ugc_negative_guidance(*, stage_name: str, family: str) -> str:
    family_specific = {
        "local_service_ugc_ad": "avoid corporate showroom polish; avoid empty reception-lobby drift; avoid hiding the actual provider, place, or treatment context; avoid introducing a second parent or customer spokesperson; avoid changing the spokesperson's face between hook, proof, and CTA",
    }.get(family, "")
    guidance = (
        "avoid polished TV-commercial look; avoid generic foreign stock-footage feel; avoid unreadable in-frame text; "
        "avoid fake title-card scenes; avoid irrelevant beauty-shot drift; avoid weak product visibility; "
        "avoid over-cinematic spectacle if it weakens authenticity; avoid abrupt ending motion before cut"
    )
    return f"{guidance}; {family_specific}".strip("; ")


def _ugc_indian_context_note_for_stage(*, family: str, stage_name: str, scene_type: str, subtopic: str) -> str:
    normalized_subtopic = str(subtopic or "").lower().strip()
    if normalized_subtopic in {
        "skincare",
        "skin care",
        "serum",
        "sunscreen",
        "face wash",
        "cleanser",
        "moisturizer",
        "acne",
        "pimple",
        "beauty",
        "makeup",
        "lipstick",
        "foundation",
        "shampoo",
        "hair oil",
        "hair serum",
    }:
        return (
            "Prefer Indian creators, Indian bathrooms, Indian bedroom vanity setups, Indian apartments, and Indian beauty-routine context "
            "instead of generic Western influencer or luxury studio beauty settings."
        )
    if stage_name in {"hook", "problem", "proof", "benefit", "cta"}:
        return (
            "When people or daily-life context appears, prefer Indian creators, Indian homes, Indian apartments, Indian kitchens, "
            "Indian bedrooms, Indian bathrooms, Indian cafes, Indian clinics, Indian shops, Indian neighborhoods, and Indian city settings "
            "when that fits the product or service naturally."
        )
    if family in {"local_service_ugc_ad", "problem_solution_ugc_ad"}:
        return "If a local business or daily-life environment is shown, ground it in familiar Indian street, apartment, shop, or clinic context."
    return ""

def _build_ugc_scene_plan_qa_flags(
    *,
    scene: dict[str, Any],
    previous_scene_type: str,
    previous_focus: str,
    client_brief: UgcAdClientBrief,
    client_brief_mode: bool,
) -> list[str]:
    flags: list[str] = []
    stage_name = str(scene.get("stage_name") or "").strip()
    scene_type = str(scene.get("scene_type") or "").strip()
    topic_focus = str(scene.get("topic_focus") or "").strip()
    subject_description = str(scene.get("subject_description") or "").lower()
    camera_framing = str(scene.get("camera_framing") or "").lower()
    motion_intent = str(scene.get("motion_intent") or "").lower()
    shot_scale = str(scene.get("shot_scale") or "").strip().lower()
    must_preserve_subject_identity = bool(scene.get("must_preserve_subject_identity"))
    must_avoid_new_spokesperson = bool(scene.get("must_avoid_new_spokesperson"))
    continuity_anchor = str(scene.get("continuity_anchor") or "").lower()
    school_testimonial_mode = bool(scene.get("school_testimonial_mode"))

    if stage_name == "hook" and "hook" not in str(scene.get("visual_objective") or "").lower():
        flags.append("weak_hook_risk")
    if stage_name == "hook":
        abrupt_open = "abrupt" in motion_intent or (
            "quick" in motion_intent
            and "controlled" not in motion_intent
            and "stable" not in motion_intent
        )
        if abrupt_open:
            flags.append("intro_abrupt_motion_risk")
    if stage_name in {"product_intro", "proof"} and "product" not in subject_description and "service" not in subject_description:
        flags.append("missing_product_visibility_risk")
    if stage_name == "proof" and not any(token in subject_description for token in ("demo", "use", "proof", "showing", "using", "product")):
        flags.append("weak_demo_risk")
    if stage_name == "cta" and "cta" not in str(scene.get("stage_goal") or "").lower() and "call to action" not in str(scene.get("visual_objective") or "").lower():
        flags.append("cta_clarity_risk")
    if "studio" in subject_description or "commercial" in subject_description:
        flags.append("native_authenticity_risk")
    if any(token in subject_description for token in ("luxury showroom", "sterile studio", "glossy beauty table")):
        flags.append("native_authenticity_risk")
    if "generic" in subject_description:
        flags.append("generic_creator_risk")
    if previous_scene_type and scene_type == previous_scene_type:
        flags.append("repeated_scene_type_risk")
    if previous_focus and topic_focus == previous_focus:
        flags.append("repeated_topic_focus_risk")
    if stage_name != "hook" and "product" not in subject_description and "service" not in subject_description and "creator" not in subject_description:
        flags.append("late_product_intro_risk")
    if stage_name == "cta" and "stable" not in str(scene.get("ending_hold_instruction") or "").lower():
        flags.append("cta_clarity_risk")
    if stage_name == "cta":
        ending_hold = str(scene.get("ending_hold_instruction") or "").lower()
        if "stable" not in ending_hold or "no new visual idea" not in ending_hold:
            flags.append("outro_resolution_risk")
    if "handheld" not in camera_framing and "selfie" not in camera_framing and stage_name in {"hook", "problem"}:
        flags.append("native_authenticity_risk")
    if "chaotic" in motion_intent:
        flags.append("native_authenticity_risk")
    if not scene.get("indian_context_note"):
        flags.append("missing_indian_context_bias")
    if "tight lips-visible" in camera_framing:
        flags.append("lip_sync_authenticity_risk")

    if stage_name in {"hook", "problem", "cta"} and shot_scale == "medium" and "close-up" in camera_framing:
        flags.append("talking_head_overuse_risk")

    if previous_scene_type and scene_type == previous_scene_type and shot_scale in {"medium", "medium_close", "close"}:
        flags.append("face_framing_repetition_risk")   
    if must_preserve_subject_identity and "same" not in continuity_anchor:
        flags.append("parent_identity_drift_risk")
    if must_avoid_new_spokesperson and stage_name in {"proof", "benefit", "cta"} and "same" not in continuity_anchor:
        flags.append("multiple_spokesperson_risk")
    if must_avoid_new_spokesperson and stage_name == "cta":
        flags.append("cta_new_face_risk")
    if school_testimonial_mode:
        flags.append("school_testimonial_continuity_risk")

    if client_brief_mode:
        if not client_brief.business_name:
            flags.append("missing_business_name")
        if not (client_brief.locality or client_brief.city):
            flags.append("missing_locality_context")
        if not client_brief.target_audience:
            flags.append("missing_target_audience")
        if not client_brief.key_promise:
            flags.append("missing_key_promise")
        if not client_brief.cta or client_brief.cta.lower() in {"learn more", "check now", "try now"}:
            flags.append("generic_cta_risk")
        if not client_brief.trust_factor and scene.get("ugc_ad_family") == "local_service_ugc_ad":
            flags.append("weak_local_trust_risk")
        if not client_brief.offer and "offer" in str(scene.get("ugc_ad_family") or ""):
            flags.append("weak_offer_specificity_risk")
        detail_count = sum(
            1
            for value in (
                client_brief.business_name,
                client_brief.business_category,
                client_brief.city,
                client_brief.locality,
                client_brief.target_audience,
                client_brief.main_service_or_product,
                client_brief.main_pain_point,
                client_brief.key_promise,
                client_brief.trust_factor,
                client_brief.offer,
                client_brief.cta,
            )
            if str(value or "").strip()
        )
        if detail_count >= 9 and len(" ".join(str(value) for value in client_brief.__dict__.values())) > 420:
            flags.append("overstuffed_brief_risk")
    return list(dict.fromkeys(flags))


def _infer_business_category(normalized_topic: str) -> str:
    category_keywords: tuple[tuple[str, tuple[str, ...]], ...] = (
        ("dental clinic", ("dental clinic", "dentist", "teeth cleaning", "root canal", "dental")),
        ("salon / beauty studio", ("salon", "beauty studio", "bridal makeup", "makeup artist", "beauty clinic")),
        ("skincare product", ("skincare", "serum", "sunscreen", "face wash", "cleanser", "moisturizer", "acne")),
        ("gym / fitness studio", ("gym", "fitness studio", "trainer", "weight loss", "workout")),
        ("restaurant / cafe", ("restaurant", "cafe", "coffee shop", "eatery", "food outlet")),
        ("local repair service", ("repair", "plumber", "electrician", "ac service", "appliance repair")),
        ("local clinic", ("clinic", "physio", "doctor consultation", "medical clinic")),
        ("coaching / education center", ("coaching", "tuition", "education center", "ielts", "study center")),
        ("app/software service", ("app", "software", "saas", "dashboard", "crm", "platform")),
        ("e-commerce product", ("shop", "e-commerce", "d2c", "buy online", "product brand")),
    )
    for category, keywords in category_keywords:
        if any(keyword in normalized_topic for keyword in keywords):
            return category
    return ""


def _extract_business_name(raw_text: str, business_category: str) -> str:
    patterns = (
        r'for\s+([^,]+?)\s+in\s+[A-Z]',
        r'for\s+([^,]+?),\s*focused on',
        r'for\s+([^,]+?),\s*serving',
    )
    for pattern in patterns:
        match = re.search(pattern, raw_text, re.IGNORECASE)
        if match:
            candidate = " ".join(match.group(1).split()).strip(" .")
            if candidate and len(candidate.split()) <= 8:
                return candidate
    if business_category and business_category in raw_text.lower():
        match = re.search(rf'([A-Z][A-Za-z.&\'\-\s]+{re.escape(business_category.split()[0])}[A-Za-z.&\'\-\s]*)', raw_text)
        if match:
            return " ".join(match.group(1).split()).strip(" .")
    return ""


def _extract_location(raw_text: str) -> tuple[str, str]:
    match = re.search(r'\bin\s+([A-Z][A-Za-z.\'\-\s]+?)(?:,\s*([A-Z][A-Za-z.\'\-\s]+))?(?:,| focused| for | serving|$)', raw_text)
    if not match:
        return "", ""
    first = " ".join((match.group(1) or "").split()).strip(" .")
    second = " ".join((match.group(2) or "").split()).strip(" .")
    if second:
        return first, second
    common_localities = ("nagar", "road", "marg", "phase", "sector", "colony", "extension", "market")
    if any(token in first.lower() for token in common_localities):
        return first, ""
    return "", first


def _extract_target_audience(raw_text: str) -> str:
    patterns = (
        r'for\s+([^.,]+?)(?:\s+focused on|\s+with|\s+who|\s+in\b|$)',
        r'for nearby\s+([^.,]+)',
        r'for\s+([^.,]+?\sprofessionals)',
        r'for\s+([^.,]+?\sfamilies)',
    )
    for pattern in patterns:
        match = re.search(pattern, raw_text, re.IGNORECASE)
        if match:
            value = " ".join(match.group(1).split()).strip(" .")
            if value and len(value.split()) <= 8:
                return value
    return ""


def _extract_after_marker(raw_text: str, markers: tuple[str, ...]) -> str:
    lowered = raw_text.lower()
    for marker in markers:
        index = lowered.find(marker)
        if index >= 0:
            value = raw_text[index + len(marker):].split(",")[0].split(".")[0].strip(" :-")
            if value and len(value.split()) <= 12:
                return value
    return ""


def _extract_offer(raw_text: str) -> str:
    offer_markers = (
        "free consultation",
        "limited discount",
        "discount",
        "trial offer",
        "free trial",
        "book now offer",
        "special offer",
        "limited-time offer",
    )
    lowered = raw_text.lower()
    match = next((marker for marker in offer_markers if marker in lowered), "")
    return match


def _extract_cta(raw_text: str, business_category: str) -> str:
    lowered = raw_text.lower()
    cta_markers = (
        "book appointment",
        "book your slot",
        "book now",
        "call today",
        "dm now",
        "shop now",
        "visit clinic",
        "visit today",
        "start free trial",
        "sign up now",
    )
    match = next((marker for marker in cta_markers if marker in lowered), "")
    if match:
        return match
    if business_category in {"dental clinic", "local clinic", "salon / beauty studio", "gym / fitness studio"}:
        return "book your slot"
    if business_category == "restaurant / cafe":
        return "visit today"
    if business_category == "app/software service":
        return "start free trial"
    if business_category == "e-commerce product":
        return "shop now"
    return ""


def _extract_service_or_product(raw_text: str, business_category: str, business_name: str) -> str:
    if business_name:
        cleaned = raw_text.replace(business_name, "").strip(" ,-")
    else:
        cleaned = raw_text
    if business_category and business_category in cleaned.lower():
        return business_category
    marker = re.search(r'for\s+(.+?)(?:\s+in\s+[A-Z]| focused on| serving|$)', cleaned, re.IGNORECASE)
    if marker:
        value = " ".join(marker.group(1).split()).strip(" .")
        if value and len(value.split()) <= 10:
            return value
    return business_category


def _infer_ad_goal(*, cta: str, business_category: str) -> str:
    lowered_cta = str(cta or "").lower()
    if any(token in lowered_cta for token in ("book", "call", "visit")):
        return "lead_generation"
    if any(token in lowered_cta for token in ("shop", "buy")):
        return "purchase"
    if any(token in lowered_cta for token in ("trial", "sign up")):
        return "signup"
    if business_category in {"restaurant / cafe", "dental clinic", "local clinic", "salon / beauty studio", "gym / fitness studio"}:
        return "lead_generation"
    return "conversion"


def _infer_brief_tone(business_category: str, ad_goal: str) -> str:
    if business_category in {"dental clinic", "local clinic"}:
        return "warm_trustworthy_reassuring"
    if business_category in {"salon / beauty studio", "skincare product"}:
        return "creator_confident_friendly"
    if business_category in {"app/software service"}:
        return "clear_smart_problem_solving"
    if ad_goal == "lead_generation":
        return "trust_first_local_conversion"
    return "creator_casual_conversion"


def _extract_language_preference(normalized_topic: str) -> str:
    if "hindi" in normalized_topic:
        return "Hindi"
    if "hinglish" in normalized_topic:
        return "Hinglish"
    if "punjabi" in normalized_topic:
        return "Punjabi"
    return ""


def _extract_creator_preference(normalized_topic: str) -> str:
    if "female creator" in normalized_topic or "woman creator" in normalized_topic:
        return "female"
    if "male creator" in normalized_topic or "man creator" in normalized_topic:
        return "male"
    return ""


def _scene_grammar_for_family(family: str) -> tuple[tuple[str, str, str, str], ...]:
    grammars = {
        "organ_anatomy_explainer": (
            ("hook", "Hook", "relatable human setup", "open with a smooth real-life reason the organ matters"),
            ("concept_introduction", "Organ Overview", "anatomical overview", "show where the organ is and what it does"),
            ("mechanism", "Internal Mechanism", "internal process close-up", "explain the organ process step by step"),
            ("concrete_example", "Body Example", "real-life body example", "connect the organ to a concrete human experience"),
            ("implication", "Why It Matters", "cause-and-effect illustration", "show the consequence of the organ doing its job"),
            ("closing_takeaway", "Closing Takeaway", "calm visual recap", "end with a clean body-centered summary"),
        ),
        "body_system_explainer": (
            ("hook", "Hook", "relatable human setup", "open with a human-scale reason the body system matters"),
            ("concept_introduction", "System Overview", "system overview", "orient the viewer to the system and its main parts"),
            ("mechanism", "System Mechanism", "process overview", "show how the system works across connected parts"),
            ("concrete_example", "Everyday Example", "real-life example", "make the system understandable through a relatable example"),
            ("implication", "Body Impact", "cause-and-effect illustration", "show what changes when the system works"),
            ("closing_takeaway", "Closing Takeaway", "calm visual recap", "summarize why this system matters to daily life"),
        ),
        "biology_process_explainer": (
            ("hook", "Hook", "curiosity setup", "open with a simple real-life question about the biological process"),
            ("concept_introduction", "Process Introduction", "process overview", "show what the biological process is"),
            ("mechanism", "How It Works", "process close-up", "break the process into readable steps"),
            ("concrete_example", "Visible Example", "real-life example", "ground the process in a familiar biological example"),
            ("implication", "Process Result", "cause-and-effect illustration", "show the result of the process in the real world"),
            ("closing_takeaway", "Closing Takeaway", "calm visual recap", "end with a clear memorable lesson about the process"),
        ),
        "physics_space_explainer": (
            ("hook", "Hook", "curiosity setup", "open with an immediate visual question about the physical concept"),
            ("concept_introduction", "Concept Introduction", "system overview", "show the objects or forces involved"),
            ("mechanism", "Mechanism", "force/process illustration", "demonstrate the physical process step by step"),
            ("concrete_example", "Visual Example", "scale example", "use a strong example or analogy viewers can picture"),
            ("implication", "Consequence", "cause-and-effect illustration", "show what happens next because of the physics"),
            ("closing_takeaway", "Closing Takeaway", "calm visual recap", "resolve with a grounded scientific takeaway"),
        ),
        "geography_earth_explainer": (
            ("hook", "Hook", "earth-scale setup", "open with a real-world Earth process or location"),
            ("concept_introduction", "Earth Overview", "map or cross-section overview", "show the Earth feature or system clearly"),
            ("mechanism", "Natural Process", "process illustration", "demonstrate the Earth process step by step"),
            ("concrete_example", "Real Example", "place-based example", "ground the process in a specific understandable example"),
            ("implication", "Earth Impact", "cause-and-effect illustration", "show consequences in weather, land, water, or people"),
            ("closing_takeaway", "Closing Takeaway", "calm visual recap", "end with a stable Earth-focused summary"),
        ),
        "historical_character_explainer": (
            ("hook", "Hook", "character-led setup", "introduce the person through a memorable opening image"),
            ("concept_introduction", "Identity And Era", "era overview", "show who the person was and the world around them"),
            ("mechanism", "Defining Actions", "action progression", "show the important actions or achievements step by step"),
            ("concrete_example", "Turning Point", "historical moment", "focus on one pivotal event or decision"),
            ("implication", "Impact And Legacy", "cause-and-effect illustration", "show how the person changed later events or ideas"),
            ("closing_takeaway", "Closing Takeaway", "calm visual recap", "end with a legacy-focused summary"),
        ),
        "historical_event_explainer": (
            ("hook", "Hook", "event-led setup", "open with the event's immediate tension or significance"),
            ("concept_introduction", "Event Setup", "era overview", "show where and why the event began"),
            ("mechanism", "How It Unfolded", "timeline progression", "walk through the event's main progression"),
            ("concrete_example", "Human Moment", "human historical example", "ground the event in one vivid moment or figure"),
            ("implication", "Impact", "cause-and-effect illustration", "show what changed because of the event"),
            ("closing_takeaway", "Closing Takeaway", "calm visual recap", "end with a historical takeaway that feels complete"),
        ),
        "what_if_explainer": (
            ("hook", "Hook", "what-if setup", "open with the imagined change in a striking but understandable way"),
            ("concept_introduction", "Scenario Setup", "concept overview", "show the altered condition clearly"),
            ("mechanism", "Immediate Effect", "cause-and-effect process", "demonstrate the first chain reaction"),
            ("concrete_example", "Human Example", "real-life consequence", "show how people or the world would experience it"),
            ("implication", "Wider Consequence", "escalation illustration", "show the bigger implications of the scenario"),
            ("closing_takeaway", "Closing Takeaway", "calm visual recap", "end with a clean insight about why the scenario matters"),
        ),
        "how_it_works_explainer": (
            ("hook", "Hook", "curiosity setup", "open with the familiar system people use but rarely think about"),
            ("concept_introduction", "System Introduction", "overview", "show the system and its main parts clearly"),
            ("mechanism", "Step By Step Mechanism", "process illustration", "walk through how the system works"),
            ("concrete_example", "Practical Example", "real-world example", "show the system in everyday use"),
            ("implication", "Why It Matters", "cause-and-effect illustration", "show what the system enables or changes"),
            ("closing_takeaway", "Closing Takeaway", "calm visual recap", "resolve with a simple memorable explanation"),
        ),
    }
    return grammars.get(
        family,
        (
            ("hook", "Hook", "relatable human setup", "open with a smooth intro that builds curiosity"),
            ("concept_introduction", "Concept Introduction", "concept overview", "show what the topic is"),
            ("mechanism", "Mechanism", "process close-up", "explain how it works"),
            ("concrete_example", "Concrete Example", "real-life example", "ground it in a practical example"),
            ("implication", "Implication", "cause-and-effect illustration", "show why it matters"),
            ("closing_takeaway", "Closing Takeaway", "calm visual recap", "end with a clear educational summary"),
        ),
    )


def _topic_focus_for_stage(*, family: str, stage_name: str, topic: str) -> str:
    family_focus = {
        "organ_anatomy_explainer": {
            "hook": "a relatable bodily function that makes the organ feel relevant immediately",
            "concept_introduction": "the organ's location, shape, and basic role in the body",
            "mechanism": "the internal organ process or tissue-level action step by step",
            "concrete_example": "a human everyday action that depends on the organ working properly",
            "implication": "how the organ affects energy, health, or survival",
            "closing_takeaway": "the organ as a steady essential part of the body",
        },
        "body_system_explainer": {
            "hook": "a daily-life reason the body system matters",
            "concept_introduction": "the system and its major connected parts",
            "mechanism": "how signals, fluids, or materials move through the system",
            "concrete_example": "a familiar example of the system in action",
            "implication": "how the system supports health and daily life",
            "closing_takeaway": "the body system as a coordinated team",
        },
        "biology_process_explainer": {
            "hook": "a real-life question that makes the biological process feel relevant",
            "concept_introduction": "what the process is and where it happens",
            "mechanism": "the step-by-step biological process",
            "concrete_example": "a visible familiar example of the process",
            "implication": "why the process matters in life or nature",
            "closing_takeaway": "the main lesson viewers should remember about the process",
        },
        "physics_space_explainer": {
            "hook": "a striking but understandable physical scenario",
            "concept_introduction": "the main object, force, or system involved",
            "mechanism": "the physical law or interaction driving the effect",
            "concrete_example": "a scale-based or everyday analogy for the physics",
            "implication": "what happens next in the world or universe",
            "closing_takeaway": "a grounded scientific takeaway",
        },
        "geography_earth_explainer": {
            "hook": "a real Earth-based event or place that grabs curiosity",
            "concept_introduction": "the Earth layer, feature, or system being explained",
            "mechanism": "the natural process or movement involved",
            "concrete_example": "a place-based or weather-based example",
            "implication": "how people, land, water, or climate are affected",
            "closing_takeaway": "the Earth process summarized clearly",
        },
        "historical_character_explainer": {
            "hook": "a memorable human moment that introduces the historical figure",
            "concept_introduction": "the person's identity, era, and environment",
            "mechanism": "the actions, decisions, or work that defined the person",
            "concrete_example": "one pivotal event or achievement",
            "implication": "the person's impact or legacy",
            "closing_takeaway": "why this person still matters today",
        },
        "historical_event_explainer": {
            "hook": "the event's central tension or turning point",
            "concept_introduction": "the era and setup of the event",
            "mechanism": "how the event unfolded over time",
            "concrete_example": "one vivid human-scale historical moment",
            "implication": "what changed because of the event",
            "closing_takeaway": "the core historical lesson",
        },
        "what_if_explainer": {
            "hook": "the altered scenario in a striking but readable way",
            "concept_introduction": "what has changed in the imagined scenario",
            "mechanism": "the first chain of consequences",
            "concrete_example": "how people or the environment would experience the change",
            "implication": "the bigger system-level consequence",
            "closing_takeaway": "the insight revealed by the what-if scenario",
        },
        "how_it_works_explainer": {
            "hook": "a familiar system people rely on every day",
            "concept_introduction": "the system and its main parts",
            "mechanism": "the step-by-step working process",
            "concrete_example": "an everyday example of the system in use",
            "implication": "why the system matters in normal life",
            "closing_takeaway": "the simplified explanation viewers should remember",
        },
        "general_educational_explainer": {
            "hook": "a concrete curiosity-building setup tied to ordinary life",
            "concept_introduction": "a clear overview of what the topic is and where it appears",
            "mechanism": "the main internal process or logic behind the topic",
            "concrete_example": "a practical human-scale example",
            "implication": "the consequence or real-world meaning of the topic",
            "closing_takeaway": "a visually clear summary of the core lesson",
        },
    }
    return family_focus.get(family, family_focus["general_educational_explainer"]).get(stage_name, f"the clearest educational angle for {topic}")


def _avoid_motifs_for_stage(*, stage_name: str, family: str) -> list[str]:
    stage_specific = {
        "hook": ["cold abstract science tunnel visuals", "text-heavy title cards inside the generated scene"],
        "concept_introduction": ["generic glowing network visuals without a clear overview", "unreadable floating labels inside the scene"],
        "mechanism": ["purely decorative particle motion with no visible process", "reusing the same overview shot from the previous scene"],
        "concrete_example": ["returning to abstract lab visuals when a human example is needed", "detached cosmic filler that does not explain anything"],
        "implication": ["another copy of the example scene without consequence", "vague beauty shots with no educational meaning"],
        "closing_takeaway": ["abrupt endings", "dense in-frame text", "repeating the hook composition exactly", "introducing a new visual idea in the final second"],
    }
    family_specific = {
        "organ_anatomy_explainer": ["fantasy anatomy", "back-view x-ray skeleton overlays", "misplaced organs", "medical-horror imagery"],
        "body_system_explainer": ["isolated organ shots that ignore the whole system", "confusing disconnected body parts", "medical-horror imagery"],
        "biology_process_explainer": ["generic synapse tunnel", "endless glowing neuron mesh", "abstract brain-light network with no clear concept progression"],
        "physics_space_explainer": ["generic galaxy swirl with no physical meaning", "floating numbers or equations inside the scene", "decorative sci-fi clutter"],
        "geography_earth_explainer": ["random space visuals for Earth-only topics", "inaccurate Earth internal structure", "decorative cosmic spectacle"],
        "historical_character_explainer": ["modern props that break the era", "inconsistent face or costume across scenes", "generic fantasy styling"],
        "historical_event_explainer": ["modern props that break the era", "timeline confusion", "generic fantasy battle visuals"],
        "what_if_explainer": ["unrelated symbolic objects", "spectacle with no causal logic", "chaotic montage with no scenario progression"],
        "how_it_works_explainer": ["decorative factory montage with no mechanism", "floating UI-like labels inside the scene", "generic abstract tech tunnels"],
    }
    return [
        *stage_specific.get(stage_name, []),
        *family_specific.get(family, []),
    ]


def build_deep_explainer_prompt_context(
    *,
    stage_name: str,
    topic: str,
    topic_focus: str,
    scene_type: str,
    family: str,
    subtopic: str,
    index: int,
    total_scenes: int,
) -> dict[str, str]:
    shot_pack = _subtopic_shot_pack(family=family, subtopic=subtopic)
    stage_override = shot_pack.get(stage_name, {})

    subject_description = str(
        stage_override.get("subject_description")
        or _subject_description_for_stage(family=family, stage_name=stage_name, topic=topic)
    )
    environment_description = str(
        stage_override.get("environment_description")
        or _environment_description_for_stage(family=family, stage_name=stage_name, topic=topic)
    )
    camera_framing = str(
        stage_override.get("camera_framing")
        or _camera_framing_for_stage(stage_name=stage_name, scene_type=scene_type, index=index, total_scenes=total_scenes)
    )
    motion_intent = str(
        stage_override.get("motion_intent")
        or _motion_intent_for_stage(stage_name=stage_name, family=family)
    )
    ending_hold_instruction = str(
        stage_override.get("ending_hold_instruction")
        or _ending_hold_instruction_for_stage(stage_name=stage_name, index=index, total_scenes=total_scenes)
    )
    extra_avoid_guidance = str(stage_override.get("extra_avoid_guidance") or "").strip()
    subtopic_visual_anchor = str(stage_override.get("subtopic_visual_anchor") or "").strip()
    shot_archetype = str(stage_override.get("shot_archetype") or f"{family}:{stage_name}").strip()
    indian_context_note = _indian_context_note_for_stage(
        family=family,
        stage_name=stage_name,
        scene_type=scene_type,
        subtopic=subtopic,
    )
    return {
        "subject_description": subject_description,
        "environment_description": environment_description,
        "camera_framing": camera_framing,
        "motion_intent": motion_intent,
        "ending_hold_instruction": ending_hold_instruction,
        "shot_archetype": shot_archetype,
        "subtopic_visual_anchor": subtopic_visual_anchor,
        "extra_avoid_guidance": extra_avoid_guidance,
        "indian_context_note": indian_context_note,
        "sora_negative_guidance": _sora_negative_guidance(stage_name=stage_name, family=family),
        "continuity_guidance": _continuity_guidance(stage_name=stage_name, index=index, total_scenes=total_scenes, topic_focus=topic_focus),
    }


def _subtopic_shot_pack(*, family: str, subtopic: str) -> dict[str, dict[str, str]]:
    normalized_subtopic = str(subtopic or "").lower().strip()

    if normalized_subtopic in {"brain", "memory formation"}:
        return {
            "hook": {
                "shot_archetype": "brain_memory_hook",
                "subtopic_visual_anchor": "a child or teen trying to remember something familiar, with subtle brain-focused visual emphasis",
                "subject_description": "a curious young person recalling a face, place, or lesson while the brain feels active but not sci-fi",
                "environment_description": "a grounded everyday setting like a classroom, bedroom desk, or quiet study space",
                "camera_framing": "medium close-up with a slow push-in toward the face and head",
                "motion_intent": "gentle human thought cues with subtle eye movement and calm focus, no chaotic brain effects",
                "extra_avoid_guidance": "avoid glowing neural tunnel visuals as the opening image",
            },
            "concept_introduction": {
                "shot_archetype": "brain_memory_overview",
                "subtopic_visual_anchor": "a clean brain overview showing major memory-related regions in a clear educational way",
                "subject_description": "a clear semi-transparent brain overview with emphasis on memory-related structure rather than decorative glowing meshes",
                "environment_description": "a calm educational studio-like anatomical environment with clean contrast and readable shape separation",
                "camera_framing": "three-quarter brain overview with a slow stabilised orbital drift",
                "motion_intent": "layered but minimal motion that helps orient the viewer to the brain's memory role",
                "extra_avoid_guidance": "avoid unreadable labels or floating text inside the scene",
            },
            "mechanism": {
                "shot_archetype": "brain_memory_encoding_process",
                "subtopic_visual_anchor": "signals moving through neurons in a controlled memory-encoding chain",
                "subject_description": "neurons forming and strengthening a memory pathway with clear cause-and-effect instead of abstract spectacle",
                "environment_description": "a microscopic but readable neural environment focused on one pathway becoming stronger",
                "camera_framing": "macro process view with a slow guided track along one active neural pathway",
                "motion_intent": "controlled neural firing ripples and strengthening connections with readable directional flow",
                "extra_avoid_guidance": "avoid repeating identical glowing synapse tunnel shots across the full middle section",
            },
            "concrete_example": {
                "shot_archetype": "brain_memory_real_life_example",
                "subtopic_visual_anchor": "a student recalling information or recognizing a loved one through memory",
                "subject_description": "a relatable real-world memory moment tied back to the brain process that just happened",
                "environment_description": "an everyday human environment with one clear emotional or educational memory trigger",
                "camera_framing": "medium shot with smooth observational motion and clear face readability",
                "motion_intent": "natural human-scale motion with a simple memory recall payoff",
            },
            "implication": {
                "shot_archetype": "brain_memory_life_impact",
                "subtopic_visual_anchor": "memory helping with learning, recognition, and decision-making in daily life",
                "subject_description": "a visible consequence of memory shaping learning, recognition, or behavior",
                "environment_description": "a slightly broader real-world environment showing why memory matters beyond one moment",
                "camera_framing": "wider educational framing with a gentle pull-back from the person into their environment",
                "motion_intent": "controlled consequence motion connecting internal memory to visible daily-life impact",
            },
            "closing_takeaway": {
                "shot_archetype": "brain_memory_closing_takeaway",
                "subtopic_visual_anchor": "a calm person with subtle brain-region emphasis and a stable educational ending",
                "subject_description": "a calm front or three-quarter human view with a subtle brain highlight that feels reassuring and educational",
                "environment_description": "a quiet resolved environment with low visual busyness and clean closure",
                "camera_framing": "front or three-quarter medium shot with a very gentle pull-back and a stable ending hold",
                "motion_intent": "minimal motion and soft settle, leaving the final memory idea visually clear",
                "ending_hold_instruction": "last 2 seconds visually stable, no new brain effects introduced, calm educational resolution for the final takeaway",
                "extra_avoid_guidance": "avoid ending on an abstract glowing brain mesh without human context",
            },
        }

    if normalized_subtopic in {"small intestine", "digestion", "nutrient absorption", "absorbs nutrients"}:
        return {
            "hook": {
                "shot_archetype": "digestion_hook",
                "subtopic_visual_anchor": "food becoming useful energy inside the body",
                "subject_description": "a real person eating or digesting food, setting up the question of how nutrients actually get absorbed",
                "environment_description": "a grounded meal or digestion-related everyday environment",
                "camera_framing": "medium shot with a slow push-in from the person toward the abdomen focus",
                "motion_intent": "gentle human-scale motion and a clean curiosity-building ease-in",
                "extra_avoid_guidance": "avoid extreme medical imagery in the opening scene",
            },
            "concept_introduction": {
                "shot_archetype": "small_intestine_overview",
                "subtopic_visual_anchor": "the small intestine correctly placed inside the abdomen with clear body context",
                "subject_description": "a clean front or three-quarter torso view with the small intestine highlighted in the correct abdominal region",
                "environment_description": "a simplified body-safe educational environment with clean anatomical clarity",
                "camera_framing": "front three-quarter anatomical overview with a slow stabilised drift",
                "motion_intent": "calm orienting motion that helps the viewer understand where absorption happens",
                "extra_avoid_guidance": "avoid back-view x-ray skeleton overlays and avoid highlighting the wrong digestive organ",
            },
            "mechanism": {
                "shot_archetype": "villi_absorption_process",
                "subtopic_visual_anchor": "nutrients passing through villi into the bloodstream in a clear step-by-step way",
                "subject_description": "the inner lining of the small intestine with villi absorbing nutrients into nearby blood vessels",
                "environment_description": "a controlled microscopic digestive environment focused on villi and absorption flow",
                "camera_framing": "macro cross-sectional process view with a slow guided track along the intestinal lining",
                "motion_intent": "clear directional nutrient flow through villi into the bloodstream with readable biological cause-and-effect",
                "extra_avoid_guidance": "avoid generic glowing biology tunnels that ignore villi structure",
            },
            "concrete_example": {
                "shot_archetype": "digestion_everyday_example",
                "subtopic_visual_anchor": "food from a meal becoming energy that the body can use",
                "subject_description": "an everyday human example showing the body using nutrients after absorption, such as walking, playing, or studying",
                "environment_description": "a relatable daily-life environment that connects digestion to energy and function",
                "camera_framing": "medium shot with smooth observational movement and clear body readability",
                "motion_intent": "natural daily-life motion that makes the absorption payoff visible and understandable",
            },
            "implication": {
                "shot_archetype": "digestion_body_benefit",
                "subtopic_visual_anchor": "absorbed nutrients supporting energy, growth, and body repair",
                "subject_description": "the body benefiting from successful nutrient absorption in an educational cause-and-effect way",
                "environment_description": "a broader human-scale environment showing healthy function and sustained energy",
                "camera_framing": "slightly wider cause-and-effect framing with a gentle pull-back",
                "motion_intent": "visible consequence motion connecting intestinal absorption to whole-body benefit",
            },
            "closing_takeaway": {
                "shot_archetype": "small_intestine_closing_takeaway",
                "subtopic_visual_anchor": "a stable body-centered recap with subtle digestive focus in the abdomen",
                "subject_description": "a calm front or three-quarter body view with a subtle highlight on the correct digestive region and no distorted anatomy",
                "environment_description": "a calm resolved body-safe environment with very low visual busyness and stable educational framing",
                "camera_framing": "front or three-quarter medium shot with a very gentle pull-back and locked stable hold in the final 2 seconds",
                "motion_intent": "minimal motion and calm settle with a clean body-centered ending",
                "ending_hold_instruction": "last 2 seconds visually stable, no new anatomical overlays added, clean body-safe educational closure",
                "extra_avoid_guidance": "avoid ending on skeletal, x-ray, or horror-leaning digestive imagery",
            },
        }

    if normalized_subtopic in {"heart", "lungs", "lung", "liver"}:
        organ_key = "lungs" if normalized_subtopic in {"lungs", "lung"} else normalized_subtopic
        organ_role = {
            "heart": "circulating blood and keeping the body supplied with oxygen",
            "lungs": "bringing oxygen in and sending carbon dioxide out",
            "liver": "filtering blood, processing nutrients, and supporting the body's chemistry",
        }[organ_key]
        organ_location = {
            "heart": "the center-left chest",
            "lungs": "the chest on both sides of the heart",
            "liver": "the upper right abdomen",
        }[organ_key]
        mechanism_subject = {
            "heart": "the heart chambers and valves pumping blood in a readable step-by-step cycle",
            "lungs": "air moving into the lungs and oxygen transferring across the air sacs in a clear breathing process",
            "liver": "blood and nutrients moving through the liver as it filters, processes, and stores what the body needs",
        }[organ_key]
        mechanism_anchor = {
            "heart": "blood flow moving through the heart in a clean pumping sequence",
            "lungs": "breathing and oxygen exchange shown in a simple step-by-step process",
            "liver": "the liver processing nutrients and filtering blood in a controlled internal sequence",
        }[organ_key]
        closing_subject = {
            "heart": "a calm front or three-quarter body view with a subtle highlight in the chest and a healthy stable pulse feeling",
            "lungs": "a calm front or three-quarter body view with subtle breathing emphasis across the chest and clear lung placement",
            "liver": "a calm front or three-quarter body view with subtle highlight in the upper right abdomen and correct liver placement",
        }[organ_key]
        return {
            "hook": {
                "shot_archetype": f"{organ_key}_hook",
                "subtopic_visual_anchor": f"an everyday human moment that makes the {organ_key} matter immediately",
                "subject_description": f"a real person in a relatable moment that depends on the {organ_key} doing its job well",
                "environment_description": "a grounded everyday environment with immediate body relevance and clean composition",
                "camera_framing": "medium shot with a slow push-in toward the person and relevant body region",
                "motion_intent": "gentle human-scale motion with a smooth curiosity-building ease-in",
                "extra_avoid_guidance": "avoid horror-leaning medical imagery in the opening scene",
            },
            "concept_introduction": {
                "shot_archetype": f"{organ_key}_overview",
                "subtopic_visual_anchor": f"the {organ_key} shown in the correct body location with clear body context",
                "subject_description": f"a clean front or three-quarter torso view with the {organ_key} clearly highlighted in {organ_location}",
                "environment_description": "a simplified anatomy-safe educational environment with clear organ placement and low clutter",
                "camera_framing": "front three-quarter anatomical overview with a slow stabilised drift",
                "motion_intent": "calm orienting motion that helps viewers understand where the organ is and what role it plays",
                "extra_avoid_guidance": "avoid back-view skeleton overlays and avoid highlighting the wrong organ or body region",
            },
            "mechanism": {
                "shot_archetype": f"{organ_key}_mechanism",
                "subtopic_visual_anchor": mechanism_anchor,
                "subject_description": mechanism_subject,
                "environment_description": "a controlled internal body environment focused on one clear organ process rather than abstract spectacle",
                "camera_framing": "macro or close internal process view with a slow guided track following the organ action",
                "motion_intent": "clear directional biological motion with readable cause-and-effect and no chaotic bursts",
                "extra_avoid_guidance": "avoid generic glowing anatomy tunnels that do not show the real organ process",
            },
            "concrete_example": {
                "shot_archetype": f"{organ_key}_real_life_example",
                "subtopic_visual_anchor": f"the {organ_key} helping in a clear everyday body example",
                "subject_description": f"a relatable real-life example showing how the {organ_key} supports movement, energy, or health",
                "environment_description": "an everyday human environment that turns anatomy into an understandable life example",
                "camera_framing": "medium shot with smooth observational motion and clear body readability",
                "motion_intent": "natural human-scale motion that makes the organ's benefit visible and believable",
            },
            "implication": {
                "shot_archetype": f"{organ_key}_implication",
                "subtopic_visual_anchor": f"the body benefiting because the {organ_key} is doing its job",
                "subject_description": f"the visible body-wide result of the {organ_key} supporting {organ_role}",
                "environment_description": "a slightly broader body-scale environment showing why the organ matters to health and daily life",
                "camera_framing": "wider cause-and-effect framing with a gentle pull-back and stable composition",
                "motion_intent": "controlled consequence motion connecting the organ process to whole-body benefit",
            },
            "closing_takeaway": {
                "shot_archetype": f"{organ_key}_closing_takeaway",
                "subtopic_visual_anchor": f"a calm body-centered recap with subtle {organ_key} emphasis and clean educational closure",
                "subject_description": closing_subject,
                "environment_description": "a calm resolved environment with low visual busyness and a stable body-centered final composition",
                "camera_framing": "front or three-quarter medium shot with a very gentle pull-back and locked stable end hold",
                "motion_intent": "minimal motion and calm settle so the final lesson lands clearly",
                "ending_hold_instruction": "last 2 seconds visually stable, no new anatomy overlays, calm educational closure with correct organ placement",
                "extra_avoid_guidance": "avoid ending on skeletal, x-ray, or distorted anatomy imagery",
            },
        }

    if normalized_subtopic in {"kidney", "kidneys", "stomach", "digestive system"}:
        body_key = "kidneys" if normalized_subtopic in {"kidney", "kidneys"} else normalized_subtopic
        body_role = {
            "kidneys": "filtering waste and balancing water in the body",
            "stomach": "breaking food down and mixing it for the next stage of digestion",
            "digestive system": "moving food through the body, breaking it down, and absorbing what the body needs",
        }[body_key]
        location_text = {
            "kidneys": "the lower back area on both sides of the spine",
            "stomach": "the upper left abdomen",
            "digestive system": "the full digestive path from mouth to intestines",
        }[body_key]
        mechanism_subject = {
            "kidneys": "the kidneys filtering blood and moving waste into urine in a readable step-by-step cycle",
            "stomach": "the stomach churning food and mixing it with digestive juices in a clear process view",
            "digestive system": "food moving through the digestive system in a connected step-by-step process from breakdown to absorption",
        }[body_key]
        mechanism_anchor = {
            "kidneys": "blood being filtered and body fluid balance being maintained in a simple internal sequence",
            "stomach": "food being broken down in the stomach before moving into the rest of digestion",
            "digestive system": "the digestive tract working as one coordinated chain from eating to nutrient use",
        }[body_key]
        closing_subject = {
            "kidneys": "a calm front or three-quarter body view with subtle lower-back kidney emphasis and correct placement",
            "stomach": "a calm front or three-quarter body view with subtle upper-abdomen stomach emphasis and clean anatomy-safe closure",
            "digestive system": "a calm front or three-quarter body view with subtle digestive-path emphasis and a clean full-system recap",
        }[body_key]
        return {
            "hook": {
                "shot_archetype": f"{body_key.replace(' ', '_')}_hook",
                "subtopic_visual_anchor": f"an everyday human moment that makes the {body_key} feel immediately relevant",
                "subject_description": f"a real person in a relatable daily-life moment that depends on {body_role}",
                "environment_description": "a grounded everyday human environment with clear body relevance",
                "camera_framing": "medium shot with a slow push-in toward the person and relevant body region",
                "motion_intent": "gentle human-scale motion with a smooth educational ease-in",
                "extra_avoid_guidance": "avoid exaggerated medical drama or horror-style anatomy",
            },
            "concept_introduction": {
                "shot_archetype": f"{body_key.replace(' ', '_')}_overview",
                "subtopic_visual_anchor": f"the {body_key} shown in the correct body context and location",
                "subject_description": f"a clean front or three-quarter torso view with the {body_key} clearly highlighted in {location_text}",
                "environment_description": "a simplified body-safe educational environment with low clutter and correct anatomy",
                "camera_framing": "front three-quarter anatomical overview with a slow stabilised drift",
                "motion_intent": "calm orienting motion that helps viewers understand the correct body location and system role",
                "extra_avoid_guidance": "avoid wrong-organ placement and avoid disconnected body parts with no system context",
            },
            "mechanism": {
                "shot_archetype": f"{body_key.replace(' ', '_')}_mechanism",
                "subtopic_visual_anchor": mechanism_anchor,
                "subject_description": mechanism_subject,
                "environment_description": "a controlled internal body environment focused on one clear process rather than abstract spectacle",
                "camera_framing": "macro or close internal process view with a slow guided track following the biological action",
                "motion_intent": "clear directional body-process motion with readable cause-and-effect",
                "extra_avoid_guidance": "avoid generic glowing anatomy tunnels that skip the real process",
            },
            "concrete_example": {
                "shot_archetype": f"{body_key.replace(' ', '_')}_real_life_example",
                "subtopic_visual_anchor": f"the {body_key} helping in a relatable everyday body example",
                "subject_description": f"a relatable real-life example showing how the {body_key} supports comfort, health, or energy",
                "environment_description": "an everyday human environment that turns internal anatomy into an understandable body example",
                "camera_framing": "medium shot with smooth observational motion and clear body readability",
                "motion_intent": "natural human-scale motion that makes the body benefit visible and believable",
            },
            "implication": {
                "shot_archetype": f"{body_key.replace(' ', '_')}_implication",
                "subtopic_visual_anchor": f"the body benefiting because the {body_key} is doing its job properly",
                "subject_description": f"the visible body-wide result of the {body_key} supporting {body_role}",
                "environment_description": "a broader body-scale environment showing why the process matters to daily health and function",
                "camera_framing": "wider cause-and-effect framing with a gentle pull-back and stable composition",
                "motion_intent": "controlled consequence motion linking the organ or system process to whole-body benefit",
            },
            "closing_takeaway": {
                "shot_archetype": f"{body_key.replace(' ', '_')}_closing_takeaway",
                "subtopic_visual_anchor": f"a calm body-centered recap with subtle {body_key} emphasis and clean educational closure",
                "subject_description": closing_subject,
                "environment_description": "a calm resolved environment with low visual busyness and stable body-centered composition",
                "camera_framing": "front or three-quarter medium shot with a very gentle pull-back and locked stable end hold",
                "motion_intent": "minimal motion and calm settle so the final body lesson lands clearly",
                "ending_hold_instruction": "last 2 seconds visually stable, no new anatomy overlays, calm body-safe educational closure",
                "extra_avoid_guidance": "avoid ending on skeletal, x-ray, or distorted anatomy imagery",
            },
        }

    if normalized_subtopic in {"immune system", "nervous system", "circulatory system"}:
        system_key = normalized_subtopic
        system_role = {
            "immune system": "defending the body from harmful germs and helping it recover",
            "nervous system": "sending signals between the brain, spinal cord, and the rest of the body",
            "circulatory system": "moving blood, oxygen, and nutrients through the body",
        }[system_key]
        system_overview = {
            "immune system": "a clean body-system overview showing protective cells, lymph pathways, and body defense context",
            "nervous system": "a clear body-system overview connecting the brain, spinal cord, and major nerves",
            "circulatory system": "a clear body-system overview connecting the heart, blood vessels, and body-wide flow",
        }[system_key]
        mechanism_subject = {
            "immune system": "immune cells recognizing and responding to a germ in a readable step-by-step defense process",
            "nervous system": "signals traveling from brain to nerves to body parts in a clean step-by-step communication process",
            "circulatory system": "blood moving through the heart and vessels to deliver oxygen and nutrients in a readable loop",
        }[system_key]
        mechanism_anchor = {
            "immune system": "the body's defense response activating in a controlled protective sequence",
            "nervous system": "brain-to-body signal flow happening in one clear directional sequence",
            "circulatory system": "blood circulation moving through the body in a clear continuous delivery cycle",
        }[system_key]
        return {
            "hook": {
                "shot_archetype": f"{system_key.replace(' ', '_')}_hook",
                "subtopic_visual_anchor": f"an everyday human moment that makes the {system_key} feel relevant right away",
                "subject_description": f"a real person in a daily-life moment that depends on the {system_key} working properly",
                "environment_description": "a grounded human environment with immediate body relevance and no medical drama",
                "camera_framing": "medium shot with a slow push-in toward the person and relevant body context",
                "motion_intent": "gentle human-scale motion with a clear curiosity-building ease-in",
                "extra_avoid_guidance": "avoid disconnected floating anatomy with no body context",
            },
            "concept_introduction": {
                "shot_archetype": f"{system_key.replace(' ', '_')}_overview",
                "subtopic_visual_anchor": system_overview,
                "subject_description": system_overview,
                "environment_description": "a simplified body-safe educational environment with low clutter and clear system structure",
                "camera_framing": "front three-quarter body-system overview with a slow stabilised drift",
                "motion_intent": "calm orienting motion that helps viewers understand the system layout and role",
                "extra_avoid_guidance": "avoid isolated organ shots that hide the full system logic",
            },
            "mechanism": {
                "shot_archetype": f"{system_key.replace(' ', '_')}_mechanism",
                "subtopic_visual_anchor": mechanism_anchor,
                "subject_description": mechanism_subject,
                "environment_description": "a controlled internal body environment focused on one readable system process",
                "camera_framing": "macro or close process view with a slow guided track following the system action",
                "motion_intent": "clear directional system motion with readable cause-and-effect and stable camera logic",
                "extra_avoid_guidance": "avoid generic glowing body tunnels that skip the actual system mechanism",
            },
            "concrete_example": {
                "shot_archetype": f"{system_key.replace(' ', '_')}_example",
                "subtopic_visual_anchor": f"the {system_key} helping in a relatable everyday body example",
                "subject_description": f"a relatable real-world example showing how the {system_key} supports normal life and health",
                "environment_description": "an everyday human environment that makes the system benefit easy to picture",
                "camera_framing": "medium shot with smooth observational motion and clear body readability",
                "motion_intent": "natural human-scale motion that makes the system's role feel believable and concrete",
            },
            "implication": {
                "shot_archetype": f"{system_key.replace(' ', '_')}_implication",
                "subtopic_visual_anchor": f"the body benefiting because the {system_key} is doing its job properly",
                "subject_description": f"the visible whole-body result of the {system_key} supporting {system_role}",
                "environment_description": "a broader body-scale environment showing why the system matters to daily life and survival",
                "camera_framing": "wider cause-and-effect framing with a gentle pull-back and stable composition",
                "motion_intent": "controlled consequence motion linking the system process to visible body-wide benefit",
            },
            "closing_takeaway": {
                "shot_archetype": f"{system_key.replace(' ', '_')}_closing_takeaway",
                "subtopic_visual_anchor": f"a calm body-centered recap with subtle {system_key} emphasis and clean educational closure",
                "subject_description": f"a calm front or three-quarter body view with subtle {system_key} emphasis and a clean full-system recap",
                "environment_description": "a calm resolved body-safe environment with low visual busyness and a stable final composition",
                "camera_framing": "front or three-quarter medium shot with a very gentle pull-back and locked stable final hold",
                "motion_intent": "minimal motion and calm settle so the final body-system lesson lands clearly",
                "ending_hold_instruction": "last 2 seconds visually stable, no new anatomy overlays, calm educational system closure",
                "extra_avoid_guidance": "avoid ending on distorted, isolated, or disconnected anatomy imagery",
            },
        }

    if normalized_subtopic in {"gravity", "black hole"}:
        topic_anchor = "gravity" if normalized_subtopic == "gravity" else "black holes"
        return {
            "hook": {
                "shot_archetype": f"{normalized_subtopic.replace(' ', '_')}_hook",
                "subtopic_visual_anchor": f"a grounded curiosity-first setup that makes {topic_anchor} feel immediate rather than decorative",
                "subject_description": (
                    "a familiar human-scale or Earth-scale setup that makes gravity immediately understandable"
                    if normalized_subtopic == "gravity"
                    else "a striking but readable cosmic setup showing a black hole as a powerful space object, not generic sci-fi art"
                ),
                "environment_description": (
                    "a grounded Earth environment with one simple visual cue that suggests force and weight"
                    if normalized_subtopic == "gravity"
                    else "a clean deep-space environment with clear scale, restrained detail, and no decorative clutter"
                ),
                "camera_framing": "wide or medium-wide shot with a slow push-in that builds curiosity without chaos",
                "motion_intent": "controlled cinematic ease-in with one clear visual idea, not a noisy spectacle montage",
                "extra_avoid_guidance": "avoid generic galaxy swirl spectacle that does not explain the concept",
            },
            "concept_introduction": {
                "shot_archetype": f"{normalized_subtopic.replace(' ', '_')}_concept_overview",
                "subtopic_visual_anchor": f"a readable overview of the main objects and physical relationship involved in {topic_anchor}",
                "subject_description": (
                    "Earth, falling objects, and the pull toward the ground shown in one readable physical setup"
                    if normalized_subtopic == "gravity"
                    else "the black hole, nearby space, and surrounding matter shown in a scientifically grounded overview"
                ),
                "environment_description": (
                    "a clear Earth-scale environment that makes force direction and object behavior easy to understand"
                    if normalized_subtopic == "gravity"
                    else "a space environment with clean contrast, visible reference objects, and readable spatial relationships"
                ),
                "camera_framing": "wide overview or overhead with a gentle stabilised drift and strong subject readability",
                "motion_intent": "calm orienting motion that clarifies the system before the mechanism begins",
            },
            "mechanism": {
                "shot_archetype": f"{normalized_subtopic.replace(' ', '_')}_mechanism",
                "subtopic_visual_anchor": f"the physical mechanism behind {topic_anchor} shown step by step",
                "subject_description": (
                    "objects moving because gravity pulls them, with direction and force made visually clear"
                    if normalized_subtopic == "gravity"
                    else "matter, light, or nearby space being affected by a black hole in a readable cause-and-effect progression"
                ),
                "environment_description": "a controlled physics-focused environment where force, motion, and result stay visually coherent",
                "camera_framing": "medium or macro process view with a slow guided track that follows the physical interaction",
                "motion_intent": (
                    "clear directional motion showing pull, fall, orbit, or acceleration in a readable way"
                    if normalized_subtopic == "gravity"
                    else "controlled curvature, pull, and orbital distortion with readable directional action and no chaotic camera motion"
                ),
                "extra_avoid_guidance": "avoid floating equations, decorative particles, or unrelated sci-fi ships",
            },
            "concrete_example": {
                "shot_archetype": f"{normalized_subtopic.replace(' ', '_')}_example",
                "subtopic_visual_anchor": f"a relatable example that makes {topic_anchor} easier to picture",
                "subject_description": (
                    "a simple everyday analogy or Earth example that makes gravity feel intuitive"
                    if normalized_subtopic == "gravity"
                    else "a clean analogy using orbiting matter, nearby stars, or scale comparison that makes black holes easier to grasp"
                ),
                "environment_description": "a strong example environment that feels explanatory, not decorative",
                "camera_framing": "medium-wide explanatory framing with smooth observational motion",
                "motion_intent": "clear example-based motion that supports understanding instead of spectacle",
            },
            "implication": {
                "shot_archetype": f"{normalized_subtopic.replace(' ', '_')}_implication",
                "subtopic_visual_anchor": f"the wider consequence of {topic_anchor} shown clearly",
                "subject_description": (
                    "gravity shaping motion, stability, and life on Earth in a visible consequence scene"
                    if normalized_subtopic == "gravity"
                    else "the black hole's effect on surrounding space, light, or nearby objects in a scientifically coherent consequence scene"
                ),
                "environment_description": "a broader environment showing why the concept matters beyond the mechanism itself",
                "camera_framing": "slightly wider cause-and-effect framing with a gentle pull-back and readable scale",
                "motion_intent": "broader but still controlled consequence motion with stable composition",
            },
            "closing_takeaway": {
                "shot_archetype": f"{normalized_subtopic.replace(' ', '_')}_closing_takeaway",
                "subtopic_visual_anchor": f"a calm resolved visual that leaves one clear lesson about {topic_anchor}",
                "subject_description": (
                    "a stable Earth-orbit or Earth-surface science image that leaves gravity feeling simple and grounded"
                    if normalized_subtopic == "gravity"
                    else "a calm resolved cosmic image of a black hole and surrounding space with clear conceptual closure, not spectacle overload"
                ),
                "environment_description": "a calmer resolved environment with low clutter and a clear final science takeaway",
                "camera_framing": "wide or medium-wide shot with a very gentle pull-back and locked stable end hold",
                "motion_intent": "minimal motion and stable settle, with the final moment visually quiet enough for the narration to land",
                "ending_hold_instruction": "last 2 seconds visually stable, no abrupt new motion, no last-second spectacle spike, clean science-focused resolution",
                "extra_avoid_guidance": "avoid ending on chaotic swirling motion or decorative cosmic overload",
            },
        }

    if normalized_subtopic in {"water cycle", "earthquakes", "volcano", "volcanoes"}:
        process_key = "volcanoes" if normalized_subtopic == "volcano" else normalized_subtopic
        subject_by_topic = {
            "water cycle": {
                "hook": "a familiar cloud, rain, river, or sunlit water scene that makes the water cycle feel immediate",
                "overview": "Earth's water moving between ocean, cloud, and land in one readable cycle overview",
                "mechanism": "evaporation, condensation, and precipitation happening step by step in a clear weather process",
                "example": "a real landscape where rain, rivers, or clouds show the cycle in action",
                "implication": "water supporting weather, crops, rivers, and life in a visible consequence scene",
                "closing": "a calm Earth-and-weather view that leaves one clear lesson about the water cycle",
            },
            "earthquakes": {
                "hook": "a stable real-world city or ground scene that hints at hidden movement below the surface",
                "overview": "tectonic plates and the Earth's crust shown clearly in a readable cross-section overview",
                "mechanism": "pressure building and releasing along a fault in a step-by-step geological process",
                "example": "a real place experiencing visible shaking or fault movement in a grounded educational way",
                "implication": "the visible effect on buildings, land, and people after the ground shifts",
                "closing": "a calm Earth cross-section or landscape resolving with a clear earthquake takeaway",
            },
            "volcanoes": {
                "hook": "a strong but grounded volcano landscape that creates curiosity without disaster-movie spectacle",
                "overview": "the volcano and magma chamber shown clearly in a readable cross-section overview",
                "mechanism": "magma rising, pressure building, and eruption logic shown step by step",
                "example": "a real volcanic landscape showing lava, ash, or venting in an educational way",
                "implication": "the effect on nearby land, air, and people once the volcano becomes active",
                "closing": "a calm resolved volcano or Earth-process view with clear educational closure",
            },
        }[process_key]
        return {
            "hook": {
                "shot_archetype": f"{process_key.replace(' ', '_')}_hook",
                "subtopic_visual_anchor": subject_by_topic["hook"],
                "subject_description": subject_by_topic["hook"],
                "environment_description": "a grounded Earth environment with strong real-world context and clean readable composition",
                "camera_framing": "wide or medium-wide shot with a slow push-in and stable horizon",
                "motion_intent": "gentle environmental motion that builds curiosity without chaos",
                "extra_avoid_guidance": "avoid unrelated cosmic spectacle or disaster-movie exaggeration in the opening scene",
            },
            "concept_introduction": {
                "shot_archetype": f"{process_key.replace(' ', '_')}_overview",
                "subtopic_visual_anchor": subject_by_topic["overview"],
                "subject_description": subject_by_topic["overview"],
                "environment_description": "a clear map-like or cross-sectional educational environment that helps viewers orient quickly",
                "camera_framing": "wide overview or overhead with a gentle stabilised drift and strong structural readability",
                "motion_intent": "calm orienting motion that clarifies the Earth process before the mechanism begins",
                "extra_avoid_guidance": "avoid unreadable labels or cluttered infographic-like frame composition",
            },
            "mechanism": {
                "shot_archetype": f"{process_key.replace(' ', '_')}_mechanism",
                "subtopic_visual_anchor": subject_by_topic["mechanism"],
                "subject_description": subject_by_topic["mechanism"],
                "environment_description": "a controlled process-focused Earth environment where the natural mechanism can be seen clearly",
                "camera_framing": "medium or close process view with a slow guided track following the natural movement",
                "motion_intent": "clear directional process motion with stable educational readability and no chaotic spectacle",
                "extra_avoid_guidance": "avoid generic beauty shots that skip the actual Earth process logic",
            },
            "concrete_example": {
                "shot_archetype": f"{process_key.replace(' ', '_')}_example",
                "subtopic_visual_anchor": subject_by_topic["example"],
                "subject_description": subject_by_topic["example"],
                "environment_description": "a real place-based environment that turns the Earth process into something viewers can picture clearly",
                "camera_framing": "medium-wide observational framing with smooth grounded movement",
                "motion_intent": "clear example-based motion that supports explanation over spectacle",
            },
            "implication": {
                "shot_archetype": f"{process_key.replace(' ', '_')}_implication",
                "subtopic_visual_anchor": subject_by_topic["implication"],
                "subject_description": subject_by_topic["implication"],
                "environment_description": "a broader Earth-scale consequence environment showing what changes next in land, water, weather, or people",
                "camera_framing": "slightly wider cause-and-effect framing with a gentle pull-back and clear scale cues",
                "motion_intent": "controlled consequence motion with stable Earth-focused composition",
            },
            "closing_takeaway": {
                "shot_archetype": f"{process_key.replace(' ', '_')}_closing_takeaway",
                "subtopic_visual_anchor": subject_by_topic["closing"],
                "subject_description": subject_by_topic["closing"],
                "environment_description": "a calmer resolved Earth environment with low visual busyness and stable educational closure",
                "camera_framing": "wide or medium-wide shot with a very gentle pull-back and locked stable final hold",
                "motion_intent": "minimal environmental motion and a soft settle so the final takeaway lands cleanly",
                "ending_hold_instruction": "last 2 seconds visually stable, no last-second eruption, rupture, or weather spike, clean Earth-focused resolution",
                "extra_avoid_guidance": "avoid ending on chaotic destruction or unrelated outer-space visuals",
            },
        }

    if normalized_subtopic in {"weather", "climate"}:
        earth_key = normalized_subtopic
        subject_by_topic = {
            "weather": {
                "hook": "a familiar changing-sky or outdoor scene that makes weather feel immediate and observable",
                "overview": "clouds, air movement, moisture, and sunlight shown in one readable weather overview",
                "mechanism": "air, moisture, heat, and cloud formation interacting in a simple step-by-step process",
                "example": "a grounded real-world weather example such as rain, wind, or storm buildup shown clearly",
                "implication": "the visible effect of weather on daily life, travel, clothing, and the environment",
                "closing": "a calm sky-and-landscape view that leaves one clear lesson about how weather works",
            },
            "climate": {
                "hook": "a readable contrast between long-term environmental patterns that makes climate feel understandable",
                "overview": "Earth regions, sunlight, oceans, and atmosphere shown in a clear climate overview",
                "mechanism": "long-term heat, water, and air patterns shaping climate over time in a step-by-step way",
                "example": "a grounded regional example showing how climate shapes vegetation, temperature, or rainfall patterns",
                "implication": "the visible effect of climate on ecosystems, farming, water, and daily human life",
                "closing": "a calm Earth-regional view that leaves one clear lesson about climate patterns",
            },
        }[earth_key]
        return {
            "hook": {
                "shot_archetype": f"{earth_key}_hook",
                "subtopic_visual_anchor": subject_by_topic["hook"],
                "subject_description": subject_by_topic["hook"],
                "environment_description": "a grounded Earth environment with strong real-world context and clear visual readability",
                "camera_framing": "wide or medium-wide shot with a slow push-in and stable horizon",
                "motion_intent": "gentle environmental motion that builds curiosity without spectacle overload",
                "extra_avoid_guidance": "avoid unrelated outer-space imagery for Earth-only topics",
            },
            "concept_introduction": {
                "shot_archetype": f"{earth_key}_overview",
                "subtopic_visual_anchor": subject_by_topic["overview"],
                "subject_description": subject_by_topic["overview"],
                "environment_description": "a clean Earth-system overview environment with readable atmospheric or regional structure",
                "camera_framing": "wide overview or overhead with a gentle stabilised drift and clear system orientation",
                "motion_intent": "calm orienting motion that clarifies the Earth-system setup before the mechanism begins",
                "extra_avoid_guidance": "avoid infographic clutter or unreadable labels inside the frame",
            },
            "mechanism": {
                "shot_archetype": f"{earth_key}_mechanism",
                "subtopic_visual_anchor": subject_by_topic["mechanism"],
                "subject_description": subject_by_topic["mechanism"],
                "environment_description": "a controlled Earth-process environment where the atmospheric or climate mechanism can be followed clearly",
                "camera_framing": "medium or close process view with a slow guided track following the environmental movement",
                "motion_intent": "clear directional process motion with stable educational readability and no chaotic spectacle",
                "extra_avoid_guidance": "avoid generic beautiful sky shots that do not explain the actual process",
            },
            "concrete_example": {
                "shot_archetype": f"{earth_key}_example",
                "subtopic_visual_anchor": subject_by_topic["example"],
                "subject_description": subject_by_topic["example"],
                "environment_description": "a real place-based example environment that turns the Earth process into something tangible",
                "camera_framing": "medium-wide observational framing with smooth grounded movement and clear subject hierarchy",
                "motion_intent": "example-based environmental motion that supports understanding over spectacle",
            },
            "implication": {
                "shot_archetype": f"{earth_key}_implication",
                "subtopic_visual_anchor": subject_by_topic["implication"],
                "subject_description": subject_by_topic["implication"],
                "environment_description": "a broader consequence environment showing how people, land, or ecosystems are affected",
                "camera_framing": "slightly wider cause-and-effect framing with a gentle pull-back and clear scale cues",
                "motion_intent": "controlled consequence motion with stable Earth-focused composition",
            },
            "closing_takeaway": {
                "shot_archetype": f"{earth_key}_closing_takeaway",
                "subtopic_visual_anchor": subject_by_topic["closing"],
                "subject_description": subject_by_topic["closing"],
                "environment_description": "a calmer resolved Earth environment with low visual busyness and stable educational closure",
                "camera_framing": "wide or medium-wide shot with a very gentle pull-back and locked stable final hold",
                "motion_intent": "minimal environmental motion and a soft settle so the final Earth-science lesson lands cleanly",
                "ending_hold_instruction": "last 2 seconds visually stable, no last-second weather spike or dramatic swing, clean Earth-focused resolution",
                "extra_avoid_guidance": "avoid ending on unrelated cosmic visuals or chaotic disaster motion",
            },
        }

    if normalized_subtopic in {"solar system", "seasons", "eclipse", "eclipses"}:
        space_key = "eclipses" if normalized_subtopic in {"eclipse", "eclipses"} else normalized_subtopic
        subject_by_topic = {
            "solar system": {
                "hook": "a readable space view that makes the solar system feel structured and understandable, not decorative",
                "overview": "the Sun and planets arranged in a clean solar-system overview with readable scale logic",
                "mechanism": "planetary motion and orbit progression shown in a simple step-by-step system view",
                "example": "one clear planet-focused example that helps viewers understand the larger solar system",
                "implication": "the solar system's structure creating stable orbital relationships and visible order",
                "closing": "a calm resolved solar-system view that leaves one clear space-science takeaway",
            },
            "seasons": {
                "hook": "a familiar Earth-based seasonal contrast that makes the question feel immediate",
                "overview": "Earth, the Sun, and axial tilt shown clearly in one readable overview",
                "mechanism": "Earth's tilt and orbit causing changing sunlight over time in a step-by-step process",
                "example": "a clear Earth-region example showing how sunlight changes create different seasons",
                "implication": "weather, daylight, and daily-life changes caused by the seasons",
                "closing": "a calm Earth-Sun view that leaves one clear lesson about why seasons happen",
            },
            "eclipses": {
                "hook": "a striking but readable sky setup showing the start of an eclipse without spectacle overload",
                "overview": "the Sun, Earth, and Moon aligned clearly in a simple eclipse overview",
                "mechanism": "the alignment and shadow logic behind an eclipse shown step by step",
                "example": "a grounded sky-view example of how an eclipse appears from Earth",
                "implication": "the visible effect of eclipse shadows and why eclipses do not happen every month",
                "closing": "a calm resolved Sun-Earth-Moon view with a stable eclipse takeaway",
            },
        }[space_key]
        return {
            "hook": {
                "shot_archetype": f"{space_key.replace(' ', '_')}_hook",
                "subtopic_visual_anchor": subject_by_topic["hook"],
                "subject_description": subject_by_topic["hook"],
                "environment_description": "a clean space-or-Earth setting with strong scientific readability and low decorative clutter",
                "camera_framing": "wide or medium-wide shot with a slow push-in and stable orientation",
                "motion_intent": "controlled cinematic ease-in with one clear educational idea and no chaos",
                "extra_avoid_guidance": "avoid generic sci-fi spectacle that does not explain the system",
            },
            "concept_introduction": {
                "shot_archetype": f"{space_key.replace(' ', '_')}_overview",
                "subtopic_visual_anchor": subject_by_topic["overview"],
                "subject_description": subject_by_topic["overview"],
                "environment_description": "a clear space-science overview environment with readable scale and orientation",
                "camera_framing": "wide overview or overhead with a gentle stabilised drift and strong system readability",
                "motion_intent": "calm orienting motion that clarifies the system before the mechanism begins",
                "extra_avoid_guidance": "avoid impossible planetary scale relationships unless they are educationally necessary",
            },
            "mechanism": {
                "shot_archetype": f"{space_key.replace(' ', '_')}_mechanism",
                "subtopic_visual_anchor": subject_by_topic["mechanism"],
                "subject_description": subject_by_topic["mechanism"],
                "environment_description": "a controlled space-process environment where motion, orbit, tilt, or alignment stay visually coherent",
                "camera_framing": "medium or close process view with a slow guided track following the physical action",
                "motion_intent": "clear directional space-process motion with readable cause-and-effect and stable camera logic",
                "extra_avoid_guidance": "avoid floating equations, decorative particles, or unrelated spacecraft",
            },
            "concrete_example": {
                "shot_archetype": f"{space_key.replace(' ', '_')}_example",
                "subtopic_visual_anchor": subject_by_topic["example"],
                "subject_description": subject_by_topic["example"],
                "environment_description": "a strong explanatory example environment that makes the space concept easier to picture",
                "camera_framing": "medium-wide explanatory framing with smooth observational motion and clear subject hierarchy",
                "motion_intent": "example-based motion that supports understanding over spectacle",
            },
            "implication": {
                "shot_archetype": f"{space_key.replace(' ', '_')}_implication",
                "subtopic_visual_anchor": subject_by_topic["implication"],
                "subject_description": subject_by_topic["implication"],
                "environment_description": "a broader consequence environment showing why the space concept matters or what it changes",
                "camera_framing": "slightly wider cause-and-effect framing with a gentle pull-back and readable scale cues",
                "motion_intent": "broader but still controlled consequence motion with stable science composition",
            },
            "closing_takeaway": {
                "shot_archetype": f"{space_key.replace(' ', '_')}_closing_takeaway",
                "subtopic_visual_anchor": subject_by_topic["closing"],
                "subject_description": subject_by_topic["closing"],
                "environment_description": "a calmer resolved space-science environment with low clutter and a stable educational ending",
                "camera_framing": "wide or medium-wide shot with a very gentle pull-back and locked stable final hold",
                "motion_intent": "minimal motion and stable settle so the final science lesson lands cleanly",
                "ending_hold_instruction": "last 2 seconds visually stable, no abrupt orbital or shadow jump, clean space-science resolution",
                "extra_avoid_guidance": "avoid ending on chaotic cosmic swirl or decorative spectacle overload",
            },
        }

    return {}


def _build_scene_plan_qa_flags(*, scene: dict[str, Any], previous_scene_type: str, previous_focus: str) -> list[str]:
    flags: list[str] = []
    scene_type = str(scene.get("scene_type") or "").strip()
    topic_focus = str(scene.get("topic_focus") or "").strip()
    avoid_motifs = [str(item).strip().lower() for item in (scene.get("avoid_motifs") or []) if str(item).strip()]
    motion_intent = str(scene.get("motion_intent") or "").lower()
    subject_description = str(scene.get("subject_description") or "").lower()
    stage_name = str(scene.get("stage_name") or "").strip()

    if previous_scene_type and scene_type == previous_scene_type:
        flags.append("repeated_scene_type_risk")
    if previous_focus and topic_focus == previous_focus:
        flags.append("repeated_topic_focus_risk")
    if "abstract" in subject_description or "generic" in subject_description:
        flags.append("generic_subject_risk")
    if "chaotic" in motion_intent or "spectacle" in motion_intent:
        flags.append("motion_clarity_risk")
    if stage_name == "closing_takeaway" and "stable" not in str(scene.get("ending_hold_instruction") or "").lower():
        flags.append("ending_hold_risk")
    if any("glowing neural tunnel" in item or "generic galaxy swirl" in item for item in avoid_motifs):
        flags.append("motif_repetition_watch")
    if not scene.get("shot_archetype"):
        flags.append("missing_shot_archetype")
    if not scene.get("subtopic_visual_anchor"):
        flags.append("missing_subtopic_anchor")
    if not scene.get("indian_context_note"):
        flags.append("missing_indian_context_bias")
    return flags


def _indian_context_note_for_stage(*, family: str, stage_name: str, scene_type: str, subtopic: str) -> str:
    normalized_subtopic = str(subtopic or "").lower().strip()

    if family in {"organ_anatomy_explainer", "body_system_explainer", "biology_process_explainer"}:
        if stage_name in {"hook", "concrete_example", "implication", "closing_takeaway"}:
            return (
                "When showing people or daily-life context, use Indian people, Indian homes, Indian classrooms, Indian clinics, "
                "Indian food habits, and Indian city or neighborhood environments rather than generic Western stock-footage settings."
            )
        if stage_name == "concept_introduction":
            return (
                "If any human body overview is shown, keep the subject Indian-coded and use Indian educational or healthcare context where relevant."
            )

    if family == "geography_earth_explainer":
        if normalized_subtopic in {"weather", "climate", "water cycle"}:
            return (
                "Prefer Indian landscapes, Indian monsoon skies, Indian farms, Indian cities, Indian coastlines, or Indian neighborhoods "
                "when a real-world Earth example is useful."
            )
        if normalized_subtopic in {"earthquakes", "volcano", "volcanoes"}:
            return (
                "Use grounded South Asian or Indian-adjacent real-world geography when a place-based example is needed, and prefer Indian urban or rural context over generic foreign B-roll."
            )
        return (
            "Prefer Indian landscapes, Indian cityscapes, and Indian environmental context whenever the scene benefits from a real-world Earth example."
        )

    if family == "physics_space_explainer":
        if stage_name in {"hook", "concrete_example", "implication", "closing_takeaway"}:
            return (
                "When grounding the science in everyday life, use Indian rooftops, Indian night skies, Indian classrooms, Indian streets, "
                "or Indian city environments instead of generic foreign stock footage."
            )

    if family in {"how_it_works_explainer", "what_if_explainer"} and stage_name in {"hook", "concrete_example", "implication"}:
        return (
            "Use Indian people, Indian streets, Indian homes, Indian public spaces, and Indian city environments whenever a human-scale example appears."
        )

    if family in {"historical_character_explainer", "historical_event_explainer"}:
        return (
            "If the topic is Indian or South Asian, preserve Indian historical context faithfully; otherwise do not force Indianization into non-Indian historical subjects."
        )

    if stage_name in {"hook", "concrete_example", "implication"}:
        return (
            "Prefer Indian people, Indian city scenes, Indian homes, Indian schools, and Indian everyday environments when a human or urban context is shown."
        )

    return ""


def _transition_template_for_stage(
    *,
    family: str,
    stage_name: str,
    stage_label: str,
    previous_stage: str,
    next_stage: str,
) -> dict[str, str]:
    if not previous_stage:
        return {
            "transition_from_previous": "Begin with a gentle visual ease-in rather than an abrupt start.",
            "transition_to_next": _transition_to_next_for_family(family=family, stage_name=stage_name, next_stage=next_stage),
            "transition_intent": _transition_intent_for_family(family=family, stage_name=stage_name, previous_stage=previous_stage, next_stage=next_stage),
        }
    if not next_stage:
        return {
            "transition_from_previous": _transition_from_previous_for_family(family=family, previous_stage=previous_stage, stage_label=stage_label),
            "transition_to_next": "Resolve cleanly with a soft visual outro that feels complete.",
            "transition_intent": _transition_intent_for_family(family=family, stage_name=stage_name, previous_stage=previous_stage, next_stage=next_stage),
        }
    return {
        "transition_from_previous": _transition_from_previous_for_family(family=family, previous_stage=previous_stage, stage_label=stage_label),
        "transition_to_next": _transition_to_next_for_family(family=family, stage_name=stage_name, next_stage=next_stage),
        "transition_intent": _transition_intent_for_family(family=family, stage_name=stage_name, previous_stage=previous_stage, next_stage=next_stage),
    }


def _transition_from_previous_for_family(*, family: str, previous_stage: str, stage_label: str) -> str:
    family_templates = {
        "organ_anatomy_explainer": f"Carry the viewer smoothly from {previous_stage.lower()} into {stage_label.lower()} by moving from outer body context toward the correct internal anatomy.",
        "body_system_explainer": f"Transition naturally out of {previous_stage.lower()} into {stage_label.lower()} by preserving body orientation and connected system logic.",
        "biology_process_explainer": f"Move smoothly from {previous_stage.lower()} into {stage_label.lower()} by continuing the biological chain instead of resetting the visual world.",
        "physics_space_explainer": f"Transition from {previous_stage.lower()} into {stage_label.lower()} by preserving physical scale, direction, and force logic from the prior scene.",
        "geography_earth_explainer": f"Transition from {previous_stage.lower()} into {stage_label.lower()} by keeping the same Earth process logic and stable geographic orientation.",
        "historical_character_explainer": f"Move from {previous_stage.lower()} into {stage_label.lower()} while preserving the same historical figure, era, and visual identity.",
        "historical_event_explainer": f"Move from {previous_stage.lower()} into {stage_label.lower()} by advancing the timeline clearly without breaking era continuity.",
        "what_if_explainer": f"Transition from {previous_stage.lower()} into {stage_label.lower()} by escalating the imagined scenario in one readable chain of consequences.",
        "how_it_works_explainer": f"Transition from {previous_stage.lower()} into {stage_label.lower()} by keeping the same system and moving one explanatory step deeper.",
    }
    return family_templates.get(
        family,
        f"Transition naturally out of {previous_stage.lower()} into {stage_label.lower()}."
    )


def _transition_to_next_for_family(*, family: str, stage_name: str, next_stage: str) -> str:
    family_templates = {
        "organ_anatomy_explainer": f"Hand off into {next_stage.lower()} by guiding the eye from the organ overview into its next body-safe explanatory step.",
        "body_system_explainer": f"Hand off into {next_stage.lower()} by preserving the system layout and showing where the next process step continues.",
        "biology_process_explainer": f"Hand off into {next_stage.lower()} with a clear biological continuation so the process feels sequential and connected.",
        "physics_space_explainer": f"Hand off into {next_stage.lower()} by maintaining scale, direction, and cause-and-effect so the science remains coherent.",
        "geography_earth_explainer": f"Hand off into {next_stage.lower()} by preserving map, cross-section, or landscape logic without abrupt geographic reset.",
        "historical_character_explainer": f"Hand off into {next_stage.lower()} while keeping the same character identity and historical world consistent.",
        "historical_event_explainer": f"Hand off into {next_stage.lower()} with a clear timeline bridge that feels like the next chapter of the event.",
        "what_if_explainer": f"Hand off into {next_stage.lower()} by cleanly escalating the scenario instead of jumping to unrelated spectacle.",
        "how_it_works_explainer": f"Hand off into {next_stage.lower()} by advancing the same system one logical step further.",
    }
    if stage_name == "closing_takeaway":
        return "Resolve cleanly with a soft visual outro that feels complete."
    return family_templates.get(
        family,
        f"Visually hand off into {next_stage.lower()} with a clear conceptual bridge."
    )


def _transition_intent_for_family(*, family: str, stage_name: str, previous_stage: str, next_stage: str) -> str:
    if not previous_stage:
        intros = {
            "organ_anatomy_explainer": "Ease in gently, establish the body context first, and prepare a clean move into the organ overview without abrupt anatomy reveals.",
            "body_system_explainer": "Ease in gently, establish the body system in a human-scale way, and prepare a clear connected-system overview.",
            "biology_process_explainer": "Ease in gently, establish the living process clearly, and prepare a readable step-by-step explanation.",
            "physics_space_explainer": "Ease in gently, establish the physical setup and scale clearly, and prepare a readable explanation of the force or system.",
            "geography_earth_explainer": "Ease in gently, establish the Earth process or place clearly, and prepare a stable overview of how it works.",
            "historical_character_explainer": "Ease in gently, establish the person and era clearly, and prepare the viewer for a continuous historical explanation.",
            "historical_event_explainer": "Ease in gently, establish the event and era clearly, and prepare a readable timeline progression.",
            "what_if_explainer": "Ease in gently, establish the altered scenario clearly, and prepare the first visible chain reaction.",
            "how_it_works_explainer": "Ease in gently, establish the system people know, and prepare a step-by-step explanation of how it works.",
        }
        return intros.get(family, "Ease in gently and establish the visual world without abrupt motion.")
    if not next_stage:
        outros = {
            "organ_anatomy_explainer": "Resolve the body explanation fully, return to a calm anatomy-safe view, and hold cleanly for the ending.",
            "body_system_explainer": "Resolve the system explanation fully and hold on a calm coordinated-body takeaway.",
            "biology_process_explainer": "Resolve the process fully and hold on one calm final lesson with no new visual idea at the end.",
            "physics_space_explainer": "Resolve the science idea fully and end on a stable, grounded physical takeaway with low visual busyness.",
            "geography_earth_explainer": "Resolve the Earth process fully and end on a stable landscape or Earth-focused takeaway.",
            "historical_character_explainer": "Resolve the legacy clearly and end on a calm historically coherent takeaway image.",
            "historical_event_explainer": "Resolve the event clearly and end on a stable historical takeaway with no abrupt timeline jump.",
            "what_if_explainer": "Resolve the imagined consequence clearly and end on a calm insight instead of last-second spectacle.",
            "how_it_works_explainer": "Resolve the mechanism clearly and end on a simple memorable system takeaway.",
        }
        return outros.get(family, "Resolve the concept fully and hold cleanly for the ending.")
    middles = {
        "organ_anatomy_explainer": f"Continue from {previous_stage.lower()} into {next_stage.lower()} by moving naturally between body context, internal anatomy, and real-life benefit.",
        "body_system_explainer": f"Continue from {previous_stage.lower()} into {next_stage.lower()} by keeping the same body orientation and system connectivity throughout.",
        "biology_process_explainer": f"Continue from {previous_stage.lower()} into {next_stage.lower()} by showing one biological step leading directly into the next.",
        "physics_space_explainer": f"Continue from {previous_stage.lower()} into {next_stage.lower()} by preserving scale, direction, and physical cause-and-effect across scenes.",
        "geography_earth_explainer": f"Continue from {previous_stage.lower()} into {next_stage.lower()} by preserving Earth process continuity and geographic readability.",
        "historical_character_explainer": f"Continue from {previous_stage.lower()} into {next_stage.lower()} by preserving character identity, era, and historical momentum.",
        "historical_event_explainer": f"Continue from {previous_stage.lower()} into {next_stage.lower()} by keeping the timeline progression readable and continuous.",
        "what_if_explainer": f"Continue from {previous_stage.lower()} into {next_stage.lower()} by escalating the scenario in one readable consequence chain.",
        "how_it_works_explainer": f"Continue from {previous_stage.lower()} into {next_stage.lower()} by moving one logical explanatory step deeper into the same system.",
    }
    return middles.get(
        family,
        f"Continue visual logic from {previous_stage.lower()} and prepare a clean bridge into {next_stage.lower()}."
    )


def _subject_description_for_stage(*, family: str, stage_name: str, topic: str) -> str:
    if family in {"organ_anatomy_explainer", "body_system_explainer"}:
        return {
            "hook": "a real person in an everyday health or food-related moment",
            "concept_introduction": "a clean front-facing human torso with the relevant organ or system clearly placed",
            "mechanism": "the organ, tissue, or body system process shown clearly and anatomically sensibly",
            "concrete_example": "a healthy everyday person demonstrating the body function in real life",
            "implication": "the body benefiting from the process in energy, health, or survival",
            "closing_takeaway": "a calm front or three-quarter body view with a subtle transparent highlight on the correct body region",
        }.get(stage_name, f"a clear educational subject that explains {topic}")
    if family == "biology_process_explainer":
        return {
            "hook": "a real visual setup that makes the living process feel active and relevant",
            "concept_introduction": "a clean overview of where the biological process happens",
            "mechanism": "the biological process shown step by step rather than abstract spectacle",
            "concrete_example": "a relatable living-world example of the process",
            "implication": "the visible biological result of the process",
            "closing_takeaway": "a calm visual that leaves one clear lesson about the process",
        }.get(stage_name, f"a clear educational subject that explains {topic}")
    if family == "physics_space_explainer":
        return {
            "hook": "a familiar Earth-scale or human-scale visual that makes the physics topic feel immediate",
            "concept_introduction": "the main object or force represented clearly in a readable physical setup",
            "mechanism": "the physical interaction or force shown in a step-by-step way",
            "concrete_example": "a grounded real-world example that simplifies the space concept",
            "implication": "visible consequences in the environment or daily life",
            "closing_takeaway": "a calm resolved science visual with clear conceptual closure",
        }.get(stage_name, f"a clear educational subject that explains {topic}")
    if family == "geography_earth_explainer":
        return {
            "hook": "a real Earth location, weather event, or landscape that creates immediate curiosity",
            "concept_introduction": "a clean map, cross-section, or Earth-system overview",
            "mechanism": "the natural process or geological movement shown step by step",
            "concrete_example": "a real-world Earth example viewers can instantly picture",
            "implication": "a visible effect on land, water, weather, or people",
            "closing_takeaway": "a calm Earth-focused visual with clear educational closure",
        }.get(stage_name, f"a clear educational subject that explains {topic}")
    if family in {"historical_character_explainer", "historical_event_explainer"}:
        return {
            "hook": "a strong period-authentic opening image with clear human focus",
            "concept_introduction": "the central figure, setting, or event context anchored in the correct era",
            "mechanism": "the defining actions, timeline, or developments shown clearly",
            "concrete_example": "a pivotal historical moment rendered in a human-scale way",
            "implication": "the later impact on people, places, or ideas",
            "closing_takeaway": "a calm legacy-focused image that resolves the historical story",
        }.get(stage_name, f"a clear educational subject that explains {topic}")
    if family == "what_if_explainer":
        return {
            "hook": "the altered scenario shown immediately in a clear human-scale way",
            "concept_introduction": "the world or system after one key rule has changed",
            "mechanism": "the first chain reaction unfolding step by step",
            "concrete_example": "a grounded everyday example of the scenario's effect",
            "implication": "the broader consequence of the imagined change",
            "closing_takeaway": "a calm concluding image that reinforces the insight from the what-if scenario",
        }.get(stage_name, f"a clear educational subject that explains {topic}")
    if family == "how_it_works_explainer":
        return {
            "hook": "a familiar system or machine people use every day",
            "concept_introduction": "the system and its major components clearly presented",
            "mechanism": "the internal working process shown in sequence",
            "concrete_example": "a practical human-scale use case for the system",
            "implication": "the visible result of the system doing its job",
            "closing_takeaway": "a calm resolved image that makes the mechanism feel understandable",
        }.get(stage_name, f"a clear educational subject that explains {topic}")
    return {
        "hook": f"a relatable subject that introduces {topic} through everyday life",
        "concept_introduction": f"a clean overview subject that defines what {topic} is",
        "mechanism": f"the main process or system behind {topic}",
        "concrete_example": f"a practical real-world example of {topic}",
        "implication": f"the visible consequence of {topic}",
        "closing_takeaway": f"a calm summarizing visual that leaves viewers with the core lesson of {topic}",
    }.get(stage_name, f"a clear educational subject that explains {topic}")


def _environment_description_for_stage(*, family: str, stage_name: str, topic: str) -> str:
    if stage_name == "hook":
        return "a grounded real-world setting with clean composition and immediate context"
    if stage_name == "concept_introduction":
        return "a simplified educational environment that helps viewers orient themselves quickly"
    if stage_name == "mechanism":
        return "a controlled process-focused environment where cause and effect can be seen clearly"
    if stage_name == "concrete_example":
        return "an everyday human environment that turns the abstract concept into something tangible"
    if stage_name == "implication":
        return "a broader consequence-focused environment showing what changes next"
    if stage_name == "closing_takeaway":
        return "a calmer resolved environment with less visual busyness, clean educational composition, and a stable closing hold"
    return f"an educational environment that helps explain {topic}"


def _camera_framing_for_stage(*, stage_name: str, scene_type: str, index: int, total_scenes: int) -> str:
    framing = {
        "hook": "medium shot with a slow push-in",
        "concept_introduction": "wide shot or overhead overview with a gentle stabilised drift",
        "mechanism": "close-up or macro process view with a slow controlled tracking move",
        "concrete_example": "medium shot with clear subject readability and smooth observational movement",
        "implication": "wider cause-and-effect framing with a gentle pull-back",
        "closing_takeaway": "front or three-quarter medium shot with a very gentle pull-back and a locked stable hold in the final 1.5 seconds",
    }
    return framing.get(stage_name, f"clean {scene_type} framing with stable educational composition")


def _motion_intent_for_stage(*, stage_name: str, family: str) -> str:
    motion = {
        "hook": "subtle energy movement and a smooth curiosity-building ease-in",
        "concept_introduction": "calm layered motion that helps orient the viewer without distraction",
        "mechanism": "clear directional action with controlled process movement and readable progression",
        "concrete_example": "natural human-scale motion that keeps the example believable and easy to follow",
        "implication": "visible consequence motion with slightly broader scale but still controlled",
        "closing_takeaway": "minimal motion, reduced visual busyness, subtle natural breathing or ambient movement, and a stable final visual settle",
    }
    if family == "biology_process_explainer" and stage_name == "mechanism":
        return "smooth biological signal or transfer motion with controlled flow and readable cause-and-effect"
    return motion.get(stage_name, "smooth educational motion with no chaotic bursts")


def _ending_hold_instruction_for_stage(*, stage_name: str, index: int, total_scenes: int) -> str:
    if index == total_scenes - 1:
        return "last 1.5 seconds visually stable, resolves cleanly, gentle visual settle, no abrupt cut motion, no new elements introduced at the end"
    return "scene ending resolves cleanly with a brief stable hold for stitching"


def _continuity_guidance(*, stage_name: str, index: int, total_scenes: int, topic_focus: str) -> str:
    if index == 0:
        return f"Start gently, establish {topic_focus}, and prepare a clean transition into the explanatory overview."
    if index == total_scenes - 1:
        return f"Close the explainer with visual resolution and a stable ending hold around {topic_focus}."
    return f"Continue the explanatory logic naturally and transition clearly into the next stage while keeping focus on {topic_focus}."


def _sora_negative_guidance(*, stage_name: str, family: str) -> str:
    items = [
        "avoid embedded readable text",
        "avoid poster-like title cards",
        "avoid text-heavy scene composition",
        "avoid abrupt ending motion before cut",
        "avoid unrelated symbolic objects",
    ]
    if stage_name in {"mechanism", "implication"}:
        items.append("avoid chaotic motion that makes the process unclear")
    if family == "biology_process_explainer":
        items.append("avoid repeated glowing neural tunnel shots across adjacent scenes")
        items.append("avoid generic sci-fi biology visuals with no educational meaning")
    if family in {"organ_anatomy_explainer", "body_system_explainer"}:
        items.append("avoid back-view x-ray skeleton overlays")
        items.append("avoid showing anatomy in the wrong body location")
    if family == "historical_character_explainer":
        items.append("avoid inconsistent face, era, or costume across scenes")
        items.append("avoid modern props unless explicitly relevant")
    if family == "geography_earth_explainer":
        items.append("avoid unrelated outer-space visuals for Earth-only topics")
    if family == "physics_space_explainer":
        items.append("avoid decorative sci-fi clutter")
    if family in {
        "organ_anatomy_explainer",
        "body_system_explainer",
        "biology_process_explainer",
        "geography_earth_explainer",
        "physics_space_explainer",
        "how_it_works_explainer",
        "what_if_explainer",
    }:
        items.append("avoid default foreign stock-footage aesthetics when a human, school, hospital, street, or city context is shown")
        items.append("avoid overly Western-looking background casting or urban context when an Indian everyday setting would fit the topic")
    return ", ".join(items)
