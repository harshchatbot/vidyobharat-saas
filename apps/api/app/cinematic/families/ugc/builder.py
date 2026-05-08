from __future__ import annotations

from app.cinematic.core.lighting_grammar import CLEAN_BEAUTY_LIGHTING, COZY_HOME, SOFT_DAYLIGHT, WARM_LUXURY
from app.cinematic.families.ugc.behavior_rules import pick_creator_behavior
from app.cinematic.families.ugc.camera_rules import pick_ugc_camera_style
from app.cinematic.families.ugc.constraints import build_ugc_constraints
from app.cinematic.families.ugc.motion_rules import build_ugc_motion_bundle
from app.cinematic.schemas.cinematic_spec import ActionSpec, CinematicSpec, ConstraintSpec, RenderingSpec, SceneSpec, TalentSpec


def build_ugc_avatar_product_spec(
    *,
    avatar_name: str,
    product_name: str,
    product_category_hint: str,
    narration_script: str | None,
    duration_seconds: int,
    camera_style: str | None = None,
    lighting_style: str | None = None,
    creator_energy: str | None = None,
    visual_mood: str | None = None,
) -> CinematicSpec:
    category = (product_category_hint or '').strip().lower()
    category_tokens = [token for token in category.replace('/', ' ').replace('-', ' ').split() if token]
    lighting = _pick_lighting(product_category_hint=category, lighting_style=lighting_style)
    motion_bundle = build_ugc_motion_bundle(product_category_hint=category)
    creator_behavior = pick_creator_behavior(product_category_hint=category, creator_energy=creator_energy)
    must_do, must_avoid, negative_prompt = build_ugc_constraints(product_category_hint=category)
    opening_action, product_interaction, hero_reveal, ending_action = _category_actions(category)
    camera = pick_ugc_camera_style(product_category_hint=category, camera_style=camera_style)

    return CinematicSpec(
        recipe_family='ugc_avatar_product',
        recipe_version='v2',
        scene=SceneSpec(
            location='creator-led product ad setting',
            environment=_pick_environment(category),
            atmosphere=visual_mood.strip() if visual_mood and visual_mood.strip() else 'realistic Indian creator UGC, premium but believable',
            time_of_day='day',
            background_details=['product visible from first frame', 'clean vertical composition', 'no distracting background movement'],
        ),
        talent=TalentSpec(
            creator_description=f'{avatar_name} presenting the product in a realistic Indian creator UGC ad',
            identity_reference_rule='Preserve avatar identity from Reference Image 1 exactly.',
            product_reference_rule='Preserve product identity from Reference Image 2 exactly.',
            product_name=product_name,
            product_category=' '.join(category_tokens) or product_category_hint or 'general',
            wardrobe='clean creator outfit with hands visible',
            expression=creator_behavior,
        ),
        action=ActionSpec(
            opening_action=opening_action,
            product_interaction=product_interaction,
            hero_reveal=hero_reveal,
            ending_action=ending_action,
            duration_seconds=duration_seconds,
        ),
        rendering=RenderingSpec(
            aspect_ratio='9:16',
            camera_style=camera,
            shot_size='medium close talking-head product frame',
            camera_motion=motion_bundle['camera_motion'],
            lighting=lighting,
            visual_style='realistic Indian creator UGC',
            motion_intensity=motion_bundle['motion_intensity'],
            lipsync_safety=motion_bundle['lipsync_safety'],
        ),
        constraints=ConstraintSpec(
            must_do=must_do,
            must_avoid=must_avoid,
            negative_prompt=negative_prompt,
        ),
        metadata={
            'cinematic_framework': 'STAR-C',
            'narration_script': (narration_script or '').strip(),
            'hero_reveal_window': 'between second 1 and second 3',
            'product_category_hint': product_category_hint,
            'creator_energy': creator_behavior,
            'visual_mood': visual_mood or 'realistic creator ugc',
        },
    )


def _pick_lighting(*, product_category_hint: str, lighting_style: str | None) -> str:
    if lighting_style and lighting_style.strip():
        return lighting_style.strip()
    if any(token in product_category_hint for token in {'beauty', 'skincare', 'cosmetic'}):
        return CLEAN_BEAUTY_LIGHTING
    if any(token in product_category_hint for token in {'jewellery', 'jewelry', 'luxury', 'premium'}):
        return WARM_LUXURY
    if any(token in product_category_hint for token in {'home', 'decor', 'furniture', 'kitchen'}):
        return COZY_HOME
    return SOFT_DAYLIGHT


def _pick_environment(category: str) -> str:
    if any(token in category for token in {'saas', 'software', 'office', 'ai', 'tech'}):
        return 'clean desk-side creator setup with subtle product context and no extra people'
    if any(token in category for token in {'home', 'decor', 'furniture', 'kitchen'}):
        return 'cozy home creator setting with steady background styling and readable product placement'
    return 'clean creator talking-head setup with product visible and controlled background'


def _category_actions(category: str) -> tuple[str, str, str, str]:
    if any(token in category for token in {'beauty', 'skincare', 'cosmetic'}):
        return (
            'Open with the product already beside the face in a calm talking-head pose.',
            'Bring the product slightly closer once while keeping the face visible and stable.',
            'Do one clean hero reveal close to camera, then hold product beside the face.',
            'End with the product still visible beside the face in a stable frontal frame.',
        )
    if any(token in category for token in {'jewellery', 'jewelry', 'luxury'}):
        return (
            'Open with careful premium presentation and the product already in frame.',
            'Present the product close to camera carefully without hiding the face.',
            'Complete one elegant hero reveal with minimal hand movement and no extra jewellery.',
            'End on a steady premium pose with both face and product clearly readable.',
        )
    if any(token in category for token in {'clothing', 'kurti', 'apparel', 'fashion', 'garment'}):
        return (
            'Open holding the garment in frame while keeping the face fully visible.',
            'Unfold or adjust the garment once with controlled movement and stable framing.',
            'Do one clean hero reveal of the garment between second 1 and second 3.',
            'End holding the garment clearly with the face still frontal and readable.',
        )
    if any(token in category for token in {'home', 'decor', 'furniture', 'kitchen'}):
        return (
            'Open with the product already held or presented beside the face in a steady frame.',
            'Present the product beside the face with calm controlled hand movement.',
            'Do one clean hero reveal of the product while keeping the face stable and visible.',
            'End on a steady home-style presentation with both face and product in frame.',
        )
    return (
        'Open with the product clearly visible from the first frame in a talking-head setup.',
        'Hold the product clearly and interact with it once using controlled creator movement.',
        'Do one clean hero reveal between second 1 and second 3, then keep the product steady.',
        'End with the face frontal and the product still clearly visible.',
    )
