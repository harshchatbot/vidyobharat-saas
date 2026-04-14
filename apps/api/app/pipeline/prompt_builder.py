from __future__ import annotations

from typing import Any

from app.recipes.recipe_registry import EXPLAINER_RECIPE_IDS, RecipeConfig


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


def build_scene_prompt(
    recipe: RecipeConfig,
    scene: dict[str, Any],
    reference: str | None,
    inputs: dict[str, Any] | None = None,
) -> str:
    if recipe.id == 'deep_dive_explainer' and recipe.generation_defaults.model_key == 'sora2':
        return build_sora_deep_explainer_prompt(recipe, scene, reference, inputs)

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

    prompt += (
        f'{guidance}\n'
        'Keep motion smooth and visually coherent.\n'
        'Subject consistency is more important than aggressive stylization.\n'
        'The shot should have a smooth intro, stable middle motion, and a clean natural outro.\n'
        'Do not start abruptly. Do not end abruptly. Avoid sudden jumps, flicker, hard cuts, warped anatomy, or instant scene changes.\n'
        'The beginning should ease into the action and the ending should settle naturally for easy stitching with adjacent scenes.\n'
    )

    return prompt
