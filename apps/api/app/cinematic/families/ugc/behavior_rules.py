from app.cinematic.core.performance_grammar import FRIENDLY_CREATOR, LUXURY_CREATOR, UGC_SPEECH_SAFE_BEHAVIOR


def pick_creator_behavior(*, product_category_hint: str, creator_energy: str | None = None) -> str:
    if creator_energy and creator_energy.strip():
        return creator_energy.strip()
    category = product_category_hint.strip().lower()
    if any(token in category for token in {'jewellery', 'jewelry', 'luxury', 'premium'}):
        return LUXURY_CREATOR
    if any(token in category for token in {'beauty', 'skincare', 'cosmetic', 'home', 'decor', 'fashion', 'apparel', 'kurti'}):
        return UGC_SPEECH_SAFE_BEHAVIOR
    return f'{FRIENDLY_CREATOR}; {UGC_SPEECH_SAFE_BEHAVIOR}'
