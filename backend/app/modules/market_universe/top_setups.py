"""Read-side watch qualification, independent of Pulse activity scores.

This does not grant entry permission or alter a published decision. All market
and risk vetoes remain central-engine facts; readiness is a separate dimension.
"""
from datetime import date, datetime
from math import isfinite

from pydantic import BaseModel, Field
from app.core.constants.trading_constants import (
    DIRECTIONAL_EVIDENCE_ACTION_MIN,
    MIN_RISK_REWARD_RATIO,
    TRADE_PLAN_MAX_RISK_PERCENT,
    TRADE_PLAN_PULLBACK_MAX_DISTANCE_PERCENT,
)

MARKET_WATCH_REASONS = {"regime_plan_not_permitted", "bearish_market_regime"}



class TopSetupRead(BaseModel):
    version: str = "top-setups-v1"
    rank: int = 0
    readiness: str
    action: str
    setup_type: str
    condition: str
    confirmation_rule: str | None = None
    confirmation_support: float | None = None
    entry_low: float
    entry_high: float
    trigger_price: float | None = None
    invalidation: float
    target: float
    opportunity_score: int
    risk_label: str
    risk_cause: str | None = None
    supporting_fact: str
    supporting_value: float | None = None
    counterargument_code: str | None = None
    counterargument_value: float | None = None
    controlling_reason_code: str | None = None
    holder_guidance: str
    price_basis: str | None = None
    price_session_date: date | None = None
    source_observed_at: datetime | None = None
    batch_fetched_at: datetime | None = None
    assessed_at: datetime | None = None
    observation_price: float | None = None
    watch_valid_until: datetime | None = Field(default=None, exclude_if=lambda value: value is None)


def _candidate(row, *, qualification_only=False, observation_assessment=None):
    decision, analysis = row.decision, row.analysis
    if not decision or not analysis or not row.eligibility or row.eligibility.status != "ELIGIBLE":
        return None
    canonical = decision.canonical
    if not canonical:
        return None
    plan = analysis.trade_plan
    market_only = (
        canonical.regime_label == "BEARISH" and canonical.regime_confidence == 100
        and canonical.regime_permission in {None, "RESTRICTED"}
        and decision.primary_reason_code in MARKET_WATCH_REASONS
        and plan.fixed_entry_geometry_valid is True
        and decision.opportunity_quality == "STRONG"
        and row.technical_snapshot.trend == "UPTREND"
        and analysis.directional_evidence.bullish_score >= DIRECTIONAL_EVIDENCE_ACTION_MIN
        and any(item.code in MARKET_WATCH_REASONS for item in decision.constraints)
        and all(item.code in MARKET_WATCH_REASONS | {"entry_plan_not_valid"}
                for item in decision.constraints if item.kind in {"BLOCK", "EXIT_AVOID", "DOWNGRADE"})
        and all(reason in MARKET_WATCH_REASONS | {"current_action_does_not_support_fresh_entry"} for reason in plan.reasons)
    )
    if not market_only and decision.non_holder_action not in {"BUY", "WAIT"}:
        return None
    if decision.opportunity_quality not in {"STRONG", "CONSTRUCTIVE"}:
        return None
    # Pending confirmation is a watch condition, not a risk/market exception.
    if not market_only and any(item.kind in {"BLOCK", "EXIT_AVOID"} and item.code != "entry_plan_not_valid" for item in decision.constraints):
        return None
    if not market_only and any(item.code in {"lower_structure", "thin_liquidity", "bearish_market_regime"} for item in decision.constraints):
        return None
    if analysis.liquidity.label not in {"NORMAL", "STRONG"} or analysis.directional_evidence.direction != "BULLISH":
        return None
    timing = plan.entry_timing or plan.scenario_entry_timing
    low = plan.preferred_entry_zone_low or plan.entry_zone_low
    high = plan.preferred_entry_zone_high or plan.entry_zone_high
    stop = plan.invalidation_price or plan.stop_loss
    target = plan.target_low
    if timing not in {"BREAKOUT", "PULLBACK", "CONTINUATION", "READY"} or not plan.condition_text:
        return None
    if any(value is None or not isfinite(value) or value <= 0 for value in (low, high, stop, target)):
        return None
    if not stop < low <= high < target or plan.fixed_entry_geometry_valid is False:
        return None
    if plan.fixed_entry_geometry_valid is None and ((target - high) / (high - stop) < MIN_RISK_REWARD_RATIO
            or (high - stop) / high * 100 > TRADE_PLAN_MAX_RISK_PERCENT):
        return None
    if plan.expiry_sessions is None or plan.expiry_sessions <= 0:
        return None
    if decision.primary_reason_code in {"near_resistance", "near_resistance_without_breakout"} and timing != "BREAKOUT":
        return None  # Do not graft a breakout condition onto a READY plan.
    if qualification_only:
        return True  # History must not depend on an old quote/proximity tier.
    assessment = observation_assessment or row.entry_applicability
    if market_only and (observation_assessment is None or assessment.status not in {"APPLICABLE", "AWAITING_CONFIRMATION", "OUTSIDE_ZONE"}
            or assessment.recheck_at is None or assessment.recheck_at <= assessment.assessed_at):
        return None
    if assessment and assessment.status in {"INVALIDATED", "EXPIRED"}:
        return None
    if assessment and assessment.reason_code in {"TARGET_REACHED", "STOP_BREACHED", "PRICE_BASIS_CHANGED", "PUBLICATION_INVALIDATED"}:
        return None
    quote = row.display_quote
    if quote and (quote.observation_status == "NO_TRADE" or quote.data_quality in {"SUSPICIOUS", "SUSPENDED"}
        or quote.volume is not None and quote.volume <= 0):
        return None
    if assessment and assessment.status == "UNVERIFIED" and assessment.reason_code in {"PATH_INCOMPLETE", "COVERAGE_UNKNOWN"}:
        return None
    quote_date = str(quote.as_of_trade_date) if quote and quote.as_of_trade_date else ""
    observed = quote.current_price if quote and quote_date >= canonical.as_of_date.isoformat() and quote.data_quality not in {"SUSPICIOUS", "SUSPENDED"} else row.technical_snapshot.latest_price
    if observed is not None and not isfinite(observed):
        observed = None
    if observed is not None and (observed <= stop or observed >= target):
        return None
    # A watch-only plan still has a finite lifetime; evaluate it on the same
    # verified completed-session dates already captured by the canonical row.
    outside_watch_range = observed is not None and (observed > high or timing == "PULLBACK" and observed < low)
    if outside_watch_range and min(abs(observed - low), abs(observed - high)) / observed * 100 > TRADE_PLAN_PULLBACK_MAX_DISTANCE_PERCENT:
        return None
    if market_only:
        readiness = "MARKET_WATCH"
    elif assessment and assessment.status == "APPLICABLE" and row.entry_applicability and row.entry_applicability.status == "APPLICABLE" and assessment.price_basis in {"CURRENT", "SNAPSHOT", "LAST_CLOSE"}:
        readiness = "CONDITIONS_MET"
    elif outside_watch_range:
        readiness = "WAIT_FOR_PRICE"
    else:
        readiness = "AWAITING_CONFIRMATION"
    if not market_only and (assessment is None or assessment.status in {"UNVERIFIED", "NOT_APPLICABLE"} or (assessment.status == "APPLICABLE" and row.entry_applicability and row.entry_applicability.status != "APPLICABLE")):
        readiness = "CONDITIONAL_SETUP"
    if readiness != "WAIT_FOR_PRICE" and decision.opportunity_quality != "STRONG":
        return None
    risk = analysis.trading_risk
    cause = max(risk.components, key=lambda item: item.score * item.weight).key if risk.components else None
    component = decision.measured_support_component
    key = component.key if component else "trend"
    support = {"trend": "UPTREND", "momentum": "MOMENTUM", "volume": "VOLUME", "price_position": "SUPPORT_ZONE"}.get(key, "BULLISH_STRUCTURE")
    technical = row.technical_snapshot
    support_value = technical.rsi if key == "momentum" else technical.volume/technical.average_volume if key == "volume" and technical.average_volume and technical.average_volume > 0 else technical.support if key == "price_position" else None
    counter = decision.opposing_constraint_code or ("PRICE_OUTSIDE_ZONE" if readiness == "WAIT_FOR_PRICE" else "CONFIRMATION_PENDING" if readiness not in {"CONDITIONS_MET", "CONDITIONAL_SETUP"} else cause if risk.label in {"MEDIUM", "HIGH"} else None)
    counter_value = None
    if not decision.opposing_constraint_code and decision.opposing_component and decision.opposing_component.score < 50:
        weakest = decision.opposing_component.key
        if weakest == "volume":
            counter = "VOLUME"
            counter_value = technical.volume/technical.average_volume if technical.average_volume and technical.average_volume > 0 else None
        elif weakest == "momentum":
            counter, counter_value = "MOMENTUM", technical.rsi
    holder = "HOLD_NO_ADD" if decision.holder_action == "HOLD" and readiness != "CONDITIONS_MET" else str(decision.holder_action or "REVIEW")
    return TopSetupRead(readiness=readiness, action="POTENTIAL_BUY" if not market_only and decision.non_holder_action == "BUY" else "WAIT",
        setup_type=timing, condition=decision.entry_condition or plan.condition_text, entry_low=low, entry_high=high,
        confirmation_rule=plan.confirmation_rule, confirmation_support=plan.confirmation_support,
        trigger_price=plan.trigger_price, invalidation=stop, target=target,
        opportunity_score=decision.opportunity_score, risk_label=risk.label, risk_cause=cause,
        supporting_fact=support, supporting_value=support_value, counterargument_code=counter,
        counterargument_value=counter_value, controlling_reason_code=decision.primary_reason_code, holder_guidance=holder,
        price_basis=assessment.price_basis if assessment else None,
        price_session_date=assessment.quote_session_date if assessment else None,
        source_observed_at=assessment.source_observed_at if assessment else None,
        batch_fetched_at=assessment.batch_fetched_at if assessment else None,
        assessed_at=assessment.assessed_at if assessment else None,
        watch_valid_until=assessment.recheck_at if market_only else None,
        observation_price=observed if assessment and assessment.status in {"APPLICABLE", "AWAITING_CONFIRMATION", "OUTSIDE_ZONE"} else None)


def project_top_setups(rows, *, limit=5, unusable_ids=(), watch_assessments=None):
    """One qualification/order contract, shared by all universe consumers."""
    from app.modules.market_universe.shortlist import entry_sort_key
    watch_assessments = watch_assessments or {}
    candidates = [(row, setup) for row in rows if row.stock.id not in unusable_ids and (setup := _candidate(row, observation_assessment=watch_assessments.get(row.stock.id))) is not None]
    tier = {"CONDITIONS_MET": 0, "AWAITING_CONFIRMATION": 1, "WAIT_FOR_PRICE": 2, "CONDITIONAL_SETUP": 3, "MARKET_WATCH": 4}
    candidates.sort(key=lambda pair: (tier[pair[1].readiness], entry_sort_key(pair[0])))
    selected, sectors = {}, {}
    while candidates and len(selected) < limit:
        # Diversify only within the same readiness/quality group. Sector variety
        # never promotes a weaker setup over the current credible group.
        first = candidates[0]
        comparable = [pair for pair in candidates if pair[1].readiness == first[1].readiness
            and pair[0].decision.opportunity_quality == first[0].decision.opportunity_quality
            and entry_sort_key(pair[0])[0] == entry_sort_key(first[0])[0]]
        chosen = next((pair for pair in comparable if sectors.get(pair[0].stock.sector or "Unclassified", 0) < 2), first)
        row, setup = chosen
        candidates.remove(chosen)
        sector = row.stock.sector or "Unclassified"
        selected[row.stock.id] = setup.model_copy(update={"rank": len(selected)+1})
        sectors[sector] = sectors.get(sector, 0)+1
    return [row.model_copy(update={"top_setup": selected.get(row.stock.id)}) for row in rows]
