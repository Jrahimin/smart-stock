"""Read-only comparisons of public and holder canonical results across verified sessions."""
from pydantic import BaseModel
from typing import Literal


class PublicDecisionComparisonRead(BaseModel):
    status: Literal["CHANGED", "UNCHANGED", "UNCOMPARABLE"]
    previous_action: str | None = None
    current_action: str | None = None
    previous_session_date: str | None = None


class HolderDecisionComparisonRead(PublicDecisionComparisonRead):
    """The actual holder instruction pair, independently of the public action."""


def _compare_decisions(current, previous, *, previous_session, current_valid, previous_valid, field, actions, result_type):
    unavailable = result_type(status="UNCOMPARABLE")
    if not current_valid or not previous_valid or current is None or previous is None or previous_session is None:
        return unavailable
    if (current.stock_id != previous.stock_id or current.exchange != previous.exchange
        or current.previous_session_date != previous_session or previous.as_of_date != previous_session
        or previous.as_of_date >= current.as_of_date):
        return unavailable
    for version_field in ("strategy_version", "threshold_version", "action_taxonomy", "decision_taxonomy_version"):
        if not getattr(current, version_field, None) or getattr(current, version_field) != getattr(previous, version_field, None):
            return unavailable
    if current.action_taxonomy not in {"TRADER_DECISION_V2", "TRADER_RECOMMENDATION_V1"}:
        return unavailable
    if current.decision_taxonomy_version != {"TRADER_DECISION_V2": "v2", "TRADER_RECOMMENDATION_V1": "v1"}[current.action_taxonomy]:
        return unavailable
    before = getattr(previous, field, None)
    after = getattr(current, field, None)
    before = getattr(before, "value", before)
    after = getattr(after, "value", after)
    if before not in actions or after not in actions:
        return unavailable
    return result_type(status="UNCHANGED" if before == after else "CHANGED",
        previous_action=before, current_action=after, previous_session_date=previous_session.isoformat())


def compare_public_decisions(current, previous, *, previous_session, current_valid, previous_valid):
    return _compare_decisions(current, previous, previous_session=previous_session,
        current_valid=current_valid, previous_valid=previous_valid, field="display_action",
        actions={"POTENTIAL_BUY", "WAIT", "HOLD", "SELL"}, result_type=PublicDecisionComparisonRead)


def compare_holder_decisions(current, previous, *, previous_session, current_valid, previous_valid):
    return _compare_decisions(current, previous, previous_session=previous_session,
        current_valid=current_valid, previous_valid=previous_valid, field="holder_action",
        actions={"HOLD", "REVIEW", "SELL", "REDUCE"}, result_type=HolderDecisionComparisonRead)
