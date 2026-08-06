from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

from app.core.core_config import Settings
from app.core.enums import (
    ExchangeCode,
    StockDetailsSyncScope,
    StockDetailsSyncTriggerType,
    SystemJobExecutionStatus,
    SystemJobTriggerSource,
    SystemJobType,
)
from app.jobs.indicators.compute_daily_indicators import compute_daily_indicators
from app.jobs.ingest_stock_details import ingest_stock_details
from app.jobs.ingestion.ingest_daily_market_prices import (
    run_daily_market_sync,
    sync_market_snapshot,
)
from app.jobs.signals.generate_daily_signals import generate_daily_signals
from app.models import SystemJobExecution

DHAKA_TIMEZONE = ZoneInfo("Asia/Dhaka")
MAX_ERROR_MESSAGE_LENGTH = 2_000
_URL_PASSWORD_PATTERN = re.compile(r"(://[^:/@\s]+:)[^@\s]+@")
_SENSITIVE_VALUE_PATTERN = re.compile(
    r"(?i)\b(password|secret|token|api[_-]?key)=([^&\s]+)"
)


@dataclass(frozen=True)
class SystemJobRunOutcome:
    status: SystemJobExecutionStatus
    result: dict[str, Any] | None
    error_message: str | None = None
    error_metadata: dict[str, Any] | None = None


async def run_system_job(
    execution: SystemJobExecution,
    *,
    settings: Settings,
) -> SystemJobRunOutcome:
    try:
        result = await _dispatch_system_job(execution, settings=settings)
        return _classify_result(execution.job_type, result)
    except Exception as exc:
        message = sanitize_job_error(exc)
        return SystemJobRunOutcome(
            status=SystemJobExecutionStatus.FAILED,
            result=None,
            error_message=message,
            error_metadata={
                "type": type(exc).__name__,
                "message": message,
                "recoverable": True,
            },
        )


async def _dispatch_system_job(
    execution: SystemJobExecution,
    *,
    settings: Settings,
) -> dict[str, Any]:
    metadata = execution.metadata_json
    trade_date = (
        date.fromisoformat(str(metadata["trade_date"]))
        if metadata.get("trade_date")
        else None
    )
    resolved_trade_date = trade_date or datetime.now(DHAKA_TIMEZONE).date()

    if execution.job_type == SystemJobType.MARKET_SNAPSHOT:
        snapshot_result = await sync_market_snapshot(
            resolved_trade_date,
            settings=settings,
        )
        return snapshot_result.model_dump(mode="json")
    if execution.job_type == SystemJobType.MARKET_SYNC:
        daily_result = await run_daily_market_sync(
            resolved_trade_date,
            settings=settings,
        )
        return daily_result.model_dump(mode="json")
    if execution.job_type == SystemJobType.STOCK_DETAILS_SYNC:
        stock_result = await ingest_stock_details(
            exchange=ExchangeCode(
                metadata.get("exchange", ExchangeCode.DSE.value)
            ),
            symbols=metadata.get("symbols"),
            limit=metadata.get("limit", settings.stock_details_sync_batch_size),
            offset=int(metadata.get("offset", 0)),
            historical_window_days=metadata.get("historical_window_days"),
            force=bool(metadata.get("force", False)),
            trigger_type=(
                StockDetailsSyncTriggerType.MANUAL
                if execution.trigger_source == SystemJobTriggerSource.MANUAL
                else StockDetailsSyncTriggerType.SCHEDULED
            ),
            scope=StockDetailsSyncScope(
                metadata.get("scope", StockDetailsSyncScope.FULL.value)
            ),
        )
        return stock_result.model_dump(mode="json")
    if execution.job_type == SystemJobType.INDICATORS:
        return await compute_daily_indicators(resolved_trade_date)
    if execution.job_type == SystemJobType.SIGNALS:
        return await generate_daily_signals(resolved_trade_date)
    raise ValueError(f"Unsupported queued job type: {execution.job_type.value}")


def _classify_result(
    job_type: SystemJobType,
    result: dict[str, Any],
) -> SystemJobRunOutcome:
    if result.get("session_skipped") is True:
        return SystemJobRunOutcome(
            status=SystemJobExecutionStatus.SKIPPED,
            result=result,
        )

    if job_type == SystemJobType.STOCK_DETAILS_SYNC:
        selected_count = int(result.get("selected_count") or 0)
        failed_count = int(result.get("failed_count") or 0)
        completed_count = int(result.get("synced_count") or 0) + int(
            result.get("partial_count") or 0
        )
        if selected_count == 0:
            return SystemJobRunOutcome(
                status=SystemJobExecutionStatus.SKIPPED,
                result=result,
            )
        if failed_count > 0 and completed_count == 0:
            return _failed_result(
                result,
                "All selected stock-details syncs failed.",
            )
        if failed_count > 0 or int(result.get("partial_count") or 0) > 0:
            return SystemJobRunOutcome(
                status=SystemJobExecutionStatus.PARTIAL,
                result=result,
            )

    if job_type == SystemJobType.MARKET_SNAPSHOT:
        if result.get("index_summary_upserted") is not True:
            return _failed_result(
                result,
                str(
                    result.get("index_summary_error")
                    or "The snapshot did not publish a DSEX-backed market generation."
                ),
            )

    if job_type == SystemJobType.MARKET_SYNC:
        news_error = result.get("news_error")
        session_finalized = result.get("session_finalized") is True
        if news_error and not session_finalized:
            return _failed_result(result, str(news_error))
        if news_error or not session_finalized:
            return SystemJobRunOutcome(
                status=SystemJobExecutionStatus.PARTIAL,
                result=result,
            )

    return SystemJobRunOutcome(
        status=SystemJobExecutionStatus.SUCCEEDED,
        result=result,
    )


def _failed_result(
    result: dict[str, Any],
    message: str,
) -> SystemJobRunOutcome:
    sanitized = sanitize_job_error(message)
    return SystemJobRunOutcome(
        status=SystemJobExecutionStatus.FAILED,
        result=result,
        error_message=sanitized,
        error_metadata={
            "type": "JobResultFailure",
            "message": sanitized,
            "recoverable": True,
        },
    )


def sanitize_job_error(error: BaseException | str) -> str:
    message = " ".join(str(error).split())
    message = _URL_PASSWORD_PATTERN.sub(r"\1***@", message)
    message = _SENSITIVE_VALUE_PATTERN.sub(r"\1=***", message)
    if not message:
        message = "Job failed without an error message."
    return message[:MAX_ERROR_MESSAGE_LENGTH]
