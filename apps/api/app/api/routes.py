import logging
import json
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from openai import OpenAI
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.api.deps import get_user_id
from app.core.config import get_settings
from app.core.request_context import get_request_id
from app.db.session import get_db
from app.schemas.ai import AIVideoGenerateRequest, AIVideoGenerateResponse, ReelScriptRequest, ReelScriptResponse
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
from app.services.ai_video_service import AIVideoOrchestrator, ProviderError
from app.services.upload_service import UploadService
from app.services.video_service import VideoService
from app.services.video_pipeline import BUILTIN_MUSIC_TRACKS

router = APIRouter()
logger = logging.getLogger(__name__)
settings = get_settings()

REEL_PROMPT_TEMPLATES: dict[str, str] = {
    'History_POV': 'Use first-person historical POV with dramatic authenticity.',
    'Mythology_POV': 'Use first-person mythology POV with vivid emotional storytelling.',
    'Titanic_POV': 'Use first-person Titanic-era POV with cinematic urgency and detail.',
    'Roman_Soldier_POV': 'Use first-person Roman soldier POV with tactical and emotional realism.',
    'Historical_Fact_Reel': 'Use concise fact-led reel style with clear, surprising insight.',
}


def _build_reel_prompt(payload: ReelScriptRequest) -> str:
    template_style = REEL_PROMPT_TEMPLATES[payload.templateId]
    return f"""
You are a specialized AI script writer trained to generate structured short-form social media reels for creators.

Template style:
{template_style}

Return valid JSON only with exactly these keys:
{{
  "hook": string,
  "body_lines": string[],
  "cta": string,
  "caption": string,
  "hashtags": string[]
}}

Rules:
1) hook is a dynamic 1-3 second opening line.
2) body_lines must be short punchy lines, each around 6-10 words.
3) cta must be creator-focused.
4) caption must summarize the reel theme.
5) hashtags must contain 3-6 relevant items.
6) Follow template style and requested tone/language exactly.
7) Do not include markdown or extra commentary.

INPUT:
Topic: {payload.topic}
Template: {payload.templateId}
Tone: {payload.tone}
Language: {payload.language}
""".strip()


def _extract_json_payload(value: str) -> dict:
    raw = value.strip()
    if raw.startswith('```'):
        raw = raw.strip('`')
        if raw.lower().startswith('json'):
            raw = raw[4:].strip()

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        start = raw.find('{')
        end = raw.rfind('}')
        if start == -1 or end == -1 or end <= start:
            raise
        data = json.loads(raw[start:end + 1])

    if not isinstance(data, dict):
        raise ValueError('Model response must be a JSON object.')
    return data


def _to_video_response(video) -> VideoResponse:
    image_urls: list[str] = []
    reference_images: list[str] = []
    try:
        image_urls = json.loads(video.image_urls or '[]')
    except json.JSONDecodeError:
        image_urls = []
    try:
        reference_images = json.loads(video.reference_images or '[]')
    except json.JSONDecodeError:
        reference_images = []
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
        selected_model=video.selected_model,
        reference_images=reference_images,
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


@router.post('/ai/reel-script', response_model=ReelScriptResponse)
def generate_reel_script(
    payload: ReelScriptRequest,
    _: str = Depends(get_user_id),
):
    prompt = _build_reel_prompt(payload)
    try:
        if not settings.openai_api_key:
            raise HTTPException(status_code=500, detail='OPENAI_API_KEY is not configured in apps/api/.env')

        client = OpenAI(api_key=settings.openai_api_key)
        response = client.chat.completions.create(
            model=settings.openai_model,
            temperature=0.7,
            response_format={'type': 'json_object'},
            messages=[
                {'role': 'system', 'content': 'Output valid JSON only.'},
                {'role': 'user', 'content': prompt},
            ],
        )
        content = response.choices[0].message.content or '{}'
        parsed = _extract_json_payload(content)
        result = ReelScriptResponse.model_validate(parsed)
        logger.info(
            'reel_script_generated',
            extra={
                'request_id': get_request_id(),
                'template_id': payload.templateId,
                'language': payload.language,
            },
        )
        return result
    except ValidationError as exc:
        logger.warning(
            'reel_script_validation_failed',
            extra={'request_id': get_request_id(), 'error': str(exc)},
        )
        raise HTTPException(status_code=422, detail='Generated script format is invalid') from exc
    except json.JSONDecodeError as exc:
        logger.warning(
            'reel_script_json_parse_failed',
            extra={'request_id': get_request_id(), 'error': str(exc)},
        )
        raise HTTPException(status_code=502, detail='AI response was not valid JSON') from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(
            'reel_script_generation_failed',
            extra={'request_id': get_request_id(), 'error': str(exc)},
        )
        detail = str(exc).strip() or 'Failed to generate reel script'
        if settings.env != 'development':
            detail = 'Failed to generate reel script'
        raise HTTPException(status_code=500, detail=detail) from exc


@router.post('/ai/video/generate', response_model=AIVideoGenerateResponse)
def generate_ai_video(
    payload: AIVideoGenerateRequest,
    _: str = Depends(get_user_id),
):
    try:
        orchestrator = AIVideoOrchestrator(settings)
        result = orchestrator.generate(payload.model_dump())
        logger.info(
            'ai_video_generated',
            extra={
                'request_id': get_request_id(),
                'provider': result.provider,
                'template_id': payload.templateId,
            },
        )
        return AIVideoGenerateResponse(
            videoUrl=result.video_url,
            provider=result.provider,
            duration=result.duration,
            quality=result.quality,
        )
    except ProviderError as exc:
        logger.warning(
            'ai_video_provider_error',
            extra={'request_id': get_request_id(), 'error': str(exc), 'provider': payload.selectedModel},
        )
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception(
            'ai_video_generation_failed',
            extra={'request_id': get_request_id(), 'error': str(exc), 'provider': payload.selectedModel},
        )
        detail = str(exc).strip() or 'Failed to generate AI video'
        if settings.env != 'development':
            detail = 'Failed to generate AI video'
        raise HTTPException(status_code=500, detail=detail) from exc


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
    selected_model: str | None = Form(default=None),
    reference_images: list[str] = Form(default=[]),
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
            selected_model=selected_model,
            reference_images=reference_images,
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
