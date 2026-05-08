from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.core.config import get_settings
from app.providers.firebase import FirebaseNotConfiguredError, get_firebase_app, get_firestore_client, normalize_firebase_bucket
from app.schemas.catalog import AvatarResponse
from app.services.tts import list_tts_voices

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class AvatarReferenceImageVariant:
    id: str
    url: str
    tags: list[str]


@dataclass(frozen=True)
class AvatarReferenceSelection:
    selected_url: str | None
    selected_id: str | None
    selected_tags: list[str]
    reason: str
    candidate_count: int
    fallback_mode: str


_REFERENCE_TAG_DEFAULTS: dict[str, tuple[str, ...]] = {
    'front': ('front', 'neutral', 'talking'),
    'smile': ('smile', 'friendly', 'beauty'),
    'desk': ('desk', 'office', 'ai'),
    'selfie': ('selfie', 'creator', 'friendly'),
    'left': ('left', 'profile', 'angle'),
    'right': ('right', 'profile', 'angle'),
    'closeup': ('closeup', 'front', 'luxury'),
}

_REFERENCE_HEURISTIC_GROUPS: tuple[tuple[tuple[str, ...], tuple[str, ...], str], ...] = (
    (('skincare', 'beauty', 'cosmetic', 'cosmetics', 'makeup'), ('smile', 'beauty', 'friendly'), 'beauty_match'),
    (('ai', 'saas', 'software', 'office'), ('desk', 'office', 'ai'), 'office_match'),
    (('jewellery', 'jewelry', 'luxury'), ('front', 'closeup'), 'luxury_match'),
)


def _filename_variant_tags(variant_id: str) -> list[str]:
    normalized = str(variant_id or '').strip().lower()
    defaults = list(_REFERENCE_TAG_DEFAULTS.get(normalized, ()))
    for token, token_tags in _REFERENCE_TAG_DEFAULTS.items():
        if token and token in normalized:
            for tag in token_tags:
                if tag not in defaults:
                    defaults.append(tag)
            if token not in defaults:
                defaults.append(token)
    if normalized and normalized not in defaults:
        defaults.append(normalized)
    return defaults


def _coerce_reference_variants(raw_variants: Any) -> list[AvatarReferenceImageVariant]:
    normalized: list[AvatarReferenceImageVariant] = []
    seen_urls: set[str] = set()
    for item in list(raw_variants or []):
        if isinstance(item, str):
            url = item.strip()
            if not url or url in seen_urls:
                continue
            variant_id = Path(url).stem.strip().lower() or 'reference'
            normalized.append(
                AvatarReferenceImageVariant(
                    id=variant_id,
                    url=url,
                    tags=_filename_variant_tags(variant_id),
                )
            )
            seen_urls.add(url)
            continue
        if not isinstance(item, dict):
            continue
        url = str(item.get('url') or item.get('image_url') or '').strip()
        if not url or url in seen_urls:
            continue
        variant_id = str(item.get('id') or Path(url).stem).strip().lower() or 'reference'
        tags = [str(tag).strip().lower() for tag in list(item.get('tags') or []) if str(tag).strip()]
        if not tags:
            tags = _filename_variant_tags(variant_id)
        normalized.append(
            AvatarReferenceImageVariant(
                id=variant_id,
                url=url,
                tags=list(dict.fromkeys(tags)),
            )
        )
        seen_urls.add(url)
    return normalized


def _filesystem_reference_variants(*, avatar_id: str, base_url: str) -> list[AvatarReferenceImageVariant]:
    normalized_id = str(avatar_id or '').strip()
    if not normalized_id:
        return []
    root = Path('data/uploads/avatars') / normalized_id
    if not root.exists() or not root.is_dir():
        return []
    variants: list[AvatarReferenceImageVariant] = []
    for path in sorted(root.iterdir()):
        if not path.is_file() or path.suffix.lower() not in {'.png', '.jpg', '.jpeg', '.webp'}:
            continue
        variant_id = path.stem.strip().lower()
        relative_url = f"{base_url.rstrip('/')}/uploads/avatars/{normalized_id}/{path.name}"
        variants.append(
            AvatarReferenceImageVariant(
                id=variant_id or 'reference',
                url=relative_url,
                tags=_filename_variant_tags(variant_id),
            )
        )
    return variants


def _merge_reference_variants(
    *,
    avatar_id: str,
    base_url: str,
    primary_image: str | None,
    raw_reference_images: Any,
    fallback_reference_image_url: str | None = None,
) -> tuple[str | None, list[str], list[AvatarReferenceImageVariant]]:
    variants = _coerce_reference_variants(raw_reference_images)
    if fallback_reference_image_url:
        fallback_url = str(fallback_reference_image_url).strip()
        if fallback_url and all(item.url != fallback_url for item in variants):
            fallback_id = Path(fallback_url).stem.strip().lower() or 'reference'
            variants.insert(
                0,
                AvatarReferenceImageVariant(
                    id=fallback_id,
                    url=fallback_url,
                    tags=_filename_variant_tags(fallback_id),
                ),
            )
    fs_variants = _filesystem_reference_variants(avatar_id=avatar_id, base_url=base_url)
    existing_urls = {item.url for item in variants}
    variants.extend(item for item in fs_variants if item.url not in existing_urls)

    ordered_urls: list[str] = []
    selected_primary = str(primary_image or '').strip() or None
    if selected_primary:
        ordered_urls.append(selected_primary)
    for item in variants:
        if item.url and item.url not in ordered_urls:
            ordered_urls.append(item.url)
    if not selected_primary and ordered_urls:
        selected_primary = ordered_urls[0]
    return selected_primary, ordered_urls, variants


def resolve_avatar_reference_variants(
    *,
    avatar_id: str,
    base_url: str,
    primary_image: str | None,
    raw_reference_images: Any,
    fallback_reference_image_url: str | None = None,
) -> tuple[str | None, list[str], list[AvatarReferenceImageVariant]]:
    return _merge_reference_variants(
        avatar_id=avatar_id,
        base_url=base_url,
        primary_image=primary_image,
        raw_reference_images=raw_reference_images,
        fallback_reference_image_url=fallback_reference_image_url,
    )


def selectBestAvatarReferenceImage(
    *,
    avatar: dict[str, Any],
    recipe_id: str,
    product_category: str | None = None,
    scene_type: str | None = None,
    prompt_text: str | None = None,
) -> AvatarReferenceSelection:
    del recipe_id, scene_type
    variants = _coerce_reference_variants(avatar.get('reference_image_variants') or [])
    primary_image = str(avatar.get('primary_image') or '').strip()
    reference_images = [str(item).strip() for item in list(avatar.get('reference_images') or []) if str(item).strip()]

    if not variants:
        selected_url = primary_image or (reference_images[0] if reference_images else None)
        return AvatarReferenceSelection(
            selected_url=selected_url,
            selected_id=Path(selected_url).stem.strip().lower() if selected_url else None,
            selected_tags=[],
            reason='legacy_single_image_fallback',
            candidate_count=len(reference_images) or (1 if selected_url else 0),
            fallback_mode='legacy',
        )

    haystack = ' '.join(
        part.strip().lower()
        for part in [str(product_category or ''), str(prompt_text or '')]
        if part and part.strip()
    )

    def score_variant(variant: AvatarReferenceImageVariant) -> tuple[int, int, int, int]:
        tag_set = {tag.lower() for tag in variant.tags}
        heuristic_score = 0
        match_priority = 0
        for keywords, preferred_tags, _reason in _REFERENCE_HEURISTIC_GROUPS:
            if any(keyword in haystack for keyword in keywords):
                heuristic_score = max(
                    heuristic_score,
                    sum(10 for tag in preferred_tags if tag in tag_set),
                )
                if heuristic_score:
                    match_priority = 1
        safe_fallback_score = sum(4 for tag in ('front', 'neutral', 'talking') if tag in tag_set)
        primary_bonus = 3 if primary_image and variant.url == primary_image else 0
        return (match_priority, heuristic_score, safe_fallback_score, primary_bonus)

    ranked = sorted(
        variants,
        key=lambda item: (
            score_variant(item)[0],
            score_variant(item)[1],
            score_variant(item)[2],
            score_variant(item)[3],
            -len(item.tags),
            item.id,
        ),
        reverse=True,
    )
    selected = ranked[0]

    reason = 'generic_safe_fallback'
    fallback_mode = 'structured'
    for keywords, preferred_tags, heuristic_reason in _REFERENCE_HEURISTIC_GROUPS:
        if any(keyword in haystack for keyword in keywords) and any(tag in {value.lower() for value in selected.tags} for tag in preferred_tags):
            reason = heuristic_reason
            break
    else:
        if primary_image and selected.url == primary_image:
            reason = 'primary_image_fallback'
            fallback_mode = 'primary'

    return AvatarReferenceSelection(
        selected_url=selected.url,
        selected_id=selected.id,
        selected_tags=selected.tags,
        reason=reason,
        candidate_count=len(variants),
        fallback_mode=fallback_mode,
    )


def build_avatar_master_prompt(
    *,
    gender: str | None,
    custom_prompt: str | None = None,
    negative_prompt: str | None = None,
    context_line: str | None = None,
) -> str:
    normalized_gender = str(gender or '').strip().lower()
    gender_label = normalized_gender if normalized_gender in {'female', 'male'} else 'person'
    custom_line = str(custom_prompt or '').strip()
    negative_line = str(negative_prompt or '').strip()
    context = str(context_line or '').strip()

    parts = [
        'You are a human influencer speaking directly to camera.',
        '',
        'Character profile:',
        f'- Gender: {gender_label}',
        '- Personality: friendly, confident, relatable',
        '- Tone: casual UGC creator',
        '- Energy: medium-high',
        '- Speaking style: fast, punchy, natural',
        '',
        'Behavior rules:',
        '- Maintain direct eye contact with camera',
        '- Use subtle head movement while speaking',
        '- Natural facial expressions aligned with speech',
        '- Slight smile when emphasizing positive points',
        '- No exaggerated movements or unnatural expressions',
        '- Keep delivery smooth and conversational',
        '',
        'Speech delivery:',
        '- Speak clearly and slightly fast (social media style)',
        '- Add natural pauses between sentences',
        '- Emphasize key words naturally (not robotic)',
        '',
        'Video style:',
        '- Selfie-style framing',
        '- Realistic lighting',
        '- Stable face (no distortion)',
        '- Authentic influencer vibe',
    ]
    if context:
        parts.extend(['', 'Scene context:', context])
    if custom_line:
        parts.extend(['', 'Actor-specific direction:', custom_line])
    parts.extend(['', 'Goal:', 'Deliver the script like a real Instagram creator, not like an AI.'])
    if negative_line:
        parts.extend(['', f'Avoid: {negative_line}'])
    return '\n'.join(parts)


@dataclass(frozen=True)
class ActorRecord:
    id: str
    name: str
    scope: str
    style: str
    gender: str | None
    language_tags: list[str]
    thumbnail_url: str
    tags: list[str]
    category: str | None
    reference_images: list[str]
    reference_image_variants: list[AvatarReferenceImageVariant]
    primary_image: str | None
    preview_video_url: str | None
    prompt_template: str | None
    negative_prompt: str | None
    recommended_voice: str | None
    voice_profile: dict[str, Any] | None
    status: str | None
    description: str | None = None
    created_at: Any | None = None
    raw: dict[str, Any] | None = None
    source: str = 'actor'
    user_id: str | None = None


@dataclass(frozen=True)
class CustomAvatarRecord:
    id: str
    user_id: str
    name: str
    reference_image_url: str
    reference_images: list[str]
    reference_image_variants: list[AvatarReferenceImageVariant]
    gender: str | None = None
    primary_image: str | None = None
    preferred_voice: str | None = None
    voice_profile: dict[str, Any] | None = None
    language_preference: str | None = None
    status: str | None = None
    style_label: str | None = None
    niche: str | None = None
    preview_image_url: str | None = None
    preview_video_url: str | None = None
    prompt_template: str | None = None
    negative_prompt: str | None = None
    raw: dict[str, Any] | None = None


class AvatarService:
    def __init__(self) -> None:
        self.settings = get_settings()
        public_base = self.settings.public_asset_base_url.rstrip('/')
        self._preset_records = [
            ActorRecord(
                id='av-priya',
                name='Priya',
                scope='public',
                style='studio',
                gender='female',
                language_tags=['hi-IN', 'en-IN'],
                thumbnail_url='https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=600&q=80',
                tags=['ugc', 'indian', 'female', 'studio'],
                category='ugc_influencer',
                reference_images=['https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=1200&q=80'],
                reference_image_variants=_filesystem_reference_variants(avatar_id='av-priya', base_url=public_base) or [
                    AvatarReferenceImageVariant(
                        id='front',
                        url='https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=1200&q=80',
                        tags=['front', 'neutral', 'talking'],
                    )
                ],
                primary_image='https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=1200&q=80',
                preview_video_url=None,
                prompt_template='Indian female creator speaking naturally to camera, selfie-style, direct eye contact, realistic expression',
                negative_prompt='distorted face, broken lips, asymmetry, blurry eyes',
                recommended_voice='Priya',
                voice_profile={
                    'speaker': 'priya',
                    'base_speed': 1.08,
                    'pitch_style': 'medium',
                    'tone': 'friendly_confident',
                    'energy': 'medium_high',
                },
                status='active',
                description='Public preset for warm, polished female UGC spokesperson videos.',
                source='preset',
            ),
            ActorRecord(
                id='av-arjun',
                name='Arjun',
                scope='public',
                style='corporate',
                gender='male',
                language_tags=['hi-IN', 'ta-IN', 'en-IN'],
                thumbnail_url='https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=600&q=80',
                tags=['ugc', 'indian', 'male', 'corporate'],
                category='ugc_influencer',
                reference_images=['https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=1200&q=80'],
                reference_image_variants=_filesystem_reference_variants(avatar_id='av-arjun', base_url=public_base) or [
                    AvatarReferenceImageVariant(
                        id='front',
                        url='https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=1200&q=80',
                        tags=['front', 'neutral', 'talking'],
                    )
                ],
                primary_image='https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=1200&q=80',
                preview_video_url=None,
                prompt_template='Indian male creator speaking naturally to camera, selfie-style, direct eye contact, realistic expression',
                negative_prompt='distorted face, broken lips, asymmetry, blurry eyes',
                recommended_voice='Shubh',
                voice_profile={
                    'speaker': 'shubh',
                    'base_speed': 1.05,
                    'pitch_style': 'medium',
                    'tone': 'confident_clear',
                    'energy': 'medium',
                },
                status='active',
                description='Public preset for confident male spokesperson and founder-style talking scenes.',
                source='preset',
            ),
        ]

    def list_avatars(
        self,
        search: str | None = None,
        scope: str | None = None,
        language: str | None = None,
        user_id: str | None = None,
    ) -> list[AvatarResponse]:
        result = [self._to_avatar_response(item) for item in self._list_actor_records(user_id=user_id)]

        if scope:
            normalized_scope = scope.strip().lower()
            result = [item for item in result if item.scope.lower() == normalized_scope]

        if language:
            normalized_language = language.strip().lower()
            result = [
                item
                for item in result
                if any(tag.lower() == normalized_language for tag in item.language_tags)
            ]

        if search:
            keyword = search.strip().lower()
            result = [
                item
                for item in result
                if keyword in item.name.lower()
                or keyword in item.style.lower()
                or keyword in (item.category or '').lower()
                or any(keyword in tag.lower() for tag in item.tags)
            ]

        logger.info(
            "avatar_list_resolved",
            extra={
                "user_id": user_id,
                "scope": scope,
                "language": language,
                "public_actor_count": sum(1 for item in result if str(item.scope).lower() == "public"),
                "saved_avatar_count": sum(1 for item in result if str(item.scope).lower() == "own"),
                "result_count": len(result),
            },
        )
        return result

    def get_avatar(self, avatar_id: str, user_id: str | None = None) -> AvatarResponse | None:
        record = self.get_actor_record(avatar_id, user_id=user_id)
        return self._to_avatar_response(record) if record else None



    def get_actor_record(self, actor_id: str, user_id: str | None = None) -> ActorRecord | None:
        normalized_id = str(actor_id or '').strip()
        if not normalized_id:
            return None

        try:
            db = get_firestore_client()
        except FirebaseNotConfiguredError:
            return None

        snap = db.collection('avatars').document(normalized_id).get()
        if not snap.exists:
            return None

        data = snap.to_dict() or {}
        item_user_id = str(data.get('user_id') or '').strip() or None
        status = str(data.get('status') or 'active').strip().lower()

        if status not in {'active', 'ready_for_preview', 'ready'}:
            return None

        visibility = str(data.get('visibility') or '').strip().lower()
        scope = str(data.get('scope') or '').strip().lower()
        avatar_type = str(data.get('avatar_type') or data.get('type') or '').strip().lower()

        is_public = (
            visibility == 'public'
            or scope == 'public'
            or avatar_type == 'system'
            or bool(data.get('is_public'))
        )

        is_owner = bool(user_id and item_user_id and item_user_id == str(user_id).strip())

        if not is_public and not is_owner:
            return None

        return self._actor_from_firestore(data, normalized_id)


    def get_actor_details(self, actor_id: str, user_id: str | None = None) -> dict[str, Any] | None:
        record = self.get_actor_record(actor_id, user_id=user_id)
        if not record:
            return None
        return {
            'id': record.id,
            'name': record.name,
            'thumbnail_url': record.thumbnail_url,
            'reference_images': record.reference_images,
            'reference_image_variants': [
                {'id': item.id, 'url': item.url, 'tags': item.tags}
                for item in record.reference_image_variants
            ],
            'primary_image': record.primary_image,
            'preview_video_url': record.preview_video_url,
            'tags': record.tags,
            'category': record.category,
            'language_support': record.language_tags,
            'prompt_template': record.prompt_template,
            'negative_prompt': record.negative_prompt,
            'recommended_voice': record.recommended_voice,
            'voice_profile': record.voice_profile,
            'created_at': record.created_at,
            'status': record.status or 'active',
            'scope': record.scope,
        }

    def create_actor(
        self,
        *,
        user_id: str,
        name: str,
        scope: str,
        gender: str | None,
        tags: list[str],
        category: str,
        language_support: list[str],
        prompt_template: str,
        negative_prompt: str,
        recommended_voice: str,
        thumb_bytes: bytes,
        thumb_content_type: str,
        ref_front_bytes: bytes,
        ref_front_content_type: str,
        ref_alt_bytes: bytes | None = None,
        ref_alt_content_type: str | None = None,
        preview_bytes: bytes | None = None,
        preview_content_type: str | None = None,
    ) -> str:
        normalized_voice = self._validate_voice(recommended_voice)
        normalized_scope = self._validate_scope(scope)
        normalized_gender = str(gender or '').strip().lower() or None
        if normalized_gender and normalized_gender not in {'female', 'male'}:
            raise ValueError('gender must be either "female" or "male"')
        name = name.strip()
        if not name:
            raise ValueError('Actor name is required')
        if not thumb_bytes:
            raise ValueError('Thumbnail is required')
        if not ref_front_bytes:
            raise ValueError('At least one reference image is required')

        db = get_firestore_client()
        actor_ref = db.collection('actors').document()
        actor_id = actor_ref.id
        thumb_url = self._upload_actor_file(actor_id=actor_id, filename='thumb.jpg', content=thumb_bytes, content_type=thumb_content_type or 'image/jpeg')
        ref_front_url = self._upload_actor_file(actor_id=actor_id, filename='ref_front.jpg', content=ref_front_bytes, content_type=ref_front_content_type or 'image/jpeg')
        reference_images = [ref_front_url]
        if ref_alt_bytes:
            ref_alt_url = self._upload_actor_file(actor_id=actor_id, filename='ref_alt.jpg', content=ref_alt_bytes, content_type=ref_alt_content_type or 'image/jpeg')
            reference_images.append(ref_alt_url)
        else:
            ref_alt_url = None

        preview_url = None
        if preview_bytes:
            preview_url = self._upload_actor_file(actor_id=actor_id, filename='preview.mp4', content=preview_bytes, content_type=preview_content_type or 'video/mp4')

        now = datetime.now(timezone.utc)
        doc = {
            'id': actor_id,
            'user_id': user_id,
            'scope': normalized_scope,
            'name': name,
            'gender': normalized_gender,
            'thumbnail_url': thumb_url,
            'reference_images': reference_images,
            'primary_image': ref_front_url,
            'preview_video_url': preview_url,
            'tags': tags,
            'category': category.strip() or 'ugc_influencer',
            'language_support': language_support or ['en-IN'],
            'prompt_template': prompt_template.strip(),
            'negative_prompt': negative_prompt.strip(),
            'recommended_voice': normalized_voice,
            'voice_profile': self._build_default_voice_profile(voice_key=normalized_voice, gender=normalized_gender),
            'created_at': now,
            'updated_at': now,
            'status': 'active',
            'description': f'{name} reusable AI actor',
        }
        actor_ref.set(doc)
        return actor_id

    def update_actor_scope(self, *, actor_id: str, user_id: str, scope: str) -> ActorRecord:
        normalized_scope = self._validate_scope(scope)
        try:
            db = get_firestore_client()
        except FirebaseNotConfiguredError as exc:
            raise ValueError('Actor storage is not configured') from exc

        actor_ref = db.collection('actors').document(str(actor_id or '').strip())
        snap = actor_ref.get()
        if not snap.exists:
            raise LookupError('Actor not found')

        data = snap.to_dict() or {}
        if str(data.get('user_id') or '').strip() != str(user_id or '').strip():
            raise PermissionError('You do not have access to this actor')

        actor_ref.set(
            {
                'scope': normalized_scope,
                'updated_at': datetime.now(timezone.utc),
            },
            merge=True,
        )
        updated = actor_ref.get().to_dict() or {}
        return self._actor_from_firestore(updated, str(updated.get('id') or actor_id))

    def get_custom_avatar(self, avatar_id: str, user_id: str) -> CustomAvatarRecord | None:
        normalized_id = str(avatar_id or '').strip()
        normalized_user_id = str(user_id or '').strip()
        if not normalized_id or not normalized_user_id:
            return None

        try:
            db = get_firestore_client()
        except FirebaseNotConfiguredError:
            return None

        snap = db.collection('avatars').document(normalized_id).get()
        if not snap.exists:
            return None

        data = snap.to_dict() or {}
        if str(data.get('provider') or '').strip().lower() == 'heygen':
            return None
        if str(data.get('user_id') or '').strip() != normalized_user_id:
            return None

        primary_image, reference_images, reference_image_variants = _merge_reference_variants(
            avatar_id=normalized_id,
            base_url=self.settings.public_asset_base_url,
            primary_image=str(data.get('primary_image') or '').strip() or None,
            raw_reference_images=data.get('reference_images'),
            fallback_reference_image_url=str(data.get('reference_image_url') or '').strip() or None,
        )
        reference_image_url = str(data.get('reference_image_url') or '').strip() or (reference_images[0] if reference_images else '')
        if not primary_image:
            return None

        style_label = str(data.get('style_label') or data.get('style') or '').strip() or None
        niche = str(data.get('niche') or '').strip() or None
        preview_image_url = (
            str(data.get('thumbnail_url') or '').strip()
            or str(data.get('last_preview_thumbnail_url') or '').strip()
            or primary_image
        )
        preview_video_url = str(data.get('preview_video_url') or data.get('last_preview_video_url') or '').strip() or None
        preferred_voice = str(data.get('preferred_voice') or data.get('recommended_voice') or '').strip() or None
        language_preference = str(data.get('language_preference') or '').strip() or None
        gender = str(data.get('gender') or '').strip() or None

        return CustomAvatarRecord(
            id=str(data.get('id') or normalized_id),
            user_id=normalized_user_id,
            name=str(data.get('name') or 'Custom Avatar').strip(),
            reference_image_url=reference_image_url,
            reference_images=reference_images or [primary_image],
            reference_image_variants=reference_image_variants,
            primary_image=primary_image,
            preferred_voice=preferred_voice,
            voice_profile=self._normalize_voice_profile(
                data.get('voice_profile'),
                voice_key=preferred_voice,
                gender=gender,
            ),
            gender=gender,
            language_preference=language_preference,
            status=str(data.get('status') or '').strip() or None,
            style_label=style_label,
            niche=niche,
            preview_image_url=preview_image_url,
            preview_video_url=preview_video_url,
            prompt_template=str(data.get('prompt_template') or '').strip() or None,
            negative_prompt=str(data.get('negative_prompt') or '').strip() or None,
            raw=data,
        )



    def _list_actor_records(self, *, user_id: str | None) -> list[ActorRecord]:
        records: list[ActorRecord] = []

        try:
            db = get_firestore_client()
        except FirebaseNotConfiguredError:
            return records

        normalized_user_id = str(user_id or '').strip()

        for snap in db.collection('avatars').stream():
            try:
                data = snap.to_dict() or {}
                avatar_id = str(data.get('id') or data.get('avatar_id') or data.get('persona_id') or snap.id).strip()
                if not avatar_id:
                    continue

                status = str(data.get('status') or 'active').strip().lower()
                if status not in {'active', 'ready_for_preview', 'ready'}:
                    continue
                if str(data.get('provider') or '').strip().lower() == 'heygen':
                    continue

                item_user_id = str(data.get('user_id') or '').strip()
                visibility = str(data.get('visibility') or '').strip().lower()
                scope = str(data.get('scope') or '').strip().lower()
                avatar_type = str(data.get('avatar_type') or data.get('type') or '').strip().lower()

                is_public = (
                    visibility == 'public'
                    or scope == 'public'
                    or avatar_type == 'system'
                    or bool(data.get('is_public'))
                )

                is_owner = bool(normalized_user_id and item_user_id == normalized_user_id)

                if not is_public and not is_owner:
                    continue

                records.append(self._actor_from_firestore(data, avatar_id))
            except Exception as exc:
                logger.warning(
                    "avatar_list_avatar_skipped",
                    extra={
                        "avatar_id": getattr(snap, "id", None),
                        "reason": str(exc),
                    },
                )

        records.sort(
            key=lambda item: (
                0 if item.scope == 'public' else 1,
                str(item.name or '').lower(),
            )
        )
        return records


    def _actor_from_firestore(self, data: dict[str, Any], actor_id: str) -> ActorRecord:
        language_support = [
            str(item).strip()
            for item in list(data.get('language_support') or data.get('supported_languages') or data.get('language_tags') or [])
            if str(item).strip()
        ]
        primary_image, reference_images, reference_image_variants = _merge_reference_variants(
            avatar_id=actor_id,
            base_url=self.settings.public_asset_base_url,
            primary_image=str(data.get('primary_image') or '').strip() or None,
            raw_reference_images=(
                data.get('reference_images')
                or ([data.get('reference_image_url')] if data.get('reference_image_url') else [])
                or ([data.get('avatar_image_url')] if data.get('avatar_image_url') else [])
            ),
            fallback_reference_image_url=(
                str(data.get('reference_image_url') or '').strip()
                or str(data.get('avatar_image_url') or '').strip()
                or None
            ),
        )
        style = str(data.get('style') or data.get('category') or 'actor').strip()
        normalized_gender = str(data.get('gender') or '').strip() or None
        resolved_recommended_voice = self._resolve_catalog_voice_key(
            str(data.get('recommended_voice') or '').strip() or None,
            normalized_gender,
        )
        return ActorRecord(
            id=actor_id,
            name=str(data.get('display_name') or data.get('name') or 'Avatar').strip(),
            scope=str(
                data.get('scope')
                or ('public' if str(data.get('visibility') or '').lower() == 'public' else '')
                or ('public' if str(data.get('avatar_type') or data.get('type') or '').lower() == 'system' else '')
                or ('own' if data.get('user_id') else 'public')
            ).strip() or 'public',
            style=style,
            gender=normalized_gender,
            language_tags=language_support,
            thumbnail_url=str(data.get('thumbnail_url') or primary_image or '').strip(),
            tags=[str(tag).strip() for tag in list(data.get('tags') or []) if str(tag).strip()],
            category=str(data.get('category') or '').strip() or None,
            reference_images=reference_images,
            reference_image_variants=reference_image_variants,
            primary_image=primary_image,
            preview_video_url=str(data.get('preview_video_url') or '').strip() or None,
            prompt_template=str(data.get('prompt_template') or '').strip() or None,
            negative_prompt=str(data.get('negative_prompt') or '').strip() or None,
            recommended_voice=resolved_recommended_voice,
            voice_profile=self._normalize_voice_profile(
                data.get('voice_profile'),
                voice_key=resolved_recommended_voice,
                gender=normalized_gender,
            ),
            status=str(data.get('status') or 'active').strip() or 'active',
            description=str(data.get('description') or '').strip() or None,
            created_at=data.get('created_at'),
            raw=data,
            source=str(data.get('source') or data.get('provider') or 'avatar').strip() or 'avatar',
            user_id=str(data.get('user_id') or '').strip() or None,
        )

    def _to_avatar_response(self, record: ActorRecord) -> AvatarResponse:
        return AvatarResponse(
            id=record.id,
            name=record.name,
            scope=record.scope,
            style=record.style,
            provider=str((record.raw or {}).get('provider') or '').strip() or None,
            provider_api_version=str((record.raw or {}).get('provider_api_version') or '').strip() or None,
            avatar_family=str((record.raw or {}).get('avatar_family') or '').strip() or None,
            avatar_type=str((record.raw or {}).get('avatar_type') or '').strip() or None,
            ownership=str((record.raw or {}).get('ownership') or '').strip() or None,
            supports_avatar_video_generation=(
                bool((record.raw or {}).get('supports_avatar_video_generation'))
                if (record.raw or {}).get('supports_avatar_video_generation') is not None
                else None
            ),
            gender=record.gender,
            language_tags=record.language_tags,
            thumbnail_url=record.thumbnail_url,
            tags=record.tags,
            category=record.category,
            reference_images=record.reference_images,
            reference_image_variants=[
                {'id': item.id, 'url': item.url, 'tags': item.tags}
                for item in record.reference_image_variants
            ],
            primary_image=record.primary_image,
            preview_video_url=record.preview_video_url,
            prompt_template=record.prompt_template,
            negative_prompt=record.negative_prompt,
            recommended_voice=record.recommended_voice,
            voice_profile=record.voice_profile,
            status=record.status,
            description=record.description,
        )

    def _list_custom_avatar_responses(self, *, user_id: str) -> list[AvatarResponse]:
        normalized_user_id = str(user_id or '').strip()
        if not normalized_user_id:
            return []

        try:
            db = get_firestore_client()
        except FirebaseNotConfiguredError:
            return []

        items: list[AvatarResponse] = []
        for snap in db.collection('avatars').stream():
            try:
                data = snap.to_dict() or {}
                if str(data.get('user_id') or '').strip() != normalized_user_id:
                    continue
                if str(data.get('provider') or '').strip().lower() == 'heygen':
                    continue

                primary_image, reference_images, reference_image_variants = _merge_reference_variants(
                    avatar_id=str(data.get('id') or snap.id),
                    base_url=self.settings.public_asset_base_url,
                    primary_image=str(data.get('primary_image') or '').strip() or None,
                    raw_reference_images=data.get('reference_images'),
                    fallback_reference_image_url=str(data.get('reference_image_url') or '').strip() or None,
                )
                if not primary_image:
                    continue
                normalized_gender = str(data.get('gender') or '').strip() or None
                resolved_recommended_voice = self._resolve_catalog_voice_key(
                    str(data.get('recommended_voice') or data.get('preferred_voice') or '').strip() or None,
                    normalized_gender,
                )

                items.append(
                    AvatarResponse(
                        id=str(data.get('id') or snap.id),
                        name=str(data.get('name') or 'Custom Avatar').strip(),
                        scope='own',
                        style=str(data.get('style_label') or data.get('category') or 'custom_avatar').strip() or 'custom_avatar',
                        provider=str(data.get('provider') or '').strip() or None,
                        provider_api_version=str(data.get('provider_api_version') or '').strip() or None,
                        avatar_family=str(data.get('avatar_family') or '').strip() or None,
                        avatar_type=str(data.get('avatar_type') or '').strip() or None,
                        ownership=str(data.get('ownership') or '').strip() or None,
                        supports_avatar_video_generation=(
                            bool(data.get('supports_avatar_video_generation'))
                            if data.get('supports_avatar_video_generation') is not None
                            else None
                        ),
                        gender=normalized_gender,
                        language_tags=[str(item).strip() for item in list(data.get('language_support') or []) if str(item).strip()],
                        thumbnail_url=str(data.get('thumbnail_url') or primary_image).strip(),
                        tags=[str(item).strip() for item in list(data.get('tags') or []) if str(item).strip()] or ['custom', 'ugc'],
                        category=str(data.get('category') or 'custom_avatar').strip() or 'custom_avatar',
                        reference_images=reference_images or [primary_image],
                        reference_image_variants=[
                            {'id': item.id, 'url': item.url, 'tags': item.tags}
                            for item in reference_image_variants
                        ],
                        primary_image=primary_image,
                        preview_video_url=str(data.get('preview_video_url') or data.get('last_preview_video_url') or '').strip() or None,
                        prompt_template=str(data.get('prompt_template') or '').strip() or None,
                        negative_prompt=str(data.get('negative_prompt') or '').strip() or None,
                        recommended_voice=resolved_recommended_voice,
                        voice_profile=self._normalize_voice_profile(
                            data.get('voice_profile'),
                            voice_key=resolved_recommended_voice,
                            gender=normalized_gender,
                        ),
                        status=str(data.get('status') or 'ready_for_preview').strip() or 'ready_for_preview',
                        description=str(data.get('description') or '').strip() or None,
                    )
                )
            except Exception as exc:
                logger.warning(
                    "avatar_list_custom_avatar_skipped",
                    extra={
                        "avatar_id": getattr(snap, "id", None),
                        "reason": str(exc),
                    },
                )
        return items

    def _upload_actor_file(self, *, actor_id: str, filename: str, content: bytes, content_type: str) -> str:
        relative_path = f'actors/{actor_id}/{filename}'
        normalized_bucket = normalize_firebase_bucket(self.settings.firebase_storage_bucket)
        if normalized_bucket and self.settings.firebase_project_id:
            from firebase_admin import storage

            token = str(uuid4())
            blob = storage.bucket(app=get_firebase_app()).blob(relative_path)
            blob.metadata = {'firebaseStorageDownloadTokens': token}
            blob.cache_control = 'public,max-age=31536000'
            blob.upload_from_string(content, content_type=content_type)
            return f'https://firebasestorage.googleapis.com/v0/b/{normalized_bucket}/o/{relative_path.replace("/", "%2F")}?alt=media&token={token}'

        root = Path('data/uploads') / 'actors' / actor_id
        root.mkdir(parents=True, exist_ok=True)
        target = root / filename
        target.write_bytes(content)
        base = self.settings.public_asset_base_url.rstrip('/')
        return f'{base}/uploads/actors/{actor_id}/{filename}'

    def _validate_voice(self, recommended_voice: str) -> str:
        normalized = str(recommended_voice or '').strip()
        if not normalized:
            raise ValueError('recommended_voice is required')
        voice_keys = {voice.key for voice in list_tts_voices()}
        if normalized not in voice_keys:
            raise ValueError(f'recommended_voice "{normalized}" does not exist')
        return normalized

    def _resolve_catalog_voice_key(self, recommended_voice: str | None, gender: str | None) -> str:
        normalized = str(recommended_voice or '').strip()
        if normalized:
            try:
                return self._validate_voice(normalized)
            except ValueError:
                pass
        normalized_gender = str(gender or '').strip().lower()
        return 'Priya' if normalized_gender == 'female' else 'Shubh'

    def _validate_scope(self, scope: str | None) -> str:
        normalized = str(scope or 'own').strip().lower() or 'own'
        if normalized not in {'own', 'public'}:
            raise ValueError('scope must be either "own" or "public"')
        return normalized

    def resolve_default_voice_profile(self, *, voice_key: str | None, gender: str | None) -> dict[str, Any]:
        return self._build_default_voice_profile(voice_key=voice_key, gender=gender)

    def _normalize_reference_images(self, value: list[Any]) -> list[str]:
        return [str(item).strip() for item in value if str(item).strip()]

    def _build_default_voice_profile(self, *, voice_key: str | None, gender: str | None) -> dict[str, Any]:
        normalized_voice = self._resolve_catalog_voice_key(voice_key, gender)
        voice_option = next((voice for voice in list_tts_voices() if voice.key == normalized_voice), None)
        normalized_gender = str(gender or '').strip().lower()
        if voice_option and not normalized_gender:
            normalized_gender = str(voice_option.gender or '').strip().lower()

        if normalized_gender == 'female':
            return {
                'speaker': str((voice_option.provider_voice if voice_option else 'priya')).strip().lower(),
                'base_speed': 1.08,
                'pitch_style': 'medium',
                'tone': 'friendly_confident',
                'energy': 'medium_high',
            }
        if normalized_gender == 'male':
            return {
                'speaker': str((voice_option.provider_voice if voice_option else 'shubh')).strip().lower(),
                'base_speed': 1.05,
                'pitch_style': 'medium',
                'tone': 'confident_clear',
                'energy': 'medium',
            }
        return {
            'speaker': str((voice_option.provider_voice if voice_option else 'shubh')).strip().lower(),
            'base_speed': 1.05,
            'pitch_style': 'medium',
            'tone': 'neutral',
            'energy': 'medium',
        }

    def _normalize_voice_profile(
        self,
        value: Any,
        *,
        voice_key: str | None,
        gender: str | None,
    ) -> dict[str, Any]:
        default = self._build_default_voice_profile(voice_key=voice_key, gender=gender)
        if not isinstance(value, dict):
            return default

        normalized = dict(default)
        speaker = str(value.get('speaker') or default['speaker']).strip().lower()
        normalized['speaker'] = speaker or default['speaker']
        try:
            normalized['base_speed'] = float(value.get('base_speed', default['base_speed']))
        except (TypeError, ValueError):
            normalized['base_speed'] = default['base_speed']
        normalized['base_speed'] = max(0.9, min(float(normalized['base_speed']), 1.25))
        normalized['pitch_style'] = str(value.get('pitch_style') or default['pitch_style']).strip() or default['pitch_style']
        normalized['tone'] = str(value.get('tone') or default['tone']).strip() or default['tone']
        normalized['energy'] = str(value.get('energy') or default['energy']).strip() or default['energy']
        return normalized
