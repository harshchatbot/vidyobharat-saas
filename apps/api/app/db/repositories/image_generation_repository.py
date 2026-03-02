from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import ImageGeneration


class ImageGenerationRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create(self, **kwargs) -> ImageGeneration:
        generation = ImageGeneration(**kwargs)
        self.db.add(generation)
        self.db.commit()
        self.db.refresh(generation)
        return generation

    def get_by_id(self, generation_id: str) -> ImageGeneration | None:
        return self.db.get(ImageGeneration, generation_id)

    def list_by_user(self, user_id: str) -> list[ImageGeneration]:
        stmt = select(ImageGeneration).where(ImageGeneration.user_id == user_id).order_by(ImageGeneration.created_at.desc())
        return list(self.db.scalars(stmt).all())
