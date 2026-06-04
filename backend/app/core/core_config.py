from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.enums import AppEnvironment


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "Smart Stock API"
    app_env: AppEnvironment = AppEnvironment.LOCAL
    debug: bool = False
    api_v1_prefix: str = "/api/v1"

    database_url: str = Field(default="postgresql://postgres:postgres@localhost:5432/smart_stock")
    alembic_database_url: str | None = None
    backend_cors_origins: str = "http://localhost:3000"
    frontend_base_url: str = "http://localhost:3000"
    jwt_secret_key: str = "change-me-in-local-development-only"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = Field(default=15, ge=1)
    jwt_refresh_token_expire_days: int = Field(default=30, ge=1)
    email_verification_token_expire_hours: int = Field(default=24, ge=1)
    google_client_id: str | None = None
    facebook_app_id: str | None = None
    facebook_app_secret: str | None = None
    smtp_host: str | None = None
    smtp_port: int = Field(default=587, ge=1)
    smtp_user: str | None = None
    smtp_password: str | None = None
    mail_from: str = "noreply@smart-stock.local"
    daily_market_sync_scheduler_enabled: bool = True
    stock_details_sync_frequency_months: int = Field(default=3, ge=1)
    stock_details_sync_max_concurrency: int = Field(default=3, ge=1, le=5)
    stock_details_sync_request_delay_min_seconds: float = Field(default=1.0, ge=0)
    stock_details_sync_request_delay_max_seconds: float = Field(default=3.0, ge=0)
    stock_details_sync_max_retries: int = Field(default=3, ge=1)
    stock_details_sync_job_max_attempts: int = Field(default=2, ge=1)
    stock_details_historical_window_days: int = Field(default=90, ge=1)
    amarstock_api_base_url: str = "https://www.amarstock.com"
    amarstock_snapshot_token: str = "1981d726120d"
    amarstock_historical_token: str = "5ee4d332a90e"
    amarstock_company_token: str = "2b5e8cfdd75f"
    amarstock_latest_price_token: str = "dbfd2587c77f"
    amarstock_news_path: str = "/info/News"
    amarstock_bulk_api_max_retries: int = Field(default=3, ge=1)
    amarstock_bulk_api_retry_delay_seconds: float = Field(default=1.0, ge=0)
    amarstock_news_ingestion_enabled: bool = True
    amarstock_daily_latest_price_patch_enabled: bool = True
    amarstock_latest_price_stock_details_enabled: bool = True

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.backend_cors_origins.split(",") if origin.strip()]

    @property
    def async_database_url(self) -> str:
        return _to_asyncpg_url(self.database_url)

    @property
    def async_alembic_database_url(self) -> str:
        return _to_asyncpg_url(self.alembic_database_url or self.database_url)


@lru_cache
def get_settings() -> Settings:
    return Settings()


def _to_asyncpg_url(database_url: str) -> str:
    if database_url.startswith("postgresql+asyncpg://"):
        return database_url
    if database_url.startswith("postgresql://"):
        return database_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    if database_url.startswith("postgres://"):
        return database_url.replace("postgres://", "postgresql+asyncpg://", 1)
    return database_url

