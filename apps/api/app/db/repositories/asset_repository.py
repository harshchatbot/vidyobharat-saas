from sqlalchemy.orm import Session

from app.models.entities import Asset


class AssetRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create(self, **kwargs) -> Asset:
        asset = Asset(**kwargs)
        self.db.add(asset)
        self.db.commit()
        self.db.refresh(asset)
        return asset

    def get(self, asset_id: str) -> Asset | None:
        return self.db.get(Asset, asset_id)

    def delete(self, asset: Asset) -> None:
        self.db.delete(asset)
        self.db.commit()
