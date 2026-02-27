from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import Project


class ProjectRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create(self, **kwargs) -> Project:
        project = Project(**kwargs)
        self.db.add(project)
        self.db.commit()
        self.db.refresh(project)
        return project

    def list_by_user(self, user_id: str) -> list[Project]:
        stmt = select(Project).where(Project.user_id == user_id).order_by(Project.created_at.desc())
        return list(self.db.scalars(stmt).all())

    def get_by_id(self, project_id: str) -> Project | None:
        return self.db.get(Project, project_id)

    def update(self, project: Project, **kwargs) -> Project:
        for key, value in kwargs.items():
            setattr(project, key, value)
        self.db.add(project)
        self.db.commit()
        self.db.refresh(project)
        return project
