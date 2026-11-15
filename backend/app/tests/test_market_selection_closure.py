"""Strict observation ownership, per-session selection, calendar and local receipts."""
import copy
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace as NS

import pytest

from app.core.audit_hashing import stable_audit_hash
from app.modules.stock_details.decision.market_regime import capture_market_context, resolve_regime_result_from_summaries
from app.modules.trading_intelligence.practicality_audit import audit_capture
from app.modules.trading_intelligence.practicality_operational import _weekly_review_failures
from app.tests.test_market_observation_selection import longer_capture, shadow_capture, wire
from app.tests.test_practicality_closure_repair import capture, operational_window, review_receipts


def bullish_capture():
    value, _, rows = longer_capture(55)
    for index, row in enumerate(rows):
        row.index_close = 101. if index == 53 else 102. if index == 54 else 100.
        row.advancing_issues, row.declining_issues = 70, 30
        row.updated_at = value.calculated_at - timedelta(hours=2)
    value = replace(value, market_regime=resolve_regime_result_from_summaries(rows, decision_session_date=value.as_of_date))
    context = capture_market_context(rows, session_date=value.as_of_date, captured_at=value.calculated_at-timedelta(hours=1),
        generation_id="CONTROLLED_CAPTURE", session_dates=set(value.exchange_session_dates))
    return value, wire(capture(value, context=context)), rows


@pytest.mark.parametrize("field", ["generation_id", "context_session_date"])
@pytest.mark.parametrize("fault", ["omitted", "null", "foreign"])
def test_captured_producer_ownership_is_explicit_not_inherited(field, fault):
    value, envelope, _ = longer_capture(55)
    stock = str(value.stock_id)
    row = envelope["input_payload"]["market_context"][-2]
    # A separately produced valid close has its own digest; only the ownership
    # selector is damaged. Neither supported producer ever omitted that selector.
    from app.modules.stock_details.decision.market_regime import market_context_source_revision
    row["index_close"] = 6000.
    row["source_revision"] = market_context_source_revision(row)
    assert audit_capture(envelope, {}, "c1")["diagnostics"][stock]["canonical"]["non_holder_action"] == "BUY"
    if fault == "omitted":
        row.pop(field)
    else:
        row[field] = None if fault == "null" else "FOREIGN" if field == "generation_id" else "2026-11-11"
    result = audit_capture(envelope, {}, "c1")["diagnostics"][stock]["canonical"]
    assert result["regime_permission"] == "UNKNOWN" and result["non_holder_action"] != "BUY"


@pytest.mark.parametrize("fault", ["missing_auth", "false_positive_provenance", "missing_provenance", "consistent_unverified"])
def test_conflicting_tied_producer_cannot_disappear_through_authentication_filter(fault):
    from app.modules.stock_details.decision.market_regime import market_context_source_revision
    value, current, prior = shadow_capture()
    original = prior["input_payload"]["market_context"][-1]
    conflicting = {**original, "unchanged": 1}
    conflicting["source_revision"] = market_context_source_revision(conflicting)
    if fault == "missing_auth":
        conflicting.pop("authenticated")
    elif fault == "missing_provenance":
        conflicting.pop("provenance_status")
    else:
        conflicting["authenticated"] = False
        if fault == "consistent_unverified":
            conflicting["provenance_status"] = "UNVERIFIED_INPUT"
    outputs = []
    for pair in ([original, conflicting], [conflicting, original]):
        changed = copy.deepcopy(prior)
        changed["input_payload"]["market_context"][-1:] = pair
        output = audit_capture(current, {"captures": [changed, current]}, "market")
        outputs.append(output["diagnostics"][str(value.stock_id)]["canonical"])
        assert outputs[-1]["regime_permission"] == "UNKNOWN" and outputs[-1]["non_holder_action"] != "BUY"
    assert outputs[0] == outputs[1]


@pytest.mark.parametrize("boundary", [50, 51])
@pytest.mark.parametrize("duplicate", ["identical", "conflicting", "later_correction"])
def test_c1_resolves_each_required_session_before_cropping(boundary, duplicate):
    from app.modules.stock_details.decision.market_regime import market_context_source_revision
    value, envelope, _ = bullish_capture()
    stock = str(value.stock_id)
    original = envelope["input_payload"]["market_context"][-boundary]
    changed = {**original}
    if duplicate != "identical":
        changed["index_close"] = 200.
        if duplicate == "later_correction":
            changed["known_at"] = (value.calculated_at-timedelta(minutes=30)).isoformat()
        changed["source_revision"] = market_context_source_revision(changed)
    outputs = []
    for pair in ([original, changed], [changed, original]):
        candidate = copy.deepcopy(envelope)
        index = len(candidate["input_payload"]["market_context"])-boundary
        candidate["input_payload"]["market_context"][index:index+1] = pair
        outputs.append(audit_capture(candidate, {}, "c1")["diagnostics"][stock])
    assert outputs[0]["canonical"] == outputs[1]["canonical"]
    if duplicate == "conflicting":
        assert outputs[0]["canonical"]["regime_permission"] == "UNKNOWN"
        assert outputs[0]["regime"]["required_inputs_complete"] is False
    else:
        selected = copy.deepcopy(envelope)
        selected["input_payload"]["market_context"][-boundary] = changed
        expected = audit_capture(selected, {}, "c1")["diagnostics"][stock]
        assert outputs[0]["canonical"] == expected["canonical"]
        assert outputs[0]["regime"]["required_inputs_complete"] is True


def test_known_interior_exchange_session_cannot_be_backfilled_by_an_older_summary():
    value, envelope, rows = bullish_capture()
    missing = rows[-20].trade_date
    assert missing in value.exchange_session_dates
    clean = audit_capture(envelope, {}, "c1")["diagnostics"][str(value.stock_id)]
    assert clean["regime"]["required_inputs_complete"] is True
    envelope["input_payload"]["market_context"].pop(-20)
    result = audit_capture(envelope, {}, "c1")["diagnostics"][str(value.stock_id)]
    assert result["regime"]["required_inputs_complete"] is False
    assert result["canonical"]["regime_permission"] == "UNKNOWN" and result["canonical"]["non_holder_action"] != "BUY"


def test_provisional_older_history_does_not_change_a_complete_required_window():
    value, envelope, summaries = bullish_capture()
    before = audit_capture(envelope, {}, "c1")["diagnostics"][str(value.stock_id)]["canonical"]
    summaries[0].is_finalized = False
    envelope["input_payload"]["market_context"] = wire(capture_market_context(summaries,
        session_date=value.as_of_date, captured_at=value.calculated_at-timedelta(hours=1),
        generation_id=envelope["generation_id"], session_dates=set(value.exchange_session_dates)))
    after = audit_capture(envelope, {}, "c1")["diagnostics"][str(value.stock_id)]["canonical"]
    assert after == before and after["non_holder_action"] == "BUY"


@pytest.mark.asyncio
@pytest.mark.parametrize("missing", [False, True])
async def test_production_context_capture_restore_and_strict_audit_keep_known_session_gaps(missing):
    from app.core.enums import ExchangeCode, MarketDataState
    from app.models import Stock
    from app.modules.market_data.published_generation import PublishedMarketGeneration
    from app.modules.market_universe.market_universe_service import MarketUniverseService
    from app.modules.stock_details.decision.engine import compute_trader_decision
    from app.modules.trading_intelligence.input_capture import restore_strategy_input
    value, _, summaries = bullish_capture()
    if missing:
        summaries.pop(-20)
    stock = Stock(id=value.stock_id, symbol=value.symbol, name=value.symbol, exchange=value.exchange,
        category=value.category, is_active=True, should_fetch_details=False,
        created_at=value.calculated_at, updated_at=value.calculated_at)

    class ReadOnlyMemoryRepository:
        async def list_market_price_windows(self, **kwargs):
            return [(stock, price) for price in value.prices]

        async def list_daily_market_summaries(self, **kwargs):
            return summaries

        async def list_recent_exchange_session_dates(self, **kwargs):
            return list(value.exchange_session_dates)

        async def list_corporate_action_dates_by_stock(self, **kwargs):
            return {}

    service = MarketUniverseService(ReadOnlyMemoryRepository(), NS(), NS(), NS())
    generation = PublishedMarketGeneration(trade_date=value.as_of_date, sync_id="CONTROLLED_CAPTURE", data_state=MarketDataState.FINALIZED,
        source_last_synced_at=value.calculated_at, published_at=value.calculated_at)
    rows = await service.recompute_scored_universe(exchange=ExchangeCode.DSE, generation=generation)
    assert len(rows) == 1
    restored = restore_strategy_input(wire(service._input_captures[str(value.stock_id)]))
    assert restored.market_regime.required_inputs_complete is not missing
    assert rows[0].decision.canonical.regime_permission == ("UNKNOWN" if missing else None)
    # The producer explicitly preserves the independent-calendar shortfall.
    assert service._market_calendar_capture["complete"] is False
    envelope = wire(capture(restored, context=service._market_context_capture))
    output = audit_capture(envelope, {}, "c1")["diagnostics"][str(value.stock_id)]
    assert output["regime"]["required_inputs_complete"] is not missing
    assert output["canonical"]["regime_permission"] == ("UNKNOWN" if missing else None)
    # Only additive completeness metadata changes. Frozen legacy numerical
    # behavior is independently checked with the same prices and raw summaries.
    legacy_without_session_guard = resolve_regime_result_from_summaries(summaries, decision_session_date=value.as_of_date)
    assert compute_trader_decision(replace(restored, strategy_version="trading-intelligence-v3")).canonical_result == compute_trader_decision(
        replace(restored, strategy_version="trading-intelligence-v3", market_regime=legacy_without_session_guard)).canonical_result


def test_strict_shadow_later_legitimate_producer_revision_wins_before_cutoff_in_both_orders():
    value, current, prior = shadow_capture()
    original = prior["input_payload"]["market_context"][-1]
    original_clock = datetime.fromisoformat(original["known_at"])
    prior["observed_at"] = (original_clock+timedelta(minutes=30)).isoformat()
    summary = NS(trade_date=value.exchange_session_dates[-2], index_name="DSEX", index_close=101.,
        advancing_issues=80, declining_issues=20, unchanged_issues=1, is_finalized=True,
        source="CONTROLLED", updated_at=original_clock+timedelta(minutes=5))
    corrected = wire(capture_market_context([summary], session_date=summary.trade_date,
        captured_at=original_clock+timedelta(minutes=15), generation_id=prior["generation_id"], session_dates=set(value.exchange_session_dates)))[0]
    selected = copy.deepcopy(prior)
    selected["input_payload"]["market_context"][-1] = corrected
    expected = audit_capture(current, {"captures": [selected, current]}, "market")["diagnostics"][str(value.stock_id)]["canonical"]
    assert expected["regime_permission"] == "ORDINARY"
    for pair in ([original, corrected], [corrected, original]):
        candidate = copy.deepcopy(prior)
        candidate["input_payload"]["market_context"][-1:] = pair
        output = audit_capture(current, {"captures": [candidate, current]}, "market")
        assert output["diagnostics"][str(value.stock_id)]["canonical"] == expected


@pytest.mark.parametrize("fault", [None, "future", "wrong_generation", "missing_generation", "conflict", "malformed", "missing_range", "missing_revision"])
def test_production_unavailable_calendar_placeholder_uses_only_a_valid_generation_supplement(fault):
    value, current, prior = shadow_capture()
    calendar = current["input_payload"]["market_calendar"]
    current["input_payload"]["market_calendar"] = {"status": "INDEPENDENT_CALENDAR_COVERAGE_UNAVAILABLE", "complete": False,
        "observed_session_dates": [day.isoformat() for day in value.exchange_session_dates],
        "source": "OBSERVED_PRICE_DATES_ONLY_NOT_A_COMPLETE_EXCHANGE_CALENDAR"}
    supplement = {**copy.deepcopy(calendar), "generation_id": current["generation_id"]}
    if fault == "future":
        supplement["known_at"] = "2026-11-16T00:00:00+00:00"
    elif fault == "wrong_generation":
        supplement["generation_id"] = "FOREIGN"
    elif fault == "missing_generation":
        supplement.pop("generation_id")
    elif fault == "conflict":
        current["input_payload"]["market_calendar"] = calendar
        supplement["sessions"] = supplement["sessions"][:-2]+supplement["sessions"][-1:]
    elif fault == "malformed":
        supplement["sessions"][-1] = None
    elif fault == "missing_range":
        supplement.pop("range_start")
    elif fault == "missing_revision":
        supplement.pop("source_revision")
    export = {"captures": [prior, current], "market_calendars_by_generation": {current["generation_id"]: supplement}}
    result = audit_capture(current, export, "market")["diagnostics"][str(value.stock_id)]["canonical"]
    assert result["regime_permission"] == ("ORDINARY" if fault is None else "UNKNOWN")
    if fault is not None:
        assert result["non_holder_action"] != "BUY"


@pytest.mark.parametrize("instant,dated_failure", [("2026-11-14T18:30:00+00:00", False), ("2026-11-21T18:30:00+00:00", True)])
def test_weekly_signoff_calendar_dates_are_dhaka_while_knowledge_uses_absolute_instants(instant, dated_failure):
    from zoneinfo import ZoneInfo
    captures, runs, _ = operational_window()
    day = "2026-11-15"
    runs = [row for row in runs if row["session"] == day]
    # Controlled structural receipts are not a real elapsed campaign. Give the
    # dated chart an explicitly earlier knowledge receipt to isolate local dates.
    for run in runs:
        for case in run["guardrails"]["chart_cases"]:
            case["known_at"] = "2026-11-14T18:00:00+00:00"
            case["case_hash"] = stable_audit_hash({key: value for key, value in case.items() if key != "case_hash"})
    reviews = review_receipts(runs, [day])
    when = datetime.fromisoformat(instant)
    outcomes = []
    for spelling in (when.isoformat(), when.astimezone(ZoneInfo("Asia/Dhaka")).isoformat()):
        reviews["weekly_reviews"][0]["reviewed_at"] = spelling
        outcomes.append(_weekly_review_failures(reviews, runs, [day], datetime(2026, 11, 23, tzinfo=UTC)))
    assert outcomes[0] == outcomes[1]
    assert ("DATED_WEEKLY_SIGNOFF_REQUIRED" in outcomes[0]) is dated_failure
    if not dated_failure:
        assert outcomes[0] == []
        assert "DATED_WEEKLY_SIGNOFF_REQUIRED" in _weekly_review_failures(reviews, runs, [day], when-timedelta(seconds=1))


@pytest.mark.parametrize("trusted_first", [False, True])
@pytest.mark.parametrize("variant", [0, 1, 2])
def test_equal_payload_winning_tie_retains_every_candidates_trust_across_hash_orders(trusted_first, variant):
    from app.modules.stock_details.decision.market_regime import market_observation_valid, market_context_revision_payload
    value, envelope, summaries = bullish_capture()
    sessions = set(value.exchange_session_dates)
    matches = []
    # Vary genuine controlled capture instants, rather than inventing a hash or
    # changing economic values, to exercise both canonical ordering classes.
    for seconds in range(64):
        clock = value.calculated_at-timedelta(hours=1)+timedelta(seconds=seconds)
        context = wire(capture_market_context(summaries, session_date=value.as_of_date, captured_at=clock,
            generation_id=envelope["generation_id"], session_dates=sessions))
        trusted = context[-1]
        unverified = wire(capture_market_context(summaries[-1:], session_date=value.as_of_date, captured_at=clock,
            generation_id=envelope["generation_id"], session_dates=sessions-{value.as_of_date}))[0]
        if (stable_audit_hash(trusted) < stable_audit_hash(unverified)) is trusted_first:
            matches.append((context, trusted, unverified))
            if len(matches) > variant:
                break
    assert len(matches) > variant, "Both actual producer hash-order classes must be exercised"
    context, trusted, unverified = matches[variant]
    assert market_context_revision_payload(trusted) == market_context_revision_payload(unverified)
    assert trusted["source_revision"] == unverified["source_revision"] and trusted["known_at"] == unverified["known_at"]
    assert all(market_observation_valid(row, require_revision=True) for row in (trusted, unverified))
    outputs = []
    for pair in ([trusted, unverified], [unverified, trusted]):
        candidate = copy.deepcopy(envelope)
        candidate["input_payload"]["market_context"] = context[:-1]+pair
        canonical = audit_capture(candidate, {}, "c1")["diagnostics"][str(value.stock_id)]["canonical"]
        outputs.append(canonical)
        assert canonical["regime_permission"] == "UNKNOWN" and canonical["non_holder_action"] != "BUY"
    assert outputs[0] == outputs[1]


@pytest.mark.parametrize("kind,permitted", [("trusted_duplicate", True), ("unverified_duplicate", False),
    ("later_trusted", True), ("later_unverified", False)])
def test_equal_payload_duplicate_trust_and_later_revision_controls(kind, permitted):
    value, envelope, summaries = bullish_capture()
    original = envelope["input_payload"]["market_context"][-1]
    later = kind.startswith("later_")
    clock = value.calculated_at-timedelta(minutes=30 if later else 60)
    sessions = set(value.exchange_session_dates)
    trust = kind in {"trusted_duplicate", "later_trusted"}
    other = wire(capture_market_context(summaries[-1:], session_date=value.as_of_date, captured_at=clock,
        generation_id=envelope["generation_id"], session_dates=sessions if trust else sessions-{value.as_of_date}))[0]
    if kind == "unverified_duplicate":
        original = other
    if kind == "later_trusted":
        original = wire(capture_market_context(summaries[-1:], session_date=value.as_of_date,
            captured_at=datetime.fromisoformat(original["known_at"]), generation_id=envelope["generation_id"],
            session_dates=sessions-{value.as_of_date}))[0]
    for pair in ([original, other], [other, original]):
        candidate = copy.deepcopy(envelope)
        candidate["input_payload"]["market_context"][-1:] = pair
        result = audit_capture(candidate, {}, "c1")["diagnostics"][str(value.stock_id)]
        assert (result["canonical"]["non_holder_action"] == "BUY") is permitted
        assert result["regime"]["required_inputs_complete"] is permitted
