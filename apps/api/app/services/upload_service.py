from sqlalchemy.orm import Session

from app.db.repositories.asset_repository import AssetRepository
from app.providers.storage import LocalStorageProvider
from app.schemas.upload import UploadSignRequest


class UploadService:
    def __init__(self, db: Session) -> None:
        self.asset_repo = AssetRepository(db)
        self.storage = LocalStorageProvider()

    def sign_upload(self, payload: UploadSignRequest):
        upload_path, public_url = self.storage.sign_upload(payload.filename)
        asset = self.asset_repo.create(
            user_id=payload.user_id,
            project_id=payload.project_id,
            kind=payload.kind,
            path=upload_path,
            public_url=public_url,
        )
        return asset, upload_path

    def delete_asset(self, asset_id: str) -> bool:
        asset = self.asset_repo.get(asset_id)
        if not asset:
            return False
        self.storage.delete(asset.path)
        self.asset_repo.delete(asset)
        return True
