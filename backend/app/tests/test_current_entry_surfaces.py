from dataclasses import replace
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.core.core_config import Settings
from app.core.enums import DecisionDisplayAction, EligibilityStatus, ExchangeCode, MarketDataState, MarketSessionStatus
from app.modules.market_pulse.market_pulse_service import (
    MarketPulseService, PulsePresentationRow, _to_focus_stock_read,
)
from app.modules.market_pulse.pulse_score import compute_pulse_score, derive_pulse_focus_label
from app.modules.market_universe.market_universe_compute import technical_snapshot_from_read
from app.modules.market_universe.market_universe_schemas import DisplayQuoteRead
from app.modules.market_universe.market_universe_service import MarketUniverseService
from app.modules.signals.trader_decisions_service import TraderDecisionsService
from app.modules.stock_details.stock_details_decision_service import StockDetailsDecisionService
from app.tests.test_canonical_generation_architecture import _canonical_fixture, _DetailsRepository
from app.tests.test_market_pulse_cache import _pulse


@pytest.mark.asyncio
@pytest.mark.parametrize("hour,minute,pause", [(5,0,None),(9,0,None),(9,15,None),(3,59,"QUOTE_UNUSABLE")])
@pytest.mark.parametrize("price,low,expected", [(100, 99, "ENTRY_TERMS_MET"),
    (105, 99, "ABOVE_ENTRY_ZONE"), (96, 96, "STOP_BREACHED"), (100, 95, "STOP_BREACHED")])
async def test_universe_signals_support_and_cached_pulse_share_current_codes(monkeypatch, price, low, expected, hour, minute, pause):
    stock, prices, original, snapshot = _canonical_fixture()
    day = snapshot.generation.trade_date + timedelta(days=1)
    now = datetime.combine(day, datetime.min.time(), tzinfo=UTC).replace(hour=hour, minute=minute)
    published = now-timedelta(days=1)
    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return now.astimezone(tz) if tz else now.replace(tzinfo=None)
    monkeypatch.setattr("app.modules.market_universe.market_universe_service.datetime", Clock)
    plan = original.analysis.trade_plan.model_copy(update={
        "status": "VALID_ENTRY_PLAN", "entry_zone_low": 99, "entry_zone_high": 101,
        "preferred_entry_zone_low": 99, "preferred_entry_zone_high": 101,
        "stop_loss": 96, "invalidation_price": 96, "target_low": 110,
        "expiry_sessions": 10, "entry_timing": "READY",
    })
    row = original.model_copy(update={"decision": original.decision.model_copy(update={
        "display_action": DecisionDisplayAction.POTENTIAL_BUY,
    }), "eligibility": original.eligibility.model_copy(update={"status": EligibilityStatus.ELIGIBLE}),
        "analysis": original.analysis.model_copy(update={"trade_plan": plan})})
    snapshot = replace(snapshot, payload=snapshot.payload.model_copy(update={"rows": [row]}))
    quote_context = replace(snapshot.generation, trade_date=day, sync_id="quote-next", data_state=MarketDataState.LIVE)
    bar = SimpleNamespace(stock_id=stock.id, trade_date=day, open_price=100,
        high_price=max(price, 100), low_price=low, close_price=price,
        volume=1000, data_quality_flag="OK")
    market = SimpleNamespace(
        list_recent_exchange_session_dates=AsyncMock(return_value=[snapshot.generation.trade_date]),
        list_entry_path_observations=AsyncMock(return_value=([bar], [], published-timedelta(days=1))),
        list_entry_basis_events=AsyncMock(return_value={}),
    )
    publication = SimpleNamespace(generation_id=snapshot.generation.sync_id,
        session_date=snapshot.generation.trade_date, observed_at=published, invalidated_at=None)
    async def latest_publication(*, before_date=None, **kwargs):
        return None if before_date is not None else publication
    durable = SimpleNamespace(latest_publication=AsyncMock(side_effect=latest_publication),
        publication_coverage=AsyncMock(return_value={"universe_membership": [str(stock.id)], "input_keys": [str(stock.id)], "excluded_members": [], "membership_provenance": {"status": "OBSERVED_INDEPENDENT_LISTED_SET", "observed_at": published.isoformat(), "listed_count": 1, "market_coverage_verified": True}}))
    universe = MarketUniverseService(market, SimpleNamespace(count_stocks=AsyncMock(return_value=1)), object(), Settings(), durable)
    universe.get_canonical_universe = AsyncMock(return_value=snapshot)
    universe.resolve_generation_context = AsyncMock(return_value=snapshot.generation)
    universe.is_generation_current = AsyncMock(return_value=True)
    universe.get_decision_event_observations = AsyncMock(return_value=())
    universe.resolve_quote_context = AsyncMock(return_value=quote_context)
    universe.get_display_quotes = AsyncMock(return_value={stock.id: DisplayQuoteRead(current_price=price,
        as_of_trade_date=day.isoformat(), observation_status="PROVISIONAL", data_quality="OK", source_observed_at=now)})

    response = await universe.get_universe_rows(exchange=ExchangeCode.DSE)
    signal = (await TraderDecisionsService(universe).list_latest_trader_decisions(
        exchange=ExchangeCode.DSE, limit=10, offset=0, price_window_limit=90))[0]
    support = await StockDetailsDecisionService(_DetailsRepository(stock, prices), universe).get_decision_support(
        exchange=ExchangeCode.DSE, symbol=stock.symbol)
    technical = technical_snapshot_from_read(row.technical_snapshot)
    score = compute_pulse_score(technical, row.decision)
    focus = _to_focus_stock_read(PulsePresentationRow(stock, technical, row.decision, score,
        derive_pulse_focus_label(technical, row.decision, score)), 1)
    pulse_service = MarketPulseService(market_data_service=SimpleNamespace(get_market_freshness=AsyncMock(
        return_value=SimpleNamespace(market_status=MarketSessionStatus.OPEN))),
        universe_service=universe, redis=object(), settings=Settings())
    cached = _pulse("Cached briefing").model_copy(update={"focus_stocks": [focus]})
    pulse = await pulse_service._refresh_current_fields(cached, snapshot)
    if pause and expected != "STOP_BREACHED":
        expected = pause
    codes = [response.rows[0].entry_applicability.reason_code, signal.decision.entry_applicability.reason_code,
        support.entry_applicability.reason_code, pulse.focus_stocks[0].entry_applicability.reason_code]
    assert codes == [expected]*4
    assert pulse.focus_stocks[0].actionable_trigger is (expected == "ENTRY_TERMS_MET" and hour == 5)
    assert response.rows[0].decision.canonical.shared_decision_id == original.decision.canonical.shared_decision_id
    assert support.canonical_decision.shared_decision_id == original.decision.canonical.shared_decision_id
