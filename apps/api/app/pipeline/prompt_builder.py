from __future__ import annotations

from typing import Any

from app.recipes.recipe_registry import RecipeConfig


def build_scene_prompt(
    recipe: RecipeConfig,
    scene: dict[str, Any],
    reference: str | None,
    inputs: dict[str, Any] | None = None,
) -> str:
    beat_names = tuple(scene.get('beat_names') or ())
    beat_list = ', '.join(beat_names)
    guidance = recipe.config.scene_guidance or (
        'Keep motion smooth, subject continuity strong, and transitions natural. '
        'The scene should begin gently and end cleanly without abrupt cuts, jerks, or sudden pose changes.'
    )
    normalized_inputs = dict(inputs or {})
    text_input = str(normalized_inputs.get('text') or '').strip()

    prompt = (
        'Create a short cinematic vertical video scene for a social-media reel.\n\n'
        f'Style: {recipe.config.style}\n'
        f'Tone: {recipe.config.tone}\n'
        f'Scene beats: {beat_list}\n'
        f'Duration: {int(scene.get("duration_seconds") or 0)} seconds\n'
    )

    if text_input:
        prompt += f'Current scene brief: {text_input}\n'

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

    if recipe.id == 'time_echo_explainer':
        prompt += (
            'This is an EXPLAINER scene for a short social reel.\n'
            'The visuals must communicate the current narration beat clearly and concretely.\n'
            'Show cause and effect, visible consequences, and progression.\n'
            'Avoid repeating the same generic planet, sky, or abstract cinematic shot unless the beat truly requires it.\n'
            'Prefer specific, understandable visuals over vague beauty shots.\n'
            'The scene should feel informative, scroll-stopping, and easy to follow even with captions on.\n'
            'Use strong opening composition, one clear visual idea in the middle, and a clean natural outro for stitching.\n'
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