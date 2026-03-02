from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.firestore_utils import coerce_datetime, model_from_fields, utcnow
from app.models.entities import InfluencerPersona, InfluencerScenePreset
from app.providers.firebase import get_firestore_client


class InfluencerRepository:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.firestore = get_firestore_client()
        self.personas = self.firestore.collection('influencer_personas')
        self.scenes = self.firestore.collection('influencer_scene_presets')

    def list_by_user(self, user_id: str) -> list[InfluencerPersona]:
        rows = self.personas.stream()
        items: list[InfluencerPersona] = []
        for row in rows:
            data = row.to_dict() or {}
            if data.get('user_id') != user_id:
                continue
            try:
                items.append(self._to_persona({**data, 'id': row.id}))
            except Exception:
                continue
        items.sort(key=lambda item: item.created_at, reverse=True)
        return items

    def get(self, persona_id: str) -> InfluencerPersona | None:
        snapshot = self.personas.document(persona_id).get()
        if not snapshot.exists:
            return None
        return self._to_persona({**(snapshot.to_dict() or {}), 'id': snapshot.id})

    def get_for_user(self, persona_id: str, user_id: str) -> InfluencerPersona | None:
        persona = self.get(persona_id)
        if persona and persona.user_id == user_id:
            return persona
        return None

    def create(self, **fields) -> InfluencerPersona:
        persona_id = fields.get('id') or self.personas.document().id
        fields['id'] = persona_id
        fields.setdefault('created_at', utcnow())
        fields.setdefault('updated_at', utcnow())
        self.personas.document(persona_id).set(fields)
        return self._to_persona(fields)

    def update(self, persona: InfluencerPersona, **fields) -> InfluencerPersona:
        fields['updated_at'] = utcnow()
        self.personas.document(persona.id).set(fields, merge=True)
        data = {**persona.__dict__, **fields}
        data.pop('_sa_instance_state', None)
        return self._to_persona(data)

    def list_scene_presets(self, user_id: str, persona_id: str | None = None) -> list[InfluencerScenePreset]:
        rows = self.scenes.where('user_id', '==', user_id).stream()
        items: list[InfluencerScenePreset] = []
        for row in rows:
            data = row.to_dict() or {}
            data.setdefault('id', row.id)
            try:
                scene = self._to_scene(data)
            except Exception:
                continue
            if scene.is_system or scene.user_id == user_id:
                if persona_id is None or scene.persona_id in {None, persona_id}:
                    items.append(scene)
        items.sort(key=lambda item: (not item.is_system, -(item.created_at.timestamp())))
        return items

    def create_scene_preset(self, **fields) -> InfluencerScenePreset:
        scene_id = fields.get('id') or self.scenes.document().id
        fields['id'] = scene_id
        fields.setdefault('created_at', utcnow())
        self.scenes.document(scene_id).set(fields)
        return self._to_scene(fields)

    def _to_persona(self, data: dict) -> InfluencerPersona:
        return model_from_fields(
            InfluencerPersona,
            id=data.get('id'),
            user_id=data.get('user_id'),
            name=data.get('name'),
            gender_identity=data.get('gender_identity'),
            niche=data.get('niche'),
            tone=data.get('tone'),
            catchphrase=data.get('catchphrase'),
            personality_traits=data.get('personality_traits') or '[]',
            backstory=data.get('backstory'),
            visual_description=data.get('visual_description') or '',
            reference_image_url=data.get('reference_image_url'),
            reference_image_path=data.get('reference_image_path'),
            reference_embedding_vector=data.get('reference_embedding_vector'),
            style_embedding_vector=data.get('style_embedding_vector'),
            system_prompt_template=data.get('system_prompt_template'),
            character_locked=bool(data.get('character_locked', True)),
            created_at=coerce_datetime(data.get('created_at')),
            updated_at=coerce_datetime(data.get('updated_at')),
        )

    def _to_scene(self, data: dict) -> InfluencerScenePreset:
        return model_from_fields(
            InfluencerScenePreset,
            id=data.get('id'),
            user_id=data.get('user_id'),
            persona_id=data.get('persona_id'),
            key=data.get('key'),
            label=data.get('label'),
            description=data.get('description'),
            environment=data.get('environment') or '',
            props=data.get('props'),
            lighting=data.get('lighting'),
            mood=data.get('mood'),
            negative_constraints=data.get('negative_constraints'),
            is_system=bool(data.get('is_system', False)),
            created_at=coerce_datetime(data.get('created_at')),
        )
