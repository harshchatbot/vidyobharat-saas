from __future__ import annotations

from typing import Any

from app.recipes.recipe_registry import EXPLAINER_RECIPE_IDS, LTX_BENCHMARK_RECIPE_IDS, LTX_FREEFORM_RECIPE_IDS, RecipeConfig, UGC_AD_RECIPE_IDS


def build_ltx_cinematic_montage_prompt(
    recipe: RecipeConfig,
    scene: dict[str, Any],
    reference: str | None,
    inputs: dict[str, Any] | None = None,
) -> str:
    del reference, inputs
    prompt = (
        "Create one stitched-scene cinematic video shot for a self-hosted LTX benchmark.\n\n"
        f"Recipe: {recipe.catalog.title}\n"
        f"Scene role: {scene.get('scene_role')}\n"
        f"Stage: {scene.get('stage_label')}\n"
        f"Duration: {int(scene.get('duration_seconds') or 0)} seconds\n"
        f"Render mode: {scene.get('render_mode')}\n"
        f"Generator model family: {scene.get('generator_model_family')}\n"
        f"Continuity priority: {scene.get('continuity_priority')}\n"
        f"Continuity anchor: {scene.get('continuity_anchor')}\n"
        f"Same subject required: {scene.get('same_subject_required')}\n"
        f"Same wardrobe required: {scene.get('same_wardrobe_required')}\n"
        f"Same environment family: {scene.get('same_environment_family')}\n"
        f"Location family: {scene.get('location_family')}\n"
        f"Emotion style: {scene.get('emotion_style')}\n"
        f"Visual style: {scene.get('visual_style')}\n"
        f"Max action complexity: {scene.get('max_action_complexity')}\n"
        f"Topic focus: {scene.get('topic_focus')}\n"
        f"Visual objective: {scene.get('visual_objective')}\n"
        f"Subject: {scene.get('subject_description')}\n"
        f"Environment: {scene.get('environment_description')}\n"
        f"Camera framing: {scene.get('camera_framing')}\n"
        f"Camera motion type: {scene.get('camera_motion_type')}\n"
        f"Motion/action: {scene.get('motion_intent')}\n"
        f"Transition intent: {scene.get('transition_intent')}\n"
        f"Transition from previous scene: {scene.get('transition_from_previous')}\n"
        f"Transition to next scene: {scene.get('transition_to_next')}\n"
        f"Ending behavior: {scene.get('ending_hold_instruction')}\n"
        f"Stitch-safe ending: {scene.get('stitch_safe_ending')}\n"
    )
    prompt += (
        "Maintain exactly the same woman, same cream sweater, same dark jeans, same rainy modern cafe, and same late-afternoon lighting across all three stitched scenes.\n"
        "Keep the shot cinematic, realistic, calm, reflective, and continuity-first.\n"
        "No speaking, no lip sync, no abrupt fast motion, no complex hand-object interaction, no crowded choreography, and no extreme pose changes.\n"
        "Keep motion smooth and controlled, with a clean stable ending that is safe for hard-cut stitching.\n"
    )
    negative_guidance = str(scene.get("negative_guidance") or "").strip()
    if negative_guidance:
        prompt += f"Negative guidance: {negative_guidance}.\n"
    return prompt


def build_ltx_storyboard_prompt(
    recipe: RecipeConfig,
    scene: dict[str, Any],
    reference: str | None,
    inputs: dict[str, Any] | None = None,
) -> str:
    del reference
    normalized_inputs = dict(inputs or {})
    text_input = str(normalized_inputs.get("text") or scene.get("source_prompt") or "").strip()
    prompt = (
        "Create one stitched-scene cinematic video shot for a self-hosted LTX storyboard flow.\n\n"
        f"Recipe: {recipe.catalog.title}\n"
        f"Story mode: {scene.get('story_mode')}\n"
        f"Story subtopic: {scene.get('story_subtopic')}\n"
        f"Source prompt: {text_input}\n"
        f"Scene role: {scene.get('scene_role')}\n"
        f"Stage: {scene.get('stage_label')}\n"
        f"Duration: {int(scene.get('duration_seconds') or 0)} seconds\n"
        f"Render mode: {scene.get('render_mode')}\n"
        f"Generator model family: {scene.get('generator_model_family')}\n"
        f"Continuity priority: {scene.get('continuity_priority')}\n"
        f"Continuity anchor: {scene.get('continuity_anchor')}\n"
        f"Topic focus: {scene.get('topic_focus')}\n"
        f"Visual objective: {scene.get('visual_objective')}\n"
        f"Subject: {scene.get('subject_description')}\n"
        f"Environment: {scene.get('environment_description')}\n"
        f"Camera framing: {scene.get('camera_framing')}\n"
        f"Camera motion type: {scene.get('camera_motion_type')}\n"
        f"Motion/action: {scene.get('motion_intent')}\n"
        f"Transition intent: {scene.get('transition_intent')}\n"
        f"Transition from previous scene: {scene.get('transition_from_previous')}\n"
        f"Transition to next scene: {scene.get('transition_to_next')}\n"
        f"Ending behavior: {scene.get('ending_hold_instruction')}\n"
        f"Stitch-safe ending: {scene.get('stitch_safe_ending')}\n"
    )
    prompt += (
        "Preserve the same subject, same environment family, same lighting family, and same tonal world across all three stitched scenes.\n"
        "Keep the shot cinematic, realistic, continuity-first, and suitable for hard-cut stitching.\n"
        "No speaking, no lip sync, no abrupt fast motion, no crowded choreography, and no major subject drift.\n"
    )
    negative_guidance = str(scene.get("negative_guidance") or "").strip()
    if negative_guidance:
        prompt += f"Negative guidance: {negative_guidance}.\n"
    return prompt


def build_sora_deep_explainer_prompt(
    recipe: RecipeConfig,
    scene: dict[str, Any],
    reference: str | None,
    inputs: dict[str, Any] | None = None,
) -> str:
    normalized_inputs = dict(inputs or {})
    text_input = str(normalized_inputs.get('text') or '').strip()
    stage_label = str(scene.get('stage_label') or '').strip()
    topic_focus = str(scene.get('topic_focus') or '').strip()
    visual_objective = str(scene.get('visual_objective') or '').strip()
    scene_type = str(scene.get('scene_type') or '').strip()
    explainer_family = str(scene.get('explainer_family') or '').strip()
    explainer_subtopic = str(scene.get('explainer_subtopic') or '').strip()
    educational_mode = str(scene.get('educational_mode') or '').strip()
    shot_archetype = str(scene.get('shot_archetype') or '').strip()
    subtopic_visual_anchor = str(scene.get('subtopic_visual_anchor') or '').strip()
    extra_avoid_guidance = str(scene.get('extra_avoid_guidance') or '').strip()
    indian_context_note = str(scene.get('indian_context_note') or '').strip()
    subject_description = str(scene.get('subject_description') or '').strip()
    environment_description = str(scene.get('environment_description') or '').strip()
    camera_framing = str(scene.get('camera_framing') or '').strip()
    motion_intent = str(scene.get('motion_intent') or '').strip()
    local_narration_context = str(scene.get('local_narration_context') or '').strip()
    transition_intent = str(scene.get('transition_intent') or '').strip()
    transition_from_previous = str(scene.get('transition_from_previous') or '').strip()
    transition_to_next = str(scene.get('transition_to_next') or '').strip()
    ending_hold_instruction = str(scene.get('ending_hold_instruction') or '').strip()
    continuity_guidance = str(scene.get('continuity_guidance') or '').strip()
    sora_negative_guidance = str(scene.get('sora_negative_guidance') or '').strip()
    explainer_style = str(scene.get('explainer_style') or '').strip()
    avoid_motifs = [str(item).strip() for item in (scene.get('avoid_motifs') or []) if str(item).strip()]

    prompt = (
        'Create a cinematic vertical educational video shot for Sora 2.\n\n'
        f'Recipe: {recipe.catalog.title}\n'
        f'Stage: {stage_label}\n'
        f'Duration: {int(scene.get("duration_seconds") or 0)} seconds\n'
        f'Explainer style: {explainer_style or recipe.metadata.get("default_explainer_style") or "educational"}\n'
        f'Explainer family: {explainer_family}\n'
        f'Explainer subtopic: {explainer_subtopic}\n'
        f'Educational mode: {educational_mode}\n'
        f'Shot archetype: {shot_archetype}\n'
        f'Subtopic visual anchor: {subtopic_visual_anchor}\n'
        f'Topic: {text_input}\n'
        f'Topic focus: {topic_focus}\n'
        f'Visual objective: {visual_objective}\n'
        f'Scene type: {scene_type}\n'
        f'Subject: {subject_description}\n'
        f'Environment: {environment_description}\n'
        f'Camera framing: {camera_framing}\n'
        f'Motion/action: {motion_intent}\n'
        f'Local narration meaning: {local_narration_context}\n'
        f'Continuity: {continuity_guidance}\n'
        f'Transition intent: {transition_intent}\n'
        f'Transition from previous scene: {transition_from_previous}\n'
        f'Transition to next scene: {transition_to_next}\n'
        f'Ending behavior: {ending_hold_instruction}\n'
    )

    if indian_context_note:
        prompt += f'Indian audience grounding: {indian_context_note}\n'

    if recipe.config.reference_prompt:
        prompt += f'Creative direction: {recipe.config.reference_prompt}\n'

    prompt += (
        'Prioritize educational clarity over spectacle.\n'
        'Make the concept understandable through concrete, visually progressive storytelling.\n'
        'Use grounded cinematic language: clear subject, readable environment, motivated camera movement, and coherent motion.\n'
        'The shot should feel like one step in a larger storyboard, not an isolated montage clip.\n'
        'Keep the intro smooth, the middle readable, and the ending stable for stitching.\n'
        'Do not ask the frame itself to carry readable explanatory text.\n'
        'Readable words will be handled by overlays, captions, and narration outside the generated scene.\n'
        'Avoid title-card compositions, poster-like layouts, and embedded readable text inside the shot.\n'
        'When a human, city, school, home, clinic, market, farm, or neighborhood context appears, prefer Indian people, Indian streets, Indian homes, Indian classrooms, Indian healthcare spaces, and Indian city or town environments.\n'
        'Avoid generic foreign stock-footage styling if an Indian real-world context would fit the explainer.\n'
    )

    if avoid_motifs:
        prompt += f'Avoid motifs: {", ".join(avoid_motifs)}.\n'
    if extra_avoid_guidance:
        prompt += f'Additional subtopic avoid guidance: {extra_avoid_guidance}.\n'
    if sora_negative_guidance:
        prompt += f'Negative guidance: {sora_negative_guidance}.\n'

    if reference:
        prompt += (
            f'Reference asset: {reference}\n'
            'Use it only for subject grounding and continuity where relevant.\n'
        )

    prompt += (
        'Camera should move with intention, not randomly.\n'
        'Motion should be smooth and controlled, with no chaotic bursts near the end.\n'
        'The final moment should resolve cleanly and hold visually stable.\n'
    )
    return prompt


def build_sora_ugc_ad_prompt(
    recipe: RecipeConfig,
    scene: dict[str, Any],
    reference: str | None,
    inputs: dict[str, Any] | None = None,
) -> str:
    normalized_inputs = dict(inputs or {})
    text_input = str(normalized_inputs.get('text') or '').strip()
    stage_label = str(scene.get('stage_label') or '').strip()
    topic_focus = str(scene.get('topic_focus') or '').strip()
    visual_objective = str(scene.get('visual_objective') or '').strip()
    scene_type = str(scene.get('scene_type') or '').strip()
    ugc_ad_family = str(scene.get('ugc_ad_family') or '').strip()
    ugc_ad_subtopic = str(scene.get('ugc_ad_subtopic') or '').strip()
    ugc_mode = str(scene.get('ugc_mode') or '').strip()
    client_brief_mode = bool(scene.get('client_brief_mode'))
    business_name = str(scene.get('business_name') or '').strip()
    business_category = str(scene.get('business_category') or '').strip()
    city = str(scene.get('city') or '').strip()
    locality = str(scene.get('locality') or '').strip()
    target_audience = str(scene.get('target_audience') or '').strip()
    main_service_or_product = str(scene.get('main_service_or_product') or '').strip()
    main_pain_point = str(scene.get('main_pain_point') or '').strip()
    key_promise = str(scene.get('key_promise') or '').strip()
    trust_factor = str(scene.get('trust_factor') or '').strip()
    offer = str(scene.get('offer') or '').strip()
    cta = str(scene.get('cta') or '').strip()
    ad_goal = str(scene.get('ad_goal') or '').strip()
    hook_plan = str(scene.get('hook_plan') or '').strip()
    shot_archetype = str(scene.get('shot_archetype') or '').strip()
    subtopic_visual_anchor = str(scene.get('subtopic_visual_anchor') or '').strip()
    extra_avoid_guidance = str(scene.get('extra_avoid_guidance') or '').strip()
    indian_context_note = str(scene.get('indian_context_note') or '').strip()
    subject_description = str(scene.get('subject_description') or '').strip()
    environment_description = str(scene.get('environment_description') or '').strip()
    camera_framing = str(scene.get('camera_framing') or '').strip()
    motion_intent = str(scene.get('motion_intent') or '').strip()
    local_narration_context = str(scene.get('local_narration_context') or '').strip()
    transition_intent = str(scene.get('transition_intent') or '').strip()
    transition_from_previous = str(scene.get('transition_from_previous') or '').strip()
    transition_to_next = str(scene.get('transition_to_next') or '').strip()
    ending_hold_instruction = str(scene.get('ending_hold_instruction') or '').strip()
    continuity_guidance = str(scene.get('continuity_guidance') or '').strip()
    sora_negative_guidance = str(scene.get('sora_negative_guidance') or '').strip()
    ugc_style = str(scene.get('ugc_style') or '').strip()
    cta_style = str(scene.get('cta_style') or '').strip()
    talking_mode = str(scene.get('talking_mode') or 'none').strip()
    render_lane = str(scene.get('render_lane') or '').strip()
    persona_required = bool(scene.get('persona_required'))
    continuity_subject_role = str(scene.get('continuity_subject_role') or '').strip()
    continuity_subject_label = str(scene.get('continuity_subject_label') or '').strip()
    continuity_anchor = str(scene.get('continuity_anchor') or '').strip()
    must_preserve_subject_identity = bool(scene.get('must_preserve_subject_identity'))
    must_avoid_new_spokesperson = bool(scene.get('must_avoid_new_spokesperson'))
    school_testimonial_mode = bool(scene.get('school_testimonial_mode'))
    avoid_motifs = [str(item).strip() for item in (scene.get('avoid_motifs') or []) if str(item).strip()]

    prompt = (
        'Create a native-feeling vertical UGC ad scene for Sora 2.\n\n'
        f'Recipe: {recipe.catalog.title}\n'
        f'Stage: {stage_label}\n'
        f'Duration: {int(scene.get("duration_seconds") or 0)} seconds\n'
        f'UGC style: {ugc_style or recipe.metadata.get("default_ugc_style") or "creator_casual"}\n'
        f'UGC family: {ugc_ad_family}\n'
        f'UGC subtopic: {ugc_ad_subtopic}\n'
        f'UGC mode: {ugc_mode}\n'
        f'Client brief mode: {"on" if client_brief_mode else "off"}\n'
        f'Shot archetype: {shot_archetype}\n'
        f'Subtopic visual anchor: {subtopic_visual_anchor}\n'
        f'Product or service brief: {text_input}\n'
        f'Topic focus: {topic_focus}\n'
        f'Visual objective: {visual_objective}\n'
        f'Scene type: {scene_type}\n'
        f'Subject: {subject_description}\n'
        f'Environment: {environment_description}\n'
        f'Camera framing: {camera_framing}\n'
        f'Motion/action: {motion_intent}\n'
        f'Local narration meaning: {local_narration_context}\n'
        f'Continuity: {continuity_guidance}\n'
        f'Transition intent: {transition_intent}\n'
        f'Transition from previous scene: {transition_from_previous}\n'
        f'Transition to next scene: {transition_to_next}\n'
        f'CTA closure behavior: {cta_style or "native_creator_close"}\n'
        f'Ending behavior: {ending_hold_instruction}\n'
        f'Talking mode: {talking_mode}\n'
        f'Render lane: {render_lane}\n'
        f'Continuity subject role: {continuity_subject_role}\n'
        f'Continuity subject label: {continuity_subject_label}\n'
        f'Continuity anchor: {continuity_anchor}\n'
        f'Must preserve subject identity: {"yes" if must_preserve_subject_identity else "no"}\n'
        f'Must avoid new spokesperson: {"yes" if must_avoid_new_spokesperson else "no"}\n'
        f'School testimonial mode: {"yes" if school_testimonial_mode else "no"}\n'
    )

    if client_brief_mode:
        prompt += (
            f'Business name: {business_name}\n'
            f'Business category: {business_category}\n'
            f'City: {city}\n'
            f'Locality: {locality}\n'
            f'Target audience: {target_audience}\n'
            f'Main service or product: {main_service_or_product}\n'
            f'Main pain point: {main_pain_point}\n'
            f'Key promise: {key_promise}\n'
            f'Trust factor: {trust_factor}\n'
            f'Offer: {offer}\n'
            f'CTA: {cta}\n'
            f'Ad goal: {ad_goal}\n'
            f'Hook plan: {hook_plan}\n'
        )

    if indian_context_note:
        prompt += f'Indian audience grounding: {indian_context_note}\n'

    if recipe.config.reference_prompt:
        prompt += f'Creative direction: {recipe.config.reference_prompt}\n'

    prompt += (
        'Prioritize native short-form ad realism over polished commercial spectacle.\n'
        'Make the scene feel creator-like, mobile-first, and believable for Meta Reels or TikTok style placements.\n'
        'Show the product or service early enough that viewers understand what is being sold.\n'
        'Keep product visibility, human authenticity, and one clear visual selling point in every scene.\n'
        'Use grounded creator camera language: selfie, handheld realism, product-in-hand, close-up demos, and quick result shots when appropriate.\n'
        'Do not depend on readable text inside the generated scene.\n'
        'Readable copy will be handled by overlays, captions, and narration outside the generated shot.\n'
        'Avoid poster-like title cards, fake UI text, and stock-footage polish.\n'
    )

    if talking_mode == 'lip_sync_required':
        prompt += (
            'This scene is a short talking beat.\n'
            'Use one spokesperson only, framed for direct-to-camera speech with natural eye contact, calm face movement, subtle blinking, and stable mouth readability.\n'
            'Keep the spoken line short enough for a 3 to 5 second talking scene.\n'
            'Do not turn this into cinematic B-roll.\n'
        )
    elif talking_mode == 'voiceover_safe':
        prompt += (
            'This scene should stay voiceover-safe.\n'
            'Do not depend on direct lips-visible dialogue to make the scene work.\n'
        )

    if must_preserve_subject_identity:
        prompt += (
            'Preserve the same spokesperson identity established earlier in the ad.\n'
            'Do not swap to a different face, age, or presenter styling.\n'
        )
    if must_avoid_new_spokesperson:
        prompt += (
            'Do not introduce a fresh spokesperson or a new solo parent/customer face in this scene.\n'
            'Keep continuity through environment, child/family context, provider context, or the already-established spokesperson.\n'
        )
    if school_testimonial_mode:
        prompt += (
            'This is a school or parent-testimonial style local-service ad.\n'
            'Keep one parent trust story across the reel, reinforce the same child/family context, and avoid switching to a different mother for proof or CTA scenes.\n'
        )

    if client_brief_mode:
        prompt += (
            'Use the client brief to make the ad feel like it belongs to a real business, not a generic category ad.\n'
            'Ground the hook, proof, and CTA in the business identity, audience, locality, promise, and booking or purchase intent.\n'
            'Use locality as believable context, not as repetitive directory text.\n'
            'Keep the business name visible through subject logic or context, but do not force readable text inside the scene.\n'
        )

    if avoid_motifs:
        prompt += f'Avoid motifs: {", ".join(avoid_motifs)}.\n'
    if extra_avoid_guidance:
        prompt += f'Additional shot-pack avoid guidance: {extra_avoid_guidance}.\n'
    if sora_negative_guidance:
        prompt += f'Negative guidance: {sora_negative_guidance}.\n'

    if reference:
        prompt += (
            f'Reference asset: {reference}\n'
            'Use it only for subject grounding and continuity where relevant.\n'
        )
    if persona_required:
        prompt += 'A locked creator persona is expected for this scene when available.\n'

    prompt += (
        'Camera should feel intentional but natural, not like a glossy TV commercial.\n'
        'Motion should feel readable and creator-native, with no abrupt CTA cut or late scene confusion.\n'
        'The final moment should resolve cleanly with stable product or service context.\n'
    )
    return prompt


def build_scene_prompt(
    recipe: RecipeConfig,
    scene: dict[str, Any],
    reference: str | None,
    inputs: dict[str, Any] | None = None,
) -> str:
    if recipe.id == 'deep_dive_explainer' and recipe.generation_defaults.model_key == 'sora2':
        return build_sora_deep_explainer_prompt(recipe, scene, reference, inputs)
    if recipe.id in UGC_AD_RECIPE_IDS and recipe.generation_defaults.model_key == 'sora2':
        return build_sora_ugc_ad_prompt(recipe, scene, reference, inputs)
    if recipe.id in LTX_BENCHMARK_RECIPE_IDS and recipe.generation_defaults.model_key == 'ltx':
        return build_ltx_cinematic_montage_prompt(recipe, scene, reference, inputs)
    if recipe.id in LTX_FREEFORM_RECIPE_IDS and recipe.generation_defaults.model_key == 'ltx':
        return build_ltx_storyboard_prompt(recipe, scene, reference, inputs)

    beat_names = tuple(scene.get('beat_names') or ())
    beat_list = ', '.join(beat_names)
    guidance = recipe.config.scene_guidance or (
        'Keep motion smooth, subject continuity strong, and transitions natural. '
        'The scene should begin gently and end cleanly without abrupt cuts, jerks, or sudden pose changes.'
    )
    normalized_inputs = dict(inputs or {})
    text_input = str(normalized_inputs.get('text') or '').strip()
    stage_label = str(scene.get('stage_label') or '').strip()
    scene_type = str(scene.get('scene_type') or '').strip()
    topic_focus = str(scene.get('topic_focus') or '').strip()
    visual_objective = str(scene.get('visual_objective') or '').strip()
    local_narration_context = str(scene.get('local_narration_context') or '').strip()
    transition_from_previous = str(scene.get('transition_from_previous') or '').strip()
    transition_to_next = str(scene.get('transition_to_next') or '').strip()
    anti_repetition_note = str(scene.get('anti_repetition_note') or '').strip()
    stage_goal = str(scene.get('stage_goal') or '').strip()
    explainer_style = str(scene.get('explainer_style') or '').strip()
    avoid_motifs = [str(item).strip() for item in (scene.get('avoid_motifs') or []) if str(item).strip()]

    prompt = (
        'Create a short cinematic vertical video scene for a social-media reel.\n\n'
        f'Style: {recipe.config.style}\n'
        f'Tone: {recipe.config.tone}\n'
        f'Scene beats: {beat_list}\n'
        f'Duration: {int(scene.get("duration_seconds") or 0)} seconds\n'
    )

    if text_input:
        prompt += f'Current scene brief: {text_input}\n'

    if stage_label:
        prompt += f'Stage: {stage_label}\n'
    if scene_type:
        prompt += f'Preferred scene type: {scene_type}\n'
    if topic_focus:
        prompt += f'Topic focus: {topic_focus}\n'
    if visual_objective:
        prompt += f'Visual objective: {visual_objective}\n'
    if stage_goal:
        prompt += f'Stage goal: {stage_goal}\n'
    if local_narration_context:
        prompt += f'Local narration context: {local_narration_context}\n'
    if transition_from_previous:
        prompt += f'Transition from previous scene: {transition_from_previous}\n'
    if transition_to_next:
        prompt += f'Transition to next scene: {transition_to_next}\n'
    if anti_repetition_note:
        prompt += f'Anti-repetition guidance: {anti_repetition_note}\n'
    if explainer_style:
        prompt += f'Explainer style: {explainer_style}\n'
    if avoid_motifs:
        prompt += f'Avoid these motifs: {", ".join(avoid_motifs)}\n'

    if recipe.config.reference_prompt:
        prompt += f'Creative direction: {recipe.config.reference_prompt}\n'

    if reference:
        prompt += (
            f'Reference asset: {reference}\n\n'
            'The uploaded reference image is the PRIMARY subject source.\n'
            'Preserve the same subject identity very strongly.\n'
            'Keep the subject clearly recognizable as the original uploaded subject.\n'
            'Preserve face structure, head shape, species or breed traits, fur or skin color, ears, nose, eyes, and overall appearance.\n'
            'Do not replace the subject with a new character, mascot, unrelated cartoon figure, or generic animated hero.\n'
            'Stylize the original subject while preserving identity first and style second.\n'
            'If the subject is a pet or animal, preserve the same animal anatomy and do not humanize or replace it.\n'
        )
    else:
        prompt += '\n'

    if recipe.id in EXPLAINER_RECIPE_IDS:
        prompt += (
            'This is an EXPLAINER scene for a short social reel.\n'
            'The visuals must communicate the current narration beat clearly and concretely.\n'
            'Show cause and effect, visible consequences, and progression.\n'
            'Avoid repeating the same generic planet, sky, or abstract cinematic shot unless the beat truly requires it.\n'
            'Prefer specific, understandable visuals over vague beauty shots.\n'
            'The scene should feel informative, scroll-stopping, and easy to follow even with captions on.\n'
            'Use strong opening composition, one clear visual idea in the middle, and a clean natural outro for stitching.\n'
            'Do not rely on the model to render readable text, labels, paragraphs, subtitles, UI panels, or title cards inside the scene.\n'
            'Readable teaching text will be added later through overlays and captions, so keep the generated frame visually clear and text-light.\n'
        )

    if recipe.id == 'deep_dive_explainer':
        prompt += (
            'Treat this as a structured educational storyboard scene, not a generic cinematic science montage.\n'
            'Make the concept teachable in one step at a time.\n'
            'Favor concrete explanation, visual progression, and distinct scene identity over spectacle.\n'
        )
    if recipe.id in UGC_AD_RECIPE_IDS:
        prompt += (
            'Treat this as a native vertical UGC ad scene, not a glossy TV commercial.\n'
            'Make the product or service feel clear, believable, creator-like, and fast to understand.\n'
            'Favor authenticity, product visibility, proof, and short-form performance clarity over over-produced spectacle.\n'
        )

    prompt += (
        f'{guidance}\n'
        'Keep motion smooth and visually coherent.\n'
        'Subject consistency is more important than aggressive stylization.\n'
        'The shot should have a smooth intro, stable middle motion, and a clean natural outro.\n'
        'Do not start abruptly. Do not end abruptly. Avoid sudden jumps, flicker, hard cuts, warped anatomy, or instant scene changes.\n'
        'The beginning should ease into the action and the ending should settle naturally for easy stitching with adjacent scenes.\n'
    )

    return prompt
