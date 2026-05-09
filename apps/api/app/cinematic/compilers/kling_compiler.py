from __future__ import annotations

from app.cinematic.compilers.prompt_guardrails import consolidate_lower_face_rule, dedupe_and_cap_rules, profile_prompt
from app.cinematic.schemas.cinematic_spec import CinematicSpec


KLING_COMPILER_VERSION = '1.3.0'


def _pick_key_constraints(spec: CinematicSpec) -> tuple[list[str], list[str]]:
    must_do_priority = (
        'preserve avatar identity',
        'preserve product',
        'keep product visible',
        'keep lips visible',
        'lower face',
        'clean final hold',
    )
    must_avoid_priority = (
        'no extra people',
        'warped hands',
        'no profile turns',
        'mouth',
        'chin',
        'dramatic cinematic',
    )

    chosen_do: list[str] = []
    for needle in must_do_priority:
        for rule in spec.constraints.must_do:
            if needle in rule.lower() and rule not in chosen_do:
                chosen_do.append(rule)
                break
    if not chosen_do and spec.constraints.must_do:
        chosen_do = spec.constraints.must_do[:4]

    chosen_avoid: list[str] = []
    for needle in must_avoid_priority:
        for rule in spec.constraints.must_avoid:
            if needle in rule.lower() and rule not in chosen_avoid:
                chosen_avoid.append(rule)
                break
    if not chosen_avoid and spec.constraints.must_avoid:
        chosen_avoid = spec.constraints.must_avoid[:4]

    return chosen_do[:6], chosen_avoid[:6]


def compile_kling_prompt(spec: CinematicSpec) -> tuple[str, dict[str, object]]:
    speaking_frame_safety_enabled = bool(spec.metadata.get('speaking_frame_safety_enabled'))
    product_face_spacing_strategy = str(spec.metadata.get('product_face_spacing_strategy') or 'standard_recipe_framing')
    cutaway_mode = str(spec.metadata.get('avatar_product_cutaway_mode') or '').strip() or None
    key_must_do, key_must_avoid = _pick_key_constraints(spec)
    key_must_do, dedupe_do = dedupe_and_cap_rules(key_must_do, max_items=4)
    key_must_avoid, lower_face_dedupe = consolidate_lower_face_rule(key_must_avoid)
    key_must_avoid, dedupe_avoid = dedupe_and_cap_rules(key_must_avoid, max_items=4)
    dedupe_count = dedupe_do + dedupe_avoid + lower_face_dedupe

    if speaking_frame_safety_enabled:
        prompt = (
            f'{spec.talent.creator_description}. '
            f'Preserve identity exactly from Reference Image 1 and preserve the product exactly from Reference Image 2. '
            f'Environment: {spec.scene.environment}. Atmosphere: {spec.scene.atmosphere}. '
            f'Use a natural conversational creator delivery with subtle smile shifts, natural blinking, relaxed micro head movement, '
            f'soft breathing rhythm, and warm human recommendation energy. '
            f'Keep the talking face unobstructed and readable while speaking; product remains visible but secondary to speech clarity. '
            f'Actions: {spec.action.opening_action} {spec.action.product_interaction} {spec.action.hero_reveal} {spec.action.ending_action} '
            f'Rendering: {spec.rendering.camera_style}; {spec.rendering.shot_size}; {spec.rendering.camera_motion}; {spec.rendering.lighting}. '
            f'Constraints: do {("; ".join(key_must_do) or "natural creator behavior")}; avoid {("; ".join(key_must_avoid) or "robotic motion")}. '
            'Avoid exaggerated acting, dramatic cinematic motion, and abrupt ending cuts.'
        )
        if cutaway_mode == 'macro_last_2s':
            prompt = (
                f'{prompt} '
                'Last 2 seconds: macro product close-up, static, no hands or face visible, preserve fine texture detail.'
            )
    else:
        prompt = (
            'Scene:\n'
            f'- Environment: {spec.scene.environment}\n'
            f'- Atmosphere: {spec.scene.atmosphere}\n'
            f'- Time of day: {spec.scene.time_of_day or "day"}\n\n'
            'Talent:\n'
            f'- Creator: {spec.talent.creator_description}\n'
            f'- Identity lock: {spec.talent.identity_reference_rule}\n'
            f'- Product lock: {spec.talent.product_reference_rule}\n'
            f'- Expression: {spec.talent.expression or "friendly creator confidence"}\n'
            '- Delivery: conversational, subtle smiles, relaxed gestures\n\n'
            'Action:\n'
            f'- Opening: {spec.action.opening_action}\n'
            f'- Product interaction: {spec.action.product_interaction}\n'
            f'- Hero reveal: {spec.action.hero_reveal}\n'
            f'- Ending: {spec.action.ending_action}\n'
            f'- Duration: {spec.action.duration_seconds}s\n\n'
            'Rendering:\n'
            f'- Aspect ratio: {spec.rendering.aspect_ratio}\n'
            f'- Camera: {spec.rendering.camera_style}; {spec.rendering.shot_size}\n'
            f'- Motion: {spec.rendering.camera_motion}\n'
            f'- Visual style: {spec.rendering.visual_style}\n'
            f'- Lighting: {spec.rendering.lighting}\n'
            f'- Motion intensity: {spec.rendering.motion_intensity}\n\n'
            'Constraints:\n'
            f'- Must do: {"; ".join(key_must_do) or "none"}\n'
            f'- Must avoid: {"; ".join(key_must_avoid) or "none"}\n'
            '- Keep it natural and human, not cinematic or over-directed.'
        )
    prompt_profile = profile_prompt(prompt, rule_count=len(key_must_do) + len(key_must_avoid), dedupe_count=dedupe_count)
    return prompt, {
        'compiler_name': 'kling_compiler',
        'compiler_version': KLING_COMPILER_VERSION,
        'prompt_style': 'natural_organic_compact_ugc' if speaking_frame_safety_enabled else 'light_realism_structured_ugc',
        'realism_mode': 'natural_organic_v2',
        'audio_strategy': 'tts_then_sync_lipsync',
        'speaking_frame_safety_enabled': speaking_frame_safety_enabled,
        'product_face_spacing_strategy': product_face_spacing_strategy,
        'avatar_product_cutaway_mode': cutaway_mode,
        'prompt_profile': prompt_profile,
    }
