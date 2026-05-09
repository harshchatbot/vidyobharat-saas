from app.cinematic.core.constraint_grammar import (
    LIPSYNC_SAFE_FACE_VISIBILITY,
    MAINTAIN_IDENTITY,
    NO_EXTRA_PEOPLE,
    NO_PRODUCT_MUTATION,
    NO_SUBTITLES,
    NO_WARPED_HANDS,
)


def build_ugc_constraints(*, product_category_hint: str) -> tuple[list[str], list[str], str]:
    must_do = [
        'keep the product visible from the first frame',
        'preserve the product from Reference Image 2',
        MAINTAIN_IDENTITY,
        LIPSYNC_SAFE_FACE_VISIBILITY,
        NO_SUBTITLES,
        'keep creator behavior conversational, subtle, and human-like',
        'maintain stable face visibility with mouth readable during speaking moments',
    ]
    must_avoid = [
        NO_PRODUCT_MUTATION,
        NO_EXTRA_PEOPLE,
        NO_WARPED_HANDS,
        'avoid dramatic cinematic camera choreography',
        'avoid aggressive gestures or fast head turns while speaking',
        'avoid product placement near the mouth or chin zone',
    ]
    category = product_category_hint.strip().lower()
    if any(token in category for token in {'jewellery', 'jewelry', 'luxury'}):
        must_avoid.append('no extra jewellery beyond the featured product')
    negative_prompt = (
        'warped hands, extra fingers, subtitle text, extra people, mutated product, distorted face, '
        'fast camera pan, profile speaking angle, exaggerated facial animation'
    )
    return must_do, must_avoid, negative_prompt
