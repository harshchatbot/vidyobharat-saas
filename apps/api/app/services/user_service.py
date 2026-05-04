import shutil
from pathlib import Path

from sqlalchemy.orm import Session

from app.db.repositories.user_repository import UserRepository
from app.models.entities import User
from app.services.firestore_sync_service import FirestoreSyncService


class UserService:
    def __init__(self, db: Session | None) -> None:
        self.repo = UserRepository(db)
        self.sync = FirestoreSyncService()

    def get_user(self, user_id: str) -> User:
        user = self.repo.get(user_id)
        if not user:
            raise LookupError('User not found')
        return user

    def bootstrap_auth_user(
        self,
        user_id: str,
        *,
        email: str | None = None,
        display_name: str | None = None,
        avatar_url: str | None = None,
    ) -> User:
        user = self.repo.get_or_create_auth_user(
            user_id=user_id,
            email=email,
            display_name=display_name,
            avatar_url=avatar_url,
        )
        self.sync.sync_user(user)
        return user

    def update_profile(self, user_id: str, **fields) -> User:
        user = self.get_user(user_id)
        updated = self.repo.update(user, **fields)
        self.sync.sync_user(updated)
        return updated

    def update_settings(self, user_id: str, **fields) -> User:
        user = self.get_user(user_id)
        updated = self.repo.update(user, **fields)
        self.sync.sync_user(updated)
        return updated

    def save_avatar(self, user_id: str, filename: str, file_obj) -> User:
        user = self.get_user(user_id)
        extension = Path(filename).suffix.lower() or '.png'
        target_dir = Path('data/uploads/avatars')
        target_dir.mkdir(parents=True, exist_ok=True)
        target_path = target_dir / f'{user_id}{extension}'
        with target_path.open('wb') as handle:
            shutil.copyfileobj(file_obj, handle)
        updated = self.repo.update(user, avatar_url=f'/static/uploads/avatars/{target_path.name}')
        self.sync.sync_user(updated)
        return updated
