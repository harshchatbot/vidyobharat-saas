from __future__ import annotations

from app.cinematic.schemas.cinematic_spec import CinematicSpec


SEEDANCE_COMPILER_VERSION = '1.0.0'


def compile_seedance_prompt(spec: CinematicSpec) -> tuple[str, dict[str, object]]:
    speaking_frame_safety_enabled = bool(spec.metadata.get('speaking_frame_safety_enabled'))
    product_face_spacing_strategy = str(spec.metadata.get('product_face_spacing_strategy') or 'standard_recipe_framing')
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
            'Use stable chest-up framing with the face near-frontal and the mouth readable.',
            (
                'During speech, keep the product beside the face but lower at chest-to-shoulder height, never near the lips or chin.'
                if speaking_frame_safety_enabled
                else ''
            ),
            (
                'Do not let the product, hands, or props cross the lower-face area during speech.'
                if speaking_frame_safety_enabled
                else ''
            ),
            (
                'No profile turns during speech. Keep frontal mouth visibility for the full spoken line.'
                if speaking_frame_safety_enabled
                else ''
            ),
            (
                'Avoid sudden camera sway, aggressive gestures, or long downward looks at the product while speaking.'
                if speaking_frame_safety_enabled
                else ''
            ),
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
        'speaking_frame_safety_enabled': speaking_frame_safety_enabled,
        'product_face_spacing_strategy': product_face_spacing_strategy,
    }
