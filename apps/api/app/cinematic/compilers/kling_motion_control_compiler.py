from __future__ import annotations

from typing import Any

from app.cinematic.schemas.cinematic_spec import CinematicSpec


COMPILER_NAME = 'kling_motion_control_compiler'
COMPILER_VERSION = 'v1'


def compile_kling_motion_control_prompt(spec: CinematicSpec) -> tuple[str, dict[str, Any]]:
    metadata = dict(spec.metadata or {})
    dance_style = 'Funny'
    character_energy = 'Playful'
    visual_style = 'Realistic'
    motion_fidelity = 'Strict'
    orientation = 'video'

    prompt_parts = [
        'Animate the character from Reference Image 1 using the choreography, movement timing, and rhythm from the uploaded reference video.',
        f'Preserve the character identity exactly: {spec.talent.creator_description}.',
        'Keep the face, proportions, texture, silhouette, and overall identity stable through the full dance.',
        'Follow the uploaded reference video for choreography and pacing instead of inventing new dance moves.',
        'Use a playful viral dance reel feel with a clean realistic visual finish.',
        'Maintain full-body visibility, readable limbs, smooth rhythmic motion, and natural pose transitions.',
        'Avoid extra limbs, warped hands, body distortion, identity drift, missing feet, or chaotic reframing.',
        'Vertical social-media framing, sharp focus, clean subject separation, and smooth natural motion.',
        'Stay closely faithful to the original choreography timing and move sequence from the uploaded reference video.',
        'Optimize for full-body dance motion transfer and readable choreography across the whole clip.',
    ]

    prompt = ' '.join(part.strip() for part in prompt_parts if part.strip())
    return prompt, {
        'compiler_name': COMPILER_NAME,
        'compiler_version': COMPILER_VERSION,
        'dance_style': dance_style,
        'character_energy': character_energy,
        'visual_style': visual_style,
        'motion_fidelity': motion_fidelity,
        'character_orientation': orientation,
    }
