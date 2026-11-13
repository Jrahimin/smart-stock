from datetime import UTC, date, datetime
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.core.enums import ExchangeCode, MarketDataState, MarketSessionStatus
from app.core.market_cache import dashboard_cache_key
from app.modules.market_data.market_data_service import MarketDataService
from app.modules.market_data.published_generation import resolve_published_market_generation


@pytest.mark.asyncio
@pytest.mark.parametrize("move", [None, Decimal("0"), Decimal("25")])
async def test_index_snapshot_preserves_missing_movement_and_never_invents_observed_day_ohlc(monkeypatch, move):
    summary = SimpleNamespace(index_name="DSEX", trade_date=date(2026,11,12), index_close=Decimal("5000"),
        index_change=move, index_change_percent=move, total_volume=100, total_turnover=None, total_trades=None,
        advancing_issues=None, declining_issues=None, unchanged_issues=None, source="FIXTURE")
    repository = SimpleNamespace(list_daily_market_summaries=AsyncMock(return_value=[summary]))
    performance = SimpleNamespace(range_52w_low=Decimal("4500"), range_52w_high=Decimal("5500"),
        return_1m_percent=None, return_6m_percent=None, return_1y_percent=None)
    monkeypatch.setattr("app.modules.market_data.market_data_service.build_dsex_performance_snapshot", AsyncMock(return_value=performance))
    result = await MarketDataService(repository, object()).get_dsex_index_snapshot(summaries=[summary])
    payload = result.model_dump(mode="json")
    assert result.index_close == Decimal("5000")
    assert result.index_change == result.index_change_percent == move
    assert payload["index_change"] == (None if move is None else str(move))
    assert all(payload[field] is None for field in ("day_open","day_high","day_low","advancing_issues","declining_issues","unchanged_issues"))


@pytest.mark.asyncio
async def test_open_market_without_today_batch_labels_old_finalized_marks_stale_without_changing_identity():
    observed = datetime(2026,11,10,8,tzinfo=UTC)
    old = SimpleNamespace(trade_date=date(2026,11,10), accepted_count=426, source_last_synced_at=observed,
        published_at=observed, sync_id="immutable-close")
    async def read(**kwargs): return old if kwargs["state"] == MarketDataState.FINALIZED else None
    result = await resolve_published_market_generation(SimpleNamespace(get_latest_market_data_generation=read), exchange=ExchangeCode.DSE,
        market_status=MarketSessionStatus.OPEN, today=date(2026,11,12), now=datetime(2026,11,12,5,tzinfo=UTC), stale_after_seconds=1800)
    assert result.sync_id == old.sync_id and result.trade_date == old.trade_date
    assert result.data_state == MarketDataState.STALE


def test_overview_cache_contract_version_is_narrow_and_generation_specific():
    assert ":index-v3:" in dashboard_cache_key("overview", ExchangeCode.DSE, "gA")
    assert "index-v3" not in dashboard_cache_key("movers", ExchangeCode.DSE, "gA")
    assert dashboard_cache_key("overview", ExchangeCode.DSE, "gA") != dashboard_cache_key("overview", ExchangeCode.DSE, "gB")


@pytest.mark.parametrize("sector_count", [1,3])
def test_all_leadership_sentences_use_the_same_existing_scope(sector_count):
    from app.modules.market_pulse.market_pulse_briefing import build_market_briefing
    from app.tests.test_market_pulse_briefing_semantics import _rows
    rows = _rows([1.0] * (sector_count*3))
    for index,row in enumerate(rows): row.stock.sector = f"Sector {index//3}"
    result = build_market_briefing(rows,[],[],[],market_summaries=[],format_number=str,
        format_percent=lambda value:f"{value:.2f}%",price_tone=lambda value:"positive",sparkline_points=lambda *args:[])
    expected = "broad" if sector_count==3 else "concentrated"
    opposite = "concentrated" if sector_count==3 else "broad"
    for sentence in (result.story.explanation,result.leadership.narrative,result.summary.text):
        assert expected in sentence.lower()
        # Broad stock breadth and sector concentration are independent measures.
        sector_sentence = sentence.lower().split("positive sector leadership")[-1]
        if "positive sector leadership" in sentence.lower():
            assert opposite not in sector_sentence
    assert result.money_flow.inflows[0].change_label.endswith("%")
