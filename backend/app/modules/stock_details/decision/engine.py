from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from app.core.constants.trading_constants import (
    ANOMALOUS_DROP_PERCENT,
    ANOMALOUS_DROP_PRIOR_WINDOW,
    DECISION_MIN_OHLCV_ROWS,
    DECISION_RECOMMENDATION_LOOKBACK,
    STALE_DATA_THRESHOLD_DAYS,
)
from app.models import DailyPrice
from app.modules.stock_details.decision.scoring import (
    DecisionResult,
    OpportunityScoreResult,
    RiskScoreResult,
    compute_opportunity_score,
    compute_recommendation,
    compute_risk_score,
)
from app.modules.stock_details.decision.technical import TechnicalSnapshot, _to_float, build_technical_snapshot
from app.modules.stock_details.decision.trade_plan import (
    LiquidityAnalysisResult,
    TradePlanResult,
    compute_liquidity,
    compute_trade_plan,
    is_below_support,
    is_near_resistance,
)


@dataclass(frozen=True)
class TraderDecisionBundle:
    snapshot: TechnicalSnapshot
    liquidity: LiquidityAnalysisResult
    opportunity: OpportunityScoreResult
    risk: RiskScoreResult
    trade_plan: TradePlanResult
    decision: DecisionResult
    confidence: int
    is_stale: bool
    is_sparse: bool
    suspected_adjustment: bool = False


def _detect_suspected_adjustment(
    sorted_prices: list[DailyPrice],
    ex_dividend_dates: set[date] | None,
) -> bool:
    """Flag one-session collapses that are likely corporate-action adjustments.

    A bonus/dividend/rights ex-date mechanically drops the quoted price without a
    change in fundamentals; treating that as a breakdown fires false SELLs during
    dividend season. Known ex-dates are authoritative; otherwise a >12% single-day
    drop that is not part of an existing downtrend is treated as suspected.
    """
    if len(sorted_prices) < 2:
        return False
    latest = sorted_prices[-1]
    if ex_dividend_dates and latest.trade_date in ex_dividend_dates:
        return True

    latest_close = _to_float(latest.close_price)
    previous_close = _to_float(sorted_prices[-2].close_price)
    if not latest_close or not previous_close or previous_close <= 0:
        return False
    drop_percent = (latest_close - previous_close) / previous_close * 100
    if drop_percent > -ANOMALOUS_DROP_PERCENT:
        return False

    prior_closes = [
        value
        for value in (_to_float(price.close_price) for price in sorted_prices[-(ANOMALOUS_DROP_PRIOR_WINDOW + 2) : -1])
        if value is not None
    ]
    # If the run-in to the drop was already declining, this is genuine weakness.
    prior_downtrend = len(prior_closes) >= 2 and prior_closes[-1] < prior_closes[0]
    return not prior_downtrend


def compute_trader_decision_from_prices(
    prices: list[DailyPrice],
    *,
    category: str | None,
    reference_date: date | None = None,
    snapshot: TechnicalSnapshot | None = None,
    ex_dividend_dates: set[date] | None = None,
    market_regime: str | None = None,
) -> TraderDecisionBundle | None:
    if not prices:
        return None

    sorted_prices = sorted(prices, key=lambda price: price.trade_date)
    decision_prices = sorted_prices[-DECISION_RECOMMENDATION_LOOKBACK:]
    resolved_snapshot = snapshot if snapshot is not None else build_technical_snapshot(decision_prices)
    if resolved_snapshot is None:
        return None

    today = reference_date or date.today()
    is_stale = False
    if resolved_snapshot.latest_trade_date:
        latest_date = date.fromisoformat(resolved_snapshot.latest_trade_date)
        is_stale = (today - latest_date).days > STALE_DATA_THRESHOLD_DAYS
    is_sparse = resolved_snapshot.ohlcv_row_count < DECISION_MIN_OHLCV_ROWS

    liquidity = compute_liquidity(resolved_snapshot)
    risk = compute_risk_score(
        resolved_snapshot,
        category,
        liquidity.label,
        is_stale=is_stale,
        is_sparse=is_sparse,
    )
    opportunity = compute_opportunity_score(resolved_snapshot, risk.score, liquidity.label)
    trade_plan = compute_trade_plan(resolved_snapshot)
    suspected_adjustment = _detect_suspected_adjustment(decision_prices, ex_dividend_dates)
    decision = compute_recommendation(
        resolved_snapshot,
        opportunity,
        risk,
        near_resistance=is_near_resistance(resolved_snapshot),
        below_support=is_below_support(resolved_snapshot),
        risk_reward=trade_plan.risk_reward_ratio,
        is_stale=is_stale,
        is_sparse=is_sparse,
        liquidity_label=liquidity.label,
        suspected_adjustment=suspected_adjustment,
        market_regime=market_regime,
    )
    # Single source of truth: the confidence computed inside the recommendation
    # (with conflict penalties and reliability caps) is reused everywhere.
    confidence = decision.confidence

    return TraderDecisionBundle(
        snapshot=resolved_snapshot,
        liquidity=liquidity,
        opportunity=opportunity,
        risk=risk,
        trade_plan=trade_plan,
        decision=decision,
        confidence=confidence,
        is_stale=is_stale,
        is_sparse=is_sparse,
        suspected_adjustment=suspected_adjustment,
    )
