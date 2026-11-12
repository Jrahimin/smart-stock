from dataclasses import replace
from decimal import Decimal
from fractions import Fraction
from itertools import permutations
from unittest.mock import AsyncMock

import pytest

from app.core.audit_hashing import stable_audit_hash
from app.core.enums import ExchangeCode, TurnoverProvenance
from app.modules.market_universe.market_universe_compute import (
    build_scored_universe_rows, group_price_window_rows, technical_snapshot_from_read, technical_snapshot_to_read,
)
from app.modules.market_universe.market_universe_lineage import compute_universe_payload_revision
from app.modules.market_universe.market_universe_schemas import ScoredUniverseCacheRead
from app.modules.market_pulse.market_pulse_briefing import measured_price_change
from app.modules.market_pulse.market_pulse_schemas import OpportunityScoreRead
from app.modules.market_pulse.market_pulse_service import is_eligible_pulse_candidate
from app.modules.stock_details.decision.technical import build_technical_snapshot
from app.tests.test_canonical_generation_architecture import _canonical_fixture, SESSION_DATE
from app.tests.test_market_pulse_cache import _service_with_redis

D = Decimal


def raw_snapshot(movements, mode="explicit"):
    pairs = []
    for index, (previous, close) in enumerate(movements):
        stock, prices, _, seed = _canonical_fixture()
        previous, close = D(previous), D(close)
        stock.sector = "Bank" if index < 3 else "Tech"
        stock.symbol = f"SOURCE{index}"
        for position, price in enumerate(prices):
            value = previous if position < len(prices) - 1 else close
            price.close_price = price.open_price = value
            price.high_price, price.low_price = value + 1, value - 1
            price.previous_close_price = None if mode == "history" else previous
            price.price_change = close - previous if mode == "amount" and position == len(prices) - 1 else None
            price.price_change_percent = None
            price.turnover_provenance = TurnoverProvenance.REPORTED
        pairs.extend((stock, price) for price in prices)
    rows = build_scored_universe_rows(group_price_window_rows(pairs),
        exchange_session_dates=[price.trade_date for price in prices], decision_session_date=SESSION_DATE)
    assert all(is_eligible_pulse_candidate(row, SESSION_DATE) for row in rows)
    payload = seed.payload.model_copy(update={"rows": rows, "payload_revision": compute_universe_payload_revision(rows)})
    return replace(seed, payload=payload)


async def projected(snapshot):
    service = _service_with_redis({})
    service.market_data_service.list_daily_market_summaries = AsyncMock(return_value=[])
    service._resolve_opportunity_score = AsyncMock(return_value=OpportunityScoreRead(score=60, label="Test"))
    computed = await service._compute_market_pulse(exchange=ExchangeCode.DSE, previous=None, snapshot=snapshot)
    return await service._stamp_pulse(computed, snapshot)


@pytest.mark.asyncio
@pytest.mark.parametrize("mode", ["explicit", "history", "amount"])
@pytest.mark.parametrize("movements,code,count", [
    ([("100", "100.10"), ("100", "100.20"), ("300", "299.10"), ("100", "99.00")], "NO_POSITIVE_SECTOR", None),
    ([("100", "100.20")] * 3, "STRENGTH_STOCKS", None),
    ([("100", "99.85")] * 3, "WEAKNESS_STOCKS", None),
    ([("100", "100")] * 3, "NO_POSITIVE_SECTOR", None),
    ([("100", "100.1999")] * 3, "STRENGTH_STOCKS", None),
    ([("100", "100.2001")] * 3, "STRENGTH_SECTORS", 1),
    ([("100", "99.8501")] * 3, "WEAKNESS_STOCKS", None),
    ([("100", "99.8499")] * 3, "WEAKNESS_SECTORS", 1),
    ([("30", "30.1"), ("30", "30.2"), ("100", "99"), ("100", "99")], "NO_POSITIVE_SECTOR", None),
    ([("30", "30.1"), ("30", "30.1"), ("30", "29.98")], "STRENGTH_STOCKS", None),
    ([("30", "29.9"), ("30", "29.9"), ("60", "60.13")], "WEAKNESS_STOCKS", None),
])
async def test_real_eligible_source_rows_survive_canonical_json_cache_projection_and_pulse(mode, movements, code, count):
    snapshot = raw_snapshot(movements, mode)
    serialized = snapshot.payload.model_dump(mode="json")
    cached = ScoredUniverseCacheRead.model_validate(serialized)
    assert compute_universe_payload_revision(cached.rows) == snapshot.payload.payload_revision
    for row, (previous, close) in zip(cached.rows, movements, strict=True):
        expected = (Fraction(D(close)) - Fraction(D(previous))) / Fraction(D(previous)) * 100
        technical = technical_snapshot_from_read(row.technical_snapshot)
        assert technical.price_change_percent_ratio == expected
        assert measured_price_change(technical, row.session) == expected
        assert measured_price_change(row.technical_snapshot, row.session) == expected
        assert technical_snapshot_to_read(technical).model_dump(mode="json") == row.technical_snapshot.model_dump(mode="json")
        if mode != "amount":
            # The versioned engine's ordinary float remains byte-compatible;
            # exact Pulse comparisons use the separate source ratio.
            assert technical.price_change_percent == (float(D(close)) - float(D(previous))) / float(D(previous)) * 100
    result = await projected(replace(snapshot, payload=cached))
    assert result.briefing.story.headline_code == code and result.briefing.story.sector_count == count
    if code == "NO_POSITIVE_SECTOR":
        assert not result.briefing.money_flow.inflows
        expected = 0 if all(previous == close for previous, close in movements) else 2
        assert result.briefing.breadth.advancing == result.briefing.breadth.declining == expected


@pytest.mark.asyncio
async def test_repeating_ratio_and_source_order_do_not_approximate_denominators():
    snapshot = raw_snapshot([("18.60", "19.00")] * 3, "history")
    assert measured_price_change(snapshot.rows[0].technical_snapshot, snapshot.rows[0].session) == Fraction(200, 93)
    snapshot = raw_snapshot([("30", "30.1"), ("30", "30.1"), ("30", "29.98")])
    for rows in permutations(snapshot.rows):
        result = await projected(replace(snapshot, payload=snapshot.payload.model_copy(update={"rows": list(rows)})))
        assert result.briefing.story.headline_code == "STRENGTH_STOCKS" and result.briefing.story.sector_count is None


def test_stored_field_precedence_and_historical_raw_adjusted_basis_are_preserved():
    _, prices, _, _ = _canonical_fixture()
    for price in prices:
        price.open_price = price.close_price = D("100")
        price.high_price, price.low_price = D("102"), D("98")
        price.adjusted_close_price = D("50")
        price.previous_close_price = price.price_change = price.price_change_percent = None
    latest = prices[-1]; latest.close_price = D("100.2"); latest.adjusted_close_price = D("50.1")
    assert build_technical_snapshot(prices).price_change_percent_ratio == Fraction(1, 5)
    adjusted = build_technical_snapshot(prices, adjustment_coverage_verified=True)
    assert adjusted.previous_close == 50 and adjusted.price_change_percent_ratio == Fraction(502, 5)
    latest.previous_close_price = D("100")
    assert build_technical_snapshot(prices, adjustment_coverage_verified=True).price_change_percent_ratio == Fraction(1, 5)
    latest.price_change = D("0.15")
    assert build_technical_snapshot(prices).price_change_percent_ratio == Fraction(3, 20)
    latest.price_change_percent = D("2.75")
    ordinary = build_technical_snapshot(prices)
    assert ordinary.price_change_percent_ratio == Fraction(11, 4) and ordinary.price_change_percent == 2.75
    latest.price_change_percent = latest.price_change = None
    latest.previous_close_price = D("0")
    assert build_technical_snapshot(prices).price_change_percent_ratio == Fraction(1, 5)
    latest.previous_close_price = None
    assert build_technical_snapshot([latest]).price_change_percent_ratio is None
    latest.price_change = D("0.1")
    assert build_technical_snapshot([latest]).price_change_percent_ratio is None
    latest.price_change_percent = D("0.2")
    assert build_technical_snapshot([latest]).price_change_percent_ratio == Fraction(1, 5)


@pytest.mark.asyncio
async def test_legacy_publication_hash_is_unchanged_and_mixed_unknown_exact_basis_cannot_bias_sector():
    snapshot = raw_snapshot([("100", "100.2")] * 4)
    snapshot = replace(snapshot, payload=snapshot.payload.model_copy(update={"rows": [row.model_copy(update={"stock": row.stock.model_copy(update={"sector": "Bank"})}) for row in snapshot.rows]}))
    raw = snapshot.payload.model_dump(mode="json")
    for row in raw["rows"]: row["technical_snapshot"].pop("price_change_percent_ratio")
    expected_hash = stable_audit_hash(sorted(raw["rows"], key=lambda row: (row["stock"]["symbol"].casefold(), str(row["stock"]["id"]))))
    raw["payload_revision"] = expected_hash
    legacy = ScoredUniverseCacheRead.model_validate(raw)
    assert compute_universe_payload_revision(legacy.rows) == expected_hash
    assert legacy.model_dump(mode="json") == raw
    result = await projected(replace(snapshot, payload=legacy))
    assert result.briefing.breadth.known_count == 4
    assert result.briefing.story.headline_code == "STRENGTH_STOCKS"
    assert not result.briefing.money_flow.inflows
    assert "exact source price-change basis" in result.data_quality_note
    mixed = snapshot.rows[:3] + legacy.rows[3:]
    result = await projected(replace(snapshot, payload=snapshot.payload.model_copy(update={"rows": mixed})))
    assert not result.briefing.money_flow.inflows
    assert next(item.value for item in result.briefing.state.dimensions if item.key == "leadership") == "Unavailable"
