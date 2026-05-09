from app.cinematic.core.motion_grammar import (
    NATURAL_BODY_SWAY,
    PRODUCT_HERO_REVEAL_MOTION,
    STABLE_LIPSYNC_SAFE_MOTION,
    SUBTLE_MICRO_SHAKE,
)


def build_ugc_motion_bundle(*, product_category_hint: str, narrated_run: bool) -> dict[str, str]:
    _ = product_category_hint
    if narrated_run:
        return {
            'camera_motion': (
                f'{SUBTLE_MICRO_SHAKE}; stable talking-head framing with subtle handheld drift only; '
                'avoid z-axis depth translation, push-in moves, and any product thrusting toward camera'
            ),
            'motion_intensity': (
                f'{NATURAL_BODY_SWAY}; lap-level/chest-static product hold; hands move minimally in the 2D plane; '
                'avoid depth-based reach motions and large parallax while speaking'
            ),
            'hero_reveal': (
                'one gentle product reveal using a small 2D tilt/angle adjustment (no push toward camera), then return to a steady hold'
            ),
            'lipsync_safety': (
                f'{STABLE_LIPSYNC_SAFE_MOTION}; keep the face stable and readable; avoid large parallax and depth motion while speaking'
            ),
        }
    return {
        'camera_motion': f'{SUBTLE_MICRO_SHAKE}; calm handheld drift with no dramatic pans or zoom bursts',
        'motion_intensity': f'{NATURAL_BODY_SWAY}; restrained creator gestures and relaxed speech-safe pacing',
        'hero_reveal': PRODUCT_HERO_REVEAL_MOTION,
        'lipsync_safety': STABLE_LIPSYNC_SAFE_MOTION,
    }
