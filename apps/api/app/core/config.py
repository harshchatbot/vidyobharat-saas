from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', extra='ignore')

    app_name: str = 'RangManch AI API'
    env: str = 'development'
    api_host: str = '0.0.0.0'
    api_port: int = 8000

    database_url: str = 'sqlite:///./data/vidyobharat.db'
    redis_url: str = 'redis://redis:6379/0'
    celery_task_always_eager: bool = True

    allowed_origins: str = Field(default='http://localhost:3000')
    log_level: str = 'INFO'

    storage_backend: str = 'local'
    public_asset_base_url: str = 'http://localhost:8000/static'
    openai_api_key: str | None = None
    openai_model: str = 'gpt-4.1-mini'
    openai_image_model: str = 'gpt-image-1'
    openai_video_model: str = 'sora-2'
    sarvam_api_key: str | None = None
    sarvam_model: str = 'bulbul:v3'
    kling_api_key: str | None = None
    kling_api_base: str = 'https://api.klingai.com'
    gemini_api_key: str | None = None
    gemini_api_base: str = 'https://generativelanguage.googleapis.com/v1beta'
    together_api_key: str | None = None
    together_api_base: str = 'https://api.together.xyz/v1'
    heygen_api_key: str | None = None
    heygen_api_base: str = 'https://api.heygen.com'
    runway_api_key: str | None = None
    runway_api_base: str = 'https://api.dev.runwayml.com'
    generic_text_video_api_key: str | None = None
    generic_text_video_api_base: str = 'https://api.example.com'
    razorpay_key_id: str | None = None
    razorpay_key_secret: str | None = None
    razorpay_api_base: str = 'https://api.razorpay.com/v1'
    stripe_secret_key: str | None = None
    stripe_publishable_key: str | None = None
    stripe_api_base: str = 'https://api.stripe.com/v1'
    geoip_api_base: str = 'https://ipapi.co'
    pricing_default_country: str = 'IN'

    @property
    def allowed_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(',') if origin.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
