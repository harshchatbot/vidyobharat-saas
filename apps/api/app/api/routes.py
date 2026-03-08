import logging
import json
import hashlib
import re
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile, status
from openai import OpenAI
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.api.deps import get_user_id
from app.core.config import get_settings
from app.core.request_context import get_request_id
from app.db.session import get_db
from app.models.entities import ImageGenerationStatus
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
from app.schemas.catalog import AvatarResponse, TemplateResponse
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
    CreateProjectAssetRequest,
    CreateProjectRequest,
    ProjectAssetResponse,
    ProjectResponse,
    UpdateProjectRequest,
)
from app.schemas.render import CreateRenderRequest, RenderResponse
from app.schemas.upload import UploadDeleteResponse, UploadSignRequest, UploadSignResponse
from app.schemas.user import UserAvatarUploadResponse, UserProfileResponse, UserProfileUpdateRequest, UserSettingsResponse, UserSettingsUpdateRequest
from app.schemas.video import InspirationVideoResponse, MusicTrackResponse, VideoCreateResponse, VideoResponse, VideoRetryResponse
from app.schemas.tts import TTSCatalogResponse, TTSLanguageOptionResponse, TTSPreviewRequest, TTSPreviewResponse, TTSVoiceOptionResponse
from app.services.avatar_service import AvatarService
from app.services.auth_service import AuthService
from app.services.image_generation_service import ImageGenerationService
from app.services.influencer_service import InfluencerService
from app.services.inspiration_service import InspirationService
from app.services.project_service import ProjectService
from app.services.render_service import RenderService
from app.services.template_service import TemplateService
from app.services.ai_video_service import AIVideoCreateService, ProviderError
from app.services.asset_search_service import AssetSearchService
from app.services.asset_tagging_service import AssetTaggingService
from app.services.credit_service import CreditCapExceededError, CreditService, InsufficientCreditsError
from app.services.pricing_service import PricingService
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


def _split_sentences(text: str) -> list[str]:
    return [part.strip() for part in re.split(r'(?<=[.!?।])\s+', text.strip()) if part.strip()]


def _build_structured_script_fallback(
    *,
    topic: str,
    template: str,
    language: str,
    source_script: str | None = None,
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
    return (
        f"[Opening shot: Cinematic hook visual aligned with {template}]\n"
        f"Narrator (energetic): \"{scene_lines[0]}\"\n\n"
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
        f"Language note: Keep narration natural in {language}."
    )


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
    asset_tagging = AssetTaggingService(db)
    auto_tags, user_tags = asset_tagging.list_tags(generation.id, 'image')

    image_url = getattr(generation, 'image_url', None) or getattr(generation, 'thumbnail_url', None) or ''
    thumbnail_url = getattr(generation, 'thumbnail_url', None) or image_url

    return ImageGenerationResponse(
        id=generation.id,
        parent_image_id=getattr(generation, 'parent_image_id', None),
        model_key=getattr(generation, 'model_key', None) or 'nano_banana',
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
    db: Session = Depends(get_db),
):
    wallet = CreditService(db).ensure_wallet(user_id)
    return _to_credit_wallet_response(wallet)


@router.post('/api/estimateCredits', response_model=EstimateCreditsResponse)
def estimate_credits(
    payload: EstimateCreditsRequest,
    user_id: str = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    try:
        wallet, estimate = CreditService(db).estimate_for_user(user_id, payload.action, payload.payload)
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
        )
    except CreditCapExceededError as exc:
        raise HTTPException(status_code=400, detail='Requested configuration exceeds allowed credit cap') from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post('/api/topupCredits', response_model=TopUpCreditsResponse)
def topup_credits(
    payload: TopUpCreditsRequest,
    user_id: str = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    wallet = CreditService(db).top_up_credits(
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
    db: Session = Depends(get_db),
):
    try:
        selection = PricingService().resolve_checkout_plan(request, payload.planName)
        result = CreditService(db).create_topup_order(user_id=user_id, selection=selection)
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
    raise HTTPException(status_code=502, detail=f"Topup order failed: {str(exc)}") from exc
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
    db: Session = Depends(get_db),
):
    service = CreditService(db)
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
    db: Session = Depends(get_db),
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

    entity = payload.get('payload', {}).get('payment', {}).get('entity', {})
    order_id = str(entity.get('order_id') or '')
    payment_id = str(entity.get('id') or '')
    if not order_id or not payment_id:
        return {'status': 'ignored', 'event': event_name}

    try:
        wallet = CreditService(db).reconcile_razorpay_topup(
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
    db: Session = Depends(get_db),
):
    service = CreditService(db)
    items = service.list_history(user_id, limit=max(1, min(limit, 250)))
    return CreditHistoryResponse(items=[_to_credit_history_item(item) for item in items])


@router.post('/api/credits/run-monthly-reset', include_in_schema=False)
def run_monthly_credit_reset(db: Session = Depends(get_db)):
    # Internal hook for cron/scheduler integration.
    updated = CreditService(db).run_monthly_reset()
    return {'updated_wallets': updated}


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
        'Write a high-quality short-form video script in plain text only.\n'
        'Return exactly this pattern:\n'
        '[Opening shot: ...]\n'
        'Narrator (tone): "..."\n'
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
        '\n'
        'Quality rules:\n'
        '- Script must be production-ready and scene-aligned.\n'
        '- Keep narration in the requested language only.\n'
        '- Keep it cinematic and creator-focused.\n'
        '- End with a clear CTA.\n'
        f'Template: {payload.template}\n'
        f'Topic: {payload.topic}\n'
        f'Language: {payload.language}\n'
    )
    script_text = ''
    if settings.openai_api_key:
        try:
            client = OpenAI(api_key=settings.openai_api_key)
            response = client.chat.completions.create(
                model=settings.openai_model,
                temperature=0.7,
                messages=[
                    {
                        'role': 'system',
                        'content': (
                            'You are a senior short-video scriptwriter. '
                            'Always output scene-wise scripts using Opening shot, Scene 1/2/3, Closing shot, narrator lines, visual/camera/mood cues, and CTA ending. '
                            'Return plain text only.'
                        ),
                    },
                    {'role': 'user', 'content': prompt},
                ],
            )
            script_text = (response.choices[0].message.content or '').strip()
        except Exception:
            logger.exception('ai_script_generate_provider_failed')
    if not script_text:
        script_text = _build_structured_script_fallback(
            topic=payload.topic,
            template=payload.template,
            language=payload.language,
        )
    tags = AssetTaggingService(db).tag_script(script_text)
    return ScriptResponse(script=script_text, tags=tags)


@router.post('/api/ai/script/enhance', response_model=ScriptResponse)
def enhance_script_v2(
    payload: ScriptEnhanceRequest,
    user_id: str = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    credit_service = CreditService(db)
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
    prompt = (
        'Enhance the following user-provided script into a production-ready scene script while preserving intent.\n'
        'Return plain text using this exact pattern:\n'
        '[Opening shot: ...]\n'
        'Narrator (tone): "..."\n'
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
        '\n'
        'Rules:\n'
        '- Keep requested language naturally.\n'
        '- Keep user meaning intact.\n'
        '- Improve flow, scene pacing, and cinematic clarity.\n'
        '- End with a strong CTA.\n'
        f'Template: {payload.template or "general"}\n'
        f'Language: {payload.language}\n'
        f'Script: {payload.script}'
    )
    script_text = ''
    provider_success = False
    if settings.openai_api_key:
        try:
            client = OpenAI(api_key=settings.openai_api_key)
            response = client.chat.completions.create(
                model=settings.openai_model,
                temperature=0.5,
                messages=[
                    {
                        'role': 'system',
                        'content': (
                            'You are a senior video script editor. '
                            'Improve flow and cinematic quality while preserving intent. '
                            'Always return Opening shot, Scene blocks, narrator lines, visual/camera/mood cues, and CTA in plain text.'
                        ),
                    },
                    {'role': 'user', 'content': prompt},
                ],
            )
            script_text = (response.choices[0].message.content or '').strip()
            provider_success = bool(script_text)
        except Exception:
            logger.exception('ai_script_enhance_provider_failed')
    if not script_text:
        script_text = _build_structured_script_fallback(
            topic=payload.template or 'General video',
            template=payload.template or 'general',
            language=payload.language,
            source_script=payload.script,
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
    if not settings.openai_api_key:
        raise HTTPException(status_code=503, detail='Translation provider is not configured.')
    try:
        client = OpenAI(api_key=settings.openai_api_key)
        response = client.chat.completions.create(
            model=settings.openai_model,
            temperature=0.2,
            messages=[
                {
                    'role': 'system',
                    'content': (
                        'Translate the provided text accurately into the requested target language. '
                        'Return only the translated text. Do not explain. Keep names unchanged where appropriate.'
                    ),
                },
                {
                    'role': 'user',
                    'content': f'Target language: {payload.target_language}\n\nText:\n{payload.text}',
                },
            ],
        )
        translated_text = (response.choices[0].message.content or '').strip()
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
            shortLabel=model.short_label,
            tier=model.tier,
            enabled=model.enabled,
            featured=model.featured,
            featureGate=model.feature_gate,
            qualityBadge=model.quality_badge,
            speedBadge=model.speed_badge,
            creditBadge=model.credit_badge,
            resolutionLabels=model.resolution_labels or [],
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
    deduction_amount = 0
    try:
        credit_service = CreditService(db)
        estimate = credit_service.estimate('video_create', payload.model_dump())
        remaining_credits: int | None = None
        if estimate.required_credits > 0:
            deduction = credit_service.deduct_credits(
                user_id=user_id,
                amount=estimate.required_credits,
                feature_key='video_create',
                metadata=payload.model_dump(),
                source='premium',
                idempotency_key=credit_service.make_idempotency_key(
                    'video_create',
                    {'user_id': user_id, **payload.model_dump()},
                ),
            )
            deduction_amount = estimate.required_credits
            remaining_credits = deduction.wallet.current_credits
        else:
            deduction = credit_service.deduct_credits(
                user_id=user_id,
                amount=0,
                feature_key='video_create_free',
                metadata=payload.model_dump(),
                source='free',
                idempotency_key=credit_service.make_idempotency_key(
                    'video_create_free',
                    {'user_id': user_id, **payload.model_dump()},
                ),
            )
            remaining_credits = deduction.wallet.current_credits
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
        # Persist charged credits on the video document so async failure refunds are exact.
        service.repo.update(video, applied_credits=estimate.required_credits, request_quality=payload.quality)
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
            appliedCredits=estimate.required_credits,
            remainingCredits=remaining_credits,
        )
    except InsufficientCreditsError as exc:
        raise HTTPException(
            status_code=402,
            detail={'error': 'INSUFFICIENT_CREDITS', 'message': 'You do not have enough credits'},
        ) from exc
    except CreditCapExceededError as exc:
        raise HTTPException(status_code=400, detail='Requested configuration exceeds allowed credit cap') from exc
    except ProviderError as exc:
        if deduction_amount > 0:
            CreditService(db).top_up_credits(
                user_id=user_id,
                credits=deduction_amount,
                metadata={'refund_for': 'video_create_provider_error', 'model_key': payload.modelKey},
            )
        logger.warning(
            'ai_video_create_provider_error',
            extra={'request_id': get_request_id(), 'error': str(exc), 'model_key': payload.modelKey},
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
            CreditService(db).top_up_credits(
                user_id=user_id,
                credits=deduction_amount,
                metadata={'refund_for': 'video_create_error', 'model_key': payload.modelKey},
            )
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

    # Guardrail: prevent jobs from staying "queued/processing" forever if the worker
    # is unavailable or provider polling stalls.
    status_value = video.status.value if hasattr(video.status, 'value') else str(video.status)
    if status_value in {'draft', 'processing'}:
        created_at = getattr(video, 'created_at', None)
        now = datetime.now(UTC)
        if created_at and getattr(created_at, 'tzinfo', None) is None:
            created_at = created_at.replace(tzinfo=UTC)
        age_seconds = int((now - created_at).total_seconds()) if created_at else 0
        if age_seconds > 20 * 60:
            raw = service.repo.collection.document(video_id).get()
            raw_data = raw.to_dict() or {}
            if not bool(raw_data.get('timed_out_refunded', False)):
                charged_credits = int(raw_data.get('applied_credits') or 0)
                if charged_credits > 0:
                    CreditService(db).top_up_credits(
                        user_id=user_id,
                        credits=charged_credits,
                        metadata={'refund_for': 'video_create_timed_out', 'video_id': video_id},
                    )
            video = service.repo.update(
                video,
                status='timed_out',
                progress=100,
                error_message='Generation timed out while waiting for provider completion.',
                timed_out_refunded=True,
            )

    auto_tags, user_tags = AssetTaggingService(db).list_tags(video.id, 'video')
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
    items: list[ImageGenerationResponse] = []
    for item in service.list_user_images(user_id):
        try:
            items.append(_to_image_generation_response(item, db))
        except Exception:
            continue
    return items


@router.get('/ai/images/inspiration', response_model=list[InspirationImageResponse])
def list_ai_image_inspiration(
    user_id: str = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    service = InspirationService(db)
    result: list[InspirationImageResponse] = []
    for item in service.list_image_inspiration(viewer_user_id=user_id):
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
    user_id: str = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    service = InspirationService(db)
    result: list[InspirationVideoResponse] = []
    for item in service.list_video_inspiration(viewer_user_id=user_id):
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
    db: Session = Depends(get_db),
):
    service = InspirationService(db)
    result: list[InspirationImageResponse] = []
    for item in service.list_image_inspiration(viewer_user_id='public'):
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
    db: Session = Depends(get_db),
):
    service = InspirationService(db)
    result: list[InspirationVideoResponse] = []
    for item in service.list_video_inspiration(viewer_user_id='public'):
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
    db: Session = Depends(get_db),
):
    service = InspirationService(db)
    try:
        result = service.publish_asset(
            content_type=payload.content_type,
            asset_id=payload.asset_id,
            user_id=user_id,
            publish=payload.publish,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
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
    db: Session = Depends(get_db),
):
    service = InspirationService(db)
    try:
        result = service.toggle_like(
            content_type=payload.content_type,
            asset_id=payload.asset_id,
            user_id=user_id,
            liked=payload.liked,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
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
    db: Session = Depends(get_db),
):
    service = ImageGenerationService(db)
    deduction_amount = 0
    try:
        credit_service = CreditService(db)
        estimate = credit_service.estimate('image_generate', payload.model_dump())
        remaining_credits: int | None = None
        if estimate.required_credits > 0:
            deduction = credit_service.deduct_credits(
                user_id=user_id,
                amount=estimate.required_credits,
                feature_key='image_generate',
                metadata=payload.model_dump(),
                source='premium',
                idempotency_key=credit_service.make_idempotency_key(
                    'image_generate',
                    {'user_id': user_id, **payload.model_dump()},
                ),
            )
            deduction_amount = estimate.required_credits
            remaining_credits = deduction.wallet.current_credits
        else:
            deduction = credit_service.deduct_credits(
                user_id=user_id,
                amount=0,
                feature_key='image_generate_free',
                metadata=payload.model_dump(),
                source='free',
                idempotency_key=credit_service.make_idempotency_key(
                    'image_generate_free',
                    {'user_id': user_id, **payload.model_dump()},
                ),
            )
            remaining_credits = deduction.wallet.current_credits
        generation = service.create_image(
            user_id=user_id,
            model_key=payload.model_key,
            prompt=payload.prompt,
            aspect_ratio=payload.aspect_ratio,
            resolution=payload.resolution,
            reference_urls=payload.reference_urls,
        )
        if deduction_amount > 0 and getattr(generation, 'status', None) == ImageGenerationStatus.failed:
            CreditService(db).top_up_credits(
                user_id=user_id,
                credits=deduction_amount,
                metadata={
                    'refund_for': 'image_generate_failed_status',
                    'generation_id': generation.id,
                    'model_key': payload.model_key,
                },
            )
            deduction_amount = 0
        return _to_image_generation_response(
            generation,
            db,
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
            CreditService(db).top_up_credits(
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
        credit_service = CreditService(db)
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


@router.get('/api/influencer/personas', response_model=list[InfluencerPersonaResponse])
def list_influencer_personas(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_user_id),
):
    try:
        service = InfluencerService(db)
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
    db: Session = Depends(get_db),
    user_id: str = Depends(get_user_id),
):
    persona = InfluencerService(db).create_persona(user_id, **payload.model_dump())
    return _to_influencer_persona_response(persona)


@router.get('/api/influencer/personas/{persona_id}', response_model=InfluencerPersonaResponse)
def get_influencer_persona(
    persona_id: str,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_user_id),
):
    service = InfluencerService(db)
    try:
        persona = service.get_persona(persona_id, user_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return _to_influencer_persona_response(persona)


@router.put('/api/influencer/personas/{persona_id}', response_model=InfluencerPersonaResponse)
def update_influencer_persona(
    persona_id: str,
    payload: InfluencerPersonaUpdateRequest,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_user_id),
):
    service = InfluencerService(db)
    try:
        persona = service.update_persona(persona_id, user_id, **payload.model_dump())
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return _to_influencer_persona_response(persona)


@router.post('/api/influencer/personas/{persona_id}/reference', response_model=InfluencerPersonaResponse)
async def upload_influencer_reference(
    persona_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user_id: str = Depends(get_user_id),
):
    service = InfluencerService(db)
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
    db: Session = Depends(get_db),
    user_id: str = Depends(get_user_id),
):
    credit_service = CreditService(db)
    service = InfluencerService(db)
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
def list_influencer_poses(user_id: str = Depends(get_user_id), db: Session = Depends(get_db)):
    return [InfluencerPoseOptionResponse(**item) for item in InfluencerService(db).list_pose_options()]


@router.get('/api/influencer/scenes', response_model=list[InfluencerScenePresetResponse])
def list_influencer_scenes(persona_id: str | None = None, user_id: str = Depends(get_user_id), db: Session = Depends(get_db)):
    return [InfluencerScenePresetResponse(**item) for item in InfluencerService(db).list_scene_library(user_id, persona_id)]


@router.post('/api/influencer/scenes', response_model=InfluencerScenePresetResponse, status_code=status.HTTP_201_CREATED)
def create_influencer_scene(
    payload: InfluencerScenePresetCreateRequest,
    user_id: str = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    scene = InfluencerService(db).create_scene_preset(
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
    db: Session = Depends(get_db),
    user_id: str = Depends(get_user_id),
):
    credit_service = CreditService(db)
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
        result = InfluencerService(db).generate_content(
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
    db: Session = Depends(get_db),
    user_id: str = Depends(get_user_id),
):
    credit_service = CreditService(db)
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
        image = InfluencerService(db).generate_consistent_image(
            payload.persona_id,
            user_id,
            pose=payload.pose,
            scene=payload.scene,
            custom_pose=payload.custom_pose,
            model_key=payload.model_key,
            aspect_ratio=payload.aspect_ratio,
            resolution=payload.resolution,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except InsufficientCreditsError as exc:
        raise HTTPException(
            status_code=402,
            detail={'error': 'INSUFFICIENT_CREDITS', 'message': 'You do not have enough credits', 'required': exc.required, 'available': exc.available},
        ) from exc
    return _to_image_generation_response(image, db, applied_credits=applied_credits, remaining_credits=remaining_credits)


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
    db: Session = Depends(get_db),
) -> TTSPreviewResponse:
    preview_text = payload.text.strip()[:PREVIEW_MAX_CHARS]
    credit_service = CreditService(db)
    wallet = credit_service.ensure_wallet(user_id)
    try:
        estimate = credit_service.estimate(
            'tts_preview',
            {
                'voice': payload.voice,
                'provider': 'free' if payload.voice in credit_service.FREE_VOICE_KEYS else 'sarvam',
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
        result = generate_voiceover_detailed(
            script=preview_text,
            voice=payload.voice,
            cache_dir=cache_dir,
            language=payload.language,
            sample_rate_hz=payload.sample_rate_hz,
            allow_premium=wallet.current_credits >= estimate.required_credits,
        )
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
            result = generate_voiceover_detailed(
                script=preview_text,
                voice=payload.voice,
                cache_dir=cache_dir,
                language=payload.language,
                sample_rate_hz=payload.sample_rate_hz,
                allow_premium=False,
            )
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
