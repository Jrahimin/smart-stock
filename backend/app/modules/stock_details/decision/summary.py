from __future__ import annotations

from app.models import DailyPrice, Stock
from app.modules.stock_details.decision.engine import TraderDecisionBundle, compute_trader_decision_from_prices
from app.modules.stock_details.decision.technical import TechnicalSnapshot
from app.modules.stock_details.stock_details_schemas import TraderDecisionSummaryRead


def build_trader_decision_summary(bundle: TraderDecisionBundle) -> TraderDecisionSummaryRead:
    return TraderDecisionSummaryRead(
        recommendation=bundle.decision.recommendation,
        confidence=bundle.decision.confidence,
        reason=bundle.decision.reasoning[-1],
        opportunity_score=bundle.opportunity.score,
        risk_label=bundle.risk.label,
    )


def compute_trader_decision_summary_for_stock(
    stock: Stock,
    prices: list[DailyPrice],
    *,
    snapshot: TechnicalSnapshot | None = None,
) -> TraderDecisionSummaryRead | None:
    bundle = compute_trader_decision_from_prices(
        prices,
        category=stock.category,
        snapshot=snapshot,
    )
    if bundle is None:
        return None
    return build_trader_decision_summary(bundle)
