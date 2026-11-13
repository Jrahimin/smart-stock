"""Reviewed follow-up regressions for actual compared populations and joins."""
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.core.core_config import Settings
from app.core.enums import ExchangeCode
from app.modules.market_dashboard.market_dashboard_schemas import DashboardSectorsRead
from app.modules.market_dashboard.market_dashboard_service import MarketDashboardService
from app.modules.market_universe.market_universe_schemas import DisplayQuoteRead
from app.modules.stock_details.decision.entry_observation_log import entry_population_snapshot
from app.tests.test_entry_applicability import DAY, NOW, assess


def test_real_evaluator_excludes_non_comparisons_from_price_use_but_accounts_for_every_stock():
    receipt = DisplayQuoteRead(current_price=100, as_of_trade_date=DAY.isoformat(),
        observation_session_date=DAY.isoformat(), observation_status="PROVISIONAL",
        data_quality="OK", batch_fetched_at=NOW, volume=1000)
    wait = SimpleNamespace(display_action="WAIT", blocker_codes=[])
    no_trade = assess(decision=wait, quote=receipt, price_basis_v2=True)
    missing_quote = assess(decision=wait, quote=None, price_basis_v2=True)
    valid = receipt.model_copy(update={"source_observed_at": NOW})
    current = assess(quote=valid, price_basis_v2=True)
    unverified = assess(quote=receipt, price_basis_v2=True)
    assert current.status == "APPLICABLE" and unverified.status == "UNVERIFIED"
    checks = [no_trade, missing_quote, current, unverified, None]
    rows = [SimpleNamespace(stock=SimpleNamespace(id=index), entry_applicability=check) for index, check in enumerate(checks)]
    result = entry_population_snapshot(rows + [rows[0]], assessed_at=NOW, generation_id="plan", quote_generation_id="quote")
    assert result["population"] == 5 and result["comparison_population"] == 1
    assert result["counts"] == {"CURRENT": 1, "SNAPSHOT": 0, "LAST_CLOSE": 0, "UNVERIFIED": 1, "NON_COMPARISON": 3}
    assert result["unavailable_reasons"] == [("QUOTE_UNUSABLE", 1)]
    assert dict(result["non_comparison_reasons"]) == {"ACTION_NOT_PERMITTED": 2, "NOT_ASSESSED": 1}


def freshness(quote, decision):
    return SimpleNamespace(market_sync_id=quote, last_synced_at=NOW, trade_date=DAY,
        decision_generation_id=decision, decision_status="CURRENT")


@pytest.mark.asyncio
@pytest.mark.parametrize("quote_changed", [True, False])
async def test_compact_sector_response_retries_quote_or_same_quote_decision_publication_race(quote_changed):
    first = freshness("quote-A", "decision-A")
    second = freshness("quote-B" if quote_changed else "quote-A", "decision-B")
    market = SimpleNamespace(get_market_freshness=AsyncMock(side_effect=[first, second, second, second]))
    service = MarketDashboardService(object(), market, object(), object(), Settings())
    service.compute_sectors = AsyncMock(side_effect=[DashboardSectorsRead(decision_generation_id="decision-A"),
        DashboardSectorsRead(decision_generation_id="decision-B")])
    result = await service.get_sectors(exchange=ExchangeCode.DSE)
    assert result.market_sync_id == second.market_sync_id and result.decision_generation_id == "decision-B"
    assert service.compute_sectors.await_count == 2


@pytest.mark.asyncio
async def test_compact_sector_response_does_not_stamp_a_different_decision_as_matching():
    market = SimpleNamespace(get_market_freshness=AsyncMock(return_value=freshness("quote-A", "decision-A")))
    service = MarketDashboardService(object(), market, object(), object(), Settings())
    service.compute_sectors = AsyncMock(return_value=DashboardSectorsRead(decision_generation_id="decision-B"))
    with pytest.raises(RuntimeError, match="generation changed"):
        await service.get_sectors(exchange=ExchangeCode.DSE)
