import shutil
from pathlib import Path

from sqlalchemy.orm import Session

from app.db.repositories.user_repository import UserRepository
from app.models.entities import User


class UserService:
    def __init__(self, db: Session) -> None:
        self.repo = UserRepository(db)

    def get_user(self, user_id: str) -> User:
        user = self.repo.get(user_id)
        if not user:
            raise LookupError('User not found')
        return user

    def update_profile(self, user_id: str, **fields) -> User:
        user = self.get_user(user_id)
        return self.repo.update(user, **fields)

    def update_settings(self, user_id: str, **fields) -> User:
        user = self.get_user(user_id)
        return self.repo.update(user, **fields)

    def save_avatar(self, user_id: str, filename: str, file_obj) -> User:
        user = self.get_user(user_id)
        extension = Path(filename).suffix.lower() or '.png'
        target_dir = Path('data/uploads/avatars')
        target_dir.mkdir(parents=True, exist_ok=True)
        target_path = target_dir / f'{user_id}{extension}'
        with target_path.open('wb') as handle:
            shutil.copyfileobj(file_obj, handle)
        return self.repo.update(user, avatar_url=f'/static/uploads/avatars/{target_path.name}')
