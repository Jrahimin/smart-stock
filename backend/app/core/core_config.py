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
    app_version: str = "dev"
    git_sha: str = "unknown"
    build_time: str = "unknown"

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
    run_scheduler: bool = False
    daily_market_sync_scheduler_enabled: bool = True
    market_snapshot_scheduler_enabled: bool = True
    stock_details_sync_scheduler_enabled: bool = False
    portfolio_summary_email_scheduler_enabled: bool = True
    system_job_queue_poll_seconds: int = Field(default=10, ge=1, le=300)
    market_open_time: str = "10:00"
    market_close_time: str = "15:00"
    market_snapshot_interval_minutes: int = Field(default=15, ge=1, le=120)
    daily_market_sync_time: str = "15:15"
    stock_details_sync_time: str = "15:35"
    stock_details_sync_batch_size: int = Field(default=50, ge=1, le=100)
    daily_market_primary_source: str = "amarstock_msgpack"
    daily_market_stocknow_validation_enabled: bool = False
    daily_market_stocknow_fallback_enabled: bool = False
    market_snapshot_min_active_coverage_percent: float = Field(default=95, gt=0, le=100)
    market_snapshot_min_source_symbols: int = Field(default=300, ge=1)
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
    # Deprecated: AmarStock's former /LatestPrice/{token} endpoint now returns 404.
    # Stock-details bulk enrichment uses amarstock_market_snapshot_path instead.
    amarstock_latest_price_token: str = "dbfd2587c77f"
    amarstock_market_snapshot_path: str = "/823af3f1ebdd"
    amarstock_market_snapshot_max_response_bytes: int = Field(
        default=5_000_000,
        ge=100_000,
        le=50_000_000,
    )
    amarstock_market_snapshot_max_last_modified_age_days: int = Field(default=7, ge=1, le=30)
    amarstock_news_path: str = "/info/News"
    amarstock_bulk_api_max_retries: int = Field(default=3, ge=1)
    amarstock_bulk_api_retry_delay_seconds: float = Field(default=1.0, ge=0)
    amarstock_news_ingestion_enabled: bool = True
    amarstock_daily_latest_price_patch_enabled: bool = False
    amarstock_index_summary_enabled: bool = True
    amarstock_latest_price_stock_details_enabled: bool = True
    # DSE day-end archive often serves an incomplete TLS chain; disable verify only for that host.
    dse_archive_ssl_verify: bool = False
    redis_url: str | None = None
    # Redis backs caches and coordination only. Bound network waits so a stalled
    # cache cannot keep an API request's database transaction open.
    redis_socket_connect_timeout_seconds: float = Field(default=1.0, gt=0, le=30)
    redis_socket_timeout_seconds: float = Field(default=2.0, gt=0, le=60)

    @property
    def market_sync_interval_seconds(self) -> int:
        return self.market_snapshot_interval_minutes * 60

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

