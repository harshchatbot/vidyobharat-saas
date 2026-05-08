from app.cinematic.core.motion_grammar import (
    NATURAL_BODY_SWAY,
    PRODUCT_HERO_REVEAL_MOTION,
    STABLE_LIPSYNC_SAFE_MOTION,
    SUBTLE_MICRO_SHAKE,
)


def build_ugc_motion_bundle(*, product_category_hint: str) -> dict[str, str]:
    _ = product_category_hint
    return {
        'camera_motion': SUBTLE_MICRO_SHAKE,
        'motion_intensity': NATURAL_BODY_SWAY,
        'hero_reveal': PRODUCT_HERO_REVEAL_MOTION,
        'lipsync_safety': STABLE_LIPSYNC_SAFE_MOTION,
    }
