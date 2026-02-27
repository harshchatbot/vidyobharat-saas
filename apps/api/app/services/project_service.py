from sqlalchemy.orm import Session

from app.db.repositories.project_repository import ProjectRepository
from app.db.repositories.render_repository import RenderRepository
from app.schemas.project import CreateProjectRequest, UpdateProjectRequest


class ProjectService:
    def __init__(self, db: Session) -> None:
        self.project_repo = ProjectRepository(db)
        self.render_repo = RenderRepository(db)

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
