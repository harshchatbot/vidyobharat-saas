from app.cinematic.core.camera_grammar import UGC_DESK_CREATOR, UGC_HANDHELD_SELFIE


def pick_ugc_camera_style(*, product_category_hint: str, camera_style: str | None = None) -> str:
    if camera_style and camera_style.strip():
        return camera_style.strip()
    category = product_category_hint.strip().lower()
    if any(token in category for token in {'saas', 'software', 'office', 'ai', 'tech'}):
        return UGC_DESK_CREATOR
    return UGC_HANDHELD_SELFIE
