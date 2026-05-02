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

    def delete_project(self, project_id: str, user_id: str) -> bool:
        project = self.project_repo.get_by_id(project_id)
        if not project:
            return False
        if project.user_id != user_id:
            raise PermissionError('Project does not belong to this user')

        for image in self.image_repo.list_by_project(project_id, limit=200):
            if image.user_id == user_id:
                self.image_repo.clear_project_assignment(image)
        for video in self.video_repo.list_by_project(project_id, limit=200):
            if video.user_id == user_id:
                self.video_repo.clear_project_assignment(video)

        self.project_repo.delete(project_id)
        return True

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

    def assign_image_to_project(self, image_id: str, user_id: str, project_id: str):
        generation = self.image_repo.get_by_id(image_id)
        if not generation:
            raise LookupError('Image not found')
        if generation.user_id != user_id:
            raise PermissionError('Image does not belong to this user')
        project = self.project_repo.get_by_id(project_id)
        if not project:
            raise LookupError('Project not found')
        if project.user_id != user_id:
            raise PermissionError('Project does not belong to this user')
        previous_project_id = getattr(generation, 'project_id', None)
        if previous_project_id == project_id:
            return generation, previous_project_id
        updated = self.image_repo.assign_project(generation, project_id)
        self.project_repo.reassign_generation(
            previous_project_id=previous_project_id,
            next_project_id=project_id,
            medium='image',
            prompt=updated.prompt,
            thumbnail_url=updated.thumbnail_url or updated.image_url,
            template=getattr(updated, 'template_id', None),
        )
        return updated, previous_project_id

    def assign_video_to_project(self, video_id: str, user_id: str, project_id: str):
        video = self.video_repo.get_by_id(video_id)
        if not video:
            raise LookupError('Video not found')
        if video.user_id != user_id:
            raise PermissionError('Video does not belong to this user')
        project = self.project_repo.get_by_id(project_id)
        if not project:
            raise LookupError('Project not found')
        if project.user_id != user_id:
            raise PermissionError('Project does not belong to this user')
        previous_project_id = getattr(video, 'project_id', None)
        if previous_project_id == project_id:
            return video, previous_project_id
        updated = self.video_repo.assign_project(video, project_id)
        self.project_repo.reassign_generation(
            previous_project_id=previous_project_id,
            next_project_id=project_id,
            medium='video',
            prompt=updated.script,
            thumbnail_url=updated.thumbnail_url or updated.source_image_url,
            template=getattr(updated, 'template_id', None) or updated.template,
            language=updated.language,
            voice=updated.voice,
        )
        return updated, previous_project_id
