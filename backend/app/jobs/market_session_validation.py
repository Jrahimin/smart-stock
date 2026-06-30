"""Validate live market session via AmarStock index API before scheduled sync writes."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime
from zoneinfo import ZoneInfo

from app.core.core_config import Settings, get_settings
from app.jobs.ingestion.amarstock_index_api_source import AmarStockIndexApiSource

logger = logging.getLogger(__name__)
DHAKA_TZ = ZoneInfo("Asia/Dhaka")


@dataclass(frozen=True)
class MarketSessionValidation:
    should_sync: bool
    trade_date: date
    market_status: str
    reason: str | None = None


async def validate_market_session(
    *,
    settings: Settings | None = None,
    today: date | None = None,
) -> MarketSessionValidation:
    """Return whether live sync should run based on index API session date vs today (Dhaka).

  Fails closed when the index API is unavailable. ``market_status`` is logged for diagnostics
  only; the gate is ``snapshot.trade_date == today``.
    """
    resolved_settings = settings or get_settings()
    resolved_today = today or datetime.now(DHAKA_TZ).date()

    try:
        snapshot = await AmarStockIndexApiSource.from_settings(resolved_settings).fetch_dsex_snapshot()
    except Exception as exc:
        reason = f"index API unavailable: {exc}"
        logger.warning("Market session validation failed: %s", reason, exc_info=True)
        return MarketSessionValidation(
            should_sync=False,
            trade_date=resolved_today,
            market_status="Unknown",
            reason=reason,
        )

    api_trade_date = snapshot.trade_date
    market_status = snapshot.market_status

    if api_trade_date != resolved_today:
        reason = (
            f"API trade_date {api_trade_date.isoformat()} != today {resolved_today.isoformat()} "
            f"(market_status={market_status!r})"
        )
        logger.info("Market session validation: skipping sync — %s", reason)
        return MarketSessionValidation(
            should_sync=False,
            trade_date=api_trade_date,
            market_status=market_status,
            reason=reason,
        )

    logger.info(
        "Market session validation passed: trade_date=%s market_status=%s",
        api_trade_date.isoformat(),
        market_status,
    )
    return MarketSessionValidation(
        should_sync=True,
        trade_date=api_trade_date,
        market_status=market_status,
        reason=None,
    )
