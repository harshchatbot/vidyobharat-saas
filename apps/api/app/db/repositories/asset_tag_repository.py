from collections import Counter

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.entities import AssetTag


class AssetTagRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def add_tags(self, asset_id: str, asset_type: str, tags: list[str], source: str) -> list[AssetTag]:
        created: list[AssetTag] = []
        for raw_tag in tags:
            tag = raw_tag.strip().lower()
            if not tag:
                continue
            existing = self.db.scalar(
                select(AssetTag).where(
                    AssetTag.asset_id == asset_id,
                    AssetTag.asset_type == asset_type,
                    AssetTag.tag == tag,
                )
            )
            if existing:
                continue
            row = AssetTag(asset_id=asset_id, asset_type=asset_type, tag=tag, source=source)
            self.db.add(row)
            created.append(row)
        self.db.commit()
        for row in created:
            self.db.refresh(row)
        return created

    def list_for_asset(self, asset_id: str, asset_type: str) -> list[AssetTag]:
        stmt = (
            select(AssetTag)
            .where(AssetTag.asset_id == asset_id, AssetTag.asset_type == asset_type)
            .order_by(AssetTag.source.asc(), AssetTag.tag.asc())
        )
        return list(self.db.scalars(stmt).all())

    def replace_user_tags(self, asset_id: str, asset_type: str, tags: list[str]) -> list[AssetTag]:
        self.db.execute(
            delete(AssetTag).where(
                AssetTag.asset_id == asset_id,
                AssetTag.asset_type == asset_type,
                AssetTag.source == 'user',
            )
        )
        self.db.commit()
        self.add_tags(asset_id=asset_id, asset_type=asset_type, tags=tags, source='user')
        return self.list_for_asset(asset_id=asset_id, asset_type=asset_type)

    def facet_counts_for_assets(self, asset_pairs: list[tuple[str, str]]) -> list[tuple[str, int]]:
        if not asset_pairs:
            return []
        rows: list[AssetTag] = []
        for asset_type, asset_id in asset_pairs:
            rows.extend(self.list_for_asset(asset_id=asset_id, asset_type=asset_type))
        counts = Counter(item.tag for item in rows)
        return sorted(counts.items(), key=lambda item: (-item[1], item[0]))
