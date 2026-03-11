from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime
from typing import Any

from app.db.firestore_utils import coerce_datetime, utcnow
from app.providers.firebase import get_firestore_client


class TemplateRepository:
    def __init__(self) -> None:
        self.firestore = get_firestore_client()
        self.collection = self.firestore.collection('templates')

    def list(self) -> list[dict[str, Any]]:
        rows = self.collection.stream()
        items: list[dict[str, Any]] = []
        for row in rows:
            data = row.to_dict() or {}
            data.setdefault('id', row.id)
            items.append(self._normalize(data))
        return items

    def get(self, template_id: str) -> dict[str, Any] | None:
        snap = self.collection.document(template_id).get()
        if not snap.exists:
            return None
        data = snap.to_dict() or {}
        data.setdefault('id', snap.id)
        return self._normalize(data)

    def upsert(self, template_id: str, payload: dict[str, Any], *, merge: bool = True) -> dict[str, Any]:
        doc = self.collection.document(template_id)
        doc.set(payload, merge=merge)
        data = self.get(template_id)
        if not data:
            raise RuntimeError('Template write did not persist')
        return data

    def seed_missing(self, templates: Iterable[dict[str, Any]]) -> None:
        existing = {item['id'] for item in self.list()}
        batch = self.firestore.batch()
        wrote = False
        for template in templates:
            template_id = str(template['id'])
            if template_id in existing:
                continue
            batch.set(self.collection.document(template_id), template, merge=True)
            wrote = True
        if wrote:
            batch.commit()

    def soft_delete(self, template_id: str) -> dict[str, Any] | None:
        template = self.get(template_id)
        if not template:
            return None
        payload = {
            'active': False,
            'deleted_at': utcnow(),
            'updated_at': utcnow(),
        }
        return self.upsert(template_id, payload)

    def _normalize(self, data: dict[str, Any]) -> dict[str, Any]:
        normalized = dict(data)
        normalized['id'] = str(normalized.get('id'))
        normalized['type'] = str(normalized.get('type') or 'video')
        normalized['medium'] = str(normalized.get('medium') or normalized['type'])
        normalized['category'] = str(normalized.get('category') or 'general')
        normalized['subcategory'] = normalized.get('subcategory')
        normalized['name'] = str(normalized.get('name') or normalized['id'])
        normalized['title'] = str(normalized.get('title') or normalized['name'])
        normalized['slug'] = str(normalized.get('slug') or normalized['id'])
        normalized['description'] = str(normalized.get('description') or normalized['name'])
        normalized['short_description'] = str(
            normalized.get('short_description')
            or normalized.get('shortDescription')
            or normalized['description']
        )
        normalized['thumbnail_url'] = str(normalized.get('thumbnail_url') or normalized.get('thumbnailUrl') or '')
        normalized['preview_image_url'] = normalized.get('preview_image_url') or normalized.get('previewImageUrl')
        normalized['preview_video_url'] = normalized.get('preview_video_url') or normalized.get('previewVideoUrl')
        normalized['visual_prompt'] = normalized.get('visual_prompt') or normalized.get('visualPrompt')
        normalized['aspect_ratio'] = str(normalized.get('aspect_ratio') or normalized.get('aspectRatio') or '9:16')
        normalized['inputs'] = list(normalized.get('inputs') or [])
        normalized['input_schema'] = list(normalized.get('input_schema') or normalized.get('inputSchema') or normalized['inputs'])
        normalized['script_hint'] = normalized.get('script_hint') or normalized.get('scriptHint')
        normalized['topic_hint'] = normalized.get('topic_hint') or normalized.get('topicHint')
        normalized['prompt_template'] = str(normalized.get('prompt_template') or normalized.get('promptTemplate') or '')
        normalized['active'] = bool(normalized.get('active', True))
        normalized['trending'] = bool(normalized.get('trending', False))
        normalized['featured'] = bool(normalized.get('featured', False))
        normalized['badge'] = normalized.get('badge')
        normalized['is_featured'] = bool(normalized.get('is_featured', normalized.get('isFeatured', normalized['featured'])))
        normalized['is_quick_start'] = bool(normalized.get('is_quick_start', normalized.get('isQuickStart', False)))
        normalized['default_model_mode'] = normalized.get('default_model_mode') or normalized.get('defaultModelMode')
        normalized['prompt_assembler_key'] = normalized.get('prompt_assembler_key') or normalized.get('promptAssemblerKey')
        normalized['legacy_mappings'] = list(normalized.get('legacy_mappings') or normalized.get('legacyMappings') or [])
        normalized['suggested_platforms'] = list(normalized.get('suggested_platforms') or normalized.get('suggestedPlatforms') or [])
        normalized['suggested_durations'] = [int(item) for item in (normalized.get('suggested_durations') or normalized.get('suggestedDurations') or [])]
        normalized['suggested_styles'] = list(normalized.get('suggested_styles') or normalized.get('suggestedStyles') or [])
        normalized['safety_profile'] = normalized.get('safety_profile') or normalized.get('safetyProfile')
        normalized['recommended_model_name'] = normalized.get('recommended_model_name') or normalized.get('recommendedModelName')
        normalized['recommended_model_description'] = normalized.get('recommended_model_description') or normalized.get('recommendedModelDescription')
        normalized['recommended_model_group'] = normalized.get('recommended_model_group') or normalized.get('recommendedModelGroup')
        normalized['order'] = int(normalized.get('order') or 0)
        normalized['created_by'] = normalized.get('created_by') or normalized.get('createdBy')
        normalized['source'] = normalized.get('source') or 'firestore'
        normalized['generation_defaults'] = normalized.get('generation_defaults') or normalized.get('generationDefaults') or {}
        normalized['created_at'] = self._normalize_datetime(normalized.get('created_at') or normalized.get('createdAt'))
        normalized['updated_at'] = self._normalize_datetime(normalized.get('updated_at') or normalized.get('updatedAt'))
        normalized['deleted_at'] = self._normalize_datetime(normalized.get('deleted_at') or normalized.get('deletedAt'))
        return normalized

    def _normalize_datetime(self, value: Any) -> datetime | None:
        if value in (None, ''):
            return None
        return coerce_datetime(value)
