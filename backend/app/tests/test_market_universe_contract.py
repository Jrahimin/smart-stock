from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest

from app.core.constants.trading_constants import (
    PULSE_SCORE_VERSION,
    TRADING_INPUT_SCHEMA_VERSION,
    TRADING_STRATEGY_VERSION,
    TRADING_THRESHOLD_VERSION,
)
from app.core.core_config import Settings
from app.core.enums import (
    DataQualityFlag,
    ExchangeCode,
    RiskLevelLabel,
    TraderRecommendation,
    TrendDirection,
)
from app.core.market_cache import (
    DASHBOARD_CACHE_KEY_NAMES,
    PULSE_CACHE_KEY_NAMES,
    dashboard_cache_key,
    invalidate_market_caches,
    pulse_cache_key,
)
from app.models import DailyPrice, Stock
from app.modules.market_dashboard.market_dashboard_compute import (
    build_market_insights,
    build_signal_feed,
    derive_market_mood,
)
from app.modules.market_universe.market_universe_cache import (
    UNIVERSE_CACHE_KEY_NAMES,
    universe_cache_key,
    universe_prev_cache_key,
)
from app.modules.market_universe.market_universe_compute import (
    build_scored_universe_rows,
    group_price_window_rows,
    technical_snapshot_to_read,
)
from app.modules.market_universe.market_universe_schemas import (
    ScoredUniverseRow,
    UniverseSessionRead,
)
from app.modules.market_universe.market_universe_service import MarketUniverseService
from app.modules.stock_details.decision.summary import TraderDecisionSummaryRead
from app.modules.stock_details.decision.technical import TechnicalSnapshot
from app.modules.stocks.stocks_schemas import StockRead
from app.tests.market_universe_test_helpers import assert_no_forbidden_universe_fields


def _stock(symbol: str = "TEST") -> Stock:
    now = datetime.now()
    return Stock(
        id=uuid4(),
        symbol=symbol,
        name=f"{symbol} Limited",
        exchange=ExchangeCode.DSE,
        is_active=True,
        should_fetch_details=False,
        created_at=now,
        updated_at=now,
    )


def _snapshot(
    *,
    trade_date: str,
    latest_price: float = 100.0,
    price_change_percent: float = -2.5,
    volume: int = 10_000,
    turnover: float = 1_000_000.0,
) -> TechnicalSnapshot:
    return TechnicalSnapshot(
        latest_price=latest_price,
        previous_close=102.5,
        price_change=-2.5,
        price_change_percent=price_change_percent,
        volume=volume,
        average_volume=8_000.0,
        turnover=turnover,
        rsi=45.0,
        sma20=101.0,
        ema20=100.5,
        volatility=1.2,
        support=95.0,
        resistance=110.0,
        trend=TrendDirection.DOWNTREND,
        data_quality=DataQualityFlag.OK,
        latest_trade_date=trade_date,
        ohlcv_row_count=20,
    )


def _universe_row(
    snapshot: TechnicalSnapshot,
    symbol: str = "TEST",
    *,
    decision: TraderDecisionSummaryRead | None = None,
) -> ScoredUniverseRow:
    stock = _stock(symbol)
    trade_date = date.fromisoformat(snapshot.latest_trade_date)
    return ScoredUniverseRow(
        stock=StockRead.model_validate(stock),
        technical_snapshot=technical_snapshot_to_read(snapshot),
        decision=decision,
        session=UniverseSessionRead(
            latest_trade_date=trade_date,
            close_price=Decimal(str(snapshot.latest_price or 0)),
            volume=snapshot.volume,
            turnover=Decimal(str(snapshot.turnover or 0)),
            change_percent=Decimal(str(snapshot.price_change_percent or 0)),
            data_quality_flag=DataQualityFlag.OK,
            updated_at=datetime.now(),
        ),
    )


def _decision(recommendation: TraderRecommendation, confidence: int = 72) -> TraderDecisionSummaryRead:
    return TraderDecisionSummaryRead(
        recommendation=recommendation,
        confidence=confidence,
        reason="Test reason",
        opportunity_score=65,
        risk_label=RiskLevelLabel.MEDIUM,
    )


def test_invalidation_key_lists_cover_presentation_and_foundation() -> None:
    assert universe_cache_key("scored", ExchangeCode.DSE) == (
        f"universe:scored:DSE:{TRADING_STRATEGY_VERSION}:"
        f"{TRADING_THRESHOLD_VERSION}:{TRADING_INPUT_SCHEMA_VERSION}"
    )
    assert universe_cache_key("scored", ExchangeCode.DSE, "future-v2") != universe_cache_key(
        "scored", ExchangeCode.DSE
    )
    assert pulse_cache_key("response", ExchangeCode.DSE) == (
        f"pulse:response:DSE:{TRADING_STRATEGY_VERSION}:"
        f"{TRADING_THRESHOLD_VERSION}:{TRADING_INPUT_SCHEMA_VERSION}:{PULSE_SCORE_VERSION}"
    )
    assert "overview" in DASHBOARD_CACHE_KEY_NAMES
    assert "response" in PULSE_CACHE_KEY_NAMES
    assert "scored" in UNIVERSE_CACHE_KEY_NAMES


@pytest.mark.asyncio
async def test_invalidate_market_caches_deletes_all_registered_keys() -> None:
    class FakeRedis:
        def __init__(self) -> None:
            self.is_available = True
            self.deleted: list[str] = []
            self.pattern_deletes: list[str] = []

        async def delete(self, key: str) -> None:
            self.deleted.append(key)

        async def delete_by_pattern(self, pattern: str) -> int:
            self.pattern_deletes.append(pattern)
            return 0

    redis = FakeRedis()
    await invalidate_market_caches(redis, ExchangeCode.DSE)

    for section in DASHBOARD_CACHE_KEY_NAMES:
        assert dashboard_cache_key(section, ExchangeCode.DSE) in redis.deleted
    for section in PULSE_CACHE_KEY_NAMES:
        assert pulse_cache_key(section, ExchangeCode.DSE) in redis.deleted
    for section in UNIVERSE_CACHE_KEY_NAMES:
        assert universe_cache_key(section, ExchangeCode.DSE) in redis.deleted
    assert universe_prev_cache_key(ExchangeCode.DSE) in redis.deleted
    assert "stock-sector-context:DSE:*" in redis.pattern_deletes
    assert "stock-workspace:*:DSE:*" in redis.pattern_deletes


def test_scored_universe_row_serialization_has_only_allowed_keys() -> None:
    row = _universe_row(_snapshot(trade_date="2026-06-17"), decision=_decision(TraderRecommendation.BUY))
    payload = row.model_dump(mode="json")
    assert set(payload.keys()) == {
        "stock",
        "technical_snapshot",
        "decision",
        "eligibility",
        "scanner",
        "session",
    }
    assert_no_forbidden_universe_fields(payload)


@pytest.mark.asyncio
async def test_scored_universe_redis_cache_payload_is_lightweight() -> None:
    class FakeRedis:
        def __init__(self) -> None:
            self.is_available = True
            self.storage: dict[str, dict] = {}
            self.deleted: list[str] = []

        async def get_json(self, key: str) -> dict | None:
            return self.storage.get(key)

        async def set_json(self, key: str, value: dict, *, ttl_seconds: int) -> None:
            self.storage[key] = value

        async def delete(self, key: str) -> None:
            self.deleted.append(key)
            self.storage.pop(key, None)

    stock = _stock("CACHE")
    freshness_time = datetime(2026, 6, 30, 15, 0)
    prices = [
        DailyPrice(
            stock_id=stock.id,
            trade_date=date(2026, 6, 1) + timedelta(days=index),
            open_price=100 + index,
            high_price=105 + index,
            low_price=95 + index,
            close_price=100 + index,
            volume=1_000 + index * 10,
            turnover=100_000,
            source="TEST",
            data_quality_flag=DataQualityFlag.OK,
        )
        for index in range(25)
    ]

    class FakeMarketRepository:
        async def list_market_price_windows(self, **kwargs):
            return [(stock, price) for price in prices]

        async def list_daily_market_summaries(self, **kwargs):
            return []

        async def get_market_price_freshness(self, **kwargs):
            return prices[-1].trade_date, freshness_time

        async def list_recent_exchange_session_dates(self, **kwargs):
            return [price.trade_date for price in prices[-10:]]

        async def list_corporate_action_dates_by_stock(self, **kwargs):
            return {}

    class FakeStocksRepository:
        async def count_stocks(self, **kwargs):
            return 1

    redis = FakeRedis()
    service = MarketUniverseService(
        FakeMarketRepository(),
        FakeStocksRepository(),
        redis,
        Settings(market_snapshot_interval_minutes=15),
    )

    rows = await service.recompute_scored_universe(exchange=ExchangeCode.DSE)
    await service.cache_scored_universe(exchange=ExchangeCode.DSE, rows=rows)
    await service.get_scored_universe(exchange=ExchangeCode.DSE)

    cache_key = universe_cache_key("scored", ExchangeCode.DSE)
    cached = redis.storage[cache_key]
    assert_no_forbidden_universe_fields(cached)
    for row in cached["rows"]:
        assert_no_forbidden_universe_fields(row)


def test_build_scored_universe_rows_omits_prices_attribute() -> None:
    stock = _stock("GROUP")
    prices = [
        DailyPrice(
            stock_id=stock.id,
            trade_date=date(2026, 6, 1) + timedelta(days=index),
            open_price=100 + index,
            high_price=105 + index,
            low_price=95 + index,
            close_price=100 + index,
            volume=1_000 + index * 10,
            turnover=100_000,
            source="TEST",
            data_quality_flag=DataQualityFlag.OK,
        )
        for index in range(25)
    ]
    grouped = group_price_window_rows([(stock, price) for price in prices])
    scored = build_scored_universe_rows(grouped)

    assert len(scored) == 1
    assert scored[0].stock.symbol == "GROUP"
    assert "prices" not in scored[0].model_dump()
    assert_no_forbidden_universe_fields(scored[0].model_dump(mode="json"))


def test_build_signal_feed_prioritizes_actionable_decisions() -> None:
    rows = [
        _universe_row(
            _snapshot(trade_date="2026-06-17", price_change_percent=3.0),
            "BUYME",
            decision=_decision(TraderRecommendation.BUY, 80),
        ),
        _universe_row(
            _snapshot(trade_date="2026-06-17", price_change_percent=1.0),
            "HOLD",
            decision=_decision(TraderRecommendation.HOLD, 90),
        ),
    ]

    feed = build_signal_feed(rows, limit=2)

    assert feed[0]["symbol"] == "HOLD"
    assert feed[1]["symbol"] == "BUYME"


def test_derive_market_mood_bullish_when_breadth_supports() -> None:
    rows = [
        _universe_row(_snapshot(trade_date="2026-06-17", price_change_percent=2.0, volume=20_000), f"S{i}")
        for i in range(10)
    ]

    mood = derive_market_mood(rows, advancing=8, declining=2)

    assert mood in {"Bullish", "Accumulation"}


def test_build_market_insights_includes_mood_block() -> None:
    insights = build_market_insights(
        market_mood="Bullish",
        has_partial_data=False,
        signal_count=3,
        turnover_label="1.2B",
    )

    assert insights[0]["id"] == "market-mood"
    assert any(insight["id"] == "signal-coverage" for insight in insights)
    turnover = next(insight for insight in insights if insight["id"] == "turnover-context")
    assert turnover["description"] == "Latest turnover is 1.2B."
    missing = build_market_insights(
        market_mood="Bullish",
        has_partial_data=False,
        signal_count=0,
        turnover_label="N/A",
    )
    missing_turnover = next(insight for insight in missing if insight["id"] == "turnover-context")
    assert "unavailable" in str(missing_turnover["description"]).lower()
    assert "1.2B" not in str(missing_turnover["description"])


def test_briefing_module_has_no_forbidden_imports() -> None:
    import app.modules.market_pulse.market_pulse_briefing as briefing_module

    source = briefing_module.__file__
    assert source is not None
    contents = open(source, encoding="utf-8").read()
    assert "compute_trader_decision" not in contents
    assert "build_technical_snapshot" not in contents
    assert "list_market_price_windows" not in contents


def test_dashboard_service_has_no_forbidden_universe_imports() -> None:
    import app.modules.market_dashboard.market_dashboard_service as module

    source = module.__file__
    assert source is not None
    contents = open(source, encoding="utf-8").read()
    assert "get_scored_universe" not in contents
    assert "MarketUniverseService" not in contents


def test_pulse_service_has_no_forbidden_price_window_imports() -> None:
    import app.modules.market_pulse.market_pulse_service as module

    source = module.__file__
    assert source is not None
    contents = open(source, encoding="utf-8").read()
    assert "list_market_price_windows" not in contents
