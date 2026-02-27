import logging
import json
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import get_user_id
from app.db.session import get_db
from app.schemas.auth import MockLoginRequest, MockLoginResponse, MockSignupRequest, MockSignupResponse
from app.schemas.catalog import AvatarResponse, TemplateResponse
from app.schemas.project import (
    CreateProjectAssetRequest,
    CreateProjectRequest,
    ProjectAssetResponse,
    ProjectResponse,
    UpdateProjectRequest,
)
from app.schemas.render import CreateRenderRequest, RenderResponse
from app.schemas.upload import UploadDeleteResponse, UploadSignRequest, UploadSignResponse
from app.schemas.video import MusicTrackResponse, VideoCreateResponse, VideoResponse, VideoRetryResponse
from app.services.avatar_service import AvatarService
from app.services.auth_service import AuthService
from app.services.project_service import ProjectService
from app.services.render_service import RenderService
from app.services.template_service import TemplateService
from app.services.upload_service import UploadService
from app.services.video_service import VideoService
from app.services.video_pipeline import BUILTIN_MUSIC_TRACKS

router = APIRouter()
logger = logging.getLogger(__name__)


def _to_video_response(video) -> VideoResponse:
    image_urls: list[str] = []
    try:
        image_urls = json.loads(video.image_urls or '[]')
    except json.JSONDecodeError:
        image_urls = []
    return VideoResponse(
        id=video.id,
        user_id=video.user_id,
        title=video.title,
        script=video.script,
        voice=video.voice,
        aspect_ratio=video.aspect_ratio or '9:16',
        resolution=video.resolution or '1080p',
        duration_mode=video.duration_mode or 'auto',
        duration_seconds=video.duration_seconds,
        captions_enabled=bool(video.captions_enabled) if video.captions_enabled is not None else True,
        status=video.status.value if hasattr(video.status, 'value') else str(video.status),
        progress=video.progress,
        image_urls=image_urls,
        music_mode=video.music_mode,
        music_track_id=video.music_track_id,
        music_file_url=video.music_file_url,
        music_volume=video.music_volume,
        duck_music=video.duck_music,
        thumbnail_url=video.thumbnail_url,
        output_url=video.output_url,
        error_message=video.error_message,
        created_at=video.created_at,
        updated_at=video.updated_at,
    )


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


@router.get('/avatars', response_model=list[AvatarResponse])
def list_avatars(
    search: str | None = None,
    scope: str | None = None,
    language: str | None = None,
    _: str = Depends(get_user_id),
):
    service = AvatarService()
    return service.list_avatars(search=search, scope=scope, language=language)


@router.get('/templates', response_model=list[TemplateResponse])
def list_templates(
    search: str | None = None,
    category: str | None = None,
    aspect_ratio: str | None = None,
    _: str = Depends(get_user_id),
):
    service = TemplateService()
    return service.list_templates(search=search, category=category, aspect_ratio=aspect_ratio)


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


@router.post('/projects/{project_id}/assets', response_model=ProjectAssetResponse, status_code=status.HTTP_201_CREATED)
def create_project_asset(
    project_id: str,
    payload: CreateProjectAssetRequest,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_user_id),
):
    service = ProjectService(db)
    try:
        asset, upload_url = service.add_project_asset(project_id, user_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc

    return ProjectAssetResponse(
        asset_id=asset.id,
        project_id=project_id,
        kind=asset.kind,
        upload_url=upload_url,
        public_url=asset.public_url,
    )


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


@router.get('/videos', response_model=list[VideoResponse])
def list_videos(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_user_id),
):
    service = VideoService(db)
    videos = service.list_videos(user_id)
    return [_to_video_response(video) for video in videos]


@router.get('/music-tracks', response_model=list[MusicTrackResponse])
def list_music_tracks() -> list[MusicTrackResponse]:
    labels = {
        'uplift-india': 'Uplift India',
        'corporate-calm': 'Corporate Calm',
        'soft-motivation': 'Soft Motivation',
    }
    tracks: list[MusicTrackResponse] = []
    for track_id, url in BUILTIN_MUSIC_TRACKS.items():
        local_path = Path(f"data/{url.replace('/static/', '', 1)}") if url.startswith('/static/') else Path(url)
        exists = local_path.exists()
        if not exists:
            continue
        tracks.append(
            MusicTrackResponse(
                id=track_id,
                name=labels.get(track_id, track_id),
                duration_sec=None,
                preview_url=url,
            )
        )
    return tracks


@router.post('/videos', response_model=VideoCreateResponse, status_code=status.HTTP_202_ACCEPTED)
async def create_video(
    script: str = Form(default=''),
    voice: str = Form(default='Aarav'),
    title: str | None = Form(default=None),
    aspect_ratio: str = Form(default='9:16'),
    resolution: str = Form(default='1080p'),
    duration_mode: str = Form(default='auto'),
    duration_seconds: int | None = Form(default=None),
    captions_enabled: bool = Form(default=True),
    music_mode: str = Form(default='none'),
    music_track_id: str | None = Form(default=None),
    music_volume: int = Form(default=20),
    duck_music: bool = Form(default=True),
    images: list[UploadFile] = File(default=[]),
    music_file: UploadFile | None = File(default=None),
    db: Session = Depends(get_db),
    user_id: str = Depends(get_user_id),
):
    service = VideoService(db)
    try:
        video = await service.create_video(
            user_id=user_id,
            script=script,
            voice=voice,
            images=images,
            title=title,
            aspect_ratio=aspect_ratio,
            resolution=resolution,
            duration_mode=duration_mode,
            duration_seconds=duration_seconds,
            captions_enabled=captions_enabled,
            music_mode=music_mode,
            music_track_id=music_track_id,
            music_volume=music_volume,
            duck_music=duck_music,
            music_file=music_file,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return VideoCreateResponse(id=video.id, status=video.status.value if hasattr(video.status, 'value') else str(video.status))


@router.get('/videos/{video_id}', response_model=VideoResponse)
def get_video(
    video_id: str,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_user_id),
):
    service = VideoService(db)
    video = service.get_video(video_id, user_id)
    if not video:
        raise HTTPException(status_code=404, detail='Video not found')
    return _to_video_response(video)


@router.post('/videos/{video_id}/retry', response_model=VideoRetryResponse)
def retry_video(
    video_id: str,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_user_id),
):
    service = VideoService(db)
    video = service.retry_video(video_id, user_id)
    if not video:
        raise HTTPException(status_code=404, detail='Video not found')
    return VideoRetryResponse(id=video.id, status=video.status.value if hasattr(video.status, 'value') else str(video.status))
