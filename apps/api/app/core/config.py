from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parents[2]
ENV_FILE = BASE_DIR / '.env'


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE),
        env_file_encoding='utf-8',
        extra='ignore',
    )

    app_name: str = 'RangManch AI API'
    env: str = 'development'
    api_host: str = '0.0.0.0'
    api_port: int = 8000

    database_url: str = 'sqlite:///./data/vidyobharat.db'
    redis_url: str = 'redis://redis:6379/0'
    celery_task_always_eager: bool = False

    allowed_origins: str = Field(
        default='http://localhost:3000,http://127.0.0.1:3000,https://rangmanch.techfilabs.com,https://rangmanchai.com,https://www.rangmanchai.com,https://api.rangmanchai.com,https://vidyobharat-saas.vercel.app'
    )
    allowed_origin_regex: str | None = r'https://([a-zA-Z0-9-]+\.)*(vercel\.app|techfilabs\.com|rangmanchai\.com)$'
    log_level: str = 'INFO'

    storage_backend: str = 'firebase'
    public_asset_base_url: str = 'http://localhost:8000/static'
    supabase_url: str | None = None
    supabase_anon_key: str | None = None
    supabase_service_role_key: str | None = None
    supabase_jwt_secret: str | None = None
    supabase_storage_bucket: str = 'rangmanch-assets'
    supabase_storage_public: bool = True
    firebase_project_id: str | None = None
    firebase_web_api_key: str | None = None
    firebase_auth_domain: str | None = None
    firebase_service_account_json: str | None = None
    firebase_service_account_json_b64: str | None = None
    firebase_service_account_path: str | None = None
    firebase_private_key_id: str | None = None
    firebase_private_key: str | None = None
    firebase_client_email: str | None = None
    firebase_client_id: str | None = None
    firebase_client_x509_cert_url: str | None = None
    firebase_storage_bucket: str | None = None
    openai_api_key: str | None = None
    openai_model: str = 'gpt-4.1-mini'
    openai_image_model: str = 'gpt-image-1'
    openai_video_model: str = 'sora-2'
    openai_video_timeout_seconds: int = 1200
    openai_video_poll_interval_seconds: int = 5
    sarvam_api_key: str | None = None
    sarvam_model: str = 'bulbul:v3'
    avatar_tts_speech_rate: float = 1.00
    avatar_infinitalk_acceleration: str = 'high'
    kling_api_key: str | None = None
    kling_api_secret: str | None = None
    kling_api_base: str = 'https://api.klingai.com'
    gemini_api_key: str | None = None
    gemini_api_base: str = 'https://generativelanguage.googleapis.com/v1beta'
    gemini_image_model_primary: str = 'gemini-3.1-flash-image-preview'
    gemini_image_model_fallback: str = 'gemini-2.5-flash-image-preview'
    gemini_flash_image_model_primary: str | None = None
    gemini_flash_image_model_fallback: str | None = None
    gemini_pro_image_model_primary: str = 'gemini-3-pro-image-preview'
    gemini_pro_image_model_fallback: str | None = None
    recraft_api_key: str | None = None
    recraft_api_base: str = 'https://external.api.recraft.ai/v1'
    recraft_image_model: str = 'recraftv4'
    recraft_image_model_pro: str = 'recraftv4pro'
    together_api_key: str | None = None
    together_api_base: str = 'https://api.together.xyz/v1'
    together_image_model: str = 'black-forest-labs/FLUX.1-schnell'
    fal_api_key: str | None = None
    fal_api_base: str = 'https://queue.fal.run'
    fal_recraft_image_endpoint: str = 'fal-ai/recraft-v3'
    fal_recraft_image_pro_endpoint: str = 'fal-ai/recraft-v3'
    fal_kling_reference_to_video_endpoint: str = 'fal-ai/kling-video/o1/reference-to-video'
    fal_gemini_tts_endpoint: str = 'fal-ai/gemini-3.1-flash-tts'
    fal_sync_lipsync_v2_endpoint: str = 'fal-ai/sync-lipsync/v2'
    ai_text_provider: str = 'hf_qwen'
    ai_video_provider: str = 'mock'
    hf_token: str | None = None
    hf_qwen_model: str = 'Qwen/Qwen3.6-35B-A3B'
    hf_qwen_provider: str = 'auto'
    hf_qwen_timeout: int = 90
    hf_ltx_model: str = 'Lightricks/LTX-Video'
    hf_ltx_provider: str = 'fal-ai'
    hf_ltx_timeout: int = 600
    qwen_self_hosted_base_url: str | None = None
    qwen_self_hosted_api_key: str | None = None
    qwen_self_hosted_model: str | None = None
    qwen_self_hosted_timeout: int = 90
    qwen_mock_mode: bool = False
    qwen_mock_profile: str = 'default'
    qwen_mock_latency_ms: int = 300
    qwen_mock_force_error: bool = False
    qwen_mock_malformed_json: bool = False
    ltx_self_hosted_base_url: str | None = None
    ltx_self_hosted_api_key: str | None = None
    ltx_self_hosted_model: str | None = None
    ltx_self_hosted_timeout: int = 600
    ltx_video_api_base: str = 'http://127.0.0.1:8010'
    ltx_video_api_key: str | None = None
    ltx_video_submit_path: str = '/generate'
    ltx_video_status_path: str = '/status/{job_id}'
    ltx_video_timeout_seconds: int = 1800
    ltx_video_poll_interval_seconds: int = 5
    ltx_mock_mode: bool = False
    ltx_mock_profile: str = 'default'
    ltx_mock_latency_ms: int = 1000
    ltx_mock_force_error: bool = False
    ltx_mock_sample_video_path: str | None = None
    ltx_mock_malformed_status: bool = False
    ltx_mock_queue_seconds: int = 2
    ltx_mock_processing_seconds: int = 3
    storyboard_safe_test_mode: bool = False
    storyboard_image_generation_stale_minutes: int = 10
    storyboard_image_generation_stale_seconds: int = 120
    storyboard_reference_strength: float = 0.85
    storyboard_image_provider: str = "fal"
    storyboard_image_reference_model: str = "fal-ai/gemini-25-flash-image/edit"
    storyboard_image_text_model: str = "fal-ai/recraft/v3/text-to-image"
    allow_openai_storyboard_image_provider: bool = False
    storyboard_real_smoke_test_mode: bool = False
    storyboard_production_e2e_stub_finalize: bool = False
    storyboard_qa_tools_enabled: bool = False
    storyboard_video_default_model: str = "seedance_v1"
    storyboard_video_allow_4k: bool = False
    storyboard_video_ltx_model: str = "fal-ai/ltx-2.3/image-to-video/fast"
    storyboard_video_seedance_model: str = "fal-ai/bytedance/seedance/v1/lite/reference-to-video"
    storyboard_video_kling_standard_model: str = "fal-ai/kling-video/o3/standard/reference-to-video"
    storyboard_video_kling_4k_model: str = "fal-ai/kling-video/o3/4k/reference-to-video"
    storyboard_tts_preview_credits: int = 1
    use_new_cinematic_architecture: bool = False
    chitrakala_persona_id: str = 'av-chitrakala'
    chitrakala_avatar_name: str = 'Chitrakala'
    chitrakala_avatar_image_url: str | None = None
    chitrakala_avatar_thumbnail_url: str | None = None
    chitrakala_avatar_prompt_template: str | None = None
    chitrakala_avatar_negative_prompt: str | None = None
    chitrakala_voice: str = 'Priya'
    chitrakala_language: str = 'en-IN'
    runway_api_key: str | None = None
    runway_api_base: str = 'https://api.dev.runwayml.com'
    generic_text_video_api_key: str | None = None
    generic_text_video_api_base: str = 'https://api.example.com'
    razorpay_key_id: str | None = None
    razorpay_key_secret: str | None = None
    razorpay_api_base: str = 'https://api.razorpay.com/v1'
    razorpay_webhook_secret: str | None = None
    stripe_secret_key: str | None = None
    stripe_publishable_key: str | None = None
    stripe_api_base: str = 'https://api.stripe.com/v1'
    geoip_api_base: str = 'https://ipapi.co'
    pricing_default_country: str = 'IN'
    admin_user_ids: str = ''
    admin_user_emails: str = ''

    @property
    def allowed_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(',') if origin.strip()]

    @property
    def admin_user_ids_list(self) -> list[str]:
        return [value.strip() for value in self.admin_user_ids.split(',') if value.strip()]

    @property
    def admin_user_emails_list(self) -> list[str]:
        return [value.strip().lower() for value in self.admin_user_emails.split(',') if value.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
