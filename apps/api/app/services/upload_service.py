from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.repositories.asset_repository import AssetRepository
from app.providers.storage import build_storage_provider
from app.schemas.upload import UploadSignRequest


class UploadService:
    def __init__(self, db: Session) -> None:
        self.asset_repo = AssetRepository(db)
        self.storage = build_storage_provider(get_settings())

    def sign_upload(self, payload: UploadSignRequest):
        signed = self.storage.sign_upload(payload.filename, kind=payload.kind)
        asset = self.asset_repo.create(
            user_id=payload.user_id,
            project_id=payload.project_id,
            kind=payload.kind,
            path=signed.storage_path,
            public_url=signed.public_url,
        )
        return asset, signed

    def delete_asset(self, asset_id: str) -> bool:
        asset = self.asset_repo.get(asset_id)
        if not asset:
            return False
        self.storage.delete(asset.path)
        self.asset_repo.delete(asset)
        return True
