from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

from app.core.enums import ExchangeCode, MarketDataState, MarketSessionStatus


@dataclass(frozen=True, slots=True)
class PublishedMarketGeneration:
    trade_date: date
    sync_id: str
    data_state: MarketDataState
    source_last_synced_at: datetime
    published_at: datetime


async def resolve_published_market_generation(
    repository: Any,
    *,
    exchange: ExchangeCode,
    market_status: MarketSessionStatus,
    today: date,
    now: datetime,
    stale_after_seconds: int,
) -> PublishedMarketGeneration | None:
    """Resolve the single published dataset readers may expose."""

    generation_reader = getattr(repository, "get_latest_market_data_generation", None)
    if generation_reader is None:
        return None

    finalized = await generation_reader(
        exchange=exchange,
        state=MarketDataState.FINALIZED,
    )
    today_finalized = (
        finalized if finalized is not None and finalized.trade_date == today else None
    )
    today_live = await generation_reader(
        exchange=exchange,
        state=MarketDataState.LIVE,
        trade_date=today,
    )

    selected = None
    data_state = MarketDataState.STALE
    if market_status == MarketSessionStatus.OPEN:
        selected = today_live or today_finalized or finalized
        data_state = MarketDataState.LIVE if selected is today_live else MarketDataState.FINALIZED
    elif market_status == MarketSessionStatus.POST_CLOSE:
        selected = today_finalized or today_live or finalized
        data_state = (
            MarketDataState.FINALIZED
            if selected is today_finalized or selected is finalized
            else MarketDataState.FINALIZATION_PENDING
        )
    else:
        selected = finalized
        data_state = MarketDataState.FINALIZED if selected is not None else MarketDataState.STALE

    if selected is None:
        return None
    if selected is today_live:
        synced_at = selected.source_last_synced_at
        if synced_at.tzinfo is None:
            synced_at = synced_at.replace(tzinfo=now.tzinfo)
        if (now - synced_at).total_seconds() > stale_after_seconds:
            data_state = MarketDataState.STALE

    return PublishedMarketGeneration(
        trade_date=selected.trade_date,
        sync_id=selected.sync_id,
        data_state=data_state,
        source_last_synced_at=selected.source_last_synced_at,
        published_at=selected.published_at,
    )
