from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.repositories.asset_repository import AssetRepository
from app.db.repositories.image_generation_repository import ImageGenerationRepository
from app.db.repositories.project_repository import ProjectRepository
from app.db.repositories.render_repository import RenderRepository
from app.db.repositories.video_repository import VideoRepository
from app.providers.storage import build_storage_provider
from app.schemas.project import CreateProjectAssetRequest, CreateProjectRequest, UpdateProjectRequest


class ProjectService:
    def __init__(self, db: Session | None) -> None:
        self.project_repo = ProjectRepository(db)
        self.render_repo = RenderRepository(db)
        self.asset_repo = AssetRepository(db)
        self.image_repo = ImageGenerationRepository(db)
        self.video_repo = VideoRepository(db)
        self.storage = build_storage_provider(get_settings())

    def create_project(self, payload: CreateProjectRequest):
        return self.project_repo.create(**payload.model_dump())

    def list_projects(self, user_id: str):
        return self.project_repo.list_by_user(user_id)

    def get_project(self, project_id: str):
        return self.project_repo.get_by_id(project_id)

    def update_project(self, project_id: str, user_id: str, payload: UpdateProjectRequest):
        project = self.project_repo.get_by_id(project_id)
        if not project:
            return None
        if project.user_id != user_id:
            raise PermissionError('Project does not belong to this user')
        updates = payload.model_dump(exclude_unset=True)
        if not updates:
            return project
        return self.project_repo.update(project, **updates)

    def list_project_renders(self, project_id: str):
        return self.render_repo.latest_by_project(project_id)

    def list_project_images(self, project_id: str, limit: int = 24):
        return self.image_repo.list_by_project(project_id, limit=limit)

    def list_project_videos(self, project_id: str, limit: int = 24):
        return self.video_repo.list_by_project(project_id, limit=limit)

    def add_project_asset(self, project_id: str, user_id: str, payload: CreateProjectAssetRequest):
        project = self.project_repo.get_by_id(project_id)
        if not project:
            raise LookupError('Project not found')
        if project.user_id != user_id:
            raise PermissionError('Project does not belong to this user')

        signed = self.storage.sign_upload(payload.filename, kind=payload.kind)
        return self.asset_repo.create(
            user_id=user_id,
            project_id=project_id,
            kind=payload.kind,
            path=signed.storage_path,
            public_url=signed.public_url,
        ), signed
