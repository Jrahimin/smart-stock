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
    if finalized is not None and getattr(finalized, "accepted_count", 1) <= 0:
        finalized = None
    today_finalized = (
        finalized if finalized is not None and finalized.trade_date == today else None
    )
    today_live = await generation_reader(
        exchange=exchange,
        state=MarketDataState.LIVE,
        trade_date=today,
    )

    if today_live is not None and getattr(today_live, "accepted_count", 1) <= 0:
        today_live = None

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


async def resolve_finalized_decision_generation(
    repository: Any, *, exchange: ExchangeCode
) -> PublishedMarketGeneration | None:
    reader = getattr(repository, "get_latest_market_data_generation", None)
    finalized = await reader(exchange=exchange, state=MarketDataState.FINALIZED) if reader else None
    if finalized is not None and getattr(finalized, "accepted_count", 1) <= 0:
        return None
    if finalized is not None:
        context = PublishedMarketGeneration(
            trade_date=finalized.trade_date,
            sync_id=finalized.sync_id,
            data_state=MarketDataState.FINALIZED,
            source_last_synced_at=finalized.source_last_synced_at,
            published_at=finalized.published_at,
        )
    else:
        session_date, synced_at = await repository.get_decision_session_freshness(exchange=exchange)
        if session_date is None or synced_at is None:
            return None
        context = PublishedMarketGeneration(
            trade_date=session_date,
            sync_id=f"legacy-{exchange.value}-{session_date}",
            data_state=MarketDataState.FINALIZED,
            source_last_synced_at=synced_at,
            published_at=synced_at,
        )
    revision_reader = getattr(repository, "finalized_input_revision", None)
    if revision_reader is not None:
        from dataclasses import replace
        revision = await revision_reader(exchange=exchange, end_date=context.trade_date)
        context = replace(context, sync_id=f"{context.sync_id}:{revision[:24]}")
    from dataclasses import replace

    from app.core.audit_hashing import stable_audit_hash
    from app.core.constants.trading_constants import (
        DECISION_TAXONOMY_VERSION,
        DECISION_CAPTURE_VERSION,
        SHORTLIST_RANKING_VERSION,
        SCANNER_CONDITION_VERSION,
        TRADING_INPUT_SCHEMA_VERSION,
        TRADING_STRATEGY_VERSION,
        TRADING_THRESHOLD_VERSION,
    )
    policy = stable_audit_hash(
        (
            TRADING_INPUT_SCHEMA_VERSION,
            TRADING_STRATEGY_VERSION,
            TRADING_THRESHOLD_VERSION,
            DECISION_TAXONOMY_VERSION,
            DECISION_CAPTURE_VERSION,
            SHORTLIST_RANKING_VERSION,
            SCANNER_CONDITION_VERSION,
        )
    )[:12]
    return replace(context, sync_id=f"{context.sync_id}:{policy}")
