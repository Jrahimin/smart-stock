from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from app.core.constants.trading_constants import DECISION_MIN_OHLCV_ROWS, DECISION_RECOMMENDATION_LOOKBACK, STALE_DATA_THRESHOLD_DAYS
from app.models import DailyPrice
from app.modules.stock_details.decision.scoring import (
    DecisionResult,
    OpportunityScoreResult,
    RiskScoreResult,
    compute_decision_confidence,
    compute_opportunity_score,
    compute_recommendation,
    compute_risk_score,
)
from app.modules.stock_details.decision.technical import TechnicalSnapshot, build_technical_snapshot
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


def compute_trader_decision_from_prices(
    prices: list[DailyPrice],
    *,
    category: str | None,
    reference_date: date | None = None,
    snapshot: TechnicalSnapshot | None = None,
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
    decision = compute_recommendation(
        resolved_snapshot,
        opportunity,
        risk,
        near_resistance=is_near_resistance(resolved_snapshot),
        below_support=is_below_support(resolved_snapshot),
        risk_reward=trade_plan.risk_reward_ratio,
        is_stale=is_stale,
        is_sparse=is_sparse,
    )
    confidence = compute_decision_confidence(
        resolved_snapshot, opportunity, risk, is_stale=is_stale, is_sparse=is_sparse
    )

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
    )
