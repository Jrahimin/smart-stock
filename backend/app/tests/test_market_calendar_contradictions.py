"""A complete shadow calendar cannot contradict a positively known session."""
import copy
from dataclasses import replace
from datetime import UTC, date, datetime, timedelta
from types import SimpleNamespace as NS

import pytest

from app.modules.stock_details.decision.market_regime import capture_market_context, resolve_regime_result_from_summaries
from app.modules.trading_intelligence.practicality_audit import audit_capture
from app.tests.test_market_observation_selection import wire
from app.tests.test_practicality_closure_repair import source_input, capture


INTERIOR = date(2026, 10, 13)


def calendar_capture(*, evidence="all", holiday=False):
    _, original = source_input()
    days = list(original.exchange_session_dates)
    assert len(days) == 90 and INTERIOR in days[-51:-2]
    source_days = [day for day in days if not holiday or day != INTERIOR]
    known_days = [day for day in source_days if evidence not in {"placeholder", "vintage"} or day != INTERIOR]
    placeholder_days = [day for day in source_days if evidence not in {"captured_input", "vintage"} or day != INTERIOR]
    authenticated_days = set(source_days)-({INTERIOR} if evidence in {"captured_input", "placeholder"} else set())
    current_at = datetime(2026, 11, 12, 13, tzinfo=UTC)
    prior_at = datetime(2026, 11, 11, 10, tzinfo=UTC)
    summaries = [NS(trade_date=day, index_name="DSEX", index_close=200. if day == INTERIOR else 100.,
        advancing_issues=35, declining_issues=65, unchanged_issues=0, is_finalized=True, source="CONTROLLED",
        updated_at=prior_at) for day in source_days]
    value = replace(original, strategy_version="trading-intelligence-v3", calculated_at=current_at,
        prices=tuple(price for price in original.prices if not holiday or price.trade_date != INTERIOR),
        exchange_session_dates=tuple(known_days),
        market_regime=resolve_regime_result_from_summaries(summaries, decision_session_date=original.as_of_date))
    current_context = capture_market_context(summaries, session_date=value.as_of_date, captured_at=current_at,
        generation_id="CONTROLLED_CAPTURE", session_dates=authenticated_days)
    current = capture(value, context=current_context, observed=current_at)
    current["input_payload"]["market_calendar"] = {"status": "INDEPENDENT_CALENDAR_COVERAGE_UNAVAILABLE", "complete": False,
        "observed_session_dates": [day.isoformat() for day in placeholder_days],
        "source": "OBSERVED_PRICE_DATES_ONLY_NOT_A_COMPLETE_EXCHANGE_CALENDAR"}
    previous = source_days[-2]
    prior = {"generation_id": "CONTROLLED_PRIOR", "session_date": previous.isoformat(), "observed_at": prior_at.isoformat(),
        "input_payload": {"market_context": capture_market_context(summaries, session_date=previous, captured_at=prior_at,
            generation_id="CONTROLLED_PRIOR", session_dates=authenticated_days)}}
    calendar = {"status": "VERIFIED_EXCHANGE_SESSION_CALENDAR", "complete": True, "generation_id": current["generation_id"],
        "source_revision": "CONTROLLED-independent-calendar", "known_at": prior_at.isoformat(),
        "range_start": days[0].isoformat(), "range_end": days[-1].isoformat(), "sessions": [day.isoformat() for day in source_days]}
    return value, wire(current), wire(prior), calendar


def run(value, current, prior, calendar, *, arm="market", placement="supplement", extra_captures=()):
    current = copy.deepcopy(current)
    export = {"captures": [prior, current, *extra_captures]}
    if placement == "embedded":
        current["input_payload"]["market_calendar"] = calendar
    else:
        export["market_calendars_by_generation"] = {current["generation_id"]: calendar}
    output = audit_capture(current, export, arm)
    return output["diagnostics"][str(value.stock_id)], output["manifest"]["market_calendar_selection"]


@pytest.mark.parametrize("placement", ["embedded", "supplement"])
@pytest.mark.parametrize("revision", ["same", "distinct"])
@pytest.mark.parametrize("arm", ["market", "combined", "c1"])
def test_verified_calendar_omission_cannot_turn_known_restricted_market_into_buy(placement, revision, arm):
    value, current, prior, calendar = calendar_capture()
    proper, selected = run(value, current, prior, calendar, arm=arm, placement=placement)
    assert selected["status"] == "VERIFIED" and proper["canonical"]["non_holder_action"] != "BUY"
    assert proper["regime"]["label"] == "BEARISH"
    if arm != "c1":
        assert proper["canonical"]["regime_permission"] == "RESTRICTED"
    omitted = {**calendar, "sessions": [day for day in calendar["sessions"] if day != INTERIOR.isoformat()]}
    if revision == "distinct":
        omitted["source_revision"] = "CONTROLLED-distinct-calendar-revision"
    damaged, selection = run(value, current, prior, omitted, arm=arm, placement=placement)
    assert selection["status"] == "CONTRADICTED_BY_KNOWN_SESSION"
    assert damaged["canonical"]["non_holder_action"] != "BUY"
    if arm != "c1":
        assert damaged["canonical"]["regime_permission"] == "UNKNOWN"
    else:
        assert damaged["canonical"] == proper["canonical"]
    restored = {**omitted, "sessions": calendar["sessions"]}
    recovered, selection = run(value, current, prior, restored, arm=arm, placement=placement)
    assert selection["status"] == "VERIFIED" and recovered["canonical"] == proper["canonical"]


@pytest.mark.parametrize("evidence", ["captured_input", "placeholder", "vintage"])
def test_each_positive_captured_source_independently_contradicts_the_calendar(evidence):
    value, current, prior, calendar = calendar_capture(evidence=evidence)
    omitted = {**calendar, "sessions": [day for day in calendar["sessions"] if day != INTERIOR.isoformat()]}
    result, selection = run(value, current, prior, omitted)
    assert selection["status"] == "CONTRADICTED_BY_KNOWN_SESSION"
    assert result["canonical"]["regime_permission"] == "UNKNOWN" and result["canonical"]["non_holder_action"] != "BUY"


@pytest.mark.parametrize("outside", [False, True])
def test_positive_date_check_uses_required_window_not_a_declared_range_escape(outside):
    value, current, prior, calendar = calendar_capture()
    removed = calendar["sessions"][0] if outside else calendar["sessions"][-51]
    candidate = {**calendar, "sessions": [day for day in calendar["sessions"] if day != removed]}
    result, selection = run(value, current, prior, candidate)
    assert selection["status"] == ("VERIFIED" if outside else "CONTRADICTED_BY_KNOWN_SESSION")
    assert result["canonical"]["regime_permission"] == ("RESTRICTED" if outside else "UNKNOWN")
    if not outside:
        # Merely declaring a later range cannot justify older-row substitution.
        candidate["range_start"] = (INTERIOR+timedelta(days=1)).isoformat()
        result, selection = run(value, current, prior, candidate)
        assert selection["status"] != "VERIFIED" and result["canonical"]["non_holder_action"] != "BUY"


def test_partial_positive_observations_do_not_claim_an_equal_or_complete_calendar():
    value, current, prior, calendar = calendar_capture()
    value = replace(value, exchange_session_dates=value.exchange_session_dates[-5:])
    context = current["input_payload"]["market_context"][-51:]
    current = wire(capture(value, context=context, observed=value.calculated_at))
    current["input_payload"]["market_calendar"] = {"status": "INDEPENDENT_CALENDAR_COVERAGE_UNAVAILABLE", "complete": False,
        "observed_session_dates": calendar["sessions"][-3:], "source": "OBSERVED_PRICE_DATES_ONLY_NOT_A_COMPLETE_EXCHANGE_CALENDAR"}
    prior["input_payload"]["market_context"] = prior["input_payload"]["market_context"][-50:]
    result, selection = run(value, current, prior, calendar)
    assert selection["status"] == "VERIFIED" and result["canonical"]["regime_permission"] == "RESTRICTED"


@pytest.mark.parametrize("extra", [None, "unverified_current", "future_current", "future_prior", "foreign_capture", "future_capture",
    "foreign_placeholder", "future_placeholder"])
def test_legitimate_controlled_holiday_is_not_poisoned_by_untrusted_or_unselected_facts(extra):
    value, current, prior, calendar = calendar_capture(holiday=True)
    extra_captures = []
    if extra in {"foreign_placeholder", "future_placeholder"}:
        marker = current["input_payload"]["market_calendar"]
        marker["observed_session_dates"].append(INTERIOR.isoformat())
        marker["generation_id"] = "FOREIGN" if extra == "foreign_placeholder" else current["generation_id"]
        marker["known_at"] = current["observed_at"] if extra == "foreign_placeholder" else "2026-11-13T13:00:00+00:00"
    elif extra:
        owner = prior if extra == "future_prior" or extra.endswith("capture") else current
        clock = datetime.fromisoformat(owner["observed_at"])
        if extra.startswith("future"):
            clock += timedelta(days=2)
        row = NS(trade_date=INTERIOR, index_name="DSEX", index_close=200., advancing_issues=35, declining_issues=65,
            unchanged_issues=0, is_finalized=True, source="CONTROLLED", updated_at=clock)
        generation = "FOREIGN" if extra.endswith("capture") else owner["generation_id"]
        observed = capture_market_context([row], session_date=date.fromisoformat(owner["session_date"]), captured_at=clock,
            generation_id=generation, session_dates=set() if extra == "unverified_current" else {INTERIOR})
        if extra.endswith("capture"):
            extra_captures.append({"generation_id": generation, "session_date": owner["session_date"],
                "observed_at": (clock+timedelta(seconds=1)).isoformat(), "input_payload": {"market_context": observed}})
        else:
            owner["input_payload"]["market_context"].extend(wire(observed))
    result, selection = run(value, current, prior, calendar, extra_captures=extra_captures)
    assert selection["status"] == "VERIFIED" and result["canonical"]["regime_permission"] == "CAUTION"
