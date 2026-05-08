from __future__ import annotations

from app.cinematic.schemas.cinematic_spec import CinematicSpec


SEEDANCE_COMPILER_VERSION = '1.0.0'


def compile_seedance_prompt(spec: CinematicSpec) -> tuple[str, dict[str, object]]:
    constraints_text = f"Constraints: {', '.join(spec.constraints.must_avoid)}." if spec.constraints.must_avoid else ''
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
            'No subtitles or on-screen text.',
            'No extra people.',
            constraints_text,
        ]
        if part
    ).strip()
    return prompt, {
        'compiler_name': 'seedance_compiler',
        'compiler_version': SEEDANCE_COMPILER_VERSION,
        'prompt_style': 'reference_heavy_direct',
    }
