from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import InfluencerPersona, InfluencerScenePreset


class InfluencerRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_by_user(self, user_id: str) -> list[InfluencerPersona]:
        stmt = select(InfluencerPersona).where(InfluencerPersona.user_id == user_id).order_by(InfluencerPersona.created_at.desc())
        return list(self.db.scalars(stmt).all())

    def get(self, persona_id: str) -> InfluencerPersona | None:
        return self.db.get(InfluencerPersona, persona_id)

    def get_for_user(self, persona_id: str, user_id: str) -> InfluencerPersona | None:
        stmt = select(InfluencerPersona).where(
            InfluencerPersona.id == persona_id,
            InfluencerPersona.user_id == user_id,
        )
        return self.db.scalar(stmt)

    def create(self, **fields) -> InfluencerPersona:
        persona = InfluencerPersona(**fields)
        self.db.add(persona)
        self.db.commit()
        self.db.refresh(persona)
        return persona

    def update(self, persona: InfluencerPersona, **fields) -> InfluencerPersona:
        for key, value in fields.items():
            setattr(persona, key, value)
        self.db.add(persona)
        self.db.commit()
        self.db.refresh(persona)
        return persona

    def list_scene_presets(self, user_id: str, persona_id: str | None = None) -> list[InfluencerScenePreset]:
        stmt = (
            select(InfluencerScenePreset)
            .where(
                (InfluencerScenePreset.is_system.is_(True))
                | (
                    (InfluencerScenePreset.user_id == user_id)
                    & (
                        (InfluencerScenePreset.persona_id == persona_id)
                        | (InfluencerScenePreset.persona_id.is_(None))
                    )
                )
            )
            .order_by(InfluencerScenePreset.is_system.desc(), InfluencerScenePreset.created_at.desc())
        )
        return list(self.db.scalars(stmt).all())

    def create_scene_preset(self, **fields) -> InfluencerScenePreset:
        scene = InfluencerScenePreset(**fields)
        self.db.add(scene)
        self.db.commit()
        self.db.refresh(scene)
        return scene
