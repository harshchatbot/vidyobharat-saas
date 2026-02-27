import logging

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_user_id
from app.db.session import get_db
from app.schemas.auth import MockLoginRequest, MockLoginResponse, MockSignupRequest, MockSignupResponse
from app.schemas.project import CreateProjectRequest, ProjectResponse, UpdateProjectRequest
from app.schemas.render import CreateRenderRequest, RenderResponse
from app.schemas.upload import UploadDeleteResponse, UploadSignRequest, UploadSignResponse
from app.services.auth_service import AuthService
from app.services.project_service import ProjectService
from app.services.render_service import RenderService
from app.services.upload_service import UploadService

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get('/health')
async def health() -> dict[str, str]:
    return {'status': 'ok'}


@router.post('/auth/mock-login', response_model=MockLoginResponse)
def mock_login(payload: MockLoginRequest, db: Session = Depends(get_db)):
    auth_service = AuthService(db)
    try:
        user_id = auth_service.mock_login(email=payload.email)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return MockLoginResponse(user_id=user_id)


@router.post('/auth/mock-signup', response_model=MockSignupResponse, status_code=status.HTTP_201_CREATED)
def mock_signup(payload: MockSignupRequest, db: Session = Depends(get_db)):
    auth_service = AuthService(db)
    try:
        user_id = auth_service.mock_signup(email=payload.email)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return MockSignupResponse(user_id=user_id)


@router.post('/projects', response_model=ProjectResponse)
def create_project(
    payload: CreateProjectRequest,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_user_id),
):
    if payload.user_id != user_id:
        raise HTTPException(status_code=403, detail='Forbidden user_id')
    service = ProjectService(db)
    return service.create_project(payload)


@router.get('/projects', response_model=list[ProjectResponse])
def list_projects(
    response: Response,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_user_id),
):
    response.headers['Cache-Control'] = 'private, max-age=10'
    service = ProjectService(db)
    return service.list_projects(user_id=user_id)


@router.get('/projects/{project_id}')
def get_project(
    project_id: str,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_user_id),
):
    service = ProjectService(db)
    project = service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail='Project not found')
    if project.user_id != user_id:
        raise HTTPException(status_code=403, detail='Project does not belong to this user')
    renders = service.list_project_renders(project_id)
    return {
        'project': ProjectResponse.model_validate(project),
        'renders': [RenderResponse.model_validate(item) for item in renders],
    }


@router.patch('/projects/{project_id}', response_model=ProjectResponse)
def update_project(
    project_id: str,
    payload: UpdateProjectRequest,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_user_id),
):
    service = ProjectService(db)
    try:
        project = service.update_project(project_id, user_id, payload)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    if not project:
        raise HTTPException(status_code=404, detail='Project not found')
    return project


@router.post('/renders', response_model=RenderResponse, status_code=status.HTTP_202_ACCEPTED)
def create_render(
    payload: CreateRenderRequest,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_user_id),
):
    if payload.user_id != user_id:
        raise HTTPException(status_code=403, detail='Forbidden user_id')
    service = RenderService(db)
    try:
        render = service.create_render(payload)
        return render
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get('/renders/{render_id}', response_model=RenderResponse)
def get_render(
    render_id: str,
    response: Response,
    db: Session = Depends(get_db),
    _: str = Depends(get_user_id),
):
    response.headers['Cache-Control'] = 'no-store'
    service = RenderService(db)
    render = service.get_render(render_id)
    if not render:
        raise HTTPException(status_code=404, detail='Render not found')
    return render


@router.post('/uploads/sign', response_model=UploadSignResponse)
def sign_upload(
    payload: UploadSignRequest,
    db: Session = Depends(get_db),
    _: str = Depends(get_user_id),
):
    service = UploadService(db)
    asset, upload_path = service.sign_upload(payload)
    return UploadSignResponse(asset_id=asset.id, upload_url=upload_path, public_url=asset.public_url)


@router.delete('/uploads/{asset_id}', response_model=UploadDeleteResponse)
def delete_upload(
    asset_id: str,
    db: Session = Depends(get_db),
    _: str = Depends(get_user_id),
):
    service = UploadService(db)
    deleted = service.delete_asset(asset_id)
    if not deleted:
        raise HTTPException(status_code=404, detail='Asset not found')
    logger.info('asset_deleted', extra={'asset_id': asset_id})
    return UploadDeleteResponse(asset_id=asset_id, deleted=True)
