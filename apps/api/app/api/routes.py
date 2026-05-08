import logging
import json
import hashlib
import re
from datetime import UTC, datetime
from pathlib import Path
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile, status
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy.orm import Session

from typing import Any

from firebase_admin import firestore
from app.api.deps import get_user_id, require_admin_user
from app.core.config import get_settings
from app.core.request_context import get_request_id
from app.db.repositories.image_generation_repository import ImageGenerationRepository
from app.db.repositories.video_repository import VideoRepository
from app.db.session import get_db
from app.models.entities import ImageGenerationStatus
from app.schemas.ai import (
    AIVideoCreateRequest,
    AIVideoCreateResponse,
    AIVideoModelResponse,
    AIVideoStatusResponse,
    AvatarProductAssistRequest,
    AvatarProductAssistResponse,
    ReelScriptRequest,
    ReelScriptResponse,
    ScriptEnhanceRequest,
    ScriptGenerateRequest,
    ScriptTagsRequest,
    ScriptTranslateRequest,
    ScriptResponse,
    TextResponse,
    VideoStudioChatRequest,
    VideoStudioChatResponse,
)
from app.schemas.asset import (
    AssetSearchResponse,
    AssetSearchResponseItem,
    AssetTagFacet,
    AssetTagUpdateRequest,
    InspirationLikeRequest,
    InspirationLikeResponse,
    InspirationPublishRequest,
    InspirationPublishResponse,
)
from app.schemas.auth import MockLoginRequest, MockLoginResponse, MockSignupRequest, MockSignupResponse
from app.schemas.catalog import RecipeCatalogResponse, TemplateResponse
from app.schemas.template_management import (
    TemplateGenerateRequest,
    TemplateGenerateResponse,
    TemplatePreviewResponse,
    TemplateStatusUpdateRequest,
    TemplateUpsertRequest,
    UnifiedTemplateResponse,
)
from app.schemas.credit import (
    CreditTopUpOrderRequest,
    CreditTopUpOrderResponse,
    CreditTopUpVerifyRequest,
    CreditBreakdownItem,
    CreditHistoryItemResponse,
    CreditHistoryResponse,
    CreditWalletResponse,
    EstimateCreditsRequest,
    EstimateCreditsResponse,
    PricingResponse,
    TopUpCreditsRequest,
    TopUpCreditsResponse,
)
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
from app.schemas.influencer import (
    InfluencerContentGenerateRequest,
    InfluencerContentResponse,
    InfluencerImageGenerateRequest,
    InfluencerPersonaCreateRequest,
    InfluencerPersonaResponse,
    InfluencerPersonaUpdateRequest,
    InfluencerPoseOptionResponse,
    InfluencerReferenceLockResponse,
    InfluencerScenePresetCreateRequest,
    InfluencerScenePresetResponse,
)
from app.schemas.project import (
    AssetProjectAssignmentResponse,
    AssignAssetProjectRequest,
    CreateProjectAssetRequest,
    CreateProjectRequest,
    ProjectAssetResponse,
    ProjectResponse,
    UpdateProjectRequest,
)
from app.schemas.render import CreateRenderRequest, RenderResponse
from app.schemas.upload import UploadDeleteResponse, UploadSignRequest, UploadSignResponse
from app.schemas.user import UserAvatarUploadResponse, UserBootstrapRequest, UserProfileResponse, UserProfileUpdateRequest, UserSettingsResponse, UserSettingsUpdateRequest
from app.schemas.video import InspirationVideoResponse, MusicTrackResponse, VideoCreateResponse, VideoResponse, VideoRetryRequest, VideoRetryResponse
from app.schemas.tts import TTSCatalogResponse, TTSLanguageOptionResponse, TTSPreviewRequest, TTSPreviewResponse, TTSVoiceOptionResponse
from app.services.auth_service import AuthService
from app.services.image_generation_service import ImageGenerationService
from app.services.influencer_service import InfluencerService
from app.services.inspiration_service import InspirationService
from app.services.project_service import ProjectService
from app.services.render_service import RenderService
from app.services.template_service import TemplateService
from app.services.template_management_service import TemplateManagementService
from app.services.ai_video_service import AIVideoCreateService, ProviderError, _launch_local_video_job
from app.services.asset_search_service import AssetSearchService
from app.services.asset_tagging_service import AssetTaggingService
from app.services.avatar_product_tts_catalog import (
    list_avatar_product_gemini_languages,
    list_avatar_product_gemini_voices,
    resolve_avatar_product_gemini_language,
)
from app.services.credit_service import CreditCapExceededError, CreditService, InsufficientCreditsError
from app.services.fal_video_service import FalVideoService
from app.services.model_registry import get_normal_video_family_definition
from app.services.pricing_service import PricingService
from app.services.upload_service import UploadService
from app.services.user_service import UserService
from app.services.video_service import VideoService
from app.services.video_pipeline import BUILTIN_MUSIC_TRACKS
from app.services.llm.qwen_service import QwenService
from app.services.video_studio_ai_service import VideoStudioAIService
from app.services.avatar_product_workflow_service import AvatarProductWorkflowService
from app.recipes.recipe_registry import (
    AnimeLofiPromptPackage,
    AnimeLofiQwenExpansion,
    build_ltx_recipe_request,
    build_explainer_recipe_request,
    build_normalized_video_payload,
    build_pixverse_anime_lofi_prompt_package,
    detect_video_intent_from_payload,
    get_recipe,
    list_recipes,
    maybe_should_use_explainer_recipe,
    normalize_explainer_video_request,
    recipe_pipeline_metadata,
    should_use_ltx_storyboard_recipe,
    validate_recipe_inputs,
)
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
from app.providers.firebase import get_firestore_client

router = APIRouter()
logger = logging.getLogger(__name__)
settings = get_settings()


class NotificationMetadataResponse(BaseModel):
    output_url: str | None = None
    thumbnail_url: str | None = None
    selected_model: str | None = None
    provider: str | None = None


class NotificationResponse(BaseModel):
    id: str
    user_id: str
    type: str
    title: str
    message: str
    video_id: str | None = None
    recipe_id: str | None = None
    read: bool = False
    created_at: datetime
    metadata: NotificationMetadataResponse = Field(default_factory=NotificationMetadataResponse)


class NotificationReadRequest(BaseModel):
    ids: list[str] = Field(default_factory=list)


def _summarize_video_create_payload(payload: AIVideoCreateRequest) -> dict[str, object]:
    if payload.recipeId:
        return {
            'recipe_id': payload.recipeId,
            'inputs': sorted(list((payload.inputs or {}).keys())),
        }
    return {
        'template': payload.template,
        'template_id': payload.templateId,
        'project_id': payload.projectId,
        'mode_id': payload.modeId,
        'model_key': payload.modelKey,
        'language': payload.language,
        'voice': payload.voice,
        'aspect_ratio': payload.aspectRatio,
        'resolution': payload.resolution,
        'quality': payload.quality,
        'duration_mode': payload.durationMode,
        'duration_seconds': payload.durationSeconds,
        'image_count': len(payload.imageUrls),
        'tags_count': len(payload.tags),
        'script_length': len(payload.script or ''),
        'music_type': payload.music.type,
        'captions_enabled': payload.captionsEnabled,
        'narration_enabled': payload.narrationEnabled,
        'caption_style': payload.captionStyle,
        'sample_rate_hz': payload.audioSettings.sampleRateHz,
    }


def _maybe_build_anime_lofi_prompt_package(
    *,
    normalized_inputs: dict[str, Any],
) -> tuple[AnimeLofiPromptPackage, dict[str, Any]]:
    motion = str(normalized_inputs.get('motion') or '').strip().lower()
    scene = str(normalized_inputs.get('scene') or '').strip().lower()
    vibe = str(normalized_inputs.get('vibe') or '').strip().lower()
    fallback_reason = 'curated_only'
    qwen_provider: str | None = None
    expansion: AnimeLofiQwenExpansion | None = None

    try:
        qwen_service = QwenService(settings)
        qwen_provider = qwen_service.provider_name()
        additional_rules = ''
        if motion == 'fly':
            additional_rules = (
                '\nFly-specific rules:\n'
                '- Emphasize altitude, open air, skyline, horizon, or airborne atmosphere\n'
                '- Do not focus on roads, trails, or terrain-travel details\n'
                '- Prefer aerial texture over ground texture'
            )
        expansion_response = qwen_service.complete_structured(
            task_type='anime_lofi_prompt_expansion',
            schema_model=AnimeLofiQwenExpansion,
            system_prompt=(
                'You expand anime reference-to-video prompts with short descriptive details only. '
                'Do not change the requested motion, scene class, subject identity, or reference token. '
                'Return concise production-safe phrases for environment flavor, atmosphere flavor, and camera texture.'
            ),
            user_prompt=(
                f'Motion: {motion}\n'
                f'Scene: {scene}\n'
                f'Vibe: {vibe}\n'
                'Return three short fields:\n'
                '- environment_flavor: small environment details only\n'
                '- atmosphere_flavor: light mood details only\n'
                '- camera_texture: subtle camera feel only\n'
                'Rules:\n'
                '- Do not mention @character\n'
                '- Do not add new actions\n'
                '- Do not contradict the motion\n'
                '- Keep each field short and concrete'
                f'{additional_rules}'
            ),
            temperature=0.35,
        )
        expansion = AnimeLofiQwenExpansion.model_validate(expansion_response)
        fallback_reason = 'qwen_enhanced'
    except Exception:
        logger.exception(
            'anime_lofi_qwen_expansion_failed',
            extra={'motion': motion, 'scene': scene, 'vibe': vibe},
        )

    prompt_package = build_pixverse_anime_lofi_prompt_package(
        motion=motion,
        scene=scene,
        vibe=vibe,
        expansion=expansion,
    )
    return prompt_package, {
        'qwen_provider': qwen_provider,
        'anime_prompt_fallback_mode': fallback_reason,
    }


def _normalize_family_quality(value: str | None) -> str:
    normalized = str(value or '').strip().lower()
    if normalized in {'premium', 'ultra_premium'}:
        return 'premium'
    if normalized in {'high', 'high_quality', 'pro'}:
        return 'high'
    return 'standard'


def _resolve_non_recipe_family_request(payload: AIVideoCreateRequest, normalized_payload: dict[str, Any]) -> dict[str, Any]:
    model_family = str(payload.modelFamily or normalized_payload.get('modelFamily') or '').strip().lower()
    if not model_family or payload.recipeId:
        return {}

    family = get_normal_video_family_definition(model_family)
    if family is None:
        raise HTTPException(status_code=422, detail=f'Unsupported modelFamily: {model_family}')

    image_urls = list(normalized_payload.get('imageUrls') or payload.imageUrls or [])
    generation_mode = str(payload.generationMode or normalized_payload.get('generationMode') or '').strip().lower()
    if generation_mode not in {'text_to_video', 'image_to_video'}:
        generation_mode = 'image_to_video' if image_urls else 'text_to_video'

    if generation_mode == 'image_to_video' and not family.supports_image_to_video:
        raise HTTPException(status_code=422, detail=f'{family.display_name} does not support image-to-video')
    if generation_mode == 'text_to_video' and not family.supports_text_to_video:
        raise HTTPException(status_code=422, detail=f'{family.display_name} does not support text-to-video')
    if generation_mode == 'image_to_video' and not image_urls:
        raise HTTPException(status_code=422, detail='An uploaded image is required for image-to-video')

    quality = _normalize_family_quality(str(normalized_payload.get('quality') or payload.quality or 'standard'))
    quality_keys = {str(entry.get('key')) for entry in family.supported_qualities}
    if quality not in quality_keys:
        raise HTTPException(status_code=422, detail=f'{family.display_name} does not support {quality} quality')

    supported_durations = {int(value) for value in family.supported_durations}
    duration_seconds = int(normalized_payload.get('durationSeconds') or payload.durationSeconds or 5)
    if duration_seconds not in supported_durations:
        raise HTTPException(
            status_code=422,
            detail=f'{family.display_name} supports only these durations: {", ".join(str(value) for value in sorted(supported_durations))}s',
        )

    route_key = family.provider_routes_by_generation_mode_and_quality.get(generation_mode, {}).get(quality)
    if not route_key:
        raise HTTPException(status_code=422, detail=f'{family.display_name} does not support {generation_mode} at {quality} quality')

    quality_entry = next((entry for entry in family.supported_qualities if str(entry.get('key')) == quality), None)
    resolution = str(
        normalized_payload.get('resolution')
        or (quality_entry or {}).get('resolution')
        or (family.supported_resolutions[0] if family.supported_resolutions else '720p')
    )

    requested_audio_mode = str(normalized_payload.get('audioMode') or payload.audioMode or '').strip().lower() or 'silent'
    native_audio_enabled = bool((normalized_payload.get('audioSettings') or {}).get('nativeAudioEnabled', payload.audioSettings.nativeAudioEnabled))
    if requested_audio_mode == 'auto_scene_sound':
        native_audio_enabled = True
    if requested_audio_mode == 'silent':
        native_audio_enabled = False
    if (requested_audio_mode == 'auto_scene_sound' or native_audio_enabled) and not family.supports_native_audio:
        raise HTTPException(status_code=422, detail='Auto scene sound is not available for this model')

    next_script = str(normalized_payload.get('script') or payload.script or '').strip()
    next_image_references = list(normalized_payload.get('imageReferences') or payload.imageReferences or [])
    if route_key == 'pixverse_c1_reference':
        if not next_image_references:
            primary_image_url = str(image_urls[0] or '').strip() if image_urls else ''
            if primary_image_url:
                next_image_references = [
                    {
                        'ref_name': 'subject',
                        'type': 'subject',
                        'image_url': primary_image_url,
                    }
                ]
        if '@subject' not in next_script.lower():
            next_script = f'@subject {next_script}'.strip()

    return {
        'modelFamily': family.key,
        'generationMode': generation_mode,
        'modelKey': route_key,
        'quality': quality,
        'resolution': resolution,
        'audioMode': 'auto_scene_sound' if native_audio_enabled else 'silent',
        'audioSettings': {
            **dict(normalized_payload.get('audioSettings') or payload.audioSettings.model_dump()),
            'nativeAudioEnabled': bool(native_audio_enabled and family.supports_native_audio),
        },
        'script': next_script,
        'imageReferences': next_image_references,
        'pipelineMetadataFamily': {
            'model_family': family.key,
            'generation_mode': generation_mode,
            'quality_profile': quality,
            'resolved_provider_route': route_key,
            'native_audio_supported': family.supports_native_audio,
            'native_audio_notes': family.native_audio_notes,
            'image_reference_count': len(next_image_references),
        },
    }

REEL_PROMPT_TEMPLATES: dict[str, str] = {
    'History_POV': 'Use first-person historical POV with dramatic authenticity.',
    'Mythology_POV': 'Use first-person mythology POV with vivid emotional storytelling.',
    'Titanic_POV': 'Use first-person Titanic-era POV with cinematic urgency and detail.',
    'Roman_Soldier_POV': 'Use first-person Roman soldier POV with tactical and emotional realism.',
    'Historical_Fact_Reel': 'Use concise fact-led reel style with clear, surprising insight.',
}


def _split_sentences(text: str) -> list[str]:
    return [part.strip() for part in re.split(r'(?<=[.!?।])\s+', text.strip()) if part.strip()]


def _estimate_script_word_budget(duration_seconds: int | None) -> tuple[int, int]:
    duration = max(5, min(int(duration_seconds or 12), 60))
    lower = max(24, duration * 4)
    upper = max(lower + 8, duration * 6)
    return lower, upper


def _script_context_lines(payload: ScriptGenerateRequest | ScriptEnhanceRequest) -> list[str]:
    lines: list[str] = []
    if payload.template:
        lines.append(f'Template: {payload.template}')
    if getattr(payload, 'tone', None):
        lines.append(f'Tone direction: {payload.tone}')
    if getattr(payload, 'scriptHint', None):
        lines.append(f'Creative brief: {payload.scriptHint}')
    if getattr(payload, 'topicHint', None):
        lines.append(f'Topic hint: {payload.topicHint}')
    if getattr(payload, 'lane', None):
        lines.append(f'Studio lane: {payload.lane}')
    if getattr(payload, 'modelLabel', None):
        lines.append(f'Preferred model: {payload.modelLabel}')
    elif getattr(payload, 'modelKey', None):
        lines.append(f'Preferred model key: {payload.modelKey}')
    if getattr(payload, 'aspectRatio', None):
        lines.append(f'Aspect ratio: {payload.aspectRatio}')
    if getattr(payload, 'resolution', None):
        lines.append(f'Resolution: {payload.resolution}')
    if getattr(payload, 'quality', None):
        lines.append(f'Quality target: {payload.quality}')
    if getattr(payload, 'durationSeconds', None):
        lines.append(f'Duration target: {payload.durationSeconds} seconds')
    lines.append(
        'Narration: '
        + ('enabled' if bool(getattr(payload, 'narrationEnabled', True)) else 'disabled, so keep visual beats self-sufficient without relying on spoken audio')
    )
    lines.append(
        'Captions: '
        + ('enabled, so wording can support readable overlays' if bool(getattr(payload, 'captionsEnabled', False)) else 'disabled, so the script should stay visually clear even without on-screen text')
    )
    return lines


def _build_structured_script_fallback(
    *,
    topic: str,
    template: str,
    language: str,
    source_script: str | None = None,
    tone: str | None = None,
    duration_seconds: int | None = None,
) -> str:
    base_lines = _split_sentences(source_script or '')
    if not base_lines:
        base_lines = [
            f'{topic} is the core focus of this story.',
            'Show the core pain point clearly.',
            'Reveal the practical solution in simple language.',
            'Close with a strong and actionable call to action.',
        ]
    while len(base_lines) < 4:
        base_lines.append(base_lines[-1])
    scene_lines = base_lines[:4]
    tone_label = tone or 'clear and engaging'
    lower_words, upper_words = _estimate_script_word_budget(duration_seconds)
    return (
        f"[Opening shot: Cinematic hook visual aligned with {template}]\n"
        f"Narrator ({tone_label}): \"{scene_lines[0]}\"\n"
        "Opening cue: Start with a smooth visual lead-in, not an abrupt first frame.\n\n"
        f"[Scene 1: Context and problem framing]\n"
        f"Narrator: \"{scene_lines[1]}\"\n"
        "Visual cue: Show the real-world setup and the user pain.\n"
        "Camera cue: Smooth push-in with medium close-up.\n"
        "Mood cue: Urgent but hopeful.\n\n"
        f"[Scene 2: Solution reveal and explanation]\n"
        f"Narrator: \"{scene_lines[2]}\"\n"
        "Visual cue: Demonstrate how the workflow/product solves the problem.\n"
        "Camera cue: Alternating wide + UI close-up shots.\n"
        "Mood cue: Confident and premium.\n\n"
        f"[Scene 3: Outcome and transformation]\n"
        f"Narrator: \"{scene_lines[3]}\"\n"
        "Visual cue: Before/after proof, engagement, and positive reaction.\n"
        "Camera cue: Dynamic cuts with gentle motion.\n"
        "Mood cue: Inspiring and uplifting.\n\n"
        "[Closing shot: Brand lockup with clear end frame]\n"
        "Narrator: \"Follow for more creator-ready videos and start creating now.\"\n"
        "Ending cue: Hold the final frame briefly or ease out naturally so the outro does not feel abrupt.\n"
        f"Language note: Keep narration natural in {language}. Approximate total spoken length: {lower_words}-{upper_words} words."
    )


def _script_has_quality_baseline(script_text: str) -> bool:
    normalized = script_text.lower()
    has_structure = all(
        marker in normalized
        for marker in [
            '[opening shot:',
            '[scene 1:',
            '[scene 2:',
            '[scene 3:',
            '[closing shot:',
            'opening cue:',
            'visual cue:',
            'camera cue:',
            'mood cue:',
            'ending cue:',
        ]
    )
    has_cta = any(
        phrase in normalized
        for phrase in [' follow', ' shop', ' book', ' download', ' subscribe', ' start', ' try', ' learn more', 'cta']
    )
    return has_structure and has_cta


def _normalize_script_output(
    *,
    script_text: str,
    topic: str,
    template: str,
    language: str,
    tone: str | None,
    duration_seconds: int | None,
) -> str:
    cleaned = script_text.strip()
    if cleaned.startswith('```'):
        cleaned = re.sub(r'^\s*```[a-zA-Z0-9_-]*\s*', '', cleaned)
        cleaned = re.sub(r'\s*```\s*$', '', cleaned).strip()

    opening_matches = list(re.finditer(r'(?im)^\[opening shot:', cleaned))
    if len(opening_matches) > 1:
        logger.info('ai_script_duplicate_opening_trimmed', extra={'duplicate_count': len(opening_matches)})
        cleaned = cleaned[:opening_matches[1].start()].strip()

    blocks = [block.strip() for block in re.split(r'\n{2,}', cleaned) if block.strip()]
    deduped_blocks: list[str] = []
    seen_blocks: set[str] = set()
    for block in blocks:
        key = re.sub(r'\s+', ' ', block).strip().lower()
        if key in seen_blocks:
            continue
        seen_blocks.add(key)
        deduped_blocks.append(block)
    cleaned = '\n\n'.join(deduped_blocks).strip()

    if not _script_has_quality_baseline(cleaned):
        logger.info(
            'ai_script_normalized_to_structured_fallback',
            extra={'template': template, 'language': language},
        )
        cleaned = _build_structured_script_fallback(
            topic=topic,
            template=template,
            language=language,
            source_script=cleaned,
            tone=tone,
            duration_seconds=duration_seconds,
        )

    return cleaned


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


def _to_video_response(video, db: Session, preloaded_tags: dict[tuple[str, str], tuple[list[str], list[str]]] | None = None) -> VideoResponse:
    image_urls: list[str] = []
    reference_images: list[str] = []
    if isinstance(video.image_urls, list):
        image_urls = [str(item) for item in video.image_urls if item]
    else:
        try:
            image_urls = json.loads(video.image_urls or '[]')
        except (json.JSONDecodeError, TypeError):
            image_urls = []
    if isinstance(video.reference_images, list):
        reference_images = [str(item) for item in video.reference_images if item]
    else:
        try:
            reference_images = json.loads(video.reference_images or '[]')
        except (json.JSONDecodeError, TypeError):
            reference_images = []
    if preloaded_tags is not None:
        auto_tags, user_tags = preloaded_tags.get(('video', video.id), ([], []))
    else:
        asset_tagging = AssetTaggingService(db)
        auto_tags, user_tags = asset_tagging.list_tags(video.id, 'video')
    return VideoResponse(
        id=video.id,
        user_id=video.user_id,
        project_id=getattr(video, 'project_id', None),
        mode_id=getattr(video, 'mode_id', None),
        template_id=getattr(video, 'template_id', None),
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
        narration_enabled=bool(getattr(video, 'narration_enabled', True)),
        caption_style=video.caption_style,
        audio_sample_rate_hz=video.audio_sample_rate_hz,
        status=video.status.value if hasattr(video.status, 'value') else str(video.status),
        progress=video.progress,
        image_urls=image_urls,
        selected_model=video.selected_model,
        provider_name=video.provider_name,
        tts_provider=getattr(video, 'tts_provider', None),
        tts_resolved_voice=getattr(video, 'tts_resolved_voice', None),
        tts_provider_message=getattr(video, 'tts_provider_message', None),
        tts_fallback_used=bool(getattr(video, 'tts_fallback_used', False)),
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
        is_public_inspiration=bool(getattr(video, 'is_public_inspiration', False)),
        moderation_status=str(getattr(video, 'moderation_status', 'draft')),
        inspiration_score=int(getattr(video, 'inspiration_score', 0) or 0),
        like_count=int(getattr(video, 'like_count', 0) or 0),
        auto_tags=auto_tags,
        user_tags=user_tags,
        recipe_id=getattr(video, 'recipe_id', None),
        recipe_inputs=getattr(video, 'recipe_inputs', {}) or {},
        pipeline_mode=getattr(video, 'pipeline_mode', None),
        pipeline_metadata=getattr(video, 'pipeline_metadata', {}) or {},
        created_at=video.created_at,
        updated_at=video.updated_at,
    )


def _to_image_generation_response(
    generation,
    db: Session,
    *,
    applied_credits: int = 0,
    remaining_credits: int | None = None,
) -> ImageGenerationResponse:
    raw_reference_urls = getattr(generation, 'reference_urls', None)
    reference_urls: list[str] = []
    if isinstance(raw_reference_urls, list):
        reference_urls = [str(url) for url in raw_reference_urls if url]
    else:
        try:
            reference_urls = json.loads(raw_reference_urls or '[]')
        except (json.JSONDecodeError, TypeError):
            reference_urls = []
    auto_tags = list(getattr(generation, 'auto_tags', []) or [])
    user_tags = list(getattr(generation, 'user_tags', []) or [])
    tagging_status = getattr(generation, 'tagging_status', None)
    if db is not None:
        try:
            asset_tagging = AssetTaggingService(db)
            auto_tags, user_tags = asset_tagging.list_tags(generation.id, 'image')
            tagging_status = 'persisted'
        except Exception as exc:
            logger.warning(
                'image_tag_load_non_fatal',
                extra={'request_id': get_request_id(), 'image_id': generation.id, 'error': str(exc)},
            )
            tagging_status = tagging_status or 'unavailable'
    else:
        tagging_status = tagging_status or 'skipped_no_db'

    image_url = getattr(generation, 'image_url', None) or getattr(generation, 'thumbnail_url', None) or ''
    thumbnail_url = getattr(generation, 'thumbnail_url', None) or image_url

    return ImageGenerationResponse(
        id=generation.id,
        parent_image_id=getattr(generation, 'parent_image_id', None),
        project_id=getattr(generation, 'project_id', None),
        mode_id=getattr(generation, 'mode_id', None),
        template_id=getattr(generation, 'template_id', None),
        model_key=getattr(generation, 'model_key', None) or 'gemini_flash_image',
        prompt=getattr(generation, 'prompt', None) or 'Generated image',
        aspect_ratio=getattr(generation, 'aspect_ratio', None) or '1:1',
        resolution=str(getattr(generation, 'resolution', None) or '1024'),
        reference_urls=reference_urls,
        image_url=image_url,
        thumbnail_url=thumbnail_url,
        action_type=getattr(generation, 'action_type', None),
        status=generation.status.value if hasattr(generation.status, 'value') else str(getattr(generation, 'status', 'completed')),
        is_public_inspiration=bool(getattr(generation, 'is_public_inspiration', False)),
        moderation_status=str(getattr(generation, 'moderation_status', 'draft')),
        inspiration_score=int(getattr(generation, 'inspiration_score', 0) or 0),
        like_count=int(getattr(generation, 'like_count', 0) or 0),
        auto_tags=auto_tags,
        user_tags=user_tags,
        tagging_status=tagging_status,
        applied_credits=applied_credits,
        remaining_credits=remaining_credits,
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


def _to_influencer_persona_response(persona) -> InfluencerPersonaResponse:
    traits: list[str] = []
    style_embedding: list[float] = []
    try:
        traits = json.loads(persona.personality_traits or '[]')
    except json.JSONDecodeError:
        traits = []
    try:
        style_embedding = json.loads(persona.style_embedding_vector or '[]')
    except json.JSONDecodeError:
        style_embedding = []
    return InfluencerPersonaResponse(
        id=persona.id,
        user_id=persona.user_id,
        name=persona.name,
        gender_identity=persona.gender_identity,
        niche=persona.niche,
        tone=persona.tone,
        catchphrase=persona.catchphrase,
        personality_traits=traits,
        backstory=persona.backstory,
        visual_description=persona.visual_description,
        reference_image_url=persona.reference_image_url,
        style_embedding_vector=style_embedding,
        system_prompt_template=persona.system_prompt_template,
        character_locked=bool(persona.character_locked),
        created_at=persona.created_at,
        updated_at=persona.updated_at,
    )


def _to_credit_wallet_response(wallet) -> CreditWalletResponse:
    current_credits = int(getattr(wallet, 'current_credits', 0) or 0)
    monthly_credits = int(getattr(wallet, 'monthly_credits', 0) or 0)
    used_credits = max(monthly_credits - current_credits, 0)
    plan_name = str(getattr(wallet, 'plan_type', None) or 'free').title()
    return CreditWalletResponse(
        currentCredits=current_credits,
        monthlyCredits=monthly_credits,
        usedCredits=used_credits,
        planName=plan_name,
        lastReset=wallet.last_reset,
    )


def _to_credit_history_item(transaction) -> CreditHistoryItemResponse:
    metadata = {}
    try:
        metadata = json.loads(transaction.metadata_json or '{}')
    except json.JSONDecodeError:
        metadata = {}
    return CreditHistoryItemResponse(
        id=transaction.id,
        featureName=transaction.feature_key,
        creditsUsed=transaction.amount,
        remainingBalance=transaction.balance_after,
        transactionType=transaction.transaction_type,
        source=transaction.source,
        metadata=metadata,
        createdAt=transaction.created_at,
    )


@router.get('/health')
async def health() -> dict[str, str]:
    return {'status': 'ok'}


@router.get('/api/credits/wallet', response_model=CreditWalletResponse)
def get_credit_wallet(
    user_id: str = Depends(get_user_id),
):
    wallet = CreditService().ensure_wallet(user_id)
    return _to_credit_wallet_response(wallet)


@router.post('/api/estimateCredits', response_model=EstimateCreditsResponse)
def estimate_credits(
    payload: EstimateCreditsRequest,
    user_id: str = Depends(get_user_id),
):
    try:
        wallet, estimate = CreditService().estimate_for_user(user_id, payload.action, payload.payload)
        return EstimateCreditsResponse(
            estimatedCredits=estimate.required_credits,
            breakdown=[
                {
                    'component': item.component,
                    'value': item.value,
                    'label': item.label,
                }
                for item in estimate.breakdown
            ],
            currentCredits=wallet.current_credits,
            remainingCredits=max(wallet.current_credits - estimate.required_credits, 0),
            sufficient=wallet.current_credits >= estimate.required_credits,
            premium=estimate.premium,
            metadata=dict(estimate.metadata or {}),
        )
    except CreditCapExceededError as exc:
        raise HTTPException(status_code=400, detail='Requested configuration exceeds allowed credit cap') from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post('/api/topupCredits', response_model=TopUpCreditsResponse)
def topup_credits(
    payload: TopUpCreditsRequest,
    user_id: str = Depends(get_user_id),
):
    wallet = CreditService().top_up_credits(
        user_id=user_id,
        credits=payload.credits,
        metadata={'route': '/api/topupCredits'},
    )
    return TopUpCreditsResponse(wallet=_to_credit_wallet_response(wallet), addedCredits=payload.credits)


@router.post('/api/topupCredits/order', response_model=CreditTopUpOrderResponse)
def create_topup_order(
    request: Request,
    payload: CreditTopUpOrderRequest,
    user_id: str = Depends(get_user_id),
):
    try:
        logger.info('topup_order_create_started', extra={'request_id': get_request_id(), 'user_id': user_id, 'plan_name': payload.planName})
        selection = PricingService().resolve_checkout_plan(request, payload.planName)
        logger.info(
            'topup_plan_resolved',
            extra={
                'request_id': get_request_id(),
                'user_id': user_id,
                'plan_name': selection.plan_name,
                'region': selection.region,
                'country': selection.country,
                'provider': selection.payment_provider,
                'amount_minor': selection.amount_minor,
                'allocated_credits': selection.allocated_credits,
            },
        )
        result = CreditService().create_topup_order(user_id=user_id, selection=selection)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception(
            'topup_order_create_failed',
            extra={
                'request_id': get_request_id(),
                'user_id': user_id,
                'plan_name': getattr(payload, 'planName', None),
            },
        )
        raise HTTPException(status_code=502, detail=f'Topup order failed: {str(exc)}') from exc
    return CreditTopUpOrderResponse(
        provider=result.provider,
        region=result.region,
        country=result.country,
        planName=result.plan_name,
        orderId=result.order_id,
        keyId=result.key_id,
        checkoutSessionId=result.checkout_session_id,
        checkoutUrl=result.checkout_url,
        amountMinor=result.amount_minor,
        currency=result.currency,
        credits=result.credits,
        message=result.message,
    )


@router.post('/api/topupCredits/verify', response_model=TopUpCreditsResponse)
def verify_topup_order(
    payload: CreditTopUpVerifyRequest,
    user_id: str = Depends(get_user_id),
):
    service = CreditService()
    order = service.repo.get_topup_order_by_provider_order_id(payload.providerOrderId)
    if not order or order.user_id != user_id:
        raise HTTPException(status_code=404, detail='Top-up order not found')
    try:
        if payload.provider != 'razorpay':
            raise RuntimeError('Stripe checkout is not enabled yet')
        wallet = service.verify_razorpay_topup(
            user_id=user_id,
            razorpay_order_id=payload.providerOrderId,
            razorpay_payment_id=payload.providerPaymentId,
            razorpay_signature=payload.providerSignature,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return TopUpCreditsResponse(wallet=_to_credit_wallet_response(wallet), addedCredits=order.credits)


@router.post('/api/topupCredits/webhook')
async def razorpay_topup_webhook(
    request: Request,
):
    if not settings.razorpay_webhook_secret:
        raise HTTPException(status_code=400, detail='Razorpay webhook is not configured')

    raw_body = await request.body()
    signature = request.headers.get('x-razorpay-signature')
    if not signature:
        raise HTTPException(status_code=400, detail='Missing Razorpay webhook signature')

    expected_signature = hmac.new(
        settings.razorpay_webhook_secret.encode('utf-8'),
        raw_body,
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected_signature, signature):
        raise HTTPException(status_code=400, detail='Invalid Razorpay webhook signature')

    try:
        payload = json.loads(raw_body.decode('utf-8'))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail='Invalid webhook payload') from exc

    event_name = str(payload.get('event') or '')
    if event_name not in {'payment.captured', 'order.paid'}:
        return {'status': 'ignored', 'event': event_name}

    payment_entity = payload.get('payload', {}).get('payment', {}).get('entity', {})
    order_entity = payload.get('payload', {}).get('order', {}).get('entity', {})
    order_id = str(payment_entity.get('order_id') or order_entity.get('id') or '')
    payment_id = str(payment_entity.get('id') or '')
    if not order_id or not payment_id:
        return {'status': 'ignored', 'event': event_name}

    try:
        wallet = CreditService().reconcile_razorpay_topup(
            razorpay_order_id=order_id,
            razorpay_payment_id=payment_id,
            razorpay_signature=signature,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        'status': 'processed',
        'event': event_name,
        'userId': wallet.user_id,
        'currentCredits': wallet.current_credits,
    }


@router.get('/api/pricing', response_model=PricingResponse)
def get_pricing(request: Request):
    quote = PricingService().get_pricing_quote(request)
    labels = {
        'premium_voice': 'Premium voice generation',
        'premium_voice_preview': 'Premium voice preview',
        'voice_retry': 'Voice retry',
        'premium_image': 'Premium image generation',
        'image_upscale': 'Image upscale',
        'premium_video_720p_15s': 'Premium video generation (720p / 15s)',
        'premium_video_1080p_15s': 'Premium video generation (1080p / 15s)',
        'character_consistency': 'Character consistency add-on',
        'script_enhance': 'Script enhance',
        'auto_caption': 'Auto captions',
        'auto_tag': 'Auto tagging',
        'audio_quality_48khz_modifier': '48 kHz audio quality modifier',
    }
    return PricingResponse(
        region=quote.region,
        country=quote.country,
        currency=quote.currency,
        paymentProvider=quote.payment_provider,
        plans=quote.plans,
        creditAllocation=quote.credit_allocation,
        actionCosts=[
            CreditBreakdownItem(feature=labels.get(key, key), cost=value)
            for key, value in quote.action_costs.items()
        ],
    )


@router.get('/api/creditHistory', response_model=CreditHistoryResponse)
def credit_history(
    limit: int = 100,
    user_id: str = Depends(get_user_id),
):
    service = CreditService()
    items = service.list_history(user_id, limit=max(1, min(limit, 250)))
    return CreditHistoryResponse(items=[_to_credit_history_item(item) for item in items])


@router.post('/api/credits/run-monthly-reset', include_in_schema=False)
def run_monthly_credit_reset():
    # Internal hook for cron/scheduler integration.
    updated = CreditService().run_monthly_reset()
    return {'updated_wallets': updated}


@router.get('/me/profile', response_model=UserProfileResponse)
def get_my_profile(
    user_id: str = Depends(get_user_id),
):
    service = UserService(None)
    try:
        return _to_user_profile_response(service.get_user(user_id))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post('/me/bootstrap', response_model=UserProfileResponse)
def bootstrap_my_profile(
    payload: UserBootstrapRequest,
    user_id: str = Depends(get_user_id),
):
    service = UserService(None)
    user = service.bootstrap_auth_user(
        user_id,
        display_name=payload.display_name.strip() if payload.display_name else None,
        email=payload.email.strip() if payload.email else None,
        avatar_url=payload.avatar_url.strip() if payload.avatar_url else None,
    )
    return _to_user_profile_response(user)


@router.put('/me/profile', response_model=UserProfileResponse)
def update_my_profile(
    payload: UserProfileUpdateRequest,
    user_id: str = Depends(get_user_id),
):
    service = UserService(None)
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
):
    if not avatar.content_type or not avatar.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail='Avatar must be an image file')
    service = UserService(None)
    try:
        user = service.save_avatar(user_id, avatar.filename or 'avatar.png', avatar.file)
        return UserAvatarUploadResponse(avatar_url=str(user.avatar_url))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get('/me/settings', response_model=UserSettingsResponse)
def get_my_settings(
    user_id: str = Depends(get_user_id),
):
    service = UserService(None)
    try:
        return _to_user_settings_response(service.get_user(user_id))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.put('/me/settings', response_model=UserSettingsResponse)
def update_my_settings(
    payload: UserSettingsUpdateRequest,
    user_id: str = Depends(get_user_id),
):
    service = UserService(None)
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
):
    lower_words, upper_words = _estimate_script_word_budget(payload.durationSeconds)
    context_block = '\n'.join(_script_context_lines(payload))
    prompt = (
        'Write a high-quality short-form video script in plain text only.\n'
        'Return exactly this pattern:\n'
        '[Opening shot: ...]\n'
        'Narrator (tone): "..."\n'
        'Opening cue: ...\n'
        '\n'
        '[Scene 1: ...]\n'
        'Narrator: "..."\n'
        'Visual cue: ...\n'
        'Camera cue: ...\n'
        'Mood cue: ...\n'
        '\n'
        '[Scene 2: ...]\n'
        'Narrator: "..."\n'
        'Visual cue: ...\n'
        'Camera cue: ...\n'
        'Mood cue: ...\n'
        '\n'
        '[Scene 3: ...]\n'
        'Narrator: "..."\n'
        'Visual cue: ...\n'
        'Camera cue: ...\n'
        'Mood cue: ...\n'
        '\n'
        '[Closing shot: ...]\n'
        'Narrator: "..."\n'
        'Ending cue: ...\n'
        '\n'
        'Quality rules:\n'
        '- Script must be production-ready and scene-aligned.\n'
        '- Keep narration in the requested language only.\n'
        '- Keep it cinematic and creator-focused.\n'
        '- Make the opening feel intentional and smooth, never abrupt.\n'
        '- Keep transitions coherent from opening through closing shot.\n'
        '- Make the outro feel natural with a held frame or ease-out, not a hard cut.\n'
        '- End with a clear CTA.\n'
        f'- Target roughly {lower_words}-{upper_words} spoken words for the full script.\n'
        f'Creative prompt: {payload.topic}\n'
        f'Language: {payload.language}\n'
        f'{context_block}\n'
    )
    script_text = ''
    try:
        script_text = QwenService(settings).complete_text(
            task_type='script_generate',
            system_prompt=(
                'You are a senior short-video scriptwriter. '
                'Always output scene-wise scripts using Opening shot, Scene 1/2/3, Closing shot, narrator lines, opening cue, ending cue, visual/camera/mood cues, and CTA ending. '
                'Respect timing, keep language natural, and return plain text only.'
            ),
            user_prompt=prompt,
            temperature=0.7,
        )
    except Exception:
        logger.exception('ai_script_generate_provider_failed')
    if not script_text:
        script_text = _build_structured_script_fallback(
            topic=payload.topic,
            template=payload.template,
            language=payload.language,
            tone=payload.tone,
            duration_seconds=payload.durationSeconds,
        )
    script_text = _normalize_script_output(
        script_text=script_text,
        topic=payload.topic,
        template=payload.template,
        language=payload.language,
        tone=payload.tone,
        duration_seconds=payload.durationSeconds,
    )
    try:
        tags = AssetTaggingService(None).tag_script(script_text)
    except Exception:
        logger.exception('ai_script_generate_tagging_failed')
        tags = []
    return ScriptResponse(script=script_text, tags=tags)


@router.post('/api/ai/script/enhance', response_model=ScriptResponse)
def enhance_script_v2(
    payload: ScriptEnhanceRequest,
    user_id: str = Depends(get_user_id),
):
    credit_service = CreditService()
    estimate = credit_service.estimate('script_enhance', {})
    idempotency_key = credit_service.make_idempotency_key(
        'script_enhance',
        {
            'user_id': user_id,
            'template': payload.template or 'general',
            'language': payload.language,
            'script_hash': hashlib.sha256(payload.script.encode('utf-8')).hexdigest(),
        },
    )
    lower_words, upper_words = _estimate_script_word_budget(payload.durationSeconds)
    context_block = '\n'.join(_script_context_lines(payload))
    prompt = (
        'Enhance the following user-provided script into a production-ready scene script while preserving intent.\n'
        'Return only one final rewritten script.\n'
        'Do not include the original script, notes, explanations, headings like "Enhanced version", or multiple alternatives.\n'
        'Do not repeat any section twice.\n'
        'Return plain text using this exact pattern:\n'
        '[Opening shot: ...]\n'
        'Narrator (tone): "..."\n'
        'Opening cue: ...\n'
        '\n'
        '[Scene 1: ...]\n'
        'Narrator: "..."\n'
        'Visual cue: ...\n'
        'Camera cue: ...\n'
        'Mood cue: ...\n'
        '\n'
        '[Scene 2: ...]\n'
        'Narrator: "..."\n'
        'Visual cue: ...\n'
        'Camera cue: ...\n'
        'Mood cue: ...\n'
        '\n'
        '[Scene 3: ...]\n'
        'Narrator: "..."\n'
        'Visual cue: ...\n'
        'Camera cue: ...\n'
        'Mood cue: ...\n'
        '\n'
        '[Closing shot: ...]\n'
        'Narrator: "..."\n'
        'Ending cue: ...\n'
        '\n'
        'Rules:\n'
        '- Keep requested language naturally.\n'
        '- Keep user meaning intact.\n'
        '- Improve flow, scene pacing, and cinematic clarity.\n'
        '- Smooth the intro so the first beat does not feel abrupt.\n'
        '- Keep transitions visually coherent between scenes.\n'
        '- Smooth the ending with a held frame or gentle ease-out instead of an abrupt cut.\n'
        '- End with a strong CTA.\n'
        f'- Target roughly {lower_words}-{upper_words} spoken words for the full script.\n'
        f'Template: {payload.template or "general"}\n'
        f'Language: {payload.language}\n'
        f'{context_block}\n'
        f'Script: {payload.script}'
    )
    script_text = ''
    provider_success = False
    try:
        script_text = QwenService(settings).complete_text(
            task_type='script_enhance',
            system_prompt=(
                'You are a senior video script editor. '
                'Improve flow and cinematic quality while preserving intent. '
                'Always return Opening shot, Scene blocks, narrator lines, opening cue, ending cue, visual/camera/mood cues, and CTA in plain text.'
            ),
            user_prompt=prompt,
            temperature=0.5,
        )
        provider_success = bool(script_text)
    except Exception:
        logger.exception('ai_script_enhance_provider_failed')
    if not script_text:
        script_text = _build_structured_script_fallback(
            topic=payload.template or 'General video',
            template=payload.template or 'general',
            language=payload.language,
            source_script=payload.script,
            tone=payload.tone,
            duration_seconds=payload.durationSeconds,
        )
    script_text = _normalize_script_output(
        script_text=script_text,
        topic=payload.template or 'General video',
        template=payload.template or 'general',
        language=payload.language,
        tone=payload.tone,
        duration_seconds=payload.durationSeconds,
    )
    if provider_success and estimate.required_credits > 0:
        try:
            credit_service.deduct_credits(
                user_id=user_id,
                amount=estimate.required_credits,
                feature_key='script_enhance',
                metadata={'template': payload.template or 'general', 'language': payload.language},
                source='premium',
                idempotency_key=idempotency_key,
            )
        except InsufficientCreditsError as exc:
            raise HTTPException(
                status_code=402,
                detail={'error': 'INSUFFICIENT_CREDITS', 'message': 'You do not have enough credits'},
            ) from exc
    try:
        tags = AssetTaggingService(None).tag_script(script_text)
    except Exception:
        logger.exception('ai_script_enhance_tagging_failed')
        tags = []
    return ScriptResponse(script=script_text, tags=tags)


@router.post('/api/ai/script/tags', response_model=ScriptResponse)
def extract_script_tags_v2(
    payload: ScriptTagsRequest,
    _: str = Depends(get_user_id),
):
    try:
        tags = AssetTaggingService(None).tag_script(payload.script)
    except Exception:
        logger.exception('ai_script_tags_failed')
        tags = []
    return ScriptResponse(script=payload.script, tags=tags)


@router.post('/api/ai/script/translate', response_model=TextResponse)
def translate_script_text_v2(
    payload: ScriptTranslateRequest,
    _: str = Depends(get_user_id),
):
    try:
        translated_text = QwenService(settings).complete_text(
            task_type='translate',
            system_prompt=(
                'Translate the provided text accurately into the requested target language. '
                'Return only the translated text. Do not explain. Keep names unchanged where appropriate.'
            ),
            user_prompt=f'Target language: {payload.target_language}\n\nText:\n{payload.text}',
            temperature=0.2,
        )
    except Exception as exc:
        logger.exception(
            'ai_script_translate_provider_failed',
            extra={'target_language': payload.target_language},
        )
        raise HTTPException(status_code=502, detail='Translation failed. Please try again.') from exc
    if not translated_text:
        raise HTTPException(status_code=502, detail='Translation returned empty output. Please retry.')
    return TextResponse(text=translated_text)


@router.post('/ai/reel-script', response_model=ReelScriptResponse)
def generate_reel_script(
    payload: ReelScriptRequest,
    _: str = Depends(get_user_id),
):
    prompt = _build_reel_prompt(payload)
    try:
        result = QwenService(settings).complete_structured(
            task_type='reel_script',
            schema_model=ReelScriptResponse,
            system_prompt='Output valid JSON only.',
            user_prompt=prompt,
            temperature=0.7,
        )
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


@router.post('/api/ai/video/studio-chat', response_model=VideoStudioChatResponse, include_in_schema=False)
def studio_ai_video_chat(
    payload: VideoStudioChatRequest,
    user_id: str = Depends(get_user_id),
):
    video = AIVideoCreateService(None, settings).get_video(payload.videoId, user_id)
    if not video:
        raise HTTPException(status_code=404, detail='Video job not found')

    reply = VideoStudioAIService(settings).reply(
        video=video,
        message=payload.message,
        chat_history=[item.model_dump() for item in payload.chatHistory],
    )
    return VideoStudioChatResponse(**reply)


@router.post('/api/recipes/avatar-product/assist', response_model=AvatarProductAssistResponse, include_in_schema=False)
def assist_avatar_product_recipe(
    payload: AvatarProductAssistRequest,
    user_id: str = Depends(get_user_id),
):
    del user_id
    service = AvatarProductWorkflowService()
    workflow = service.assess(
        message=payload.message,
        inputs=payload.inputs,
        image_urls=payload.imageUrls,
        avatar_id=payload.personaId,
        advanced_controls=payload.advancedControls,
    )
    return AvatarProductAssistResponse(
        fields=service.export_fields(workflow.fields),
        canGenerate=workflow.can_generate,
        nextQuestion=workflow.next_question,
        missingTier1=workflow.missing_tier_1,
        missingTier2=workflow.missing_tier_2,
        missingTier3=workflow.missing_tier_3,
        advancedControlsSummary=workflow.advanced_controls_summary,
    )



@router.post("/api/recipes/avatar-product/autofill")
async def autofill_avatar_product(payload: dict[str, Any]):
    service = AvatarProductWorkflowService()

    return service.autofill_with_ai(
        text=str(payload.get("text") or payload.get("message") or ""),
        image_url=str(payload.get("image_url") or ""),
        current_controls=dict(payload.get("advanced_controls") or {}),
    )



@router.get('/ai/video/models', response_model=list[AIVideoModelResponse])
@router.get('/api/ai/video/models', response_model=list[AIVideoModelResponse], include_in_schema=False)
@router.get('/api/video/models', response_model=list[AIVideoModelResponse], include_in_schema=False)
def list_ai_video_models(user_id: str = Depends(get_user_id)):
    service = AIVideoCreateService(None, settings)
    include_internal = settings.env == 'development' or user_id in set(settings.admin_user_ids_list)
    return [
        AIVideoModelResponse(
            key=model.key,
            label=model.label,
            description=model.description,
            frontendHint=model.frontend_hint,
            apiAdapter=model.api_adapter,
            shortLabel=model.short_label,
            tier=model.tier,
            enabled=model.enabled,
            featured=model.featured,
            featureGate=model.feature_gate,
            qualityBadge=model.quality_badge,
            speedBadge=model.speed_badge,
            creditBadge=model.credit_badge,
            resolutionLabels=model.resolution_labels or [],
            supportsNativeAudio=model.supports_native_audio,
            providerId=model.provider_id,
            canonicalModelKey=model.canonical_model_key,
            modeIds=model.mode_ids or [],
            billingUnit=model.billing_unit,
        )
        for model in service.list_models(include_internal=include_internal)
    ]


@router.post('/ai/video/create', response_model=AIVideoCreateResponse)
@router.post('/api/ai/video/create', response_model=AIVideoCreateResponse, include_in_schema=False)
def create_ai_video(
    payload: AIVideoCreateRequest,
    user_id: str = Depends(get_user_id),
):
    deduction_amount = 0
    error_stage = 'init'
    request_id = get_request_id()
    payload_summary = _summarize_video_create_payload(payload)
    try:
        recipe = None
        normalized_payload = payload.model_dump()
        requested_audio_mode = str(payload.audioMode or '').strip() or None
        normalized_audio_settings = dict(normalized_payload.get('audioSettings') or payload.audioSettings.model_dump())
        requested_native_audio_enabled = bool(normalized_audio_settings.get('nativeAudioEnabled', False))
        if requested_audio_mode == 'auto_scene_sound':
            requested_native_audio_enabled = True
        elif requested_audio_mode == 'silent':
            requested_native_audio_enabled = False
        normalized_audio_settings['nativeAudioEnabled'] = requested_native_audio_enabled
        normalized_payload['audioSettings'] = normalized_audio_settings
        if requested_audio_mode:
            normalized_payload['audioMode'] = requested_audio_mode
        normalized_recipe_inputs: dict[str, object] | None = None
        pipeline_metadata: dict[str, object] | None = None
        if payload.recipeId:
            recipe = get_recipe(payload.recipeId)
            normalized_recipe_inputs = validate_recipe_inputs(recipe, payload.inputs)
            anime_prompt_package: AnimeLofiPromptPackage | None = None
            anime_prompt_runtime_metadata: dict[str, Any] = {}
            if recipe.id == 'anime_lofi_reel':
                anime_prompt_package, anime_prompt_runtime_metadata = _maybe_build_anime_lofi_prompt_package(
                    normalized_inputs=normalized_recipe_inputs,
                )
            normalized_payload = build_normalized_video_payload(
                recipe,
                normalized_recipe_inputs,
                anime_prompt_package=anime_prompt_package,
            )
            if payload.aspectRatio:
                normalized_payload['aspectRatio'] = str(payload.aspectRatio).strip()
            if payload.language:
                normalized_payload['language'] = str(payload.language).strip()
            if payload.voice:
                normalized_payload['voice'] = str(payload.voice).strip()
            normalized_payload['captionsEnabled'] = bool(payload.captionsEnabled)
            normalized_payload['narrationEnabled'] = bool(payload.narrationEnabled)
            normalized_payload['audioSettings'] = {
                **dict(normalized_payload.get('audioSettings') or {}),
                **normalized_audio_settings,
            }
            if requested_audio_mode:
                normalized_payload['audioMode'] = requested_audio_mode
            pipeline_metadata = recipe_pipeline_metadata(
                recipe,
                normalized_recipe_inputs,
                anime_prompt_package=anime_prompt_package,
            )
            if anime_prompt_runtime_metadata:
                pipeline_metadata.setdefault('metadata', {}).update(anime_prompt_runtime_metadata)
            if recipe.id == 'avatar_product':
                pipeline_metadata['pipeline_version'] = 'chitrakala_v1'
                pipeline_metadata['avatar_name'] = str(settings.chitrakala_avatar_name or 'Chitrakala').strip() or 'Chitrakala'
                if settings.chitrakala_avatar_image_url:
                    pipeline_metadata['avatar_image_url'] = str(settings.chitrakala_avatar_image_url).strip()
                pipeline_metadata['persona_id'] = (
                    str(payload.personaId).strip()
                    if payload.personaId and str(payload.personaId).strip()
                    else str(settings.chitrakala_persona_id or '').strip() or None
                )
            if payload.personaId and recipe.id != 'avatar_product':
                pipeline_metadata['persona_id'] = str(payload.personaId).strip()
            if payload.talkingModePreference:
                pipeline_metadata['talking_mode_preference'] = str(payload.talkingModePreference).strip()
            if payload.useAvatarForTalkingScenes is not None:
                pipeline_metadata['use_avatar_for_talking_scenes'] = bool(payload.useAvatarForTalkingScenes)
            if recipe.id == 'avatar_product':
                pipeline_metadata['use_avatar_for_talking_scenes'] = True
                normalized_payload['audioMode'] = 'silent'
                normalized_payload['captionsEnabled'] = False
                normalized_audio_settings['nativeAudioEnabled'] = False
                normalized_payload['audioSettings'] = {
                    **dict(normalized_payload.get('audioSettings') or {}),
                    **normalized_audio_settings,
                }
        elif should_use_ltx_storyboard_recipe(normalized_payload):
            recipe, normalized_recipe_inputs, normalized_payload, pipeline_metadata = build_ltx_recipe_request(
                str(payload.script or '').strip()
            )
            if payload.aspectRatio:
                normalized_payload['aspectRatio'] = str(payload.aspectRatio).strip()
            if payload.language:
                normalized_payload['language'] = str(payload.language).strip()
            if payload.voice:
                normalized_payload['voice'] = str(payload.voice).strip()
            normalized_payload['captionsEnabled'] = bool(payload.captionsEnabled)
            normalized_payload['narrationEnabled'] = bool(payload.narrationEnabled)
            normalized_payload['audioSettings'] = {
                **dict(normalized_payload.get('audioSettings') or {}),
                **normalized_audio_settings,
            }
            if requested_audio_mode:
                normalized_payload['audioMode'] = requested_audio_mode
            logger.info(
                'ai_video_create_auto_rerouted_to_ltx_storyboard',
                extra={
                    'request_id': request_id,
                    'user_id': user_id,
                    'recipe_id': recipe.id,
                    'model_key': normalized_payload.get('modelKey'),
                },
            )
        elif maybe_should_use_explainer_recipe(normalized_payload):
            recipe, normalized_recipe_inputs, normalized_payload, pipeline_metadata = build_explainer_recipe_request(
                str(payload.script or '').strip()
            )
            logger.info(
                'ai_video_create_auto_rerouted_to_recipe',
                extra={
                    'request_id': request_id,
                    'user_id': user_id,
                    'recipe_id': recipe.id,
                    'intent': detect_video_intent_from_payload(normalized_payload),
                },
            )
        elif detect_video_intent_from_payload(normalized_payload) == 'explainer':
            normalized_payload = normalize_explainer_video_request(normalized_payload)
            logger.info(
                'ai_video_create_explainer_normalized',
                extra={
                    'request_id': request_id,
                    'user_id': user_id,
                    'duration_seconds': normalized_payload.get('durationSeconds'),
                },
            )
        elif payload.modelFamily:
            resolved_family_payload = _resolve_non_recipe_family_request(payload, normalized_payload)
            pipeline_metadata = {
                **dict(pipeline_metadata or {}),
                **dict(resolved_family_payload.pop('pipelineMetadataFamily', {}) or {}),
            }
            normalized_payload = {
                **normalized_payload,
                **resolved_family_payload,
            }

        logger.info(
            'ai_video_create_started',
            extra={'request_id': request_id, 'user_id': user_id, 'stage': 'estimate', 'payload_summary': payload_summary},
        )
        credit_service = CreditService()
        error_stage = 'estimate'
        estimate_payload = {
            **normalized_payload,
            'recipeId': recipe.id if recipe else payload.recipeId,
            'inputs': normalized_recipe_inputs or {},
        }
        wallet_for_estimate, estimate = credit_service.estimate_for_user(user_id, 'video_create', estimate_payload)
        logger.info(
            'ai_video_create_estimated',
            extra={
                'request_id': request_id,
                'user_id': user_id,
                'required_credits': estimate.required_credits,
                'available_credits': wallet_for_estimate.current_credits,
                'sufficient_credits': wallet_for_estimate.current_credits >= estimate.required_credits,
                'estimate_breakdown': [
                    {
                        'component': item.component,
                        'label': item.label,
                        'value': item.value,
                    }
                    for item in estimate.breakdown
                ],
                'payload_summary': payload_summary,
            },
        )
        remaining_credits: int | None = None
        if estimate.required_credits > 0:
            error_stage = 'deduct_credits'
            deduction = credit_service.deduct_credits(
                user_id=user_id,
                amount=estimate.required_credits,
                feature_key='video_create',
                metadata=estimate_payload,
                source='premium',
                idempotency_key=credit_service.make_idempotency_key(
                    'video_create',
                    {'user_id': user_id, **estimate_payload},
                ),
            )
            deduction_amount = estimate.required_credits
            remaining_credits = deduction.wallet.current_credits
        else:
            error_stage = 'deduct_free_credits'
            deduction = credit_service.deduct_credits(
                user_id=user_id,
                amount=0,
                feature_key='video_create_free',
                metadata=estimate_payload,
                source='free',
                idempotency_key=credit_service.make_idempotency_key(
                    'video_create_free',
                    {'user_id': user_id, **estimate_payload},
                ),
            )
            remaining_credits = deduction.wallet.current_credits
        error_stage = 'create_video_record'

        provider_safe_duration_seconds = (
            int(normalized_payload['durationSeconds'])
            if normalized_payload.get('durationSeconds') is not None
            else None
        )
        

        if recipe and recipe.id == "avatar_product" and normalized_recipe_inputs is not None:
            requested_model_key = str(normalized_recipe_inputs.get("video_model_key") or "").strip()

            if requested_model_key == "kling_o3_standard_reference":
                normalized_recipe_inputs["video_model_key"] = "kling_o3_reference"

        provider_safe_model_key = str(normalized_payload['modelKey'])

        if provider_safe_model_key == "kling_o3_standard_reference":
            provider_safe_model_key = "kling_o3_reference"
            normalized_payload["modelKey"] = "kling_o3_reference"

        if provider_safe_model_key == 'seedance_v1_lite_reference':
            normalized_payload['audioMode'] = 'silent'
            normalized_audio_settings['nativeAudioEnabled'] = False
        elif normalized_payload.get('audioMode') == 'auto_scene_sound':
            normalized_audio_settings['nativeAudioEnabled'] = True
        elif normalized_payload.get('audioMode') == 'silent':
            normalized_audio_settings['nativeAudioEnabled'] = False

        pipeline_metadata = dict(pipeline_metadata or {})
        if isinstance(normalized_payload.get('imageReferences'), list):
            pipeline_metadata['image_references'] = list(normalized_payload.get('imageReferences') or [])
        pipeline_metadata['audio_mode'] = str(normalized_payload.get('audioMode') or 'silent')
        pipeline_metadata['native_audio_enabled'] = bool(normalized_audio_settings.get('nativeAudioEnabled', False))
        normalized_payload['audioSettings'] = {
            **dict(normalized_payload.get('audioSettings') or {}),
            **normalized_audio_settings,
        }
        if recipe and recipe.id == 'ugc_ad' and recipe.scene_strategy.render_scenes:
            provider_safe_duration_seconds = int(recipe.scene_strategy.render_scenes[0].duration_seconds)

        service = AIVideoCreateService(None, settings)
        video = service.create_video(
            user_id=user_id,
            template=str(normalized_payload['template']),
            template_id=payload.templateId if not recipe else recipe.id,
            project_id=payload.projectId,
            mode_id=payload.modeId,
            language=str(normalized_payload['language']),
            image_urls=list(normalized_payload.get('imageUrls') or []),
            script=str(normalized_payload['script']),
            tags=list(normalized_payload.get('tags') or []),
            model_key=provider_safe_model_key,
            aspect_ratio=str(normalized_payload['aspectRatio']),
            resolution=str(normalized_payload['resolution']),
            duration_mode=str(normalized_payload['durationMode']),
            duration_seconds=provider_safe_duration_seconds,
            voice=str(normalized_payload['voice']),
            music=(normalized_payload.get('music') or payload.music.model_dump()),
            audio_settings=(normalized_payload.get('audioSettings') or payload.audioSettings.model_dump()),
            captions_enabled=bool(normalized_payload.get('captionsEnabled')),
            narration_enabled=bool(normalized_payload.get('narrationEnabled')),
            caption_style=str(normalized_payload.get('captionStyle') or payload.captionStyle),
            recipe_id=recipe.id if recipe else payload.recipeId,
            recipe_inputs=normalized_recipe_inputs,
            pipeline_mode='recipe' if recipe or payload.recipeId else None,
            pipeline_metadata=pipeline_metadata,
        )
        # Persist charged credits on the video document so async failure refunds are exact.
        error_stage = 'persist_applied_credits'
        service.repo.update(
            video,
            applied_credits=estimate.required_credits,
            request_quality=str(normalized_payload.get('quality') or payload.quality),
        )
        logger.info(
            'ai_video_created',
            extra={
                'request_id': request_id,
                'user_id': user_id,
                'stage': 'created',
                'provider': video.provider_name,
                'model_key': video.selected_model,
                'video_id': video.id,
                'payload_summary': payload_summary,
            },
        )
        return AIVideoCreateResponse(
            id=video.id,
            status='queued',
            videoUrl=video.output_url,
            provider=video.provider_name,
            modelKey=str(normalized_payload['modelKey']),
            appliedCredits=estimate.required_credits,
            remainingCredits=remaining_credits,
        )
    except InsufficientCreditsError as exc:
        logger.warning(
            'ai_video_create_insufficient_credits',
            extra={
                'request_id': request_id,
                'user_id': user_id,
                'required_credits': exc.required,
                'available_credits': exc.available,
                'payload_summary': payload_summary,
            },
        )
        raise HTTPException(
            status_code=402,
            detail={
                'error': 'INSUFFICIENT_CREDITS',
                'message': f'You need {exc.required} credits, but only {exc.available} are available.',
                'required': exc.required,
                'available': exc.available,
            },
        ) from exc
    except CreditCapExceededError as exc:
        raise HTTPException(status_code=400, detail='Requested configuration exceeds allowed credit cap') from exc
    except ProviderError as exc:
        if deduction_amount > 0:
            CreditService().top_up_credits(
                user_id=user_id,
                credits=deduction_amount,
                metadata={'refund_for': 'video_create_provider_error', 'model_key': normalized_payload.get('modelKey')},
            )
        logger.warning(
            'ai_video_create_provider_error',
            extra={
                'request_id': request_id,
                'user_id': user_id,
                'error': str(exc),
                'model_key': payload.modelKey,
                'stage': error_stage,
                'payload_summary': payload_summary,
            },
        )
        error_text = str(exc)
        normalized_error = error_text.lower()
        if 'moderation_blocked' in normalized_error or 'blocked by our moderation system' in normalized_error:
            raise HTTPException(
                status_code=422,
                detail={
                    'error': 'MODERATION_BLOCKED',
                    'message': 'Your prompt was blocked by provider moderation. Please revise wording to remove sensitive, harmful, or policy-restricted content and try again.',
                },
            ) from exc
        if 'not available yet' in normalized_error or 'backend routing' in normalized_error:
            raise HTTPException(
                status_code=409,
                detail={
                    'error': 'MODEL_NOT_ENABLED',
                    'message': error_text,
                },
            ) from exc
        raise HTTPException(status_code=502, detail=error_text) from exc
    except Exception as exc:
        if deduction_amount > 0:
            CreditService().top_up_credits(
                user_id=user_id,
                credits=deduction_amount,
                metadata={'refund_for': 'video_create_error', 'model_key': normalized_payload.get('modelKey') if 'normalized_payload' in locals() else payload.modelKey},
            )
        logger.exception(
            'ai_video_create_failed',
            extra={
                'request_id': request_id,
                'user_id': user_id,
                'error': str(exc),
                'model_key': payload.modelKey,
                'stage': error_stage,
                'payload_summary': payload_summary,
            },
        )
        detail = {
            'error': 'VIDEO_CREATE_FAILED',
            'message': 'Failed to create AI video',
            'request_id': request_id,
            'stage': error_stage,
        }
        if settings.env == 'development':
            detail['debug'] = str(exc).strip() or 'Failed to create AI video'
        raise HTTPException(status_code=500, detail=detail) from exc


@router.get('/api/ai/video/status/{video_id}', response_model=AIVideoStatusResponse)
def get_ai_video_status(
    video_id: str,
    user_id: str = Depends(get_user_id),
):
    service = AIVideoCreateService(None, settings)
    video = service.get_video(video_id, user_id)
    if not video:
        raise HTTPException(status_code=404, detail='Video job not found')

    # Guardrail: prevent jobs from staying queued/processing forever.
    # Use created_at for queue starvation and updated_at for processing stalls.
    DRAFT_LOCAL_RECOVERY_SECONDS = 90
    MAX_DRAFT_AGE_SECONDS = 5 * 60
    MAX_PROCESSING_STALE_SECONDS = 12 * 60
    status_value = video.status.value if hasattr(video.status, 'value') else str(video.status)
    if status_value in {'draft', 'processing'}:
        created_at = getattr(video, 'created_at', None)
        updated_at = getattr(video, 'updated_at', None) or created_at
        now = datetime.now(UTC)
        if created_at and getattr(created_at, 'tzinfo', None) is None:
            created_at = created_at.replace(tzinfo=UTC)
        if updated_at and getattr(updated_at, 'tzinfo', None) is None:
            updated_at = updated_at.replace(tzinfo=UTC)
        draft_age_seconds = int((now - created_at).total_seconds()) if created_at else 0
        processing_stale_seconds = int((now - updated_at).total_seconds()) if updated_at else 0
        if status_value == 'draft' and draft_age_seconds > DRAFT_LOCAL_RECOVERY_SECONDS:
            raw = service.repo.collection.document(video_id).get()
            raw_data = raw.to_dict() or {}
            if not bool(raw_data.get('local_runner_kicked', False)):
                try:
                    logger.warning(
                        'ai_video_queue_stall_recovery',
                        extra={
                            'request_id': get_request_id(),
                            'render_id': video_id,
                            'draft_age_seconds': draft_age_seconds,
                        },
                    )
                    service.repo.update(
                        video,
                        status='processing',
                        progress=max(int(video.progress or 0), 15),
                        error_message=None,
                        local_runner_kicked=True,
                        local_runner_kicked_at=now,
                    )
                    _launch_local_video_job(video_id)
                    refreshed = service.get_video(video_id, user_id)
                    if refreshed is not None:
                        video = refreshed
                        status_value = video.status.value if hasattr(video.status, 'value') else str(video.status)
                        updated_at = getattr(video, 'updated_at', None) or created_at
                        if updated_at and getattr(updated_at, 'tzinfo', None) is None:
                            updated_at = updated_at.replace(tzinfo=UTC)
                        processing_stale_seconds = int((now - updated_at).total_seconds()) if updated_at else 0
                except Exception:
                    logger.exception(
                        'ai_video_queue_stall_recovery_failed',
                        extra={'request_id': get_request_id(), 'render_id': video_id},
                    )
        raw = service.repo.collection.document(video_id).get()
        raw_data = raw.to_dict() or {}
        pipeline_metadata = dict(raw_data.get('pipeline_metadata') or raw_data.get('pipelineMetadata') or {})
        provider_request_accepted = bool(
            raw_data.get('external_job_id')
            or raw_data.get('provider_status_url')
            or raw_data.get('provider_request_id')
            or pipeline_metadata.get('status_url')
            or pipeline_metadata.get('request_id')
            or pipeline_metadata.get('provider_status_url')
            or pipeline_metadata.get('provider_request_id')
        )
        selected_model_key = str(raw_data.get('selected_model') or getattr(video, 'selected_model', '') or '').strip()
        provider_backed_stale_seconds = MAX_PROCESSING_STALE_SECONDS
        if provider_request_accepted:
            if selected_model_key == 'sora2':
                provider_backed_stale_seconds = max(
                    MAX_PROCESSING_STALE_SECONDS,
                    int(getattr(settings, 'openai_video_timeout_seconds', 1200) or 1200) + 300,
                )
            else:
                try:
                    provider_backed_stale_seconds = max(
                        MAX_PROCESSING_STALE_SECONDS,
                        int(service.fal._terminal_timeout_for_model(selected_model_key)) + 300,
                    )
                except Exception:
                    provider_backed_stale_seconds = max(MAX_PROCESSING_STALE_SECONDS, 45 * 60)

        should_timeout = (
            (status_value == 'draft' and draft_age_seconds > MAX_DRAFT_AGE_SECONDS and not provider_request_accepted)
            or (status_value == 'processing' and processing_stale_seconds > provider_backed_stale_seconds)
        )
        if should_timeout:
            logger.warning(
                'ai_video_status_stale_timeout',
                extra={
                    'request_id': get_request_id(),
                    'render_id': video_id,
                    'status': status_value,
                    'draft_age_seconds': draft_age_seconds,
                    'processing_stale_seconds': processing_stale_seconds,
                    'provider_request_accepted': provider_request_accepted,
                    'provider_backed_stale_seconds': provider_backed_stale_seconds,
                },
            )
            if not bool(raw_data.get('timed_out_refunded', False)):
                charged_credits = int(raw_data.get('applied_credits') or 0)
                if charged_credits > 0 and not provider_request_accepted:
                    credit_service = CreditService()
                    credit_service.top_up_credits(
                        user_id=user_id,
                        credits=charged_credits,
                        metadata={'refund_for': 'video_create_timed_out', 'video_id': video_id},
                        idempotency_key=credit_service.make_idempotency_key(
                            'video_refund',
                            {'video_id': video_id},
                        ),
                    )
            video = service.repo.update(
                video,
                status='timed_out',
                progress=100,
                error_message=(
                    'Generation timed out while waiting for provider completion.'
                    if not provider_request_accepted
                    else 'Provider accepted the job but status polling timed out. The render may still complete later.'
                ),
                timed_out_refunded=not provider_request_accepted,
            )

    auto_tags: list[str] = []
    user_tags: list[str] = []
    try:
        auto_tags, user_tags = AssetTaggingService(None).list_tags(video.id, 'video')
    except Exception:
        # Tag storage can be unavailable; do not fail status polling for non-critical metadata.
        auto_tags, user_tags = [], []
    status_value = video.status.value if hasattr(video.status, 'value') else str(video.status)
    if status_value == 'completed':
        mapped_status = 'success'
    elif status_value in {'failed', 'timed_out', 'provider_failed'}:
        mapped_status = status_value
    else:
        mapped_status = 'processing'
    return AIVideoStatusResponse(
        id=video.id,
        status='queued' if status_value == 'draft' else mapped_status,
        progress=video.progress or 0,
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
        ttsProvider=getattr(video, 'tts_provider', None),
        ttsResolvedVoice=getattr(video, 'tts_resolved_voice', None),
        ttsProviderMessage=getattr(video, 'tts_provider_message', None),
        ttsFallbackUsed=bool(getattr(video, 'tts_fallback_used', False)),
        pipelineMetadata=dict(getattr(video, 'pipeline_metadata', {}) or {}),
    )


@router.get('/ai/image/models', response_model=list[ImageModelResponse])
def list_ai_image_models(
    _: str = Depends(get_user_id),
):
    service = ImageGenerationService(None)
    return [
        ImageModelResponse(
            key=model.key,
            label=model.label,
            description=model.description,
            frontend_hint=model.frontend_hint,
            provider=model.provider,
            badge=model.badge,
            logo_label=model.logo_label,
            alias_hint=model.alias_hint,
            provider_id=model.provider_id,
            canonical_model_key=model.canonical_model_key,
            mode_ids=list(model.mode_ids or []),
            billing_unit=model.billing_unit,
        )
        for model in service.list_models()
    ]


@router.get('/ai/images', response_model=list[ImageGenerationResponse])
def list_ai_images(
    limit: int | None = None,
    user_id: str = Depends(get_user_id),
):
    service = ImageGenerationService(None)
    db = None
    items: list[ImageGenerationResponse] = []
    for item in service.list_user_images(user_id, limit=limit):
        try:
            items.append(_to_image_generation_response(item, db))
        except Exception:
            continue
    return items


@router.get('/ai/images/inspiration', response_model=list[InspirationImageResponse])
def list_ai_image_inspiration(
    limit: int = 60,
    offset: int = 0,
    sort: str = 'curated',
    user_id: str = Depends(get_user_id),
):
    service = InspirationService(None)
    result: list[InspirationImageResponse] = []
    for item in service.list_image_inspiration(viewer_user_id=user_id, limit=limit, offset=offset, sort=sort):
        try:
            result.append(InspirationImageResponse.model_validate(item))
        except Exception:
            logger.warning(
                'inspiration_image_item_skipped',
                extra={'request_id': get_request_id(), 'user_id': user_id, 'asset_id': item.get('id') if isinstance(item, dict) else None},
            )
            continue
    return result


@router.get('/api/videos/inspiration', response_model=list[InspirationVideoResponse])
def list_ai_video_inspiration(
    limit: int = 60,
    offset: int = 0,
    sort: str = 'curated',
    user_id: str = Depends(get_user_id),
):
    service = InspirationService(None)
    result: list[InspirationVideoResponse] = []
    for item in service.list_video_inspiration(viewer_user_id=user_id, limit=limit, offset=offset, sort=sort):
        try:
            result.append(InspirationVideoResponse.model_validate(item))
        except Exception:
            logger.warning(
                'inspiration_video_item_skipped',
                extra={'request_id': get_request_id(), 'user_id': user_id, 'asset_id': item.get('id') if isinstance(item, dict) else None},
            )
            continue
    return result


@router.get('/public/images/inspiration', response_model=list[InspirationImageResponse])
def list_public_image_inspiration(
    limit: int = 60,
    offset: int = 0,
    sort: str = 'curated',
):
    service = InspirationService(None)
    result: list[InspirationImageResponse] = []
    for item in service.list_image_inspiration(viewer_user_id='public', limit=limit, offset=offset, sort=sort):
        try:
            result.append(InspirationImageResponse.model_validate(item))
        except Exception:
            logger.warning(
                'public_inspiration_image_item_skipped',
                extra={'request_id': get_request_id(), 'asset_id': item.get('id') if isinstance(item, dict) else None},
            )
            continue
    return result


@router.get('/public/videos/inspiration', response_model=list[InspirationVideoResponse])
def list_public_video_inspiration(
    limit: int = 60,
    offset: int = 0,
    sort: str = 'curated',
):
    service = InspirationService(None)
    result: list[InspirationVideoResponse] = []
    for item in service.list_video_inspiration(viewer_user_id='public', limit=limit, offset=offset, sort=sort):
        try:
            result.append(InspirationVideoResponse.model_validate(item))
        except Exception:
            logger.warning(
                'public_inspiration_video_item_skipped',
                extra={'request_id': get_request_id(), 'asset_id': item.get('id') if isinstance(item, dict) else None},
            )
            continue
    return result


@router.post('/inspiration/publish', response_model=InspirationPublishResponse)
def publish_to_inspiration(
    payload: InspirationPublishRequest,
    user_id: str = Depends(get_user_id),
):
    service = InspirationService(None)
    try:
        result = service.publish_asset(
            content_type=payload.content_type,
            asset_id=payload.asset_id,
            user_id=user_id,
            publish=payload.publish,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception(
            'inspiration_publish_failed',
            extra={
                'request_id': get_request_id(),
                'user_id': user_id,
                'asset_id': payload.asset_id,
                'content_type': payload.content_type,
                'publish': payload.publish,
                'error': str(exc),
            },
        )
        raise HTTPException(status_code=500, detail='Failed to update inspiration publish status') from exc
    return InspirationPublishResponse(
        asset_id=result.asset_id,
        content_type=result.content_type,
        is_public_inspiration=result.is_public_inspiration,
        moderation_status=result.moderation_status,
        inspiration_score=result.inspiration_score,
        like_count=result.like_count,
    )


@router.post('/inspiration/like', response_model=InspirationLikeResponse)
def like_inspiration_asset(
    payload: InspirationLikeRequest,
    user_id: str = Depends(get_user_id),
):
    service = InspirationService(None)
    try:
        result = service.toggle_like(
            content_type=payload.content_type,
            asset_id=payload.asset_id,
            user_id=user_id,
            liked=payload.liked,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception(
            'inspiration_like_failed',
            extra={
                'request_id': get_request_id(),
                'user_id': user_id,
                'asset_id': payload.asset_id,
                'content_type': payload.content_type,
                'liked': payload.liked,
                'error': str(exc),
            },
        )
        raise HTTPException(status_code=500, detail='Failed to update inspiration like status') from exc
    return InspirationLikeResponse(
        asset_id=result.asset_id,
        content_type=result.content_type,
        liked=result.liked,
        like_count=result.like_count,
    )


@router.get('/assets/tags', response_model=list[AssetTagFacet])
def list_asset_tags(
    query: str | None = None,
    content_type: str | None = None,
    user_id: str = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    try:
        service = AssetSearchService(db)
        facets = service.list_tag_facets(user_id=user_id, content_type=content_type, query=query)
        return [AssetTagFacet(tag=tag, count=count) for tag, count in facets]
    except Exception as exc:
        logger.exception(
            'asset_tag_list_failed',
            extra={'request_id': get_request_id(), 'user_id': user_id, 'content_type': content_type, 'error': str(exc)},
        )
        return []


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
    try:
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
                    is_public_inspiration=item.is_public_inspiration,
                    moderation_status=item.moderation_status,
                    inspiration_score=item.inspiration_score,
                    like_count=item.like_count,
                )
                for item in items
            ],
            total=total,
            page=page,
            page_size=page_size,
        )
    except Exception as exc:
        logger.exception(
            'asset_search_failed',
            extra={'request_id': get_request_id(), 'user_id': user_id, 'content_type': content_type, 'error': str(exc)},
        )
        return AssetSearchResponse(items=[], total=0, page=page, page_size=page_size)


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
):
    service = ImageGenerationService(None)
    deduction_amount = 0
    try:
        credit_service = CreditService()
        estimate = credit_service.estimate('image_generate', payload.model_dump())
        remaining_credits: int | None = None
        if estimate.required_credits > 0:
            idempotency_metadata = {'user_id': user_id, **payload.model_dump()}
            if payload.request_id:
                idempotency_metadata['request_id'] = payload.request_id
            deduction = credit_service.deduct_credits(
                user_id=user_id,
                amount=estimate.required_credits,
                feature_key='image_generate',
                metadata=payload.model_dump(),
                source='premium',
                idempotency_key=credit_service.make_idempotency_key(
                    'image_generate',
                    idempotency_metadata,
                ),
            )
            deduction_amount = estimate.required_credits
            remaining_credits = deduction.wallet.current_credits
        else:
            idempotency_metadata = {'user_id': user_id, **payload.model_dump()}
            if payload.request_id:
                idempotency_metadata['request_id'] = payload.request_id
            deduction = credit_service.deduct_credits(
                user_id=user_id,
                amount=0,
                feature_key='image_generate_free',
                metadata=payload.model_dump(),
                source='free',
                idempotency_key=credit_service.make_idempotency_key(
                    'image_generate_free',
                    idempotency_metadata,
                ),
            )
            remaining_credits = deduction.wallet.current_credits
        generations = service.create_images(
            user_id=user_id,
            model_key=payload.model_key,
            prompt=payload.prompt,
            aspect_ratio=payload.aspect_ratio,
            resolution=payload.resolution,
            reference_urls=payload.reference_urls,
            reference_mode=payload.reference_mode,
            image_count=payload.image_count,
            project_id=payload.project_id,
            mode_id=payload.mode_id,
            template_id=payload.template_id,
        )
        generation = generations[0]
        if deduction_amount > 0 and getattr(generation, 'status', None) == ImageGenerationStatus.failed:
            CreditService().top_up_credits(
                user_id=user_id,
                credits=deduction_amount,
                metadata={
                    'refund_for': 'image_generate_failed_status',
                    'generation_id': generation.id,
                    'model_key': payload.model_key,
                },
            )
            deduction_amount = 0
        bonus_wallet, _ = credit_service.grant_activation_bonus_if_eligible(
            user_id=user_id,
            trigger='first_image_generated',
            trigger_ref=generation.id,
        )
        remaining_credits = bonus_wallet.current_credits
        return _to_image_generation_response(
            generation,
            None,
            applied_credits=estimate.required_credits,
            remaining_credits=remaining_credits,
        )
    except InsufficientCreditsError as exc:
        raise HTTPException(
            status_code=402,
            detail={'error': 'INSUFFICIENT_CREDITS', 'message': 'You do not have enough credits'},
        ) from exc
    except CreditCapExceededError as exc:
        raise HTTPException(status_code=400, detail='Requested configuration exceeds allowed credit cap') from exc
    except Exception as exc:
        if deduction_amount > 0:
            CreditService().top_up_credits(
                user_id=user_id,
                credits=deduction_amount,
                metadata={'refund_for': 'image_generate_error', 'model_key': payload.model_key},
            )
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
):
    service = ImageGenerationService(None)
    return ImagePromptEnhanceResponse(prompt=service.enhance_prompt(payload.prompt, payload.model_key))


@router.post('/ai/images/action', response_model=ImageActionResponse)
def apply_ai_image_action(
    payload: ImageActionRequest,
    user_id: str = Depends(get_user_id),
):
    service = ImageGenerationService(None)
    try:
        credit_service = CreditService()
        estimate = credit_service.estimate('image_action', payload.model_dump())
        if estimate.required_credits > 0:
            credit_service.deduct_credits(
                user_id=user_id,
                amount=estimate.required_credits,
                feature_key=f'image_action:{payload.action_type}',
                metadata=payload.model_dump(),
                source='premium',
                idempotency_key=credit_service.make_idempotency_key(
                    'image_action',
                    {'user_id': user_id, **payload.model_dump()},
                ),
            )
        else:
            credit_service.deduct_credits(
                user_id=user_id,
                amount=0,
                feature_key=f'image_action:{payload.action_type}',
                metadata=payload.model_dump(),
                source='free',
                idempotency_key=credit_service.make_idempotency_key(
                    'image_action_free',
                    {'user_id': user_id, **payload.model_dump()},
                ),
            )
        results = service.apply_action(user_id=user_id, generation_id=payload.image_id, action=payload.action_type)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InsufficientCreditsError as exc:
        raise HTTPException(
            status_code=402,
            detail={'error': 'INSUFFICIENT_CREDITS', 'message': 'You do not have enough credits'},
        ) from exc
    except CreditCapExceededError as exc:
        raise HTTPException(status_code=400, detail='Requested configuration exceeds allowed credit cap') from exc
    return ImageActionResponse(
        action_type=payload.action_type,
        items=[_to_image_generation_response(item, None) for item in results],
    )


@router.post('/ai/images/{image_id}/action', response_model=ImageGenerationResponse)
def apply_ai_image_action_legacy(
    image_id: str,
    payload: dict,
    user_id: str = Depends(get_user_id),
):
    action_type = str(payload.get('action') or payload.get('action_type') or '').strip()
    if not action_type:
        raise HTTPException(status_code=422, detail='action is required')
    service = ImageGenerationService(None)
    try:
        results = service.apply_action(user_id=user_id, generation_id=image_id, action=action_type)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return _to_image_generation_response(results[0], None)


@router.delete('/ai/images/{image_id}', response_model=UploadDeleteResponse)
def delete_generated_image(
    image_id: str,
    user_id: str = Depends(get_user_id),
):
    deleted = ImageGenerationRepository(None).soft_delete(image_id, user_id=user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail='Image not found')
    logger.info('image_generation_deleted', extra={'request_id': get_request_id(), 'user_id': user_id, 'image_id': image_id})
    return UploadDeleteResponse(asset_id=image_id, deleted=True)


@router.get('/api/influencer/personas', response_model=list[InfluencerPersonaResponse])
def list_influencer_personas(
    user_id: str = Depends(get_user_id),
):
    try:
        service = InfluencerService(None)
        return [_to_influencer_persona_response(item) for item in service.list_personas(user_id)]
    except Exception as exc:
        logger.exception(
            'influencer_persona_list_failed',
            extra={'request_id': get_request_id(), 'user_id': user_id, 'error': str(exc)},
        )
        return []


@router.post('/api/influencer/personas', response_model=InfluencerPersonaResponse, status_code=status.HTTP_201_CREATED)
def create_influencer_persona(
    payload: InfluencerPersonaCreateRequest,
    user_id: str = Depends(get_user_id),
):
    try:
        persona = InfluencerService(None).create_persona(user_id, **payload.model_dump())
    except Exception as exc:
        logger.exception(
            'influencer_persona_create_failed',
            extra={'request_id': get_request_id(), 'user_id': user_id, 'error': str(exc)},
        )
        raise HTTPException(status_code=500, detail='Failed to save persona') from exc
    return _to_influencer_persona_response(persona)


@router.get('/api/influencer/personas/{persona_id}', response_model=InfluencerPersonaResponse)
def get_influencer_persona(
    persona_id: str,
    user_id: str = Depends(get_user_id),
):
    service = InfluencerService(None)
    try:
        persona = service.get_persona(persona_id, user_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return _to_influencer_persona_response(persona)


@router.put('/api/influencer/personas/{persona_id}', response_model=InfluencerPersonaResponse)
def update_influencer_persona(
    persona_id: str,
    payload: InfluencerPersonaUpdateRequest,
    user_id: str = Depends(get_user_id),
):
    service = InfluencerService(None)
    try:
        persona = service.update_persona(persona_id, user_id, **payload.model_dump())
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception(
            'influencer_persona_update_failed',
            extra={'request_id': get_request_id(), 'user_id': user_id, 'persona_id': persona_id, 'error': str(exc)},
        )
        raise HTTPException(status_code=500, detail='Failed to save persona') from exc
    return _to_influencer_persona_response(persona)


@router.post('/api/influencer/personas/{persona_id}/reference', response_model=InfluencerPersonaResponse)
async def upload_influencer_reference(
    persona_id: str,
    file: UploadFile = File(...),
    user_id: str = Depends(get_user_id),
):
    service = InfluencerService(None)
    try:
        persona = service.upload_reference_image(
            persona_id,
            user_id,
            filename=file.filename or 'reference.png',
            content=await file.read(),
            content_type=file.content_type or 'image/png',
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _to_influencer_persona_response(persona)


@router.post('/api/influencer/personas/{persona_id}/lock', response_model=InfluencerReferenceLockResponse)
def lock_influencer_reference(
    persona_id: str,
    user_id: str = Depends(get_user_id),
):
    credit_service = CreditService()
    service = InfluencerService(None)
    try:
        persona = service.get_persona(persona_id, user_id)
        if not persona.reference_image_url:
            raise ValueError('Upload a reference image before locking identity')
        estimate = credit_service.estimate('influencer_reference_lock', {})
        if estimate.required_credits > 0:
            deduction = credit_service.deduct_credits(
                user_id=user_id,
                amount=estimate.required_credits,
                feature_key='influencer_reference_lock',
                metadata={'persona_id': persona_id},
                source='premium',
                idempotency_key=credit_service.make_idempotency_key(
                    'influencer_reference_lock',
                    {'user_id': user_id, 'persona_id': persona_id},
                ),
            )
            remaining = deduction.wallet.current_credits
        else:
            remaining = credit_service.ensure_wallet(user_id).current_credits
        persona = service.lock_reference(persona_id, user_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except InsufficientCreditsError as exc:
        raise HTTPException(
            status_code=402,
            detail={'error': 'INSUFFICIENT_CREDITS', 'message': 'You do not have enough credits', 'required': exc.required, 'available': exc.available},
        ) from exc
    return InfluencerReferenceLockResponse(
        persona=_to_influencer_persona_response(persona),
        message=f'Character identity locked. Remaining balance: {remaining} credits.',
    )


@router.get('/api/influencer/poses', response_model=list[InfluencerPoseOptionResponse])
def list_influencer_poses(user_id: str = Depends(get_user_id)):
    return [InfluencerPoseOptionResponse(**item) for item in InfluencerService(None).list_pose_options()]


@router.get('/api/influencer/scenes', response_model=list[InfluencerScenePresetResponse])
def list_influencer_scenes(persona_id: str | None = None, user_id: str = Depends(get_user_id)):
    return [InfluencerScenePresetResponse(**item) for item in InfluencerService(None).list_scene_library(user_id, persona_id)]


@router.post('/api/influencer/scenes', response_model=InfluencerScenePresetResponse, status_code=status.HTTP_201_CREATED)
def create_influencer_scene(
    payload: InfluencerScenePresetCreateRequest,
    user_id: str = Depends(get_user_id),
):
    scene = InfluencerService(None).create_scene_preset(
        user_id,
        persona_id=payload.persona_id,
        label=payload.label,
        description=payload.description,
        environment=payload.environment,
        props=payload.props,
        lighting=payload.lighting,
        mood=payload.mood,
        negative_constraints=payload.negative_constraints,
    )
    return InfluencerScenePresetResponse(**scene)


@router.post('/api/influencer/generate', response_model=InfluencerContentResponse)
def generate_influencer_content(
    payload: InfluencerContentGenerateRequest,
    user_id: str = Depends(get_user_id),
):
    credit_service = CreditService()
    try:
        estimate = credit_service.estimate('influencer_content_generate', {})
        applied_credits = 0
        remaining_credits = credit_service.ensure_wallet(user_id).current_credits
        if estimate.required_credits > 0:
            deduction = credit_service.deduct_credits(
                user_id=user_id,
                amount=estimate.required_credits,
                feature_key='influencer_content_generate',
                metadata={'persona_id': payload.persona_id, 'platform': payload.platform},
                source='premium',
                idempotency_key=credit_service.make_idempotency_key(
                    'influencer_content_generate',
                    {
                        'user_id': user_id,
                        'persona_id': payload.persona_id,
                        'platform': payload.platform,
                        'intent': payload.intent,
                    },
                ),
            )
            applied_credits = estimate.required_credits
            remaining_credits = deduction.wallet.current_credits
        result = InfluencerService(None).generate_content(
            payload.persona_id,
            user_id,
            intent=payload.intent,
            platform=payload.platform,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InsufficientCreditsError as exc:
        raise HTTPException(
            status_code=402,
            detail={'error': 'INSUFFICIENT_CREDITS', 'message': 'You do not have enough credits', 'required': exc.required, 'available': exc.available},
        ) from exc
    return InfluencerContentResponse(
        **result,
        applied_credits=applied_credits,
        remaining_credits=remaining_credits,
    )


@router.post('/api/influencer/generate-image', response_model=ImageGenerationResponse)
def generate_influencer_image(
    payload: InfluencerImageGenerateRequest,
    user_id: str = Depends(get_user_id),
):
    credit_service = CreditService()
    estimate_payload = {
        'model': payload.model_key,
        'resolution': payload.resolution,
    }
    try:
        estimate = credit_service.estimate('influencer_image_generate', estimate_payload)
        applied_credits = 0
        remaining_credits = credit_service.ensure_wallet(user_id).current_credits
        if estimate.required_credits > 0:
            deduction = credit_service.deduct_credits(
                user_id=user_id,
                amount=estimate.required_credits,
                feature_key='influencer_image_generate',
                metadata={
                    'persona_id': payload.persona_id,
                    'pose': payload.pose,
                    'scene': payload.scene,
                    'resolution': payload.resolution,
                    'model_key': payload.model_key,
                },
                source='premium',
                idempotency_key=credit_service.make_idempotency_key(
                    'influencer_image_generate',
                    {
                        'user_id': user_id,
                        'persona_id': payload.persona_id,
                        'pose': payload.pose,
                        'scene': payload.scene,
                        'resolution': payload.resolution,
                        'model_key': payload.model_key,
                    },
                ),
            )
            applied_credits = estimate.required_credits
            remaining_credits = deduction.wallet.current_credits
        image = InfluencerService(None).generate_consistent_image(
            payload.persona_id,
            user_id,
            pose=payload.pose,
            scene=payload.scene,
            custom_pose=payload.custom_pose,
            model_key=payload.model_key,
            aspect_ratio=payload.aspect_ratio,
            resolution=payload.resolution,
        )
        bonus_wallet, _ = credit_service.grant_activation_bonus_if_eligible(
            user_id=user_id,
            trigger='first_influencer_image_generated',
            trigger_ref=image.id,
        )
        remaining_credits = bonus_wallet.current_credits
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except InsufficientCreditsError as exc:
        raise HTTPException(
            status_code=402,
            detail={'error': 'INSUFFICIENT_CREDITS', 'message': 'You do not have enough credits', 'required': exc.required, 'available': exc.available},
        ) from exc
    return _to_image_generation_response(image, None, applied_credits=applied_credits, remaining_credits=remaining_credits)


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


@router.get('/templates', response_model=list[TemplateResponse])
def list_templates(
    search: str | None = None,
    category: str | None = None,
    aspect_ratio: str | None = None,
    _: str = Depends(get_user_id),
):
    service = TemplateService()
    return service.list_templates(search=search, category=category, aspect_ratio=aspect_ratio)


@router.get('/api/templates', response_model=list[UnifiedTemplateResponse])
def list_unified_templates(
    type: str | None = None,
    category: str | None = None,
    trending: bool | None = None,
    featured: bool | None = None,
    active: bool | None = True,
    aspect_ratio: str | None = None,
    search: str | None = None,
    _: str = Depends(get_user_id),
):
    service = TemplateManagementService()
    return service.list_templates(
        type=type,
        category=category,
        trending=trending,
        featured=featured,
        active=active,
        aspect_ratio=aspect_ratio,
        search=search,
    )


@router.get('/api/recipes', response_model=list[RecipeCatalogResponse])
def list_recipe_catalog(
    type: str | None = 'video',
    active: bool | None = True,
    featured: bool | None = None,
    _: str = Depends(get_user_id),
):
    return list_recipes(type=type, active=active, featured=featured)


@router.get('/api/templates/{template_id}', response_model=UnifiedTemplateResponse)
def get_unified_template(
    template_id: str,
    _: str = Depends(get_user_id),
):
    service = TemplateManagementService()
    template = service.get_template(template_id)
    if not template:
        raise HTTPException(status_code=404, detail='Template not found')
    return template


@router.post('/api/templates/preview', response_model=TemplatePreviewResponse)
def preview_template(
    payload: TemplateGenerateRequest,
    _: str = Depends(get_user_id),
):
    service = TemplateManagementService()
    try:
        return service.preview_template(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post('/api/templates/generate', response_model=TemplateGenerateResponse)
def generate_from_template(
    payload: TemplateGenerateRequest,
    user_id: str = Depends(get_user_id),
):
    service = TemplateManagementService()
    try:
        return service.generate_from_template(user_id=user_id, payload=payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except InsufficientCreditsError as exc:
        raise HTTPException(
            status_code=402,
            detail={'error': 'INSUFFICIENT_CREDITS', 'message': 'You do not have enough credits'},
        ) from exc
    except CreditCapExceededError as exc:
        raise HTTPException(status_code=400, detail='Requested configuration exceeds allowed credit cap') from exc
    except ProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception(
            'template_generate_failed',
            extra={'request_id': get_request_id(), 'user_id': user_id, 'template_id': payload.template_id, 'error': str(exc)},
        )
        detail = str(exc).strip() or 'Failed to generate from template'
        if settings.env != 'development':
            detail = 'Failed to generate from template'
        raise HTTPException(status_code=500, detail=detail) from exc


@router.post('/api/admin/templates', response_model=UnifiedTemplateResponse)
def create_template(
    payload: TemplateUpsertRequest,
    admin_user_id: str = Depends(require_admin_user),
):
    service = TemplateManagementService()
    return service.create_template(payload, created_by=admin_user_id)


@router.put('/api/admin/templates/{template_id}', response_model=UnifiedTemplateResponse)
def update_template(
    template_id: str,
    payload: TemplateUpsertRequest,
    admin_user_id: str = Depends(require_admin_user),
):
    service = TemplateManagementService()
    try:
        return service.update_template(template_id, payload, updated_by=admin_user_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.patch('/api/admin/templates/{template_id}/status', response_model=UnifiedTemplateResponse)
def update_template_status(
    template_id: str,
    payload: TemplateStatusUpdateRequest,
    _: str = Depends(require_admin_user),
):
    service = TemplateManagementService()
    try:
        return service.update_status(
            template_id,
            active=payload.active,
            trending=payload.trending,
            featured=payload.featured,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete('/api/admin/templates/{template_id}', response_model=UnifiedTemplateResponse)
def delete_template(
    template_id: str,
    _: str = Depends(require_admin_user),
):
    service = TemplateManagementService()
    try:
        return service.delete_template(template_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post('/api/admin/templates/upload-preview')
async def upload_template_preview(
    file: UploadFile = File(...),
    _: str = Depends(require_admin_user),
):
    service = TemplateManagementService()
    try:
        url = service.upload_preview_media(file=file)
        return {'url': url}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception('template_preview_upload_failed', extra={'request_id': get_request_id(), 'error': str(exc)})
        raise HTTPException(status_code=500, detail='Failed to upload template preview') from exc


@router.post('/projects', response_model=ProjectResponse)
def create_project(
    payload: CreateProjectRequest,
    user_id: str = Depends(get_user_id),
):
    if payload.user_id != user_id:
        raise HTTPException(status_code=403, detail='Forbidden user_id')
    service = ProjectService(None)
    project = service.create_project(payload)
    CreditService().grant_activation_bonus_if_eligible(
        user_id=user_id,
        trigger='first_project_created',
        trigger_ref=project.id,
    )
    return project


@router.get('/projects', response_model=list[ProjectResponse])
def list_projects(
    response: Response,
    user_id: str = Depends(get_user_id),
):
    response.headers['Cache-Control'] = 'private, max-age=10'
    service = ProjectService(None)
    return service.list_projects(user_id=user_id)


@router.get('/projects/{project_id}')
def get_project(
    project_id: str,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_user_id),
):
    service = ProjectService(None)
    project = service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail='Project not found')
    if project.user_id != user_id:
        raise HTTPException(status_code=403, detail='Project does not belong to this user')
    renders = service.list_project_renders(project_id)
    images = service.list_project_images(project_id, limit=24)
    videos = service.list_project_videos(project_id, limit=24)
    return {
        'project': ProjectResponse.model_validate(project),
        'renders': [RenderResponse.model_validate(item) for item in renders],
        'images': [_to_image_generation_response(item, None) for item in images],
        'videos': [_to_video_response(item, db) for item in videos],
        'summary': {
            'imageCount': len(images),
            'videoCount': len(videos),
            'renderCount': len(renders),
        },
    }


@router.patch('/projects/{project_id}', response_model=ProjectResponse)
def update_project(
    project_id: str,
    payload: UpdateProjectRequest,
    user_id: str = Depends(get_user_id),
):
    service = ProjectService(None)
    try:
        project = service.update_project(project_id, user_id, payload)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    if not project:
        raise HTTPException(status_code=404, detail='Project not found')
    return project


@router.delete('/projects/{project_id}', response_model=UploadDeleteResponse)
def delete_project(
    project_id: str,
    user_id: str = Depends(get_user_id),
):
    service = ProjectService(None)
    try:
        deleted = service.delete_project(project_id, user_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    if not deleted:
        raise HTTPException(status_code=404, detail='Project not found')
    logger.info('project_deleted', extra={'request_id': get_request_id(), 'user_id': user_id, 'project_id': project_id})
    return UploadDeleteResponse(asset_id=project_id, deleted=True)


@router.post('/projects/{project_id}/assets', response_model=ProjectAssetResponse, status_code=status.HTTP_201_CREATED)
def create_project_asset(
    project_id: str,
    payload: CreateProjectAssetRequest,
    user_id: str = Depends(get_user_id),
):
    service = ProjectService(None)
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


@router.patch('/projects/assets/image/{image_id}', response_model=AssetProjectAssignmentResponse)
def assign_image_to_project(
    image_id: str,
    payload: AssignAssetProjectRequest,
    user_id: str = Depends(get_user_id),
):
    service = ProjectService(None)
    try:
        generation, previous_project_id = service.assign_image_to_project(image_id, user_id, payload.project_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    return AssetProjectAssignmentResponse(
        asset_id=generation.id,
        content_type='image',
        project_id=payload.project_id,
        previous_project_id=previous_project_id,
    )


@router.patch('/projects/assets/video/{video_id}', response_model=AssetProjectAssignmentResponse)
def assign_video_to_project(
    video_id: str,
    payload: AssignAssetProjectRequest,
    user_id: str = Depends(get_user_id),
):
    service = ProjectService(None)
    try:
        video, previous_project_id = service.assign_video_to_project(video_id, user_id, payload.project_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    return AssetProjectAssignmentResponse(
        asset_id=video.id,
        content_type='video',
        project_id=payload.project_id,
        previous_project_id=previous_project_id,
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
    user_id: str = Depends(get_user_id),
):
    try:
        if payload.user_id and payload.user_id != user_id:
            raise HTTPException(status_code=403, detail='Forbidden user_id')
        resolved_payload = payload.model_copy(update={'user_id': payload.user_id or user_id})
        service = UploadService(db)
        asset, signed = service.sign_upload(resolved_payload)
        return UploadSignResponse(
            asset_id=asset.id,
            upload_url=signed.upload_url,
            public_url=asset.public_url,
            method=signed.method,
            headers=signed.headers,
        )
    except HTTPException:
        raise
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post('/uploads/direct', response_model=UploadSignResponse)
async def direct_upload(
    file: UploadFile = File(...),
    kind: str = Form('brand_asset'),
    project_id: str | None = Form(default=None),
    db: Session = Depends(get_db),
    user_id: str = Depends(get_user_id),
):
    try:
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail='Uploaded file is empty')
        service = UploadService(db)
        asset, signed = service.upload_direct(
            user_id=user_id,
            filename=file.filename or 'upload.bin',
            content=content,
            content_type=file.content_type or 'application/octet-stream',
            kind=kind,
            project_id=project_id,
        )
        return UploadSignResponse(
            asset_id=asset.id,
            upload_url='',
            public_url=asset.public_url,
            method='PUT',
            headers={},
        )
    except HTTPException:
        raise
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


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
    limit: int | None = 50,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_user_id),
):
    service = VideoService(None)
    videos = service.list_videos(user_id, limit=limit)
    asset_tagging = AssetTaggingService(db)
    tag_map = asset_tagging.list_tags_for_assets([('video', video.id) for video in videos])
    return [_to_video_response(video, db, preloaded_tags=tag_map) for video in videos]


@router.get('/notifications', response_model=list[NotificationResponse])
def list_notifications(
    limit: int | None = 20,
    user_id: str = Depends(get_user_id),
):
    firestore_client = get_firestore_client()
    bounded_limit = max(1, min(limit or 20, 50))
    items: list[NotificationResponse] = []
    rows = []
    try:
        query = (
            firestore_client.collection('notifications')
            .where('user_id', '==', user_id)
            .order_by('created_at', direction=firestore.Query.DESCENDING)
            .limit(bounded_limit)
        )
        rows = list(query.stream())
    except Exception:
        fallback_query = firestore_client.collection('notifications').where('user_id', '==', user_id).limit(bounded_limit)
        rows = sorted(
            list(fallback_query.stream()),
            key=lambda row: (row.to_dict() or {}).get('created_at') or datetime.min,
            reverse=True,
        )[:bounded_limit]

    for row in rows:
        data = row.to_dict() or {}
        created_at = data.get('created_at')
        if not isinstance(created_at, datetime):
            created_at = datetime.utcnow()
        metadata = data.get('metadata') if isinstance(data.get('metadata'), dict) else {}
        items.append(
            NotificationResponse(
                id=row.id,
                user_id=str(data.get('user_id') or user_id),
                type=str(data.get('type') or 'notification'),
                title=str(data.get('title') or 'Notification'),
                message=str(data.get('message') or ''),
                video_id=str(data.get('video_id')) if data.get('video_id') else None,
                recipe_id=str(data.get('recipe_id')) if data.get('recipe_id') else None,
                read=bool(data.get('read')),
                created_at=created_at,
                metadata=NotificationMetadataResponse(
                    output_url=str(metadata.get('output_url')) if metadata.get('output_url') else None,
                    thumbnail_url=str(metadata.get('thumbnail_url')) if metadata.get('thumbnail_url') else None,
                    selected_model=str(metadata.get('selected_model')) if metadata.get('selected_model') else None,
                    provider=str(metadata.get('provider')) if metadata.get('provider') else None,
                ),
            )
        )
    return items


@router.post('/notifications/read')
def mark_notifications_read(
    payload: NotificationReadRequest,
    user_id: str = Depends(get_user_id),
):
    firestore_client = get_firestore_client()
    updated = 0
    ids = [value.strip() for value in payload.ids if isinstance(value, str) and value.strip()]

    if ids:
        for notification_id in ids:
            doc_ref = firestore_client.collection('notifications').document(notification_id)
            snapshot = doc_ref.get()
            if not snapshot.exists:
                continue
            data = snapshot.to_dict() or {}
            if str(data.get('user_id') or '') != user_id:
                continue
            if bool(data.get('read')):
                continue
            doc_ref.set({'read': True}, merge=True)
            updated += 1
    else:
        try:
            rows = list(
                firestore_client.collection('notifications')
                .where('user_id', '==', user_id)
                .where('read', '==', False)
                .limit(50)
                .stream()
            )
        except Exception:
            rows = [
                row
                for row in firestore_client.collection('notifications').where('user_id', '==', user_id).limit(50).stream()
                if not bool((row.to_dict() or {}).get('read'))
            ]
        for row in rows:
            row.reference.set({'read': True}, merge=True)
            updated += 1

    return {'updated': updated}


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


@router.get('/api/recipes/avatar-product/tts-catalog', response_model=TTSCatalogResponse)
def get_avatar_product_tts_catalog(_: str = Depends(get_user_id)) -> TTSCatalogResponse:
    return TTSCatalogResponse(
        provider='gemini_flash_tts',
        model='fal-ai/gemini-3.1-flash-tts',
        languages=[
            TTSLanguageOptionResponse(code=item.code, label=item.label, native_label=item.native_label)
            for item in list_avatar_product_gemini_languages()
        ],
        voices=[
            TTSVoiceOptionResponse(
                key=item.key,
                label=item.label,
                tone=item.tone,
                gender=item.gender,
                provider_voice=item.key,
                supported_language_codes=[],
                description=item.description,
            )
            for item in list_avatar_product_gemini_voices()
        ],
    )


@router.post('/tts/preview', response_model=TTSPreviewResponse)
def generate_tts_preview(
    payload: TTSPreviewRequest,
    user_id: str = Depends(get_user_id),
) -> TTSPreviewResponse:
    preview_text = payload.text.strip()[:PREVIEW_MAX_CHARS]
    gemini_voice_keys = {item.key for item in list_avatar_product_gemini_voices()}
    gemini_language_codes = {item.code for item in list_avatar_product_gemini_languages()}
    is_avatar_product_gemini_preview = payload.voice in gemini_voice_keys or payload.language in gemini_language_codes

    if is_avatar_product_gemini_preview:
        try:
            assert_preview_rate_limit(user_id)
        except RuntimeError as exc:
            raise HTTPException(
                status_code=429,
                detail=f'{exc} Limit: {PREVIEW_MAX_REQUESTS_PER_WINDOW} previews every {PREVIEW_WINDOW_SECONDS // 60} minutes.',
            ) from exc
        try:
            preview_url, _meta = FalVideoService().generate_gemini_flash_tts(
                text=preview_text,
                voice=payload.voice,
                language_code=resolve_avatar_product_gemini_language(payload.language),
                style_instructions=(
                    f"Speak entirely in {resolve_avatar_product_gemini_language(payload.language)}. "
                    "Warm Indian creator voice, natural product-ad delivery, clear pacing, friendly confidence."
                ),
            )
        except RuntimeError as exc:
            logger.exception('avatar_product_tts_preview_generation_failed')
            raise HTTPException(status_code=502, detail=str(exc)) from exc

        return TTSPreviewResponse(
            preview_url=preview_url,
            provider='Gemini Flash TTS',
            resolved_voice=payload.voice,
            cached=False,
            preview_limit=f'{PREVIEW_MAX_REQUESTS_PER_WINDOW} uncached previews / {PREVIEW_WINDOW_SECONDS // 60} min · {PREVIEW_MAX_CHARS} chars max',
            provider_message='Avatar Product preview uses Gemini Flash TTS.',
            applied_credits=0,
            remaining_credits=None,
        )

    credit_service = CreditService()
    wallet = credit_service.ensure_wallet(user_id)
    try:
        estimate = credit_service.estimate(
            'tts_preview',
            {
                'voice': payload.voice,
                'provider': 'free' if payload.voice in credit_service.free_voice_keys else 'sarvam',
                'sample_rate_hz': payload.sample_rate_hz,
            },
        )
    except CreditCapExceededError as exc:
        raise HTTPException(status_code=400, detail='Requested configuration exceeds allowed credit cap') from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
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
        try:
            result = generate_voiceover_detailed(
                script=preview_text,
                voice=payload.voice,
                cache_dir=cache_dir,
                language=payload.language,
                sample_rate_hz=payload.sample_rate_hz,
                allow_premium=wallet.current_credits >= estimate.required_credits,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except RuntimeError as exc:
            logger.exception('tts_preview_generation_failed')
            raise HTTPException(status_code=502, detail=str(exc)) from exc
    applied_credits = 0
    remaining_credits = wallet.current_credits
    if not result.cached and result.provider == 'Sarvam AI' and estimate.required_credits > 0:
        try:
            deduction = credit_service.deduct_credits(
                user_id=user_id,
                amount=estimate.required_credits,
                feature_key='tts_preview',
                metadata={
                    'voice': payload.voice,
                    'language': payload.language,
                    'sample_rate_hz': payload.sample_rate_hz,
                    'text_hash': hashlib.sha256(preview_text.encode('utf-8')).hexdigest(),
                },
                source='premium',
                idempotency_key=credit_service.make_idempotency_key(
                    'tts_preview',
                    {
                        'user_id': user_id,
                        'voice': payload.voice,
                        'language': payload.language,
                        'sample_rate_hz': payload.sample_rate_hz,
                        'text_hash': hashlib.sha256(preview_text.encode('utf-8')).hexdigest(),
                    },
                ),
            )
            applied_credits = estimate.required_credits
            remaining_credits = deduction.wallet.current_credits
        except InsufficientCreditsError:
            # If premium synthesis succeeded but credits became unavailable concurrently,
            # surface the asset as fallback-free but do not pretend the balance changed.
            try:
                result = generate_voiceover_detailed(
                    script=preview_text,
                    voice=payload.voice,
                    cache_dir=cache_dir,
                    language=payload.language,
                    sample_rate_hz=payload.sample_rate_hz,
                    allow_premium=False,
                )
            except RuntimeError as exc:
                logger.exception('tts_preview_fallback_generation_failed')
                raise HTTPException(status_code=502, detail=str(exc)) from exc
    preview_url = f"/static/{result.path.as_posix().replace('data/', '', 1)}"
    return TTSPreviewResponse(
        preview_url=preview_url,
        provider=result.provider,
        resolved_voice=result.resolved_voice,
        cached=result.cached,
        preview_limit=f'{PREVIEW_MAX_REQUESTS_PER_WINDOW} uncached previews / {PREVIEW_WINDOW_SECONDS // 60} min · {PREVIEW_MAX_CHARS} chars max',
        provider_message=result.provider_message,
        applied_credits=applied_credits,
        remaining_credits=remaining_credits,
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
    audio_sample_rate_hz: int = Form(default=48000),
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
    payload: VideoRetryRequest | None = None,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_user_id),
):
    service = VideoService(db)
    video = service.retry_video(
        video_id,
        user_id,
        voice_override=payload.voice if payload else None,
        language_override=payload.language if payload else None,
        script_override=payload.script if payload else None,
        audio_sample_rate_hz=payload.audio_sample_rate_hz if payload else None,
    )
    if not video:
        raise HTTPException(status_code=404, detail='Video not found')
    return VideoRetryResponse(id=video.id, status=video.status.value if hasattr(video.status, 'value') else str(video.status))


@router.delete('/videos/{video_id}', response_model=UploadDeleteResponse)
def delete_video(
    video_id: str,
    user_id: str = Depends(get_user_id),
):
    deleted = VideoRepository(None).soft_delete(video_id, user_id=user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail='Video not found')
    logger.info('video_deleted', extra={'request_id': get_request_id(), 'user_id': user_id, 'video_id': video_id})
    return UploadDeleteResponse(asset_id=video_id, deleted=True)




@router.post("/webhooks/video-complete")
async def video_complete_webhook(request: Request):

    payload = await request.json()

    print("🔥 WEBHOOK RECEIVED:", payload)

    status = payload.get("status")
    video_url = payload.get("video_url")
    metadata = payload.get("metadata", {})

    video_id = metadata.get("video_id")
    user_id = metadata.get("user_id")  # VERY IMPORTANT

    if not video_id or not user_id:
        return {"error": "missing video_id or user_id"}

    db = get_firestore_client()

    video_ref = db.collection("users") \
                  .document(user_id) \
                  .collection("videos") \
                  .document(video_id)

    update_data = {
        "status": status,
        "updatedAt": datetime.utcnow().isoformat(),
    }

    if status == "completed":
        update_data["outputUrl"] = video_url
        update_data["completedAt"] = datetime.utcnow().isoformat()

    if status == "failed":
        update_data["errorMessage"] = payload.get("error")

    video_ref.set(update_data, merge=True)

    print("✅ VIDEO UPDATED:", video_id)

    return {"ok": True}


    payload = await request.json()

    print("🔥 WEBHOOK RECEIVED:", payload)

    status = payload.get("status")
    video_url = payload.get("video_url")
    metadata = payload.get("metadata", {})

    video_id = metadata.get("video_id")
    user_id = metadata.get("user_id")  # VERY IMPORTANT

    if not video_id or not user_id:
        return {"error": "missing video_id or user_id"}

    db = get_firestore_client()

    video_ref = db.collection("users") \
                  .document(user_id) \
                  .collection("videos") \
                  .document(video_id)

    update_data = {
        "status": status,
        "updatedAt": datetime.utcnow().isoformat(),
    }

    if status == "completed":
        update_data["outputUrl"] = video_url
        update_data["completedAt"] = datetime.utcnow().isoformat()

    if status == "failed":
        update_data["errorMessage"] = payload.get("error")

    video_ref.set(update_data, merge=True)

    print("✅ VIDEO UPDATED:", video_id)

    return {"ok": True}
    payload = await request.json()

    print("🔥 WEBHOOK RECEIVED:", payload)

    # Extract fields
    job_id = payload.get("job_id")
    status = payload.get("status")
    video_url = payload.get("video_url")

    metadata = payload.get("metadata", {})
    video_id = metadata.get("video_id")

    if not video_id:
        return {"error": "missing video_id"}

    db = get_db()

    update_data = {
        "status": status,
        "updated_at": datetime.utcnow(),
    }

    if status == "completed":
        update_data["video_url"] = video_url
        update_data["completed_at"] = datetime.utcnow()

    if status == "failed":
        update_data["error"] = payload.get("error", "unknown error")

    db.collection("videos").document(video_id).update(update_data)

    return {"ok": True}
