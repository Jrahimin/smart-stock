from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest

from app.core.core_config import Settings
from app.core.enums import DataQualityFlag, ExchangeCode
from app.core.security_config import ANONYMOUS_USER_CONTEXT
from app.models import DailyMarketSummary, DailyPrice, Stock
from app.modules.market_data.market_data_service import MarketDataService
from app.modules.market_universe.market_universe_compute import build_scored_universe_rows
from app.modules.market_universe.market_universe_service import MarketUniverseService
from app.modules.stock_details.decision.market_regime import resolve_regime_from_summaries
from app.modules.trading_intelligence.monitoring import build_decision_funnel

COMPLETED_SESSION = date(2026, 7, 14)
LIVE_SESSION = date(2026, 7, 15)
SYNCED_AT = datetime(2026, 7, 15, 12, 30)


def _stock(symbol: str = "SESSION") -> Stock:
    now = datetime(2026, 7, 15, 12, 30)
    return Stock(
        id=uuid4(),
        symbol=symbol,
        name=f"{symbol} Limited",
        exchange=ExchangeCode.DSE,
        category="A",
        is_active=True,
        should_fetch_details=False,
        created_at=now,
        updated_at=now,
    )


def _price_history(stock: Stock) -> list[DailyPrice]:
    start = COMPLETED_SESSION - timedelta(days=59)
    rows: list[DailyPrice] = []
    for index in range(60):
        close = Decimal("100") + Decimal(index % 3) * Decimal("0.10")
        rows.append(
            DailyPrice(
                stock_id=stock.id,
                trade_date=start + timedelta(days=index),
                open_price=close,
                high_price=close + Decimal("0.50"),
                low_price=close - Decimal("0.50"),
                close_price=close,
                volume=100_000,
                turnover=Decimal("10000000"),
                source="TEST",
                data_quality_flag=DataQualityFlag.OK,
            )
        )
    return rows


def _live_breakout_touch(stock: Stock) -> DailyPrice:
    return DailyPrice(
        stock_id=stock.id,
        trade_date=LIVE_SESSION,
        open_price=Decimal("100"),
        high_price=Decimal("125"),
        low_price=Decimal("99"),
        close_price=Decimal("120"),
        volume=2_000_000,
        turnover=Decimal("240000000"),
        source="TEST_LIVE",
        data_quality_flag=DataQualityFlag.PARTIAL,
        updated_at=SYNCED_AT,
    )


def _build_row(stock: Stock, prices: list[DailyPrice]):
    rows = build_scored_universe_rows(
        {str(stock.id): {"stock": stock, "prices": prices}},
        exchange_session_dates=[
            price.trade_date for price in prices if price.trade_date <= COMPLETED_SESSION
        ],
        decision_session_date=COMPLETED_SESSION,
    )
    assert len(rows) == 1
    return rows[0]


def test_partial_intraday_row_cannot_replace_completed_canonical_inputs() -> None:
    stock = _stock()
    completed_prices = _price_history(stock)
    completed_row = _build_row(stock, completed_prices)
    live_row = _build_row(stock, [*completed_prices, _live_breakout_touch(stock)])

    assert live_row.session.latest_trade_date == COMPLETED_SESSION
    assert live_row.technical_snapshot.latest_trade_date == COMPLETED_SESSION.isoformat()
    assert (
        live_row.technical_snapshot.average_volume
        == completed_row.technical_snapshot.average_volume
    )
    assert live_row.decision is not None and live_row.decision.canonical is not None
    assert completed_row.decision is not None and completed_row.decision.canonical is not None
    assert live_row.decision.canonical.as_of_date == COMPLETED_SESSION
    assert live_row.decision.canonical.input_hash == completed_row.decision.canonical.input_hash
    assert (
        live_row.decision.canonical.trade_plan_status
        == completed_row.decision.canonical.trade_plan_status
    )


def test_live_resistance_touch_is_not_completed_session_breakout_confirmation() -> None:
    stock = _stock("TOUCH")
    row = _build_row(stock, [*_price_history(stock), _live_breakout_touch(stock)])

    assert row.technical_snapshot.latest_price != 120.0
    assert row.technical_snapshot.is_breakout is False


def test_market_regime_ignores_summary_after_decision_session() -> None:
    completed = DailyMarketSummary(
        exchange=ExchangeCode.DSE,
        trade_date=COMPLETED_SESSION,
        index_name="DSEX",
        index_close=Decimal("6000"),
        advancing_issues=250,
        declining_issues=50,
        source="TEST",
        is_finalized=True,
    )
    live = DailyMarketSummary(
        exchange=ExchangeCode.DSE,
        trade_date=LIVE_SESSION,
        index_name="DSEX",
        index_close=Decimal("4000"),
        advancing_issues=10,
        declining_issues=300,
        source="TEST",
        is_finalized=False,
    )

    assert resolve_regime_from_summaries(
        [completed, live], decision_session_date=COMPLETED_SESSION
    ) == resolve_regime_from_summaries([completed])


@pytest.mark.asyncio
async def test_universe_cache_and_snapshot_share_decision_session_date() -> None:
    stock = _stock("AGREE")
    prices = [*_price_history(stock), _live_breakout_touch(stock)]

    class FakeMarketRepository:
        async def get_latest_finalized_session_date(self, **kwargs):
            return COMPLETED_SESSION

        async def get_decision_session_freshness(self, **kwargs):
            return COMPLETED_SESSION, datetime(2026, 7, 14, 15, 5)

        async def get_market_price_freshness(self, **kwargs):
            return LIVE_SESSION, SYNCED_AT

        async def list_market_price_windows(self, **kwargs):
            return [(stock, price) for price in prices]

        async def list_daily_market_summaries(self, **kwargs):
            return []

        async def list_recent_exchange_session_dates(self, **kwargs):
            return [price.trade_date for price in prices]

        async def list_corporate_action_dates_by_stock(self, **kwargs):
            return {}

    class FakeRedis:
        is_available = True

        def __init__(self):
            self.storage = {}

        async def get_json(self, key):
            return self.storage.get(key)

        async def set_json(self, key, value, *, ttl_seconds):
            self.storage[key] = value

    class FakeSnapshotRepository:
        def __init__(self):
            self.rows = []

        async def persist_missing(self, rows):
            self.rows = rows
            return len(rows)

    snapshots = FakeSnapshotRepository()
    service = MarketUniverseService(
        FakeMarketRepository(),
        object(),
        FakeRedis(),
        Settings(),
        snapshots,
    )
    rows = await service.recompute_scored_universe(ExchangeCode.DSE)
    await service.cache_scored_universe(ExchangeCode.DSE, rows)

    assert snapshots.rows == rows
    assert rows[0].session.latest_trade_date == COMPLETED_SESSION
    assert rows[0].eligibility is not None
    assert rows[0].eligibility.exchange_session_date == COMPLETED_SESSION
    assert rows[0].decision is not None and rows[0].decision.canonical is not None
    assert rows[0].decision.canonical.as_of_date == COMPLETED_SESSION
    cached = next(iter(service.redis.storage.values()))
    assert cached["decision_session_date"] == COMPLETED_SESSION.isoformat()
    assert cached["session_trade_date"] == COMPLETED_SESSION.isoformat()
    assert cached["is_live_session"] is True
    assert cached["live_data_as_of"] == SYNCED_AT.isoformat()


@pytest.mark.asyncio
async def test_freshness_exposes_provisional_live_metadata() -> None:
    class FakeRepository:
        async def get_market_price_freshness(self, **kwargs):
            return LIVE_SESSION, SYNCED_AT

        async def get_decision_session_freshness(self, **kwargs):
            return COMPLETED_SESSION, datetime(2026, 7, 14, 15, 5)

    freshness = await MarketDataService(
        FakeRepository(), ANONYMOUS_USER_CONTEXT
    ).get_market_freshness(exchange=ExchangeCode.DSE)

    assert freshness.decision_session_date == COMPLETED_SESSION
    assert freshness.live_data_as_of == SYNCED_AT
    assert freshness.is_live_session is True


def test_decision_funnel_reconciles_with_final_universe_rows() -> None:
    stock = _stock("FUNNEL")
    row = _build_row(stock, _price_history(stock))
    funnel = build_decision_funnel([row])

    assert funnel.total_universe == 1
    assert funnel.reconciles is True
    assert funnel.buy + funnel.hold + funnel.wait + funnel.sell + funnel.unavailable == 1
    assert (
        funnel.blocked_by_data
        + funnel.blocked_by_liquidity
        + funnel.blocked_by_extension
        + funnel.blocked_by_entry_plan
        + funnel.blocked_by_risk
        + funnel.other_or_unblocked
        == 1
    )
