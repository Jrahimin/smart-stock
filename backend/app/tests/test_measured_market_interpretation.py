from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.core.core_config import Settings
from app.core.enums import DataQualityFlag, ExchangeCode
from app.modules.market_data.breadth import breadth_facts
from app.modules.market_dashboard.market_dashboard_compute import measured_market_interpretation
from app.modules.market_dashboard.market_dashboard_schemas import DashboardMarketSentimentRead
from app.modules.market_dashboard.market_dashboard_service import MarketDashboardService

DAY = date(2026, 11, 10)


def index(**updates):
    return SimpleNamespace(**{**dict(index_name="DSEX", trade_date=DAY, index_close=Decimal("5000"),
        index_change_percent=Decimal("0.2"), total_volume=120), **updates})


def interpret(changes, current=None, summaries=()):
    return measured_market_interpretation(breadth=breadth_facts(changes, cohort="ACTIVE_VALID_OHLC", as_of_date=DAY),
        index=current, summaries=summaries, session_date=DAY)


@pytest.mark.parametrize("changes,move,code", [([1, 2, -1], ".2", "ALIGNED_UP"),
    ([-1, -2, 1], "-.2", "ALIGNED_DOWN"), ([1, 2, -1], "-.2", "DIVERGENT"),
    ([0, 0], "0", "MIXED"), ([None], ".2", "INDEX_ONLY")])
def test_interpretation_is_only_same_session_measured_agreement(changes, move, code):
    current = index(); current.index_change_percent = Decimal(move)
    facts = interpret(changes, current)
    assert facts.code == code
    assert facts.breadth.cohort_count == len(changes)
    assert facts.as_of_date == DAY


def test_missing_index_unknown_breadth_and_zero_are_distinct():
    assert interpret([1], None).code == "BREADTH_ONLY"
    assert interpret([None], None).code == "UNAVAILABLE"
    assert interpret([0], None).breadth.known_count == 1
    current = index(); current.trade_date = date(2026, 11, 9)
    assert interpret([1], current).index_change_percent is None


def test_participation_uses_only_prior_matching_quality_rows_and_reports_actual_sample():
    rows = [SimpleNamespace(trade_date=date(2026, 11, day), index_name=name, total_volume=volume, data_quality_flag=quality)
        for day, name, volume, quality in [(8, "DSEX", 80, DataQualityFlag.OK), (9, "DSEX", 120, DataQualityFlag.OK),
            (10, "DSEX", 999, DataQualityFlag.OK), (7, "DS30", 999, DataQualityFlag.OK),
            (6, "DSEX", 999, DataQualityFlag.SUSPICIOUS)]]
    facts = interpret([1, None], index(), rows)
    assert facts.volume_vs_average == Decimal("1.2")
    assert facts.volume_average_sessions == 2
    current = index(); current.total_volume = 0
    assert interpret([1], current, rows).volume_vs_average == 0
    assert interpret([1], index()).volume_vs_average is None
    assert interpret([1], None, rows).volume_vs_average is None


@pytest.mark.asyncio
async def test_old_same_generation_sentiment_cache_is_upgraded_once_without_global_invalidation():
    freshness = SimpleNamespace(market_sync_id="G1", last_synced_at=None, market_status=SimpleNamespace(value="CLOSED"))
    market = SimpleNamespace(get_market_freshness=AsyncMock(return_value=freshness))
    service = MarketDashboardService(market_repository=object(), market_data_service=market,
        stocks_repository=object(), redis=None, settings=Settings())
    old = dict(exchange="DSE", market_mood="Unknown", signal_count=0, price_backed_count=1, insights=[])
    current = DashboardMarketSentimentRead(**old, interpretation=interpret([1], index()))
    service._cache_get = AsyncMock(side_effect=[old, current.model_dump(mode="json")])
    service._cache_set = AsyncMock()
    compute = AsyncMock(return_value=current)
    result = await service._get_cached("market-sentiment", ExchangeCode.DSE, DashboardMarketSentimentRead, compute)
    assert result.interpretation.code == "ALIGNED_UP"
    await service._get_cached("market-sentiment", ExchangeCode.DSE, DashboardMarketSentimentRead, compute)
    assert compute.await_count == 1
    assert service._cache_set.await_count == 1


@pytest.mark.asyncio
async def test_actual_sentiment_path_uses_stored_missing_index_change_without_display_zero_or_history_fetch():
    from app.modules.market_dashboard.market_snapshot import DashboardMarketSnapshot, DashboardSnapshotRow
    from app.tests.test_dashboard_snapshot import _price, _stock, _technical

    stock = _stock()
    summary = index(index_change_percent=None)
    summary.data_quality_flag = DataQualityFlag.OK; summary.total_turnover = None
    row = DashboardSnapshotRow(stock=stock, price=_price(stock.id, DAY), technical=_technical(change=1))
    market = SimpleNamespace(get_dsex_index_snapshot=AsyncMock(side_effect=AssertionError("No horizon/provider read")))
    service = MarketDashboardService(market_repository=object(), market_data_service=market,
        stocks_repository=object(), redis=None, settings=Settings())
    service._load_snapshot = AsyncMock(return_value=DashboardMarketSnapshot(DAY, [summary], [row]))
    result = await service.compute_market_sentiment(ExchangeCode.DSE,
        freshness=SimpleNamespace(market_status=SimpleNamespace(value="CLOSED")))
    assert result.interpretation.code == "BREADTH_ONLY"
    assert result.interpretation.index_change_percent is None
    assert result.interpretation.breadth.known_count == 1
    market.get_dsex_index_snapshot.assert_not_called()
