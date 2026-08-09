from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from types import SimpleNamespace

import pytest

from app.core.enums import ExchangeCode, MarketDataState, MarketSessionStatus
from app.core.security_config import ANONYMOUS_USER_CONTEXT
from app.modules.market_data.market_data_service import MarketDataService
from app.modules.market_data.published_generation import (
    resolve_published_market_generation,
)

TODAY = date(2026, 7, 23)
NOW = datetime(2026, 7, 23, 10, 30, tzinfo=UTC)
SOURCE_SYNCED_AT = NOW - timedelta(minutes=5)


class GenerationRepository:
    def __init__(self) -> None:
        self.finalized = SimpleNamespace(
            trade_date=TODAY - timedelta(days=1),
            sync_id="finalized-sync",
            source_last_synced_at=SOURCE_SYNCED_AT - timedelta(days=1),
            published_at=SOURCE_SYNCED_AT - timedelta(days=1),
        )
        self.live = SimpleNamespace(
            trade_date=TODAY,
            sync_id="live-sync",
            source_last_synced_at=SOURCE_SYNCED_AT,
            published_at=SOURCE_SYNCED_AT,
        )

    async def get_latest_market_data_generation(self, *, state, trade_date=None, **kwargs):
        if state == MarketDataState.FINALIZED:
            return self.finalized
        if state == MarketDataState.LIVE and trade_date == TODAY:
            return self.live
        return None


@pytest.mark.asyncio
async def test_pre_open_selects_latest_finalized_generation() -> None:
    published = await resolve_published_market_generation(
        GenerationRepository(),
        exchange=ExchangeCode.DSE,
        market_status=MarketSessionStatus.PRE_OPEN,
        today=TODAY,
        now=NOW,
        stale_after_seconds=600,
    )

    assert published is not None
    assert published.trade_date == TODAY - timedelta(days=1)
    assert published.sync_id == "finalized-sync"
    assert published.data_state == MarketDataState.FINALIZED


@pytest.mark.asyncio
async def test_open_and_post_close_share_live_generation_with_phase_state() -> None:
    repository = GenerationRepository()

    live = await resolve_published_market_generation(
        repository,
        exchange=ExchangeCode.DSE,
        market_status=MarketSessionStatus.OPEN,
        today=TODAY,
        now=NOW,
        stale_after_seconds=600,
    )
    pending = await resolve_published_market_generation(
        repository,
        exchange=ExchangeCode.DSE,
        market_status=MarketSessionStatus.POST_CLOSE,
        today=TODAY,
        now=NOW,
        stale_after_seconds=600,
    )

    assert live is not None and live.data_state == MarketDataState.LIVE
    assert pending is not None and pending.data_state == MarketDataState.FINALIZATION_PENDING
    assert live.sync_id == pending.sync_id == "live-sync"


@pytest.mark.asyncio
async def test_finalization_retry_returns_the_existing_finalized_generation() -> None:
    finalized = SimpleNamespace(sync_id="same-generation")

    class Repository:
        async def get_latest_market_data_generation(self, *, state, trade_date, **kwargs):
            if state == MarketDataState.FINALIZED and trade_date == TODAY:
                return finalized
            raise AssertionError("A finalization retry must not promote an older LIVE manifest")

    service = MarketDataService(Repository(), ANONYMOUS_USER_CONTEXT)

    assert await service.publish_finalized_market_generation(
        exchange=ExchangeCode.DSE,
        trade_date=TODAY,
    ) == "same-generation"
