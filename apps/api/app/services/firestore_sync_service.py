from __future__ import annotations

import json
import logging
from datetime import date, datetime
from typing import Any

from app.models.entities import CreditTransaction, CreditWallet, ImageGeneration, InfluencerPersona, InfluencerScenePreset, User, Video
from app.providers.firebase import FirebaseNotConfiguredError, get_firestore_client

logger = logging.getLogger(__name__)


class FirestoreSyncService:
    """Mirrors SQL writes into a Firebase-style user-scoped document hierarchy.

    This keeps the current operational SQL layer intact while enforcing the
    Firebase ownership architecture:
      users/{uid}
      users/{uid}/creditTransactions/{txId}
      users/{uid}/images/{imageId}
      users/{uid}/videos/{videoId}
      users/{uid}/personas/{personaId}
      users/{uid}/personas/{personaId}/scenes/{sceneId}
    """

    def __init__(self) -> None:
        try:
            self.db = get_firestore_client()
            self.enabled = True
        except FirebaseNotConfiguredError as exc:
            logger.warning('firestore_sync_disabled', extra={'error': str(exc)})
            self.db = None
            self.enabled = False
        except Exception as exc:  # pragma: no cover - defensive infra protection
            logger.exception('firestore_sync_init_failed', extra={'error': str(exc)})
            self.db = None
            self.enabled = False

    def sync_user(self, user: User) -> None:
        self._set(['users', user.id], {
            'id': user.id,
            'userId': user.id,
            'displayName': user.display_name,
            'email': user.email,
            'phone': user.phone,
            'avatarUrl': user.avatar_url,
            'bio': user.bio,
            'company': user.company,
            'addressLine1': user.address_line1,
            'addressLine2': user.address_line2,
            'city': user.city,
            'state': user.state,
            'country': user.country,
            'postalCode': user.postal_code,
            'timezone': user.timezone,
            'defaultLanguage': user.default_language,
            'defaultVoice': user.default_voice,
            'defaultAspectRatio': user.default_aspect_ratio,
            'emailNotifications': user.email_notifications,
            'marketingEmails': user.marketing_emails,
            'autoCaptionDefault': user.auto_caption_default,
            'musicDuckingDefault': user.music_ducking_default,
            'createdAt': user.created_at,
        })

    def sync_wallet(self, wallet: CreditWallet) -> None:
        self._set(['users', wallet.user_id, 'private', 'wallet'], {
            'userId': wallet.user_id,
            'currentCredits': wallet.current_credits,
            'planType': wallet.plan_type,
            'monthlyCredits': wallet.monthly_credits,
            'lastReset': wallet.last_reset,
            'premiumUsageCount': wallet.premium_usage_count,
            'freeUsageCount': wallet.free_usage_count,
        })

    def sync_credit_transaction(self, tx: CreditTransaction) -> None:
        metadata = self._decode_json(tx.metadata_json, {})
        self._set(['users', tx.user_id, 'creditTransactions', str(tx.id)], {
            'id': str(tx.id),
            'userId': tx.user_id,
            'featureKey': tx.feature_key,
            'amount': tx.amount,
            'balanceAfter': tx.balance_after,
            'transactionType': tx.transaction_type,
            'source': tx.source,
            'metadata': metadata,
            'idempotencyKey': tx.idempotency_key,
            'createdAt': tx.created_at,
        })

    def sync_image(self, image: ImageGeneration, *, auto_tags: list[str] | None = None, user_tags: list[str] | None = None) -> None:
        self._set(['users', image.user_id, 'images', image.id], {
            'id': image.id,
            'userId': image.user_id,
            'parentImageId': image.parent_image_id,
            'modelKey': image.model_key,
            'prompt': image.prompt,
            'aspectRatio': image.aspect_ratio,
            'resolution': image.resolution,
            'referenceUrls': self._decode_json(image.reference_urls, []),
            'imageUrl': image.image_url,
            'thumbnailUrl': image.thumbnail_url,
            'actionType': image.action_type,
            'status': image.status.value if hasattr(image.status, 'value') else str(image.status),
            'isPublicInspiration': bool(getattr(image, 'is_public_inspiration', False)),
            'moderationStatus': str(getattr(image, 'moderation_status', 'draft')),
            'inspirationScore': int(getattr(image, 'inspiration_score', 0) or 0),
            'inspirationPublishedAt': getattr(image, 'inspiration_published_at', None),
            'likeCount': int(getattr(image, 'like_count', 0) or 0),
            'autoTags': auto_tags or [],
            'userTags': user_tags or [],
            'createdAt': image.created_at,
        })

    def sync_video(self, video: Video, *, auto_tags: list[str] | None = None, user_tags: list[str] | None = None) -> None:
        self._set(['users', video.user_id, 'videos', video.id], {
            'id': video.id,
            'userId': video.user_id,
            'title': video.title,
            'template': video.template,
            'language': video.language,
            'script': video.script,
            'voice': video.voice,
            'aspectRatio': video.aspect_ratio,
            'resolution': video.resolution,
            'durationMode': video.duration_mode,
            'durationSeconds': video.duration_seconds,
            'captionsEnabled': video.captions_enabled,
            'captionStyle': video.caption_style,
            'audioSampleRateHz': video.audio_sample_rate_hz,
            'status': video.status.value if hasattr(video.status, 'value') else str(video.status),
            'progress': video.progress,
            'imageUrls': self._decode_json(video.image_urls, []),
            'selectedModel': video.selected_model,
            'providerName': video.provider_name,
            'sourceImageUrl': video.source_image_url,
            'referenceImages': self._decode_json(video.reference_images, []),
            'musicMode': video.music_mode,
            'musicTrackId': video.music_track_id,
            'musicFileUrl': video.music_file_url,
            'musicVolume': video.music_volume,
            'duckMusic': video.duck_music,
            'thumbnailUrl': video.thumbnail_url,
            'outputUrl': video.output_url,
            'errorMessage': video.error_message,
            'isPublicInspiration': bool(getattr(video, 'is_public_inspiration', False)),
            'moderationStatus': str(getattr(video, 'moderation_status', 'draft')),
            'inspirationScore': int(getattr(video, 'inspiration_score', 0) or 0),
            'inspirationPublishedAt': getattr(video, 'inspiration_published_at', None),
            'likeCount': int(getattr(video, 'like_count', 0) or 0),
            'autoTags': auto_tags or [],
            'userTags': user_tags or [],
            'createdAt': video.created_at,
            'updatedAt': video.updated_at,
        })

    def sync_persona(self, persona: InfluencerPersona) -> None:
        self._set(['users', persona.user_id, 'personas', persona.id], {
            'id': persona.id,
            'userId': persona.user_id,
            'name': persona.name,
            'genderIdentity': persona.gender_identity,
            'niche': persona.niche,
            'tone': persona.tone,
            'catchphrase': persona.catchphrase,
            'personalityTraits': self._decode_json(persona.personality_traits, []),
            'backstory': persona.backstory,
            'visualDescription': persona.visual_description,
            'referenceImageUrl': persona.reference_image_url,
            'referenceImagePath': persona.reference_image_path,
            'referenceEmbeddingVector': self._decode_json(persona.reference_embedding_vector, []),
            'styleEmbeddingVector': self._decode_json(persona.style_embedding_vector, []),
            'systemPromptTemplate': persona.system_prompt_template,
            'characterLocked': persona.character_locked,
            'createdAt': persona.created_at,
            'updatedAt': persona.updated_at,
        })

    def sync_scene_preset(self, scene: InfluencerScenePreset) -> None:
        owner = scene.user_id or 'system'
        if scene.persona_id:
            path = ['users', owner, 'personas', scene.persona_id, 'scenes', scene.id]
        else:
            path = ['users', owner, 'sceneLibrary', scene.id]
        self._set(path, {
            'id': scene.id,
            'userId': owner,
            'personaId': scene.persona_id,
            'key': scene.key,
            'label': scene.label,
            'description': scene.description,
            'environment': scene.environment,
            'props': scene.props,
            'lighting': scene.lighting,
            'mood': scene.mood,
            'negativeConstraints': scene.negative_constraints,
            'isSystem': scene.is_system,
            'createdAt': scene.created_at,
        })

    def _set(self, path: list[str], data: dict[str, Any]) -> None:
        if not self.enabled or not self.db:
            return
        try:
            doc = self._doc_ref(path)
            doc.set(self._serialize(data), merge=True)
        except Exception as exc:  # pragma: no cover - sync must never break core app flow
            logger.exception('firestore_sync_write_failed', extra={'path': '/'.join(path), 'error': str(exc)})

    def _doc_ref(self, path: list[str]):
        ref = self.db
        for index, segment in enumerate(path):
            if index % 2 == 0:
                ref = ref.collection(segment)
            else:
                ref = ref.document(segment)
        return ref

    def _serialize(self, value: Any) -> Any:
        if isinstance(value, dict):
            return {key: self._serialize(item) for key, item in value.items()}
        if isinstance(value, list):
            return [self._serialize(item) for item in value]
        if isinstance(value, datetime):
            return value.isoformat()
        if isinstance(value, date):
            return value.isoformat()
        return value

    def _decode_json(self, raw: str | None, default: Any) -> Any:
        if not raw:
            return default
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return default
