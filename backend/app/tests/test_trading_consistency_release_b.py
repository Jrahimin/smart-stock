from dataclasses import replace
from datetime import UTC, date, datetime
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.core.enums import ExchangeCode, MarketDataState
from app.core.security_config import ANONYMOUS_USER_CONTEXT
from app.modules.market_data.breadth import breadth_facts
from app.modules.market_data.market_data_service import MarketDataService, MarketSnapshotCoverageError
from app.modules.market_pulse.pulse_score import _compute_risk_penalty
from app.modules.stock_details.decision.engine import compute_trader_decision
from app.modules.stock_details.decision.technical import build_technical_snapshot
from app.modules.trading_intelligence.capture_inventory import inspect_capture
from app.modules.trading_intelligence.input_capture import capture_strategy_input, restore_strategy_input
from app.tests.test_canonical_decision_consistency import _stock, _prices
from app.modules.stock_details.decision.canonical import build_strategy_input


@pytest.mark.parametrize("volumes,baseline,ratio", [([100], None, None), ([0, 100], None, None),
    ([100, 0], 100, 0), ([100, 45], 100, 0.45), ([100, 100], 100, 1), ([100, 180], 100, 1.8)])
def test_one_volume_fact_excludes_current_session(volumes, baseline, ratio):
    stock = _stock()
    prices = _prices(stock, len(volumes))
    for bar, volume in zip(prices, volumes, strict=True):
        bar.volume = volume
    snapshot = build_technical_snapshot(prices)
    facts = snapshot.volume_facts
    assert facts is snapshot.volume_facts
    assert facts.baseline == baseline
    assert facts.ratio == ratio
    assert facts.prior_sample_count == (0 if baseline is None else 1)
    if ratio is None:
        assert facts.classification == "UNKNOWN" and not snapshot.is_breakout


def test_old_capture_restores_v2_identity_and_new_policy_is_distinct():
    stock = _stock()
    value = build_strategy_input(stock, _prices(stock), exchange_session_dates=tuple(bar.trade_date for bar in _prices(stock)))
    legacy = replace(value, strategy_version="trading-intelligence-v2")
    payload = capture_strategy_input(legacy)
    del payload["strategy_version"]  # Actual v2 captures predate the explicit input field.
    restored = restore_strategy_input(payload)
    old, restored_old = compute_trader_decision(legacy), compute_trader_decision(restored)
    new = compute_trader_decision(value)
    assert old.canonical_result.input_hash == restored_old.canonical_result.input_hash
    assert old.canonical_result.shared_decision_id == restored_old.canonical_result.shared_decision_id
    assert new.canonical_result.shared_decision_id != old.canonical_result.shared_decision_id
    assert new.canonical_result.risk_label == new.trading_risk.label
    assert old.canonical_result.risk_label == old.risk.label


def test_breadth_missing_changes_are_unknown_with_explicit_denominator():
    facts = breadth_facts([1, -1, 0, None], cohort="SAME", as_of_date=date(2026, 11, 10))
    assert (facts.advancing, facts.declining, facts.unchanged) == (1, 1, 1)
    assert facts.unknown_count == 1 and facts.denominator == facts.known_count == 3
    assert facts.cohort_count == 4
    assert breadth_facts([None], cohort="SAME").denominator == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("accepted,success", [(1, False), (400, False), (426, True)])
async def test_missing_live_manifest_requires_same_session_distinct_coverage(monkeypatch, accepted, success):
    repository = SimpleNamespace(
        lock_session_publication=AsyncMock(),
        get_latest_market_data_generation=AsyncMock(return_value=None),
        session_symbol_coverage=AsyncMock(return_value=(426, accepted, 2)),
        is_market_session_finalized=AsyncMock(return_value=True),
        session=SimpleNamespace(rollback=AsyncMock()),
    )
    service = MarketDataService(repository, ANONYMOUS_USER_CONTEXT)
    service.publish_market_generation = AsyncMock(return_value="recovered")
    if success:
        assert await service.publish_finalized_market_generation(exchange=ExchangeCode.DSE, trade_date=date(2026, 11, 10)) == "recovered"
        values = service.publish_market_generation.call_args.kwargs
        assert values["accepted_count"] == values["fetched_count"] == 426
    else:
        with pytest.raises(MarketSnapshotCoverageError):
            await service.publish_finalized_market_generation(exchange=ExchangeCode.DSE, trade_date=date(2026, 11, 10))
        service.publish_market_generation.assert_not_awaited()


def test_capture_inventory_reports_missing_duplicates_and_version_parity():
    stock = _stock()
    value = build_strategy_input(stock, _prices(stock))
    capture = SimpleNamespace(input_payload={"universe_membership": [str(stock.id), str(stock.id)], "inputs": {}},
        result_payload={"strategy_version": "unsupported", "rows": [{"stock": {"id": str(stock.id)}, "eligibility": {"status": "ELIGIBLE"}}]},
        observed_at=datetime.now(UTC), invalidated_at=None, generation_id="g", session_date=value.as_of_date)
    report = inspect_capture(capture)
    assert not report["coverage_verified"] and report["listed_count"] == 2
    assert report["missing_input_ids"] == [str(stock.id)]
    assert report["parity"][0]["status"] == "VERSION_UNAVAILABLE"


def test_account_math_uses_display_mark_instead_of_published_reference():
    from app.modules.market_universe.market_universe_schemas import DisplayQuoteRead
    from app.modules.stock_details.decision.display_metrics import resolve_account_mark
    from app.modules.watchlists.watchlists_service import _compute_unrealized_gain_percent
    from app.tests.test_canonical_generation_architecture import _canonical_fixture
    from app.tests.test_portfolios import _item, _service
    _, _, row, _ = _canonical_fixture()
    row = row.model_copy(update={"display_quote": DisplayQuoteRead(current_price=110,
        previous_close=100, price_change=10, price_change_percent=10,
        as_of_trade_date="2026-11-11", observation_status="PROVISIONAL", data_quality="OK")})
    row.session.close_price = Decimal("100")
    item = _item(quantity=Decimal("10"), buy_price=Decimal("100"))
    service, _, _ = _service([item], {})
    position = service._build_position(item=item, universe_row=row, fallback_price=None,
        published_date=date(2026, 11, 11), data_state=MarketDataState.LIVE,
        is_provisional=True, relevant_event=None)
    mark = resolve_account_mark(row=row)
    assert _compute_unrealized_gain_percent(buy_price=Decimal("100"), current_price=Decimal(str(mark.current_price))) == Decimal("10.00")
    assert position.current_value == Decimal("1100")
    assert position.unrealized_gain_amount == Decimal("100")
    assert position.current_price == Decimal("110")
