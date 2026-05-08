from __future__ import annotations


def orientation_guidance(character_orientation: str) -> str:
    normalized = str(character_orientation or 'video').strip().lower()
    if normalized == 'image':
        return 'Preserve the framing and visual silhouette of Reference Image 1 more strongly while still transferring the reference dance timing.'
    return 'Use video orientation for fuller body motion transfer and stronger choreography readability across the dance.'
