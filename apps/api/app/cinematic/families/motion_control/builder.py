from __future__ import annotations

from app.cinematic.families.motion_control.constraints import build_motion_control_constraints
from app.cinematic.families.motion_control.orientation_rules import orientation_guidance
from app.cinematic.schemas.cinematic_spec import ActionSpec, CinematicSpec, ConstraintSpec, RenderingSpec, SceneSpec, TalentSpec


def build_motion_control_dance_spec(
    *,
    character_description: str,
    user_prompt: str,
    dance_style: str,
    character_energy: str,
    visual_style: str,
    motion_fidelity: str,
    character_orientation: str,
    keep_original_sound: bool,
    duration_seconds: int,
    aspect_ratio: str = '9:16',
    has_audio: bool | None = None,
) -> CinematicSpec:
    normalized_style = 'Funny'
    normalized_energy = 'Playful'
    normalized_visual_style = 'Realistic'
    normalized_fidelity = 'Strict'
    normalized_orientation = 'video'
    prompt_tail = str(user_prompt or '').strip()
    character_label = str(character_description or '').strip() or 'uploaded character'
    must_do, must_avoid, negative_prompt = build_motion_control_constraints(
        motion_fidelity=normalized_fidelity,
        keep_original_sound=keep_original_sound,
    )

    return CinematicSpec(
        recipe_family='motion_control_dance',
        recipe_version='v1',
        scene=SceneSpec(
            location='viral short-form dance reel setting',
            environment='social-first vertical dance frame that keeps the main character readable from head to toe',
            atmosphere='playful viral dance energy with clean realistic rendering and strong shareable rhythm',
            time_of_day=None,
            background_details=[
                'reference choreography comes from the uploaded dance video',
                'keep the main dancer clearly visible',
                'optimize for 9:16 vertical reel framing',
            ],
        ),
        talent=TalentSpec(
            creator_description=character_label,
            identity_reference_rule='Reference Image 1 is the exact character identity to preserve.',
            product_reference_rule='The uploaded reference video is the exact choreography and timing source to follow.',
            product_name='reference choreography',
            product_category=normalized_style,
            wardrobe=None,
            expression='playful performance with strong recognisable character identity',
        ),
        action=ActionSpec(
            opening_action='Start with the same dance timing and body rhythm established by the uploaded reference video.',
            product_interaction='Transfer the reference choreography cleanly onto the target character while preserving full-body readability.',
            hero_reveal='Keep the strongest dance moments faithful to the reference timing rather than inventing new choreography.',
            ending_action='Finish on the same dance ending timing and performance energy implied by the uploaded reference video.',
            duration_seconds=max(1, int(duration_seconds)),
        ),
        rendering=RenderingSpec(
            aspect_ratio=aspect_ratio,
            camera_style='vertical social-first dance framing',
            shot_size='full-body dance frame with readable limbs and clear subject silhouette',
            camera_motion='mostly inherited from the reference video timing and framing, with smooth stable motion transfer',
            lighting='realistic visual finish with clean readable subject separation',
            visual_style='realistic viral dance reel',
            motion_intensity='strict motion fidelity with playful character energy',
            lipsync_safety=None,
        ),
        constraints=ConstraintSpec(
            must_do=must_do + [orientation_guidance(normalized_orientation)],
            must_avoid=must_avoid,
            negative_prompt=negative_prompt,
        ),
        metadata={
            'cinematic_framework': 'STAR-C',
            'dance_style': normalized_style,
            'character_energy': normalized_energy,
            'visual_style': normalized_visual_style,
            'motion_fidelity': normalized_fidelity,
            'character_orientation': normalized_orientation,
            'keep_original_sound': bool(keep_original_sound),
            'has_audio': bool(has_audio) if has_audio is not None else None,
            'user_prompt': prompt_tail,
            'generation_mode': 'reference_driven',
        },
    )
