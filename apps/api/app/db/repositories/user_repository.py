from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import User


class UserRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create(self, email: str | None = None) -> User:
        user = User(email=email)
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def get(self, user_id: str) -> User | None:
        return self.db.get(User, user_id)

    def get_by_email(self, email: str) -> User | None:
        stmt = select(User).where(User.email == email)
        return self.db.scalar(stmt)
