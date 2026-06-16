from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.core.enums import SystemJobExecutionStatus, SystemJobType
from app.modules.admin_jobs.admin_jobs_schemas import SystemJobExecutionRead


class AdminUserSummaryRead(BaseModel):
    total_users: int
    active_users: int
    inactive_users: int
    deleted_users: int
    admin_users: int
    super_admin_users: int


class AdminSchedulerStatusRead(BaseModel):
    market_snapshot_scheduler_enabled: bool
    daily_market_sync_scheduler_enabled: bool


class AdminDataHealthRead(BaseModel):
    latest_market_sync_at: datetime | None
    latest_market_snapshot_at: datetime | None
    latest_stock_details_sync_at: datetime | None
    failed_jobs_count: int
    suspicious_prices_count: int
    partial_prices_count: int
    active_stocks_without_latest_price: int
    overall_freshness_label: str


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
