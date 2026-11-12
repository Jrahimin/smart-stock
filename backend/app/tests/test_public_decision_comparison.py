from datetime import date, timedelta
from types import SimpleNamespace

import pytest

from app.modules.stock_details.decision.comparison import compare_holder_decisions, compare_public_decisions

DAY = date(2026, 11, 10)
PRIOR = date(2026, 11, 9)


def canonical(**updates):
    return SimpleNamespace(**dict(stock_id="stock-1", exchange="DSE", strategy_version="strategy-3",
        threshold_version="threshold-2", action_taxonomy="TRADER_DECISION_V2", decision_taxonomy_version="v2",
        as_of_date=DAY, previous_session_date=PRIOR, display_action="POTENTIAL_BUY", **updates))


def previous(**updates):
    values = dict(vars(canonical()))
    values.update(as_of_date=PRIOR, display_action="WAIT")
    values.update(updates)
    return SimpleNamespace(**values)


def compare(before=None, **changes):
    return compare_public_decisions(canonical(), before or previous(), previous_session=PRIOR,
        current_valid=changes.get("current_valid", True), previous_valid=changes.get("previous_valid", True))


def test_public_pair_changed_unchanged_and_no_holder_mix():
    assert compare().status == "CHANGED"
    assert compare().previous_action == "WAIT"
    assert compare(previous(display_action="POTENTIAL_BUY")).status == "UNCHANGED"
    assert compare(previous(display_action="REDUCE")).status == "UNCOMPARABLE"


@pytest.mark.parametrize("field,value", [
    ("stock_id", "other"), ("exchange", "CSE"), ("strategy_version", "old"),
    ("threshold_version", "old"), ("action_taxonomy", "future"),
    ("decision_taxonomy_version", "v99"), ("as_of_date", PRIOR-timedelta(days=1)),
])
def test_missing_or_incompatible_prior_is_uncomparable(field, value):
    assert compare(previous(**{field: value})).status == "UNCOMPARABLE"


def test_verified_calendar_and_both_publications_are_required():
    assert compare(current_valid=False).status == "UNCOMPARABLE"
    assert compare(previous_valid=False).status == "UNCOMPARABLE"
    assert compare_public_decisions(canonical(), previous(), previous_session=None, current_valid=True, previous_valid=True).status == "UNCOMPARABLE"


def test_holder_pair_is_independent_and_requires_both_precise_actions():
    current = canonical()
    current.holder_action = "REDUCE"
    before = previous(display_action="POTENTIAL_BUY", holder_action="HOLD")
    kwargs = dict(previous_session=PRIOR, current_valid=True, previous_valid=True)
    assert compare_public_decisions(current, before, **kwargs).status == "UNCHANGED"
    pair = compare_holder_decisions(current, before, **kwargs)
    assert (pair.status, pair.previous_action, pair.current_action) == ("CHANGED", "HOLD", "REDUCE")
    before.holder_action = "REDUCE"
    assert compare_holder_decisions(current, before, **kwargs).status == "UNCHANGED"
    before.holder_action = None
    assert compare_holder_decisions(current, before, **kwargs).status == "UNCOMPARABLE"
    before.holder_action = "WAIT"
    assert compare_holder_decisions(current, before, **kwargs).status == "UNCOMPARABLE"


@pytest.mark.parametrize("field,value", [("as_of_date", PRIOR-timedelta(days=1)), ("strategy_version", "old"), ("threshold_version", "old"), ("exchange", "CSE"), ("decision_taxonomy_version", "future")])
def test_holder_pair_uses_same_comparability_gate(field, value):
    current = canonical()
    current.holder_action = "REDUCE"
    before = previous(holder_action="HOLD", **{field: value})
    assert compare_holder_decisions(current, before, previous_session=PRIOR, current_valid=True, previous_valid=True).status == "UNCOMPARABLE"
