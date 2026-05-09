from __future__ import annotations

from typing import Callable

from app.cinematic.core.lighting_grammar import CLEAN_BEAUTY_LIGHTING, COZY_HOME, SOFT_DAYLIGHT, WARM_LUXURY
from app.cinematic.compilers.kling_compiler import compile_kling_prompt
from app.cinematic.compilers.ltx_compiler import compile_ltx_prompt
from app.cinematic.compilers.seedance_compiler import compile_seedance_prompt
from app.cinematic.families.ugc.behavior_rules import pick_creator_behavior
from app.cinematic.families.ugc.camera_rules import pick_ugc_camera_style
from app.cinematic.families.ugc.constraints import build_ugc_constraints
from app.cinematic.families.ugc.motion_rules import build_ugc_motion_bundle
from app.cinematic.schemas.cinematic_spec import ActionSpec, CinematicSpec, ConstraintSpec, RenderingSpec, SceneSpec, TalentSpec

_KLING_MODEL_KEYS = frozenset({
    'kling_o3_standard_reference',
    'kling_o3_pro_reference',
    'kling_o3_4k_reference',
    'kling_o3_reference',
    'kling-standard',
    'kling-4k',
})


def select_compiler_for_model(model_key: str) -> Callable[[CinematicSpec], tuple[str, dict]]:
    """Return the right prompt compiler for a video model key."""
    key = (model_key or '').strip().lower()
    if 'ltx' in key:
        return compile_ltx_prompt
    if 'seedance' in key:
        return compile_seedance_prompt
    if 'kling' in key or model_key in _KLING_MODEL_KEYS:
        return compile_kling_prompt
    return compile_seedance_prompt


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
    narrated_run = bool((narration_script or '').strip())
    lighting = _pick_lighting(product_category_hint=category, lighting_style=lighting_style)
    motion_bundle = build_ugc_motion_bundle(product_category_hint=category, narrated_run=narrated_run)
    creator_behavior = pick_creator_behavior(product_category_hint=category, creator_energy=creator_energy)
    must_do, must_avoid, negative_prompt = build_ugc_constraints(product_category_hint=category)
    opening_action, product_interaction, hero_reveal, ending_action = _category_actions(category)
    camera = pick_ugc_camera_style(product_category_hint=category, camera_style=camera_style)
    product_face_spacing_strategy = _product_face_spacing_strategy(category, narrated_run=narrated_run)
    cutaway_mode = _avatar_product_cutaway_mode(
        product_category_hint=category,
        product_name=product_name,
        duration_seconds=duration_seconds,
    )
    if narrated_run:
        opening_action, product_interaction, hero_reveal, ending_action = _tighten_actions_for_narrated_speech(
            category=category,
            opening_action=opening_action,
            product_interaction=product_interaction,
            hero_reveal=hero_reveal,
            ending_action=ending_action,
        )
        must_do = list(must_do) + [
            'keep the talking face clearly readable throughout spoken sections',
            'keep the product from covering the mouth or chin while speaking',
            'perform one gentle product reveal and return to a stable talking hold',
        ]
        must_avoid = list(must_avoid) + [
            'no profile turns during speech',
            'avoid product or hand crossing the lower-face speaking area',
            'avoid abrupt gesture bursts during spoken sections',
        ]
        motion_bundle = {
            **motion_bundle,
            'camera_motion': (
                'subtle handheld drift with stable chest-up talking-head framing during speech'
            ),
            'motion_intensity': (
                'calm creator movement, natural micro-expression, and steady face readability during speech'
            ),
            'lipsync_safety': (
                'face near-frontal and readable, lips unobstructed, and product held lower for reliable lip sync'
            ),
        }
        negative_prompt = (
            f'{negative_prompt}, profile turns during speech, product blocking mouth, obstructed lips'
            if negative_prompt
            else 'profile turns during speech, product blocking mouth, obstructed lips'
        )

    if cutaway_mode:
        ending_action = f'{ending_action} Last 2 seconds: macro product close-up, static, no hands or face visible, preserve texture detail.'

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
            'speaking_frame_safety_enabled': narrated_run,
            'product_face_spacing_strategy': product_face_spacing_strategy,
            'hero_reveal_window': 'between second 1 and second 3',
            'product_category_hint': product_category_hint,
            'creator_energy': creator_behavior,
            'visual_mood': visual_mood or 'realistic creator ugc',
            'avatar_product_cutaway_mode': cutaway_mode,
        },
    )


def _avatar_product_cutaway_mode(*, product_category_hint: str, product_name: str, duration_seconds: int) -> str | None:
    if int(duration_seconds or 0) > 6:
        return None
    haystack = f'{product_category_hint} {product_name}'.lower()
    keywords = (
        'crochet',
        'knit',
        'knitted',
        'jewelry',
        'jewellery',
        'textured',
        'embroidered',
        'handmade',
        'fabric',
        'apparel',
        'kurti',
        'garment',
    )
    if any(token in haystack for token in keywords):
        return 'macro_last_2s'
    return None


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


def _tighten_actions_for_narrated_speech(
    *,
    category: str,
    opening_action: str,
    product_interaction: str,
    hero_reveal: str,
    ending_action: str,
) -> tuple[str, str, str, str]:
    if any(token in category for token in {'beauty', 'skincare', 'cosmetic', 'jewellery', 'jewelry', 'luxury'}):
        return (
            'Open in a calm frontal talking-head pose with the product visible beside the face.',
            'Bring the product slightly closer once, then return it to a comfortable lower hold.',
            'Do one gentle hero reveal close to camera, then settle back into a stable talking hold.',
            'End in a stable frontal frame with the product readable beside the face and the mouth fully visible.',
        )
    if any(token in category for token in {'clothing', 'kurti', 'apparel', 'fashion', 'garment'}):
        return (
            'Open with the garment visible in a wider lower hold so the face stays readable in a frontal frame.',
            'Adjust or unfold the garment once with slow controlled movement and stable framing.',
            'Do one gentle hero reveal of the garment, then keep it lower and wider while speaking.',
            'End with the garment clearly readable and the face still near-frontal with full lip visibility.',
        )
    return (
        'Open with the product visible beside the face in a steady frontal frame.',
        'Present the product once with calm controlled movement while keeping speech visibility clear.',
        'Do one gentle hero reveal, then hold the product lower beside the face for the spoken line.',
        'End on a steady creator presentation with both face and product in frame and the lips fully visible.',
    )


def _product_face_spacing_strategy(category: str, narrated_run: bool) -> str:
    if not narrated_run:
        return 'standard_recipe_framing'
    if any(token in category for token in {'beauty', 'skincare', 'cosmetic', 'jewellery', 'jewelry', 'luxury'}):
        return 'close_but_below_mouthline'
    if any(token in category for token in {'clothing', 'kurti', 'apparel', 'fashion', 'garment'}):
        return 'wide_lower_hold_full_face_visible'
    return 'lower_beside_face_chest_to_shoulder_zone'
