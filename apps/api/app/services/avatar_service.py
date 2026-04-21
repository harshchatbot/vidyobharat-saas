from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.core.config import get_settings
from app.providers.firebase import FirebaseNotConfiguredError, get_firebase_app, get_firestore_client, normalize_firebase_bucket
from app.schemas.catalog import AvatarResponse
from app.services.tts import list_tts_voices


@dataclass(frozen=True)
class ActorRecord:
    id: str
    name: str
    scope: str
    style: str
    language_tags: list[str]
    thumbnail_url: str
    tags: list[str]
    category: str | None
    reference_images: list[str]
    primary_image: str | None
    preview_video_url: str | None
    prompt_template: str | None
    negative_prompt: str | None
    recommended_voice: str | None
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
    primary_image: str | None = None
    preferred_voice: str | None = None
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
        self._preset_records = [
            ActorRecord(
                id='av-priya',
                name='Priya',
                scope='public',
                style='studio',
                language_tags=['hi-IN', 'en-IN'],
                thumbnail_url='https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=600&q=80',
                tags=['ugc', 'indian', 'female', 'studio'],
                category='ugc_influencer',
                reference_images=['https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=1200&q=80'],
                primary_image='https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=1200&q=80',
                preview_video_url=None,
                prompt_template='Indian female creator speaking naturally to camera, selfie-style, direct eye contact, realistic expression',
                negative_prompt='distorted face, broken lips, asymmetry, blurry eyes',
                recommended_voice='Priya',
                status='active',
                description='Public preset for warm, polished female UGC spokesperson videos.',
                source='preset',
            ),
            ActorRecord(
                id='av-arjun',
                name='Arjun',
                scope='public',
                style='corporate',
                language_tags=['hi-IN', 'ta-IN', 'en-IN'],
                thumbnail_url='https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=600&q=80',
                tags=['ugc', 'indian', 'male', 'corporate'],
                category='ugc_influencer',
                reference_images=['https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=1200&q=80'],
                primary_image='https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=1200&q=80',
                preview_video_url=None,
                prompt_template='Indian male creator speaking naturally to camera, selfie-style, direct eye contact, realistic expression',
                negative_prompt='distorted face, broken lips, asymmetry, blurry eyes',
                recommended_voice='Shubh',
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

        return result

    def get_avatar(self, avatar_id: str, user_id: str | None = None) -> AvatarResponse | None:
        record = self.get_actor_record(avatar_id, user_id=user_id)
        return self._to_avatar_response(record) if record else None

    def get_actor_record(self, actor_id: str, user_id: str | None = None) -> ActorRecord | None:
        normalized_id = str(actor_id or '').strip()
        if not normalized_id:
            return None

        for item in self._preset_records:
            if item.id == normalized_id:
                return item

        try:
            db = get_firestore_client()
        except FirebaseNotConfiguredError:
            return None

        snap = db.collection('actors').document(normalized_id).get()
        if not snap.exists:
            return None
        data = snap.to_dict() or {}
        item_user_id = str(data.get('user_id') or '').strip() or None
        item_scope = str(data.get('scope') or ('own' if item_user_id else 'public')).strip() or 'public'
        if item_scope == 'own' and item_user_id and user_id and item_user_id != user_id:
            return None
        if item_scope == 'own' and item_user_id and not user_id:
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
            'primary_image': record.primary_image,
            'preview_video_url': record.preview_video_url,
            'tags': record.tags,
            'category': record.category,
            'language_support': record.language_tags,
            'prompt_template': record.prompt_template,
            'negative_prompt': record.negative_prompt,
            'recommended_voice': record.recommended_voice,
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
        if str(data.get('user_id') or '').strip() != normalized_user_id:
            return None

        reference_images = self._normalize_reference_images(
            data.get('reference_images') or [data.get('reference_image_url')] if data.get('reference_image_url') else []
        )
        reference_image_url = str(data.get('reference_image_url') or '').strip() or (reference_images[0] if reference_images else '')
        primary_image = str(data.get('primary_image') or '').strip() or reference_image_url or (reference_images[0] if reference_images else None)
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

        return CustomAvatarRecord(
            id=str(data.get('avatar_id') or normalized_id),
            user_id=normalized_user_id,
            name=str(data.get('name') or 'Custom Avatar').strip(),
            reference_image_url=reference_image_url,
            reference_images=reference_images or [primary_image],
            primary_image=primary_image,
            preferred_voice=preferred_voice,
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
        records = list(self._preset_records)
        try:
            db = get_firestore_client()
        except FirebaseNotConfiguredError:
            return records

        for snap in db.collection('actors').stream():
            data = snap.to_dict() or {}
            actor_id = str(data.get('id') or snap.id)
            item = self._actor_from_firestore(data, actor_id)
            if item.scope == 'own' and item.user_id != user_id:
                continue
            records.append(item)
        return records

    def _actor_from_firestore(self, data: dict[str, Any], actor_id: str) -> ActorRecord:
        language_support = [str(item).strip() for item in list(data.get('language_support') or []) if str(item).strip()]
        reference_images = self._normalize_reference_images(data.get('reference_images') or [])
        primary_image = str(data.get('primary_image') or '').strip() or (reference_images[0] if reference_images else None)
        style = str(data.get('style') or data.get('category') or 'actor').strip()
        return ActorRecord(
            id=actor_id,
            name=str(data.get('name') or 'Actor').strip(),
            scope=str(data.get('scope') or ('own' if data.get('user_id') else 'public')).strip() or 'public',
            style=style,
            language_tags=language_support,
            thumbnail_url=str(data.get('thumbnail_url') or primary_image or '').strip(),
            tags=[str(tag).strip() for tag in list(data.get('tags') or []) if str(tag).strip()],
            category=str(data.get('category') or '').strip() or None,
            reference_images=reference_images,
            primary_image=primary_image,
            preview_video_url=str(data.get('preview_video_url') or '').strip() or None,
            prompt_template=str(data.get('prompt_template') or '').strip() or None,
            negative_prompt=str(data.get('negative_prompt') or '').strip() or None,
            recommended_voice=str(data.get('recommended_voice') or '').strip() or None,
            status=str(data.get('status') or 'active').strip() or 'active',
            description=str(data.get('description') or '').strip() or None,
            created_at=data.get('created_at'),
            raw=data,
            source='actor',
            user_id=str(data.get('user_id') or '').strip() or None,
        )

    def _to_avatar_response(self, record: ActorRecord) -> AvatarResponse:
        return AvatarResponse(
            id=record.id,
            name=record.name,
            scope=record.scope,
            style=record.style,
            language_tags=record.language_tags,
            thumbnail_url=record.thumbnail_url,
            tags=record.tags,
            category=record.category,
            reference_images=record.reference_images,
            primary_image=record.primary_image,
            preview_video_url=record.preview_video_url,
            prompt_template=record.prompt_template,
            negative_prompt=record.negative_prompt,
            recommended_voice=record.recommended_voice,
            status=record.status,
            description=record.description,
        )

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

    def _validate_scope(self, scope: str | None) -> str:
        normalized = str(scope or 'own').strip().lower() or 'own'
        if normalized not in {'own', 'public'}:
            raise ValueError('scope must be either "own" or "public"')
        return normalized

    def _normalize_reference_images(self, value: list[Any]) -> list[str]:
        return [str(item).strip() for item in value if str(item).strip()]
