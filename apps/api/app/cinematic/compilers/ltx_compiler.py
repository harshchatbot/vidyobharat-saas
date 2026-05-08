from __future__ import annotations

from app.cinematic.schemas.cinematic_spec import CinematicSpec


LTX_COMPILER_VERSION = '1.0.0'


def compile_ltx_prompt(spec: CinematicSpec) -> tuple[str, dict[str, object]]:
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
            'No subtitles. No extra people. Keep identity and product stable.',
        ] if part
    ).strip()
    return prompt, {
        'compiler_name': 'ltx_compiler',
        'compiler_version': LTX_COMPILER_VERSION,
        'prompt_style': 'motion_focused_concise',
    }
