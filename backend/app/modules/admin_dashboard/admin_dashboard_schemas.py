from datetime import date, datetime
from enum import StrEnum

from pydantic import BaseModel, Field

from app.core.enums import StockDetailsSyncJobStatus
from app.modules.admin_jobs.admin_jobs_schemas import SystemJobExecutionRead


class AdminUserSummaryRead(BaseModel):
    total_users: int
    active_users: int
    inactive_users: int
    deleted_users: int
    admin_users: int
    super_admin_users: int


class AdminSchedulerLivenessState(StrEnum):
    ONLINE = "ONLINE"
    OFFLINE = "OFFLINE"
    UNKNOWN = "UNKNOWN"


class AdminSchedulerLivenessRead(BaseModel):
    component_name: str
    state: AdminSchedulerLivenessState
    reason: str
    last_heartbeat_at: datetime | None
    heartbeat_age_seconds: int | None


class AdminSchedulerConfigurationRead(BaseModel):
    market_snapshot_scheduler_enabled: bool
    daily_market_sync_scheduler_enabled: bool
    stock_details_sync_scheduler_enabled: bool
    queue_poll_seconds: int
    stock_details_sync_time: str
    stock_details_sync_batch_size: int


class AdminSchedulerNextRunsRead(BaseModel):
    market_snapshot_at: datetime | None
    daily_market_sync_at: datetime | None
    stock_details_sync_at: datetime | None


class AdminSchedulerStatusRead(BaseModel):
    liveness: AdminSchedulerLivenessRead
    configuration: AdminSchedulerConfigurationRead
    next_runs: AdminSchedulerNextRunsRead


class AdminDataHealthState(StrEnum):
    CURRENT = "CURRENT"
    DELAYED = "DELAYED"
    STALE = "STALE"
    MISSING = "MISSING"


class AdminMeasuredHealthRead(BaseModel):
    state: AdminDataHealthState
    reason: str
    last_successful_at: datetime | None


class AdminMarketGenerationRead(BaseModel):
    trade_date: date
    sync_id: str
    source: str
    source_last_synced_at: datetime
    published_at: datetime
    fetched_count: int
    accepted_count: int
    suspicious_count: int


class AdminMarketSessionRead(BaseModel):
    trade_date: date
    source: str
    updated_at: datetime
    is_finalized: bool


class AdminStockDetailsHealthRead(BaseModel):
    health: AdminMeasuredHealthRead
    latest_status: StockDetailsSyncJobStatus | None
    latest_source: str | None
    due_count: int
    completed_count: int
    failed_count: int


class AdminDataHealthRead(BaseModel):
    market_data_health: AdminMeasuredHealthRead
    market_snapshot_health: AdminMeasuredHealthRead
    market_session_health: AdminMeasuredHealthRead
    latest_market_generation: AdminMarketGenerationRead | None
    latest_market_session: AdminMarketSessionRead | None
    stock_details: AdminStockDetailsHealthRead
    failed_jobs_count: int
    suspicious_prices_count: int
    expected_no_trade_count: int
    active_stocks_without_latest_price: int
    latest_price_trade_date: date | None


class AdminEmailCampaignHealthRead(BaseModel):
    queued_count: int
    running_count: int
    failed_count: int
    last_sent_at: datetime | None


class AdminDashboardOverviewRead(BaseModel):
    users: AdminUserSummaryRead
    scheduler: AdminSchedulerStatusRead
    data_health: AdminDataHealthRead
    email_campaign_health: AdminEmailCampaignHealthRead
    recent_job_executions: list[SystemJobExecutionRead] = Field(default_factory=list)
