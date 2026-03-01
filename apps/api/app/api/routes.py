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
from app.schemas.ai import (
    AIVideoCreateRequest,
    AIVideoCreateResponse,
    AIVideoGenerateRequest,
    AIVideoGenerateResponse,
    AIVideoModelResponse,
    AIVideoStatusResponse,
    ReelScriptRequest,
    ReelScriptResponse,
    ScriptEnhanceRequest,
    ScriptGenerateRequest,
    ScriptTagsRequest,
    ScriptTranslateRequest,
    ScriptResponse,
    TextResponse,
)
from app.schemas.asset import AssetSearchResponse, AssetSearchResponseItem, AssetTagFacet, AssetTagUpdateRequest
from app.schemas.auth import MockLoginRequest, MockLoginResponse, MockSignupRequest, MockSignupResponse
from app.schemas.catalog import AvatarResponse, TemplateResponse
from app.schemas.image_generation import (
    ImageActionRequest,
    ImageActionResponse,
    ImageGenerationCreateRequest,
    ImageGenerationResponse,
    ImageModelResponse,
    ImagePromptEnhanceRequest,
    ImagePromptEnhanceResponse,
    InspirationImageResponse,
)
from app.schemas.project import (
    CreateProjectAssetRequest,
    CreateProjectRequest,
    ProjectAssetResponse,
    ProjectResponse,
    UpdateProjectRequest,
)
from app.schemas.render import CreateRenderRequest, RenderResponse
from app.schemas.upload import UploadDeleteResponse, UploadSignRequest, UploadSignResponse
from app.schemas.user import UserAvatarUploadResponse, UserProfileResponse, UserProfileUpdateRequest, UserSettingsResponse, UserSettingsUpdateRequest
from app.schemas.video import MusicTrackResponse, VideoCreateResponse, VideoResponse, VideoRetryResponse
from app.schemas.tts import TTSCatalogResponse, TTSLanguageOptionResponse, TTSPreviewRequest, TTSPreviewResponse, TTSVoiceOptionResponse
from app.services.avatar_service import AvatarService
from app.services.auth_service import AuthService
from app.services.image_generation_service import ImageGenerationService
from app.services.project_service import ProjectService
from app.services.render_service import RenderService
from app.services.template_service import TemplateService
from app.services.ai_video_service import AIVideoCreateService, ProviderError
from app.services.asset_search_service import AssetSearchService
from app.services.asset_tagging_service import AssetTaggingService
from app.services.upload_service import UploadService
from app.services.user_service import UserService
from app.services.video_service import VideoService
from app.services.video_pipeline import BUILTIN_MUSIC_TRACKS
from app.services.tts import (
    PREVIEW_MAX_CHARS,
    PREVIEW_MAX_REQUESTS_PER_WINDOW,
    PREVIEW_WINDOW_SECONDS,
    assert_preview_rate_limit,
    generate_voiceover,
    generate_voiceover_detailed,
    get_cached_voiceover_detailed,
    list_tts_languages,
    list_tts_voices,
)

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


def _to_video_response(video, db: Session) -> VideoResponse:
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
    asset_tagging = AssetTaggingService(db)
    auto_tags, user_tags = asset_tagging.list_tags(video.id, 'video')
    return VideoResponse(
        id=video.id,
        user_id=video.user_id,
        title=video.title,
        template=video.template,
        language=video.language,
        script=video.script,
        voice=video.voice,
        aspect_ratio=video.aspect_ratio or '9:16',
        resolution=video.resolution or '1080p',
        duration_mode=video.duration_mode or 'auto',
        duration_seconds=video.duration_seconds,
        captions_enabled=bool(video.captions_enabled) if video.captions_enabled is not None else True,
        caption_style=video.caption_style,
        audio_sample_rate_hz=video.audio_sample_rate_hz,
        status=video.status.value if hasattr(video.status, 'value') else str(video.status),
        progress=video.progress,
        image_urls=image_urls,
        selected_model=video.selected_model,
        provider_name=video.provider_name,
        source_image_url=video.source_image_url,
        reference_images=reference_images,
        music_mode=video.music_mode,
        music_track_id=video.music_track_id,
        music_file_url=video.music_file_url,
        music_volume=video.music_volume,
        duck_music=video.duck_music,
        thumbnail_url=video.thumbnail_url,
        output_url=video.output_url,
        error_message=video.error_message,
        auto_tags=auto_tags,
        user_tags=user_tags,
        created_at=video.created_at,
        updated_at=video.updated_at,
    )


def _to_image_generation_response(generation, db: Session) -> ImageGenerationResponse:
    reference_urls: list[str] = []
    try:
        reference_urls = json.loads(generation.reference_urls or '[]')
    except json.JSONDecodeError:
        reference_urls = []
    asset_tagging = AssetTaggingService(db)
    auto_tags, user_tags = asset_tagging.list_tags(generation.id, 'image')

    return ImageGenerationResponse(
        id=generation.id,
        parent_image_id=generation.parent_image_id,
        model_key=generation.model_key,
        prompt=generation.prompt,
        aspect_ratio=generation.aspect_ratio,
        resolution=generation.resolution,
        reference_urls=reference_urls,
        image_url=generation.image_url,
        thumbnail_url=generation.thumbnail_url,
        action_type=generation.action_type,
        status=generation.status.value if hasattr(generation.status, 'value') else str(generation.status),
        auto_tags=auto_tags,
        user_tags=user_tags,
        created_at=generation.created_at,
    )


def _to_user_profile_response(user) -> UserProfileResponse:
    return UserProfileResponse(
        id=user.id,
        display_name=user.display_name,
        email=user.email,
        phone=user.phone,
        avatar_url=user.avatar_url,
        bio=user.bio,
        company=user.company,
        address_line1=user.address_line1,
        address_line2=user.address_line2,
        city=user.city,
        state=user.state,
        country=user.country,
        postal_code=user.postal_code,
        timezone=user.timezone,
        created_at=user.created_at.isoformat(),
    )


def _to_user_settings_response(user) -> UserSettingsResponse:
    return UserSettingsResponse(
        id=user.id,
        default_language=user.default_language,
        default_voice=user.default_voice,
        default_aspect_ratio=user.default_aspect_ratio,
        email_notifications=bool(user.email_notifications),
        marketing_emails=bool(user.marketing_emails),
        auto_caption_default=bool(user.auto_caption_default),
        music_ducking_default=bool(user.music_ducking_default),
    )


@router.get('/health')
async def health() -> dict[str, str]:
    return {'status': 'ok'}


@router.get('/me/profile', response_model=UserProfileResponse)
def get_my_profile(
    user_id: str = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    service = UserService(db)
    try:
        return _to_user_profile_response(service.get_user(user_id))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.put('/me/profile', response_model=UserProfileResponse)
def update_my_profile(
    payload: UserProfileUpdateRequest,
    user_id: str = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    service = UserService(db)
    try:
        user = service.update_profile(
            user_id,
            display_name=payload.display_name.strip(),
            email=payload.email.strip() if payload.email else None,
            phone=payload.phone.strip() if payload.phone else None,
            bio=payload.bio.strip() if payload.bio else None,
            company=payload.company.strip() if payload.company else None,
            address_line1=payload.address_line1.strip() if payload.address_line1 else None,
            address_line2=payload.address_line2.strip() if payload.address_line2 else None,
            city=payload.city.strip() if payload.city else None,
            state=payload.state.strip() if payload.state else None,
            country=payload.country.strip() if payload.country else None,
            postal_code=payload.postal_code.strip() if payload.postal_code else None,
            timezone=payload.timezone.strip() if payload.timezone else None,
        )
        return _to_user_profile_response(user)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post('/me/avatar', response_model=UserAvatarUploadResponse)
async def upload_my_avatar(
    avatar: UploadFile = File(...),
    user_id: str = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    if not avatar.content_type or not avatar.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail='Avatar must be an image file')
    service = UserService(db)
    try:
        user = service.save_avatar(user_id, avatar.filename or 'avatar.png', avatar.file)
        return UserAvatarUploadResponse(avatar_url=str(user.avatar_url))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get('/me/settings', response_model=UserSettingsResponse)
def get_my_settings(
    user_id: str = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    service = UserService(db)
    try:
        return _to_user_settings_response(service.get_user(user_id))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.put('/me/settings', response_model=UserSettingsResponse)
def update_my_settings(
    payload: UserSettingsUpdateRequest,
    user_id: str = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    service = UserService(db)
    try:
        user = service.update_settings(
            user_id,
            default_language=payload.default_language,
            default_voice=payload.default_voice,
            default_aspect_ratio=payload.default_aspect_ratio,
            email_notifications=payload.email_notifications,
            marketing_emails=payload.marketing_emails,
            auto_caption_default=payload.auto_caption_default,
            music_ducking_default=payload.music_ducking_default,
        )
        return _to_user_settings_response(user)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post('/api/ai/script/generate', response_model=ScriptResponse)
def generate_script_v2(
    payload: ScriptGenerateRequest,
    _: str = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    prompt = (
        f'Write a short creator-ready video script for template {payload.template}. '
        f'Topic: {payload.topic}. Language: {payload.language}. '
        'Return only the script text.'
    )
    script_text = ''
    if settings.openai_api_key:
        client = OpenAI(api_key=settings.openai_api_key)
        response = client.chat.completions.create(
            model=settings.openai_model,
            temperature=0.7,
            messages=[
                {'role': 'system', 'content': 'Write concise creator-ready video scripts.'},
                {'role': 'user', 'content': prompt},
            ],
        )
        script_text = (response.choices[0].message.content or '').strip()
    if not script_text:
        script_text = f'{payload.topic}. Start with a sharp hook, explain the core idea, and close with a memorable CTA.'
    tags = AssetTaggingService(db).tag_script(script_text)
    return ScriptResponse(script=script_text, tags=tags)


@router.post('/api/ai/script/enhance', response_model=ScriptResponse)
def enhance_script_v2(
    payload: ScriptEnhanceRequest,
    _: str = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    prompt = (
        f'Enhance this video script for clarity, flow, and stronger storytelling. '
        f'Template: {payload.template or "general"}. Language: {payload.language}. '
        f'Script: {payload.script}'
    )
    script_text = ''
    if settings.openai_api_key:
        client = OpenAI(api_key=settings.openai_api_key)
        response = client.chat.completions.create(
            model=settings.openai_model,
            temperature=0.5,
            messages=[
                {'role': 'system', 'content': 'Improve creator video scripts without changing the core meaning.'},
                {'role': 'user', 'content': prompt},
            ],
        )
        script_text = (response.choices[0].message.content or '').strip()
    if not script_text:
        script_text = payload.script
    tags = AssetTaggingService(db).tag_script(script_text)
    return ScriptResponse(script=script_text, tags=tags)


@router.post('/api/ai/script/tags', response_model=ScriptResponse)
def extract_script_tags_v2(
    payload: ScriptTagsRequest,
    _: str = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    tags = AssetTaggingService(db).tag_script(payload.script)
    return ScriptResponse(script=payload.script, tags=tags)


@router.post('/api/ai/script/translate', response_model=TextResponse)
def translate_script_text_v2(
    payload: ScriptTranslateRequest,
    _: str = Depends(get_user_id),
):
    translated_text = ''
    if settings.openai_api_key:
        client = OpenAI(api_key=settings.openai_api_key)
        response = client.chat.completions.create(
            model=settings.openai_model,
            temperature=0.2,
            messages=[
                {
                    'role': 'system',
                    'content': 'Translate the provided text accurately into the requested target language. Return only the translated text with no explanation.',
                },
                {
                    'role': 'user',
                    'content': f'Target language: {payload.target_language}\n\nText:\n{payload.text}',
                },
            ],
        )
        translated_text = (response.choices[0].message.content or '').strip()
    if not translated_text:
        translated_text = payload.text
    return TextResponse(text=translated_text)


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
    user_id: str = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    try:
        service = AIVideoCreateService(db, settings)
        video = service.create_video(
            user_id=user_id,
            template=payload.templateId,
            language=payload.language,
            image_urls=payload.referenceImages[:1],
            script=f'{payload.topic}. Tone: {payload.tone}. Language: {payload.language}.',
            tags=[],
            model_key=payload.selectedModel,
            aspect_ratio='9:16',
            resolution='1080p',
            duration_mode='custom',
            duration_seconds=8,
            voice=payload.voice or 'Shubh',
            music={'type': 'none', 'url': None},
            audio_settings={'volume': 20, 'ducking': True},
            captions_enabled=True,
        )
        logger.info(
            'ai_video_generated',
            extra={
                'request_id': get_request_id(),
                'provider': video.provider_name,
                'template_id': payload.templateId,
            },
        )
        return AIVideoGenerateResponse(
            videoUrl=video.output_url or '',
            provider=video.provider_name or payload.selectedModel,
            duration=video.duration_seconds or 8,
            quality=video.resolution,
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


@router.get('/ai/video/models', response_model=list[AIVideoModelResponse])
@router.get('/api/ai/video/models', response_model=list[AIVideoModelResponse], include_in_schema=False)
@router.get('/api/video/models', response_model=list[AIVideoModelResponse], include_in_schema=False)
def list_ai_video_models(_: str = Depends(get_user_id), db: Session = Depends(get_db)):
    service = AIVideoCreateService(db, settings)
    return [
        AIVideoModelResponse(
            key=model.key,
            label=model.label,
            description=model.description,
            frontendHint=model.frontend_hint,
            apiAdapter=model.api_adapter,
        )
        for model in service.list_models()
    ]


@router.post('/ai/video/create', response_model=AIVideoCreateResponse)
@router.post('/api/ai/video/create', response_model=AIVideoCreateResponse, include_in_schema=False)
def create_ai_video(
    payload: AIVideoCreateRequest,
    user_id: str = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    try:
        service = AIVideoCreateService(db, settings)
        video = service.create_video(
            user_id=user_id,
            template=payload.template,
            language=payload.language,
            image_urls=payload.imageUrls,
            script=payload.script,
            tags=payload.tags,
            model_key=payload.modelKey,
            aspect_ratio=payload.aspectRatio,
            resolution=payload.resolution,
            duration_mode=payload.durationMode,
            duration_seconds=payload.durationSeconds,
            voice=payload.voice,
            music=payload.music.model_dump(),
            audio_settings=payload.audioSettings.model_dump(),
            captions_enabled=payload.captionsEnabled,
            caption_style=payload.captionStyle,
        )
        logger.info(
            'ai_video_created',
            extra={
                'request_id': get_request_id(),
                'provider': video.provider_name,
                'model_key': video.selected_model,
            },
        )
        return AIVideoCreateResponse(
            id=video.id,
            status='queued',
            videoUrl=video.output_url,
            provider=video.provider_name,
            modelKey=payload.modelKey,
        )
    except ProviderError as exc:
        logger.warning(
            'ai_video_create_provider_error',
            extra={'request_id': get_request_id(), 'error': str(exc), 'model_key': payload.modelKey},
        )
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception(
            'ai_video_create_failed',
            extra={'request_id': get_request_id(), 'error': str(exc), 'model_key': payload.modelKey},
        )
        detail = str(exc).strip() or 'Failed to create AI video'
        if settings.env != 'development':
            detail = 'Failed to create AI video'
        raise HTTPException(status_code=500, detail=detail) from exc


@router.get('/api/ai/video/status/{video_id}', response_model=AIVideoStatusResponse)
def get_ai_video_status(
    video_id: str,
    user_id: str = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    service = AIVideoCreateService(db, settings)
    video = service.get_video(video_id, user_id)
    if not video:
        raise HTTPException(status_code=404, detail='Video job not found')
    auto_tags, user_tags = AssetTaggingService(db).list_tags(video.id, 'video')
    status_value = video.status.value if hasattr(video.status, 'value') else str(video.status)
    mapped_status = 'success' if status_value == 'completed' else 'failed' if status_value == 'failed' else 'processing'
    return AIVideoStatusResponse(
        id=video.id,
        status='queued' if status_value == 'draft' else mapped_status,
        videoUrl=video.output_url,
        modelKey=video.selected_model,
        modelLabel=video.provider_name,
        provider=video.provider_name,
        resolution=video.resolution,
        aspectRatio=video.aspect_ratio,
        durationSeconds=video.duration_seconds,
        tags=[*auto_tags, *user_tags],
        errorMessage=video.error_message,
        thumbnailUrl=video.thumbnail_url,
    )


@router.get('/ai/image/models', response_model=list[ImageModelResponse])
def list_ai_image_models(
    _: str = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    service = ImageGenerationService(db)
    return [
        ImageModelResponse(
            key=model.key,
            label=model.label,
            description=model.description,
            frontend_hint=model.frontend_hint,
        )
        for model in service.list_models()
    ]


@router.get('/ai/images', response_model=list[ImageGenerationResponse])
def list_ai_images(
    user_id: str = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    service = ImageGenerationService(db)
    return [_to_image_generation_response(item, db) for item in service.list_user_images(user_id)]


@router.get('/ai/images/inspiration', response_model=list[InspirationImageResponse])
def list_ai_image_inspiration(
    _: str = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    service = ImageGenerationService(db)
    return [InspirationImageResponse.model_validate(item) for item in service.list_inspiration()]


@router.get('/assets/tags', response_model=list[AssetTagFacet])
def list_asset_tags(
    query: str | None = None,
    content_type: str | None = None,
    user_id: str = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    service = AssetSearchService(db)
    facets = service.list_tag_facets(user_id=user_id, content_type=content_type, query=query)
    return [AssetTagFacet(tag=tag, count=count) for tag, count in facets]


@router.get('/assets/search', response_model=AssetSearchResponse)
def search_assets(
    query: str | None = None,
    tags: list[str] | None = None,
    models: list[str] | None = None,
    resolutions: list[str] | None = None,
    content_type: str | None = None,
    sort: str = 'newest',
    page: int = 1,
    page_size: int = 24,
    user_id: str = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    service = AssetSearchService(db)
    items, total = service.search_assets(
        user_id=user_id,
        query=query,
        tags=tags,
        models=models,
        resolutions=resolutions,
        content_type=content_type,
        sort=sort,
        page=page,
        page_size=page_size,
    )
    return AssetSearchResponse(
        items=[
            AssetSearchResponseItem(
                id=item.id,
                content_type=item.content_type,
                title=item.title,
                model_key=item.model_key,
                resolution=item.resolution,
                aspect_ratio=item.aspect_ratio,
                prompt=item.prompt,
                thumbnail_url=item.thumbnail_url,
                asset_url=item.asset_url,
                status=item.status,
                created_at=item.created_at,
                reference_urls=item.reference_urls,
                auto_tags=item.auto_tags,
                user_tags=item.user_tags,
            )
            for item in items
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.put('/assets/{content_type}/{asset_id}/tags')
def update_asset_tags(
    content_type: str,
    asset_id: str,
    payload: AssetTagUpdateRequest,
    user_id: str = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    if content_type not in {'image', 'video'}:
        raise HTTPException(status_code=400, detail='content_type must be image or video')
    if content_type == 'image':
        image = ImageGenerationService(db).repo.get_by_id(asset_id)
        if not image or image.user_id != user_id:
            raise HTTPException(status_code=404, detail='Image not found')
    else:
        video = VideoService(db).get_video(asset_id, user_id)
        if not video:
            raise HTTPException(status_code=404, detail='Video not found')
    service = AssetTaggingService(db)
    auto_tags, user_tags = service.replace_user_tags(asset_id=asset_id, asset_type=content_type, tags=payload.user_tags)
    return {'asset_id': asset_id, 'content_type': content_type, 'auto_tags': auto_tags, 'user_tags': user_tags}


@router.post('/ai/image/generate', response_model=ImageGenerationResponse)
def generate_ai_image(
    payload: ImageGenerationCreateRequest,
    user_id: str = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    service = ImageGenerationService(db)
    try:
        generation = service.create_image(
            user_id=user_id,
            model_key=payload.model_key,
            prompt=payload.prompt,
            aspect_ratio=payload.aspect_ratio,
            resolution=payload.resolution,
            reference_urls=payload.reference_urls,
        )
        return _to_image_generation_response(generation, db)
    except Exception as exc:
        logger.exception(
            'image_generation_failed',
            extra={'request_id': get_request_id(), 'model_key': payload.model_key, 'error': str(exc)},
        )
        detail = str(exc).strip() or 'Failed to generate image'
        if settings.env != 'development':
            detail = 'Failed to generate image'
        raise HTTPException(status_code=500, detail=detail) from exc


@router.post('/ai/image/prompt-enhance', response_model=ImagePromptEnhanceResponse)
def enhance_ai_image_prompt(
    payload: ImagePromptEnhanceRequest,
    _: str = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    service = ImageGenerationService(db)
    return ImagePromptEnhanceResponse(prompt=service.enhance_prompt(payload.prompt, payload.model_key))


@router.post('/ai/images/action', response_model=ImageActionResponse)
def apply_ai_image_action(
    payload: ImageActionRequest,
    user_id: str = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    service = ImageGenerationService(db)
    try:
        results = service.apply_action(user_id=user_id, generation_id=payload.image_id, action=payload.action_type)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return ImageActionResponse(
        action_type=payload.action_type,
        items=[_to_image_generation_response(item, db) for item in results],
    )


@router.post('/ai/images/{image_id}/action', response_model=ImageGenerationResponse)
def apply_ai_image_action_legacy(
    image_id: str,
    payload: dict,
    user_id: str = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    action_type = str(payload.get('action') or payload.get('action_type') or '').strip()
    if not action_type:
        raise HTTPException(status_code=422, detail='action is required')
    service = ImageGenerationService(db)
    try:
        results = service.apply_action(user_id=user_id, generation_id=image_id, action=action_type)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return _to_image_generation_response(results[0], db)


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
    return [_to_video_response(video, db) for video in videos]


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


@router.get('/tts/catalog', response_model=TTSCatalogResponse)
def get_tts_catalog(_: str = Depends(get_user_id)) -> TTSCatalogResponse:
    return TTSCatalogResponse(
        provider='sarvam',
        model=settings.sarvam_model,
        languages=[
            TTSLanguageOptionResponse(code=item.code, label=item.label, native_label=item.native_label)
            for item in list_tts_languages()
        ],
        voices=[
            TTSVoiceOptionResponse(
                key=item.key,
                label=item.label,
                tone=item.tone,
                gender=item.gender,
                provider_voice=item.provider_voice,
                supported_language_codes=list(item.supported_language_codes),
                description=item.description,
            )
            for item in list_tts_voices()
        ],
    )


@router.post('/tts/preview', response_model=TTSPreviewResponse)
def generate_tts_preview(
    payload: TTSPreviewRequest,
    user_id: str = Depends(get_user_id),
) -> TTSPreviewResponse:
    preview_text = payload.text.strip()[:PREVIEW_MAX_CHARS]
    cache_dir = Path('data/tts_cache')
    cached = get_cached_voiceover_detailed(
        script=preview_text,
        voice=payload.voice,
        cache_dir=cache_dir,
        language=payload.language,
        sample_rate_hz=payload.sample_rate_hz,
    )
    if cached:
        result = cached
    else:
        try:
            assert_preview_rate_limit(user_id)
        except RuntimeError as exc:
            raise HTTPException(
                status_code=429,
                detail=f'{exc} Limit: {PREVIEW_MAX_REQUESTS_PER_WINDOW} previews every {PREVIEW_WINDOW_SECONDS // 60} minutes.',
            ) from exc
        result = generate_voiceover_detailed(
            script=preview_text,
            voice=payload.voice,
            cache_dir=cache_dir,
            language=payload.language,
            sample_rate_hz=payload.sample_rate_hz,
        )
    preview_url = f"/static/{result.path.as_posix().replace('data/', '', 1)}"
    return TTSPreviewResponse(
        preview_url=preview_url,
        provider=result.provider,
        resolved_voice=result.resolved_voice,
        cached=result.cached,
        preview_limit=f'{PREVIEW_MAX_REQUESTS_PER_WINDOW} uncached previews / {PREVIEW_WINDOW_SECONDS // 60} min · {PREVIEW_MAX_CHARS} chars max',
        provider_message=result.provider_message,
    )


@router.post('/videos', response_model=VideoCreateResponse, status_code=status.HTTP_202_ACCEPTED)
async def create_video(
    script: str = Form(default=''),
    language: str = Form(default='English'),
    voice: str = Form(default='Shubh'),
    title: str | None = Form(default=None),
    aspect_ratio: str = Form(default='9:16'),
    resolution: str = Form(default='1080p'),
    duration_mode: str = Form(default='auto'),
    duration_seconds: int | None = Form(default=None),
    captions_enabled: bool = Form(default=True),
    audio_sample_rate_hz: int = Form(default=22050),
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
            language=language,
            voice=voice,
            images=images,
            title=title,
            aspect_ratio=aspect_ratio,
            resolution=resolution,
            duration_mode=duration_mode,
            duration_seconds=duration_seconds,
            captions_enabled=captions_enabled,
            audio_sample_rate_hz=audio_sample_rate_hz,
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
    return _to_video_response(video, db)


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
