from dataclasses import replace
from datetime import UTC, date, datetime, timedelta
from types import SimpleNamespace

import pytest

from app.modules.market_universe.market_universe_schemas import DisplayQuoteRead
from app.modules.stock_details.decision.entry_applicability import (
    EntryPathFacts, build_entry_path_facts, evaluate_entry_applicability,
)

NOW = datetime(2026, 11, 11, 11, tzinfo=UTC)
REFERENCE = date(2026, 11, 10)
DAY = date(2026, 11, 11)


def terms(**updates):
    return SimpleNamespace(**{
        "status": "VALID_ENTRY_PLAN", "preferred_entry_zone_low": 99,
        "preferred_entry_zone_high": 101, "entry_zone_low": 99, "entry_zone_high": 101,
        "stop_loss": 96, "invalidation_price": 96, "target_low": 110,
        "expiry_sessions": 10, "entry_timing": "READY", "trigger_price": None,
        **updates,
    })


def assess(*, price=100, plan=None, path=None, **updates):
    arguments = dict(
        decision=SimpleNamespace(display_action="POTENTIAL_BUY", blocker_codes=[]),
        eligibility=SimpleNamespace(status="ELIGIBLE"), plan=plan or terms(),
        quote=DisplayQuoteRead(current_price=price, as_of_trade_date=DAY.isoformat(),
            observation_status="PROVISIONAL", data_quality="OK", source_observed_at=NOW),
        reference_date=REFERENCE, now=NOW, market_open=True, coverage_verified=True,
        publication_observed_at=datetime(2026, 11, 10, 10, tzinfo=UTC),
        path=path or EntryPathFacts(sessions=(DAY,), reliable_lows=((DAY, min(price, 100)),), complete=True),
    )
    arguments.update(updates)
    return evaluate_entry_applicability(**arguments)


@pytest.mark.parametrize("price,code", [(100, "ENTRY_TERMS_MET"), (99, "ENTRY_TERMS_MET"),
    (101, "ENTRY_TERMS_MET"), (105, "ABOVE_ENTRY_ZONE"), (98, "BELOW_ENTRY_ZONE"),
    (110, "TARGET_REACHED"), (96, "STOP_BREACHED")])
def test_fixed_plan_current_terms(price, code):
    assert assess(price=price).reason_code == code


def test_recovery_does_not_resurrect_breached_plan_or_mutate_terms():
    plan = terms()
    path = EntryPathFacts(sessions=(DAY,), reliable_lows=((DAY, 95),), complete=True)
    assert assess(plan=plan, path=path).reason_code == "STOP_BREACHED"
    assert plan.entry_zone_low == 99 and plan.invalidation_price == 96


def test_precedence_withdrawal_permission_invalidation_expiry_evidence():
    assert assess(withdrawn=True, decision=None, coverage_verified=False).reason_code == "PUBLICATION_INVALIDATED"
    assert assess(decision=None).reason_code == "ACTION_NOT_PERMITTED"
    assert assess(eligibility=SimpleNamespace(status="REVIEW_ONLY")).reason_code == "ELIGIBILITY_BLOCKED"
    assert assess(plan=terms(status="WATCH_ONLY")).reason_code == "NO_ENTRY_PLAN"
    expired = EntryPathFacts(sessions=(DAY,), completed_sessions=frozenset({DAY}), complete=False)
    assert assess(plan=terms(expiry_sessions=1), path=expired, coverage_verified=False).reason_code == "PLAN_EXPIRED"
    assert assess(coverage_verified=False).reason_code == "COVERAGE_UNKNOWN"


@pytest.mark.parametrize("changes", [dict(source_observed_at=None),
    dict(source_observed_at=NOW-timedelta(hours=2)), dict(observation_status="NO_TRADE"),
    dict(as_of_trade_date="2026-11-10"), dict(data_quality="SUSPICIOUS")])
def test_ingestion_or_stale_no_trade_quote_cannot_renew_entry(changes):
    quote = DisplayQuoteRead(current_price=100, as_of_trade_date=DAY.isoformat(),
        observation_status="PROVISIONAL", source_observed_at=NOW, ingested_at=NOW)
    assert assess(quote=quote.model_copy(update=changes)).reason_code == "QUOTE_UNUSABLE"


def test_actual_batch_receipt_explains_unknown_timing_without_permitting_entry():
    quote = DisplayQuoteRead(current_price=100, as_of_trade_date=DAY.isoformat(),
        observation_status="PROVISIONAL", source_observed_at=None, batch_fetched_at=NOW)
    result = assess(quote=quote)
    assert result.status == "UNVERIFIED"
    assert result.reason_code == "QUOTE_UNUSABLE"
    assert result.quote_timing_status == "FETCH_ONLY"
    assert result.batch_fetched_at == NOW
    assert assess(quote=quote.model_copy(update={"source_observed_at": NOW + timedelta(minutes=1)})).status == "UNVERIFIED"


def test_old_quote_payload_omits_additive_receipt_field():
    quote = DisplayQuoteRead(current_price=100)
    assert "batch_fetched_at" not in quote.model_dump(mode="json")


def test_missing_path_terms_targetless_and_completed_confirmation():
    assert assess(path=EntryPathFacts(sessions=(DAY,))).reason_code == "PATH_INCOMPLETE"
    assert assess(plan=terms(expiry_sessions=None)).reason_code == "TERMS_UNKNOWN"
    assert assess(plan=terms(target_low=None), price=100).status == "APPLICABLE"
    breakout = terms(entry_timing="BREAKOUT", trigger_price=99)
    assert assess(plan=breakout).reason_code == "COMPLETED_BREAKOUT_REQUIRED"
    confirmed_today = EntryPathFacts(sessions=(DAY,), complete=True, confirmed_on=DAY)
    assert assess(plan=breakout, path=confirmed_today).reason_code == "ENTRY_SESSION_PENDING"
    assert assess(plan=breakout, path=replace(confirmed_today, confirmed_on=REFERENCE)).status == "APPLICABLE"


def test_holiday_does_not_consume_expiry_or_permit_entry():
    thursday, sunday = date(2026, 11, 12), date(2026, 11, 15)
    # An actual session calendar omits Friday/Saturday and holidays.
    path = EntryPathFacts(sessions=(thursday,), completed_sessions=frozenset({thursday}), complete=True)
    assert assess(plan=terms(expiry_sessions=2), path=path, market_open=False).reason_code == "MARKET_CLOSED"
    assert assess(plan=terms(expiry_sessions=1), path=path, market_open=False).reason_code == "PLAN_EXPIRED"
    assert sunday not in path.sessions


def test_revision_recovers_overwritten_low_and_ignores_publication_day():
    def bar(day, low):
        return SimpleNamespace(trade_date=day, open_price=100, high_price=102, low_price=low,
            close_price=100, volume=1000, data_quality_flag="OK")
    publication = datetime(2026, 11, 10, 10, tzinfo=UTC)
    prior = {"trade_date": DAY.isoformat(), "open_price": "100", "high_price": "102",
        "low_price": "95", "close_price": "100", "volume": 1000, "data_quality_flag": "OK"}
    revision = SimpleNamespace(session_date=DAY, observed_at=NOW, payload={**prior, "low_price": "99"}, previous_payload=prior)
    path = build_entry_path_facts(prices=[bar(REFERENCE, 90), bar(DAY, 99)], revisions=[revision],
        sessions=[REFERENCE, DAY], completed_sessions=[], reference_date=REFERENCE,
        published_at=publication, journal_started_at=publication-timedelta(days=1), plan=terms())
    assert (DAY, 95) in path.reliable_lows and all(day != REFERENCE for day, _ in path.reliable_lows)
    assert assess(path=path).reason_code == "STOP_BREACHED"
    revision.previous_payload = {**prior, "data_quality_flag": "SUSPICIOUS"}
    path = build_entry_path_facts(prices=[bar(DAY, 99)], revisions=[revision], sessions=[DAY],
        completed_sessions=[], reference_date=REFERENCE, published_at=publication,
        journal_started_at=publication-timedelta(days=1), plan=terms())
    assert assess(path=path).status == "APPLICABLE"


def test_late_publication_cannot_order_earlier_intraday_low_or_claim_continuity():
    publication = NOW
    row = SimpleNamespace(trade_date=DAY, open_price=100, high_price=102, low_price=95,
        close_price=100, volume=1000, data_quality_flag="OK")
    path = build_entry_path_facts(prices=[row], revisions=[], sessions=[DAY], completed_sessions=[],
        reference_date=REFERENCE, published_at=publication, journal_started_at=publication-timedelta(days=1), plan=terms())
    assert path.complete is False and not path.reliable_lows
    assert assess(path=path).reason_code == "PATH_INCOMPLETE"


def test_applicability_reason_codes_are_a_fixed_api_contract():
    from app.modules.stock_details.decision.entry_applicability import EntryApplicabilityRead
    schema = EntryApplicabilityRead.model_json_schema()
    codes = schema["properties"]["reason_code"]["enum"]
    assert len(codes) == len(set(codes)) == 19
    assert {"STOP_BREACHED", "QUOTE_UNUSABLE", "ENTRY_TERMS_MET", "PATH_INCOMPLETE"} <= set(codes)
    with pytest.raises(ValueError):
        EntryApplicabilityRead(status="UNVERIFIED", reason_code="UNKNOWN_NEW_REASON", assessed_at=datetime.now(UTC))


@pytest.mark.parametrize("quality,volume", [("SUSPICIOUS", 1000), ("OK", 0)])
def test_unreliable_or_untraded_low_does_not_invalidate(quality, volume):
    publication = datetime(2026, 11, 10, 10, tzinfo=UTC)
    row = SimpleNamespace(trade_date=DAY, open_price=100, high_price=102, low_price=90,
        close_price=100, volume=volume, data_quality_flag=quality)
    path = build_entry_path_facts(prices=[row], revisions=[], sessions=[DAY], completed_sessions=[],
        reference_date=REFERENCE, published_at=publication, journal_started_at=publication-timedelta(days=1), plan=terms())
    assert not path.reliable_lows
    assert assess(path=path).reason_code != "STOP_BREACHED"


def test_observed_breach_precedes_partial_continuity_and_excludes_post_basis_raw_low():
    from app.modules.stock_details.decision.entry_applicability import PriceBasisEvent
    publication = datetime(2026, 11, 10, 10, tzinfo=UTC)
    row = SimpleNamespace(trade_date=DAY, open_price=100, high_price=102, low_price=90,
        close_price=100, volume=1000, data_quality_flag="OK")
    before_change = build_entry_path_facts(prices=[row], revisions=[], sessions=[DAY], completed_sessions=[],
        reference_date=REFERENCE, published_at=publication, journal_started_at=None, plan=terms())
    assert before_change.complete is False
    assert assess(path=before_change).reason_code == "STOP_BREACHED"
    after_change = build_entry_path_facts(prices=[row], revisions=[], sessions=[DAY], completed_sessions=[],
        reference_date=REFERENCE, published_at=publication, journal_started_at=publication-timedelta(days=1), plan=terms(),
        basis_events=[PriceBasisEvent(DAY, "SPLIT")])
    assert not after_change.reliable_lows
    assert assess(path=after_change).reason_code == "PRICE_BASIS_CHANGED"


def test_provisional_close_cannot_confirm_breakout_but_completed_close_can():
    publication = datetime(2026, 11, 10, 10, tzinfo=UTC)
    row = SimpleNamespace(trade_date=DAY, open_price=100, high_price=102, low_price=99,
        close_price=101, volume=1000, data_quality_flag="OK")
    arguments = dict(prices=[row], revisions=[], sessions=[DAY], reference_date=REFERENCE,
        published_at=publication, journal_started_at=publication-timedelta(days=1),
        plan=terms(entry_timing="BREAKOUT", trigger_price=100), average_volume=900)
    assert build_entry_path_facts(**arguments, completed_sessions=[]).confirmed_on is None
    assert build_entry_path_facts(**arguments, completed_sessions=[DAY]).confirmed_on == DAY


@pytest.mark.parametrize("clock,reason,recheck", [
    ("2026-11-12T09:59:59+06:00", "MARKET_CLOSED", "2026-11-12T10:00:00+06:00"),
    ("2026-11-12T10:00:00+06:00", None, None),
    ("2026-11-12T14:59:59+06:00", None, None),
    ("2026-11-12T15:00:00+06:00", "SESSION_SETTLING", "2026-11-12T15:15:00+06:00"),
    ("2026-11-12T15:14:59+06:00", "SESSION_SETTLING", "2026-11-12T15:15:00+06:00"),
    ("2026-11-12T15:15:00+06:00", "MARKET_CLOSED", "2026-11-15T10:00:00+06:00"),
    ("2026-11-13T12:00:00+06:00", "MARKET_CLOSED", "2026-11-15T10:00:00+06:00"),
])
def test_entry_schedule_close_buffer_and_weekend_opening(clock, reason, recheck):
    from app.jobs.market_session_schedule import entry_session_pause
    from app.core.core_config import Settings
    result, deadline = entry_session_pause(datetime.fromisoformat(clock), Settings())
    assert result == reason
    assert (deadline.isoformat() if deadline else None) == recheck


def test_closed_entry_defers_evidence_but_keeps_invalidation_and_expiry():
    closed = dict(market_open=False, coverage_verified=False, quote=None)
    assert assess(**closed).reason_code == "MARKET_CLOSED"
    assert assess(price=95, **closed).reason_code == "STOP_BREACHED"
    expired = EntryPathFacts(sessions=(DAY,), ended_sessions=frozenset({DAY}))
    assert assess(plan=terms(expiry_sessions=1), path=expired, **closed).reason_code == "PLAN_EXPIRED"
    assert assess(market_open=True, coverage_verified=False, quote=None).reason_code == "COVERAGE_UNKNOWN"


def test_opening_requires_today_quote_and_completed_evidence():
    now = datetime.fromisoformat("2026-11-12T10:00:00+06:00")
    quote = DisplayQuoteRead(current_price=100, as_of_trade_date="2026-11-11",
        observation_status="FINALIZED", source_observed_at=now-timedelta(hours=19))
    path = EntryPathFacts(sessions=(date(2026,11,12),), complete=True)
    assert assess(now=now, path=path, quote=quote).reason_code == "QUOTE_UNUSABLE"
    fresh = quote.model_copy(update={"as_of_trade_date":"2026-11-12", "source_observed_at":now, "observation_status":"PROVISIONAL"})
    assert assess(now=now, path=path, quote=fresh).status == "APPLICABLE"
    assert assess(now=now+timedelta(minutes=31), path=path, quote=fresh).reason_code == "QUOTE_UNUSABLE"


@pytest.mark.parametrize("opening,clock,reason", [("09:00","09:30",None),("11:00","10:30","MARKET_CLOSED")])
def test_entry_and_freshness_share_overridden_opening(opening, clock, reason):
    from app.jobs.market_session_schedule import entry_session_pause, resolve_market_status
    from app.core.core_config import Settings
    config = Settings(market_session_open_overrides={"2026-11-12":opening})
    now = datetime.fromisoformat(f"2026-11-12T{clock}:00+06:00")
    pause, deadline = entry_session_pause(now, config)
    assert pause == reason
    assert (resolve_market_status(now, config).value == "OPEN") == (reason is None)
    before = datetime.fromisoformat("2026-11-11T16:00:00+06:00")
    assert entry_session_pause(before, config)[1].isoformat() == f"2026-11-12T{opening}:00+06:00"


def test_entry_and_freshness_agree_at_the_exact_close():
    from app.jobs.market_session_schedule import entry_session_pause, resolve_market_status
    from app.core.core_config import Settings
    now = datetime.fromisoformat("2026-11-12T15:00:00+06:00")
    assert resolve_market_status(now, Settings()).value == "POST_CLOSE"
    assert entry_session_pause(now, Settings())[0] == "SESSION_SETTLING"


@pytest.mark.parametrize("opening", ["09:00", "10:00", "11:00"])
def test_first_usable_quote_must_be_observed_at_or_after_effective_open(opening):
    now = datetime.fromisoformat(f"2026-11-12T{opening}:00+06:00")
    quote = DisplayQuoteRead(current_price=100, as_of_trade_date="2026-11-12",
        observation_status="PROVISIONAL", source_observed_at=now-timedelta(seconds=1))
    path = EntryPathFacts(sessions=(date(2026,11,12),), complete=True)
    assert assess(now=now, path=path, quote=quote, session_open_at=now).reason_code == "QUOTE_UNUSABLE"
    assert assess(now=now, path=path, quote=quote.model_copy(update={"source_observed_at":now}), session_open_at=now).status == "APPLICABLE"
