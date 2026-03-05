from __future__ import annotations

import json
import random
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from app.db.firestore_utils import utcnow
from app.db.repositories.asset_tag_repository import AssetTagRepository
from app.db.repositories.image_generation_repository import ImageGenerationRepository
from app.db.repositories.inspiration_like_repository import InspirationLikeRepository
from app.db.repositories.user_repository import UserRepository
from app.db.repositories.video_repository import VideoRepository
from app.models.entities import ImageGenerationStatus, VideoStatus
from app.services.firestore_sync_service import FirestoreSyncService


BLOCKED_TERMS = {
    'nsfw', 'nude', 'porn', 'explicit', 'gore', 'blood', 'violence', 'weapon',
}


@dataclass
class PublishResult:
    asset_id: str
    content_type: str
    is_public_inspiration: bool
    moderation_status: str
    inspiration_score: int
    like_count: int


@dataclass
class LikeResult:
    asset_id: str
    content_type: str
    liked: bool
    like_count: int


class InspirationService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.images = ImageGenerationRepository(db)
        self.videos = VideoRepository(db)
        self.users = UserRepository(db)
        self.tags = AssetTagRepository(db)
        self.likes = InspirationLikeRepository()
        self.sync = FirestoreSyncService()

    def publish_asset(self, *, content_type: str, asset_id: str, user_id: str, publish: bool) -> PublishResult:
        if content_type not in {'image', 'video'}:
            raise ValueError('content_type must be image or video')

        if content_type == 'image':
            item = self.images.get_by_id(asset_id)
            if not item or item.user_id != user_id:
                raise ValueError('Image not found')
            if not publish:
                updated = self.images.update(
                    item,
                    is_public_inspiration=False,
                    moderation_status='draft',
                    inspiration_score=0,
                    inspiration_published_at=None,
                )
                auto_tags, user_tags = self._tags_for(asset_id=updated.id, asset_type='image')
                self.sync.sync_image(updated, auto_tags=auto_tags, user_tags=user_tags)
                return self._publish_result_from_item(updated, content_type='image')
            status, score = self._evaluate_image(item)
            updated = self.images.update(
                item,
                is_public_inspiration=True,
                moderation_status=status,
                inspiration_score=score,
                inspiration_published_at=utcnow() if status == 'approved' else None,
            )
            auto_tags, user_tags = self._tags_for(asset_id=updated.id, asset_type='image')
            self.sync.sync_image(updated, auto_tags=auto_tags, user_tags=user_tags)
            return self._publish_result_from_item(updated, content_type='image')

        item = self.videos.get_by_id(asset_id)
        if not item or item.user_id != user_id:
            raise ValueError('Video not found')
        if not publish:
            updated = self.videos.update(
                item,
                is_public_inspiration=False,
                moderation_status='draft',
                inspiration_score=0,
                inspiration_published_at=None,
            )
            auto_tags, user_tags = self._tags_for(asset_id=updated.id, asset_type='video')
            self.sync.sync_video(updated, auto_tags=auto_tags, user_tags=user_tags)
            return self._publish_result_from_item(updated, content_type='video')
        status, score = self._evaluate_video(item)
        updated = self.videos.update(
            item,
            is_public_inspiration=True,
            moderation_status=status,
            inspiration_score=score,
            inspiration_published_at=utcnow() if status == 'approved' else None,
        )
        auto_tags, user_tags = self._tags_for(asset_id=updated.id, asset_type='video')
        self.sync.sync_video(updated, auto_tags=auto_tags, user_tags=user_tags)
        return self._publish_result_from_item(updated, content_type='video')

    def toggle_like(self, *, content_type: str, asset_id: str, user_id: str, liked: bool | None = None) -> LikeResult:
        if content_type not in {'image', 'video'}:
            raise ValueError('content_type must be image or video')
        item = self.images.get_by_id(asset_id) if content_type == 'image' else self.videos.get_by_id(asset_id)
        if not item:
            raise ValueError('Asset not found')
        if not bool(getattr(item, 'is_public_inspiration', False)) or str(getattr(item, 'moderation_status', '')).lower() != 'approved':
            raise ValueError('Asset is not published to inspiration')

        currently_liked = self.likes.has_liked(asset_type=content_type, asset_id=asset_id, user_id=user_id)
        next_liked = (not currently_liked) if liked is None else bool(liked)
        self.likes.set_like(asset_type=content_type, asset_id=asset_id, user_id=user_id, liked=next_liked)
        like_count = self.likes.count_likes(asset_type=content_type, asset_id=asset_id)
        if content_type == 'image':
            updated = self.images.update(item, like_count=like_count)
            auto_tags, user_tags = self._tags_for(asset_id=updated.id, asset_type='image')
            self.sync.sync_image(updated, auto_tags=auto_tags, user_tags=user_tags)
        else:
            updated = self.videos.update(item, like_count=like_count)
            auto_tags, user_tags = self._tags_for(asset_id=updated.id, asset_type='video')
            self.sync.sync_video(updated, auto_tags=auto_tags, user_tags=user_tags)
        return LikeResult(asset_id=asset_id, content_type=content_type, liked=next_liked, like_count=like_count)

    def list_image_inspiration(self, *, viewer_user_id: str, limit: int = 60) -> list[dict[str, object]]:
        items = self.images.list_inspiration_candidates(limit=limit * 3)
        viewer_pending = [
            row
            for row in self.images.list_by_user(viewer_user_id)
            if bool(getattr(row, 'is_public_inspiration', False))
            and str(getattr(row, 'moderation_status', '')).lower() in {'pending_review', 'approved'}
        ]
        by_id = {item.id: item for item in items}
        for row in viewer_pending:
            by_id[row.id] = row
        items = list(by_id.values())
        ranked = self._diverse_rank(items, key_fn=lambda item: str(getattr(item, 'model_key', 'image')))
        result: list[dict[str, object]] = []
        for item in ranked[:limit]:
            auto_tags, user_tags = self._tags_for(asset_id=item.id, asset_type='image')
            owner = self.users.get_by_id(item.user_id)
            result.append(
                {
                    'id': item.id,
                    'creator_name': owner.display_name if owner and owner.display_name else 'Creator',
                    'model_key': item.model_key,
                    'title': (item.prompt or 'Generated image').split('.')[0][:72],
                    'prompt': item.prompt,
                    'image_url': item.image_url,
                    'aspect_ratio': item.aspect_ratio,
                    'resolution': item.resolution,
                    'created_at': getattr(item, 'inspiration_published_at', None) or item.created_at,
                    'reference_urls': self._parse_json_list(item.reference_urls),
                    'tags': list(dict.fromkeys([*auto_tags, *user_tags]))[:8],
                    'like_count': int(getattr(item, 'like_count', 0) or 0),
                    'liked_by_user': self.likes.has_liked(asset_type='image', asset_id=item.id, user_id=viewer_user_id),
                    'moderation_status': str(getattr(item, 'moderation_status', 'approved')),
                }
            )
        return result

    def list_video_inspiration(self, *, viewer_user_id: str, limit: int = 60) -> list[dict[str, object]]:
        items = self.videos.list_inspiration_candidates(limit=limit * 3)
        viewer_pending = [
            row
            for row in self.videos.list_by_user(viewer_user_id)
            if bool(getattr(row, 'is_public_inspiration', False))
            and str(getattr(row, 'moderation_status', '')).lower() in {'pending_review', 'approved'}
        ]
        by_id = {item.id: item for item in items}
        for row in viewer_pending:
            by_id[row.id] = row
        items = list(by_id.values())
        ranked = self._diverse_rank(items, key_fn=lambda item: str(getattr(item, 'selected_model', 'video')))
        result: list[dict[str, object]] = []
        for item in ranked[:limit]:
            auto_tags, user_tags = self._tags_for(asset_id=item.id, asset_type='video')
            owner = self.users.get_by_id(item.user_id)
            result.append(
                {
                    'id': item.id,
                    'creator_name': owner.display_name if owner and owner.display_name else 'Creator',
                    'model_key': item.selected_model or 'video',
                    'provider_name': item.provider_name or item.selected_model or 'AI Video',
                    'title': item.title or 'Generated video',
                    'prompt': item.script or '',
                    'video_url': item.output_url or '',
                    'thumbnail_url': item.thumbnail_url or '',
                    'aspect_ratio': item.aspect_ratio or '9:16',
                    'resolution': item.resolution or '720p',
                    'duration_seconds': int(item.duration_seconds or 0),
                    'created_at': getattr(item, 'inspiration_published_at', None) or item.created_at,
                    'tags': list(dict.fromkeys([*auto_tags, *user_tags]))[:8],
                    'like_count': int(getattr(item, 'like_count', 0) or 0),
                    'liked_by_user': self.likes.has_liked(asset_type='video', asset_id=item.id, user_id=viewer_user_id),
                    'moderation_status': str(getattr(item, 'moderation_status', 'approved')),
                }
            )
        return result

    def _tags_for(self, *, asset_id: str, asset_type: str) -> tuple[list[str], list[str]]:
        rows = self.tags.list_for_asset(asset_id=asset_id, asset_type=asset_type)
        auto_tags = [row.tag for row in rows if row.source == 'auto']
        user_tags = [row.tag for row in rows if row.source == 'user']
        return auto_tags, user_tags

    def _evaluate_image(self, item) -> tuple[str, int]:
        if self._contains_blocked_terms(getattr(item, 'prompt', '') or ''):
            return 'rejected', 0
        if getattr(item, 'status', None) != ImageGenerationStatus.completed:
            return 'rejected', 0
        score = 40
        res = str(getattr(item, 'resolution', '1024'))
        if res == '2048':
            score += 28
        elif res == '1536':
            score += 18
        else:
            score += 8
        prompt_len = len((getattr(item, 'prompt', '') or '').strip())
        score += min(20, prompt_len // 12)
        if str(getattr(item, 'aspect_ratio', '')) in {'9:16', '16:9', '1:1', '4:5'}:
            score += 8
        score = max(0, min(score, 100))
        return ('approved', score) if score >= 70 else ('pending_review', score)

    def _evaluate_video(self, item) -> tuple[str, int]:
        if self._contains_blocked_terms(getattr(item, 'script', '') or ''):
            return 'rejected', 0
        if getattr(item, 'status', None) != VideoStatus.completed:
            return 'rejected', 0
        if not getattr(item, 'output_url', None):
            return 'rejected', 0
        score = 45
        res = str(getattr(item, 'resolution', '720p')).lower()
        if res == '1080p':
            score += 24
        elif res == '720p':
            score += 12
        duration = int(getattr(item, 'duration_seconds', 0) or 0)
        if 4 <= duration <= 15:
            score += 12
        script_len = len((getattr(item, 'script', '') or '').strip())
        score += min(15, script_len // 25)
        if str(getattr(item, 'aspect_ratio', '')) in {'9:16', '16:9', '1:1'}:
            score += 8
        score = max(0, min(score, 100))
        return ('approved', score) if score >= 72 else ('pending_review', score)

    def _contains_blocked_terms(self, text: str) -> bool:
        normalized = text.lower()
        return any(term in normalized for term in BLOCKED_TERMS)

    def _publish_result_from_item(self, item, *, content_type: str) -> PublishResult:
        return PublishResult(
            asset_id=item.id,
            content_type=content_type,
            is_public_inspiration=bool(getattr(item, 'is_public_inspiration', False)),
            moderation_status=str(getattr(item, 'moderation_status', 'draft')),
            inspiration_score=int(getattr(item, 'inspiration_score', 0) or 0),
            like_count=int(getattr(item, 'like_count', 0) or 0),
        )

    def _parse_json_list(self, raw: str | None) -> list[str]:
        try:
            data = json.loads(raw or '[]')
        except json.JSONDecodeError:
            return []
        return [str(item) for item in data if str(item).strip()]

    def _diverse_rank(self, items: list, *, key_fn) -> list:
        buckets: dict[str, list] = {}
        for item in items:
            buckets.setdefault(key_fn(item), []).append(item)
        for rows in buckets.values():
            rows.sort(
                key=lambda item: (
                    int(getattr(item, 'inspiration_score', 0) or 0),
                    int(getattr(item, 'like_count', 0) or 0),
                    getattr(item, 'created_at', datetime.min),
                ),
                reverse=True,
            )
        result: list = []
        while buckets:
            for key in list(buckets.keys()):
                if not buckets[key]:
                    buckets.pop(key, None)
                    continue
                result.append(buckets[key].pop(0))
                if not buckets.get(key):
                    buckets.pop(key, None)
            # small shuffle window keeps feed from looking repetitive while preserving quality ordering
            if len(result) > 8:
                head = result[:8]
                tail = result[8:]
                random.shuffle(tail)
                result = head + tail
        return result
