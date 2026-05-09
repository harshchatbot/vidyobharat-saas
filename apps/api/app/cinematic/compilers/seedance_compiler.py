from __future__ import annotations

from app.cinematic.compilers.prompt_guardrails import consolidate_lower_face_rule, dedupe_and_cap_rules, profile_prompt
from app.cinematic.schemas.cinematic_spec import CinematicSpec


SEEDANCE_COMPILER_VERSION = '1.3.0'


def _seedance_key_avoid_rules(spec: CinematicSpec) -> str:
    priority = ('extra people', 'warped hands', 'profile', 'mouth', 'chin', 'dramatic')
    picked: list[str] = []
    for needle in priority:
        for rule in spec.constraints.must_avoid:
            if needle in rule.lower() and rule not in picked:
                picked.append(rule)
                break
    if not picked:
        picked = list(spec.constraints.must_avoid[:4])
    picked, lower_face_dedupe = consolidate_lower_face_rule(picked)
    picked, _ = dedupe_and_cap_rules(picked, max_items=4)
    if lower_face_dedupe > 0 and 'keep mouth and chin area unobstructed during speech' not in picked:
        picked.append('keep mouth and chin area unobstructed during speech')
    return ', '.join(picked[:4])


def compile_seedance_prompt(spec: CinematicSpec) -> tuple[str, dict[str, object]]:
    speaking_frame_safety_enabled = bool(spec.metadata.get('speaking_frame_safety_enabled'))
    product_face_spacing_strategy = str(spec.metadata.get('product_face_spacing_strategy') or 'standard_recipe_framing')
    cutaway_mode = str(spec.metadata.get('avatar_product_cutaway_mode') or '').strip() or None
    constraints_text = f"Constraints: {_seedance_key_avoid_rules(spec)}." if spec.constraints.must_avoid else ''
    prompt = ' '.join(
        part
        for part in [
            'Reference Image 1 is the creator identity. Reference Image 2 is the exact product.',
            spec.talent.creator_description,
            f'Product: {spec.talent.product_name}.',
            f'Scene: {spec.scene.environment}.',
            f'Opening: {spec.action.opening_action}',
            f'Product interaction: {spec.action.product_interaction}',
            f'Hero reveal: {spec.action.hero_reveal}',
            f'Ending: {spec.action.ending_action}',
            f'Camera: {spec.rendering.camera_style}.',
            f'Motion: {spec.rendering.camera_motion}.',
            f'Lighting: {spec.rendering.lighting}.',
            f'Lip-sync safety: {spec.rendering.lipsync_safety or "keep face stable and frontal"}.',
            'Product visible from first frame.',
            'Face stable and clearly visible.',
            'Use stable chest-up framing with face near-frontal and relaxed creator posture.',
            'Keep movement subtle, conversational, and human-like with natural blinking, soft smile shifts, and relaxed breathing rhythm.',
            'Keep hand gestures gentle and infrequent while speaking.',
            (
                'During speech, keep the product beside the face at a lower hold so mouth visibility stays clear.'
                if speaking_frame_safety_enabled
                else ''
            ),
            (
                'Do not let the product, hands, or props cross the lower-face area during speech.'
                if speaking_frame_safety_enabled
                else ''
            ),
            (
                'Prefer near-frontal speaking angles with clear mouth readability.'
                if speaking_frame_safety_enabled
                else ''
            ),
            (
                'Avoid sudden camera sway and abrupt gesture bursts while speaking.'
                if speaking_frame_safety_enabled
                else ''
            ),
            'Keep the final second steady with both face and product clearly visible for a clean non-abrupt ending.',
            'No dramatic zooms, no fast pans, and no cinematic action behavior.',
            'No subtitles or on-screen text.',
            'No extra people.',
            constraints_text,
            (
                'Last 2 seconds: macro product close-up, static, no hands or face visible, preserve fine texture detail.'
                if cutaway_mode == 'macro_last_2s'
                else ''
            ),
        ]
        if part
    ).strip()
    prompt_profile = profile_prompt(
        prompt,
        rule_count=min(4, len(spec.constraints.must_avoid)),
        dedupe_count=max(0, len(spec.constraints.must_avoid) - min(4, len(spec.constraints.must_avoid))),
    )
    return prompt, {
        'compiler_name': 'seedance_compiler',
        'compiler_version': SEEDANCE_COMPILER_VERSION,
        'prompt_style': 'reference_heavy_direct',
        'realism_mode': 'natural_organic_v2',
        'audio_strategy': 'tts_then_sync_lipsync',
        'speaking_frame_safety_enabled': speaking_frame_safety_enabled,
        'product_face_spacing_strategy': product_face_spacing_strategy,
        'avatar_product_cutaway_mode': cutaway_mode,
        'prompt_profile': prompt_profile,
    }
