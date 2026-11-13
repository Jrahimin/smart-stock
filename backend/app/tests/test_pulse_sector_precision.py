from dataclasses import replace
from datetime import date
from decimal import Decimal
from fractions import Fraction
from itertools import permutations
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.core.enums import ExchangeCode
from app.modules.market_pulse.market_pulse_briefing import (
    _avg, _sector_performance, build_market_briefing, measured_price_change,
)
from app.tests.test_market_pulse_briefing_semantics import _rows


def briefing(rows):
    return build_market_briefing(rows, [], [], [], market_summaries=[], format_number=str,
        format_percent=lambda value: f"{value:.2f}%", price_tone=lambda value: "neutral", sparkline_points=lambda *args: [])


def test_reproduced_cancellation_is_exact_flat_and_permutation_invariant_across_all_sections():
    rows = _rows([0.1, 0.2, -0.3, -1.0]); rows[-1].stock.sector = "Tech"
    expected = None
    for ordered in permutations(rows):
        assert _avg(_sector_performance(ordered)["Bank"]) == 0
        result = briefing(ordered)
        assert result.story.headline_code == "NO_POSITIVE_SECTOR"
        assert result.story.sector_count is None
        assert not result.money_flow.inflows and not result.money_flow.outflows
        assert next(item.value for item in result.state.dimensions if item.key == "leadership") == "No positive leader"
        assert next(item.value for item in result.summary.highlights if item.label == "Leadership") == "No positive leader"
        assert "No positive sector" in result.leadership.narrative
        assert [(item.label, item.value) for item in result.story.metrics[:3]] == [("Advancing", "2"), ("Declining", "2"), ("Unchanged", "0")]
        payload = {"story": result.story.model_dump(mode="json"), "state": result.state.model_dump(mode="json"),
            "flows": result.money_flow.model_dump(mode="json"), "summary": result.summary.model_dump(mode="json"),
            "sector_cards": [card.model_dump(mode="json") for card in result.leadership.cards if card.kind == "sector"]}
        assert expected is None or payload == expected
        expected = payload


@pytest.mark.parametrize("values,expected_count", [
    ([0.1999] * 3, None), ([0.2] * 3, None), ([0.2] * 4, None), ([0.2001] * 3, 1),
    ([-0.1499] * 3, None), ([-0.15] * 3, None), ([-0.15] * 4, None), ([-0.1501] * 3, 1),
    ([0.1, 0.2, 0.3], None), ([-0.1, -0.15, -0.2], None),
    ([0.2, 0.2, 0.2001], 1), ([-0.15, -0.15, -0.1501], 1),
    ([0.2, 0.2001], None), ([-0.15, -0.1501], None),
])
def test_strict_cutoffs_eligibility_and_permutations(values, expected_count):
    rows = _rows(values)
    for ordered in permutations(rows):
        result = briefing(ordered)
        assert result.story.sector_count == expected_count
        expected_code = ("STRENGTH_SECTORS" if expected_count else "STRENGTH_STOCKS") if values[0] > 0 else ("WEAKNESS_SECTORS" if expected_count else "WEAKNESS_STOCKS")
        assert result.story.headline_code == expected_code
        assert bool(result.money_flow.inflows) == (len(values) >= 3 and values[0] > 0)
        assert bool(result.money_flow.outflows) == (len(values) >= 3 and values[0] < 0)


@pytest.mark.parametrize("last,positive", [(-0.2999, True), (-0.3001, False)])
def test_legitimate_nonzero_mean_is_not_rounded_to_zero(last, positive):
    rows = _rows([0.1, 0.2, last])
    for ordered in permutations(rows):
        mean = _avg(_sector_performance(ordered)["Bank"])
        assert mean == (Fraction(1, 30000) if positive else Fraction(-1, 30000))
        result = briefing(ordered)
        assert bool(result.money_flow.inflows) == positive
        assert bool(result.money_flow.outflows) != positive
        assert result.story.sector_count is None
        flow = result.money_flow.inflows[0] if positive else result.money_flow.outflows[0]
        assert flow.change_label == ("+<0.01%" if positive else "-<0.01%")
        if positive:
            assert next(card.detail for card in result.leadership.cards if card.kind == "sector") == "+<0.01%"


@pytest.mark.parametrize("value,label", [("0", "0.00%"), ("0.0001", "+<0.01%"), ("-0.0001", "-<0.01%"), ("0.01", "+0.01%"), ("-0.01", "-0.01%")])
def test_sector_bound_label_does_not_round_genuine_direction_to_zero(value, label):
    from app.modules.market_pulse.market_pulse_briefing import _format_sector_percent
    assert _format_sector_percent(Fraction(Decimal(value))) == label


def test_stored_decimal_precision_wins_without_quantizing_legacy_or_missing_source_values():
    snapshot = SimpleNamespace(latest_trade_date="2026-11-12", price_change_percent=0.20000000000000004)
    session = SimpleNamespace(latest_trade_date=date(2026, 11, 12), change_percent=Decimal("0.2000"))
    assert measured_price_change(snapshot, session) == Fraction(1, 5)
    session.latest_trade_date = date(2026, 11, 11)
    assert measured_price_change(snapshot, session) is None
    session.change_percent = None
    assert measured_price_change(snapshot, session) is None
    assert measured_price_change(snapshot) == Fraction(Decimal(str(snapshot.price_change_percent)))
    snapshot.price_change_percent = 0.000000001
    assert measured_price_change(snapshot) == Fraction(1, 1_000_000_000)


@pytest.mark.asyncio
async def test_actual_pulse_compute_uses_same_session_decimal_instead_of_noisy_technical_float():
    from app.tests.test_canonical_generation_architecture import _canonical_fixture
    from app.tests.test_market_pulse_cache import _service_with_redis
    from app.modules.market_pulse.market_pulse_schemas import OpportunityScoreRead
    from app.core.enums import EligibilityStatus
    _, _, row, snapshot = _canonical_fixture()
    rows = []
    for index, value in enumerate([Decimal("0.1000"), Decimal("0.2000"), Decimal("-0.3000")]):
        rows.append(row.model_copy(update={
            "stock": row.stock.model_copy(update={"id": uuid4(), "symbol": f"EXACT{index}", "sector": "Bank"}),
            "session": row.session.model_copy(update={"change_percent": value}),
            "technical_snapshot": row.technical_snapshot.model_copy(update={"price_change_percent": float(value) + 1e-15}),
            "eligibility": row.eligibility.model_copy(update={"status": EligibilityStatus.ELIGIBLE}),
        }))
    snapshot = replace(snapshot, payload=snapshot.payload.model_copy(update={"rows": rows}))
    service = _service_with_redis({})
    service.market_data_service.list_daily_market_summaries = AsyncMock(return_value=[])
    service._resolve_opportunity_score = AsyncMock(return_value=OpportunityScoreRead(score=60, label="Test"))
    result = await service._compute_market_pulse(exchange=ExchangeCode.DSE, previous=None, snapshot=snapshot)
    assert result.briefing is not None and not result.briefing.money_flow.inflows
    assert next(item.value for item in result.briefing.state.dimensions if item.key == "leadership") == "No positive leader"



def test_sector_card_and_narrative_share_measured_availability():
    rows = [replace(row, change_basis_available=False, measured_change_percent=None) for row in _rows([0.4]*3)]
    result = briefing(rows)
    card = next(card for card in result.leadership.cards if card.kind == "sector")
    assert "unavailable" in result.leadership.narrative
    assert "unavailable" in card.subtitle
    assert "No positive" not in card.subtitle
    for changes in ([0,0,0], [-0.1]*3):
        card = next(card for card in briefing(_rows(changes)).leadership.cards if card.kind == "sector")
        assert "No positive" in card.subtitle
    assert next(card for card in briefing(_rows([0.4]*3)).leadership.cards if card.kind == "sector").detail == "+0.40%"
