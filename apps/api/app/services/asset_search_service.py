from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.db.repositories.asset_tag_repository import AssetTagRepository
from app.db.repositories.image_generation_repository import ImageGenerationRepository
from app.db.repositories.video_repository import VideoRepository
from app.models.entities import ImageGeneration, Video


@dataclass
class SearchAsset:
    id: str
    content_type: str
    title: str
    model_key: str
    resolution: str
    aspect_ratio: str
    prompt: str
    thumbnail_url: str | None
    asset_url: str | None
    status: str
    created_at: object
    reference_urls: list[str]
    auto_tags: list[str]
    user_tags: list[str]


class AssetSearchService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.tags = AssetTagRepository(db)
        self.images = ImageGenerationRepository(db)
        self.videos = VideoRepository(db)

    def list_tag_facets(self, user_id: str, content_type: str | None = None, query: str | None = None) -> list[tuple[str, int]]:
        assets = self._load_assets(user_id=user_id, content_type=content_type)
        pairs = [(asset.content_type, asset.id) for asset in assets]
        facets = self.tags.facet_counts_for_assets(pairs)
        if query:
            query_norm = query.strip().lower()
            return [item for item in facets if query_norm in item[0]]
        return facets

    def search_assets(
        self,
        user_id: str,
        query: str | None = None,
        tags: list[str] | None = None,
        models: list[str] | None = None,
        resolutions: list[str] | None = None,
        content_type: str | None = None,
        sort: str = 'newest',
        page: int = 1,
        page_size: int = 24,
    ) -> tuple[list[SearchAsset], int]:
        selected_tags = [tag.strip().lower() for tag in (tags or []) if tag.strip()]
        selected_models = [value.strip() for value in (models or []) if value.strip()]
        selected_resolutions = [value.strip() for value in (resolutions or []) if value.strip()]
        query_norm = (query or '').strip().lower()

        assets = self._load_assets(user_id=user_id, content_type=content_type)
        filtered: list[SearchAsset] = []
        for asset in assets:
            tag_pool = set(asset.auto_tags + asset.user_tags)
            if selected_tags and not set(selected_tags).issubset(tag_pool):
                continue
            if selected_models and asset.model_key not in selected_models:
                continue
            if selected_resolutions and asset.resolution not in selected_resolutions:
                continue
            if query_norm:
                haystack = ' '.join([asset.title, asset.prompt, *asset.auto_tags, *asset.user_tags]).lower()
                if query_norm not in haystack:
                    continue
            filtered.append(asset)

        if sort == 'oldest':
            filtered.sort(key=lambda item: item.created_at)
        else:
            filtered.sort(key=lambda item: item.created_at, reverse=True)

        total = len(filtered)
        start = max(0, (page - 1) * page_size)
        end = start + page_size
        return filtered[start:end], total

    def _load_assets(self, user_id: str, content_type: str | None = None) -> list[SearchAsset]:
        assets: list[SearchAsset] = []
        if content_type in {None, 'image'}:
            for image in self.images.list_by_user(user_id):
                auto_tags, user_tags = self._tag_lists(image.id, 'image')
                assets.append(
                    SearchAsset(
                        id=image.id,
                        content_type='image',
                        title=image.prompt[:60] or 'Untitled image',
                        model_key=image.model_key,
                        resolution=image.resolution,
                        aspect_ratio=image.aspect_ratio,
                        prompt=image.prompt,
                        thumbnail_url=image.thumbnail_url,
                        asset_url=image.image_url,
                        status=image.status.value if hasattr(image.status, 'value') else str(image.status),
                        created_at=image.created_at,
                        reference_urls=self._parse_json_list(image.reference_urls),
                        auto_tags=auto_tags,
                        user_tags=user_tags,
                    )
                )
        if content_type in {None, 'video'}:
            for video in self.videos.list_by_user(user_id):
                auto_tags, user_tags = self._tag_lists(video.id, 'video')
                assets.append(
                    SearchAsset(
                        id=video.id,
                        content_type='video',
                        title=video.title or 'Untitled video',
                        model_key=video.selected_model or 'local_render',
                        resolution=video.resolution,
                        aspect_ratio=video.aspect_ratio,
                        prompt=video.script,
                        thumbnail_url=video.thumbnail_url,
                        asset_url=video.output_url,
                        status=video.status.value if hasattr(video.status, 'value') else str(video.status),
                        created_at=video.created_at,
                        reference_urls=self._parse_json_list(video.reference_images),
                        auto_tags=auto_tags,
                        user_tags=user_tags,
                    )
                )
        return assets

    def _tag_lists(self, asset_id: str, asset_type: str) -> tuple[list[str], list[str]]:
        rows = self.tags.list_for_asset(asset_id=asset_id, asset_type=asset_type)
        auto_tags = [row.tag for row in rows if row.source == 'auto']
        user_tags = [row.tag for row in rows if row.source == 'user']
        return auto_tags, user_tags

    def _parse_json_list(self, raw: str | None) -> list[str]:
        import json

        try:
            data = json.loads(raw or '[]')
        except json.JSONDecodeError:
            return []
        return [str(item) for item in data if str(item).strip()]
