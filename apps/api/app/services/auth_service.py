from sqlalchemy.orm import Session

from app.db.repositories.user_repository import UserRepository


class AuthService:
    def __init__(self, db: Session) -> None:
        self.user_repo = UserRepository(db)

    def mock_signup(self, email: str) -> str:
        existing = self.user_repo.get_by_email(email)
        if existing:
            raise ValueError('User already exists')
        user = self.user_repo.create(email=email)
        return user.id

    def mock_login(self, email: str | None = None) -> str:
        if email:
            user = self.user_repo.get_by_email(email)
            if not user:
                raise LookupError('User not found. Please sign up first.')
            return user.id
        user = self.user_repo.create(email=None)
        return user.id
