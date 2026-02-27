from sqlalchemy.orm import Session

from app.db.repositories.user_repository import UserRepository


class AuthService:
    def __init__(self, db: Session) -> None:
        self.user_repo = UserRepository(db)

    def mock_login(self, email: str | None = None) -> str:
        user = self.user_repo.create(email=email)
        return user.id
