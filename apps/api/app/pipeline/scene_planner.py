from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Any

from app.recipes.recipe_registry import RecipeConfig


@dataclass(frozen=True)
class ExplainerFamilyDetection:
    family: str
    subtopic: str
    educational_mode: str


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
