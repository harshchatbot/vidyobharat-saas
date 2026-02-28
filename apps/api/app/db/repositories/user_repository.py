from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import User


class UserRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create(self, email: str | None = None) -> User:
        display_name = None
        if email:
            local = email.split('@')[0] or 'User'
            display_name = ' '.join(part.capitalize() for part in local.replace('.', ' ').replace('_', ' ').replace('-', ' ').split()) or 'User'
        user = User(email=email, display_name=display_name)
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def get(self, user_id: str) -> User | None:
        return self.db.get(User, user_id)

    def get_by_email(self, email: str) -> User | None:
        stmt = select(User).where(User.email == email)
        return self.db.scalar(stmt)

    def update(self, user: User, **fields) -> User:
        for key, value in fields.items():
            setattr(user, key, value)
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user
