from __future__ import annotations

from app.cinematic.families.motion_control.motion_rules import (
    AVOID_BODY_WARPING,
    AVOID_EXTRA_LIMBS,
    FOLLOW_REFERENCE_TIMING,
    KEEP_CHARACTER_VISIBLE,
    MAINTAIN_BODY_STRUCTURE,
    PRESERVE_CHARACTER_IDENTITY,
    PRESERVE_REFERENCE_CHOREOGRAPHY,
    SMOOTH_RHYTHMIC_MOTION,
)


def build_motion_control_constraints(*, motion_fidelity: str, keep_original_sound: bool) -> tuple[list[str], list[str], str]:
    must_do = [
        PRESERVE_REFERENCE_CHOREOGRAPHY,
        FOLLOW_REFERENCE_TIMING,
        MAINTAIN_BODY_STRUCTURE,
        PRESERVE_CHARACTER_IDENTITY,
        KEEP_CHARACTER_VISIBLE,
        SMOOTH_RHYTHMIC_MOTION,
        'stay closely aligned to the original choreography timing and pose intent from the uploaded reference video',
        'maintain full-body readability and consistent identity through the full reference dance',
    ]

    if keep_original_sound:
        must_do.append('preserve the original soundtrack timing from the uploaded dance video when audio is present')

    must_avoid = [
        AVOID_EXTRA_LIMBS,
        AVOID_BODY_WARPING,
        'do not crop out the main dancer body during key movement beats',
        'do not replace the dance with unrelated movement or invented choreography',
        'do not introduce extra people, duplicate characters, or background dancers that were not requested',
    ]
    negative_prompt = (
        'extra limbs, warped hands, broken anatomy, body distortion, duplicated body parts, identity drift, '
        'cropped dancer, missing legs, missing arms, off-beat motion, chaotic camera shake'
    )
    return must_do, must_avoid, negative_prompt
