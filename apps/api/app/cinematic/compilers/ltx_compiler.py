from __future__ import annotations

from app.cinematic.compilers.prompt_guardrails import profile_prompt
from app.cinematic.schemas.cinematic_spec import CinematicSpec


LTX_COMPILER_VERSION = '1.2.0'


def compile_ltx_prompt(spec: CinematicSpec) -> tuple[str, dict[str, object]]:
    speaking_frame_safety_enabled = bool(spec.metadata.get('speaking_frame_safety_enabled'))
    product_face_spacing_strategy = str(spec.metadata.get('product_face_spacing_strategy') or 'standard_recipe_framing')
    cutaway_mode = str(spec.metadata.get('avatar_product_cutaway_mode') or '').strip() or None
    prompt = ' '.join(
        part for part in [
            f'{spec.talent.creator_description}.',
            f'Hold {spec.talent.product_name} visible from frame one.',
            f'{spec.action.opening_action}',
            f'{spec.action.product_interaction}',
            f'{spec.action.hero_reveal}',
            f'{spec.action.ending_action}',
            f'Camera style: {spec.rendering.camera_style}.',
            f'Camera motion: {spec.rendering.camera_motion}.',
            f'Motion intensity: {spec.rendering.motion_intensity}.',
            f'Lighting: {spec.rendering.lighting}.',
            f'Lip-sync safety: {spec.rendering.lipsync_safety or "stable face visibility"}.',
            'Keep creator behavior natural and conversational, with subtle smile shifts, natural blinking, and gentle hand motion.',
            'Avoid exaggerated mouth shapes and keep a clean final hold with face and product readable.',
            (
                'During speech, keep product visibility while maintaining an unobstructed mouth and chin area.'
                if speaking_frame_safety_enabled
                else ''
            ),
            (
                'Keep the face near-frontal with relaxed micro movement for stable lip readability.'
                if speaking_frame_safety_enabled
                else ''
            ),
            'No subtitles. No extra people. Keep identity and product stable. Avoid abrupt ending cuts.',
            (
                'Last 2 seconds: macro product close-up, static, no hands or face visible, preserve fine texture detail.'
                if cutaway_mode == 'macro_last_2s'
                else ''
            ),
        ] if part
    ).strip()
    prompt_profile = profile_prompt(prompt, rule_count=3 if speaking_frame_safety_enabled else 2, dedupe_count=0)
    return prompt, {
        'compiler_name': 'ltx_compiler',
        'compiler_version': LTX_COMPILER_VERSION,
        'prompt_style': 'motion_focused_concise',
        'realism_mode': 'natural_organic_v2',
        'audio_strategy': 'tts_then_sync_lipsync',
        'speaking_frame_safety_enabled': speaking_frame_safety_enabled,
        'product_face_spacing_strategy': product_face_spacing_strategy,
        'avatar_product_cutaway_mode': cutaway_mode,
        'prompt_profile': prompt_profile,
    }
