from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', extra='ignore')

    app_name: str = 'VidyoBharat API'
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

    @property
    def allowed_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(',') if origin.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
