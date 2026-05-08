from __future__ import annotations

from app.cinematic.schemas.cinematic_spec import CinematicSpec


KLING_COMPILER_VERSION = '1.0.0'


def compile_kling_prompt(spec: CinematicSpec) -> tuple[str, dict[str, object]]:
    prompt = (
        'Scene:\n'
        f'- Location: {spec.scene.location}\n'
        f'- Environment: {spec.scene.environment}\n'
        f'- Atmosphere: {spec.scene.atmosphere}\n'
        f'- Time of day: {spec.scene.time_of_day or "day"}\n'
        f'- Background details: {", ".join(spec.scene.background_details) or "none"}\n\n'
        'Talent:\n'
        f'- Creator: {spec.talent.creator_description}\n'
        f'- Identity lock: {spec.talent.identity_reference_rule}\n'
        f'- Product lock: {spec.talent.product_reference_rule}\n'
        f'- Product name: {spec.talent.product_name}\n'
        f'- Product category: {spec.talent.product_category}\n'
        f'- Wardrobe: {spec.talent.wardrobe or "clean creator wardrobe"}\n'
        f'- Expression: {spec.talent.expression or "friendly creator confidence"}\n\n'
        'Action:\n'
        f'- Opening: {spec.action.opening_action}\n'
        f'- Product interaction: {spec.action.product_interaction}\n'
        f'- Hero reveal: {spec.action.hero_reveal}\n'
        f'- Ending: {spec.action.ending_action}\n'
        f'- Duration: {spec.action.duration_seconds}s\n\n'
        'Rendering:\n'
        f'- Aspect ratio: {spec.rendering.aspect_ratio}\n'
        f'- Camera style: {spec.rendering.camera_style}\n'
        f'- Shot size: {spec.rendering.shot_size}\n'
        f'- Camera motion: {spec.rendering.camera_motion}\n'
        f'- Lighting: {spec.rendering.lighting}\n'
        f'- Visual style: {spec.rendering.visual_style}\n'
        f'- Motion intensity: {spec.rendering.motion_intensity}\n'
        f'- Lip-sync safety: {spec.rendering.lipsync_safety or "keep face stable"}\n\n'
        'Constraints:\n'
        f'- Must do: {"; ".join(spec.constraints.must_do) or "none"}\n'
        f'- Must avoid: {"; ".join(spec.constraints.must_avoid) or "none"}\n'
        f'- Negative prompt: {spec.constraints.negative_prompt or "none"}'
    )
    return prompt, {
        'compiler_name': 'kling_compiler',
        'compiler_version': KLING_COMPILER_VERSION,
        'prompt_style': 'structured_cinematic_ugc',
    }
