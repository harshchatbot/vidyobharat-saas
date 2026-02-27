from pathlib import Path
from uuid import uuid4

from app.core.config import get_settings


class StorageProvider:
    def sign_upload(self, filename: str) -> tuple[str, str]:
        raise NotImplementedError

    def delete(self, path: str) -> bool:
        raise NotImplementedError


class LocalStorageProvider(StorageProvider):
    def __init__(self) -> None:
        settings = get_settings()
        self.upload_dir = Path('data/uploads')
        self.upload_dir.mkdir(parents=True, exist_ok=True)
        self.base_url = settings.public_asset_base_url.rstrip('/')

    def sign_upload(self, filename: str) -> tuple[str, str]:
        ext = Path(filename).suffix
        asset_name = f'{uuid4()}{ext}'
        local_path = self.upload_dir / asset_name
        upload_url = str(local_path)
        public_url = f'{self.base_url}/uploads/{asset_name}'
        return upload_url, public_url

    def delete(self, path: str) -> bool:
        target = Path(path)
        if target.exists():
            target.unlink()
            return True
        return False
