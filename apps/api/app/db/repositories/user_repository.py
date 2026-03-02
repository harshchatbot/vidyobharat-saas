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

    def get_or_create_auth_user(
        self,
        *,
        user_id: str,
        email: str | None,
        display_name: str | None = None,
        avatar_url: str | None = None,
    ) -> User:
        user = self.get(user_id)
        if not user:
            user = User(
                id=user_id,
                email=email,
                display_name=display_name,
                avatar_url=avatar_url,
            )
            self.db.add(user)
            self.db.commit()
            self.db.refresh(user)
            return user

        changed = False
        if email and user.email != email:
            user.email = email
            changed = True
        if display_name and user.display_name != display_name:
            user.display_name = display_name
            changed = True
        if avatar_url and user.avatar_url != avatar_url:
            user.avatar_url = avatar_url
            changed = True

        if changed:
            self.db.add(user)
            self.db.commit()
            self.db.refresh(user)
        return user

    def update(self, user: User, **fields) -> User:
        for key, value in fields.items():
            setattr(user, key, value)
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user
