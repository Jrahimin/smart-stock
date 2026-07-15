from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime
from uuid import UUID, uuid5

from app.core.constants.trading_constants import (
    TRADING_ACTION_TAXONOMY,
    TRADING_STRATEGY_VERSION,
    TRADING_THRESHOLD_VERSION,
)
from app.core.enums import (
    EligibilityStatus,
    ExchangeCode,
    HolderAction,
    NonHolderAction,
    RiskLevelLabel,
    TradePlanStatus,
    TraderRecommendation,
    TraderStance,
)
from app.models import DailyPrice, Stock
from app.modules.stock_details.decision.lineage import build_decision_input_lineage

_SHARED_DECISION_NAMESPACE = UUID("ea888502-07ac-4b4b-b644-4450cc742ebe")

CANONICAL_RESULT_SEMANTICS: tuple[tuple[str, str], ...] = (
    ("recommendation", "DETERMINISTIC_CONTEXTUAL_ACTION"),
    ("evidence_strength", "HEURISTIC_DIRECTIONAL_EVIDENCE"),
    ("opportunity_score", "HEURISTIC_LONG_SETUP_INDEX"),
    ("risk_label", "LEGACY_COMPOSITE_RISK"),
    ("trade_plan_status", "DETERMINISTIC_PLAN_FEASIBILITY"),
)


@dataclass(frozen=True)
class StrategyInput:
    """Explicit inputs shared by universe and detail decision computation."""

    stock_id: UUID
    exchange: ExchangeCode
    category: str | None
    prices: tuple[DailyPrice, ...]
    reference_date: date | None
    known_corporate_action_dates: frozenset[date]
    exchange_session_dates: tuple[date, ...]
    is_active: bool
    market_regime: str | None
    calculated_at: datetime

    @property
    def as_of_date(self) -> date:
        if self.exchange_session_dates:
            return self.exchange_session_dates[-1]
        if self.reference_date is not None:
            return self.reference_date
        return self.prices[-1].trade_date

    @property
    def previous_session_date(self) -> date | None:
        prior_sessions = [
            session_date
            for session_date in self.exchange_session_dates
            if session_date < self.as_of_date
        ]
        if prior_sessions:
            return prior_sessions[-1]

        prior_price_dates = sorted(
            {price.trade_date for price in self.prices if price.trade_date < self.as_of_date}
        )
        return prior_price_dates[-1] if prior_price_dates else None


@dataclass(frozen=True)
class CanonicalDecisionResult:
    stock_id: UUID
    exchange: ExchangeCode
    strategy_version: str
    threshold_version: str
    action_taxonomy: str
    as_of_date: date
    previous_session_date: date | None
    calculated_at: datetime
    shared_decision_id: str
    input_schema_version: str
    data_revision: str
    event_revision: str
    input_hash: str
    replay_status: str
    replay_limitations: tuple[str, ...]
    result_semantics: tuple[tuple[str, str], ...]
    recommendation: TraderRecommendation
    evidence_strength: int
    opportunity_score: int
    risk_label: RiskLevelLabel
    trade_plan_status: TradePlanStatus
    eligibility_status: EligibilityStatus
    primary_reason: str
    primary_reason_code: str
    stance: TraderStance
    non_holder_action: NonHolderAction
    holder_action: HolderAction

    def semantics_dict(self) -> dict[str, str]:
        return dict(self.result_semantics)


def build_strategy_input(
    stock: Stock,
    prices: list[DailyPrice],
    *,
    reference_date: date | None = None,
    ex_dividend_dates: set[date] | None = None,
    known_corporate_action_dates: set[date] | None = None,
    exchange_session_dates: list[date] | tuple[date, ...] | None = None,
    market_regime: str | None = None,
    calculated_at: datetime | None = None,
) -> StrategyInput:
    return build_strategy_input_from_prices(
        prices,
        stock_id=stock.id,
        exchange=stock.exchange,
        category=stock.category,
        reference_date=reference_date,
        ex_dividend_dates=ex_dividend_dates,
        known_corporate_action_dates=known_corporate_action_dates,
        exchange_session_dates=exchange_session_dates,
        is_active=stock.is_active,
        market_regime=market_regime,
        calculated_at=calculated_at,
    )


def build_strategy_input_from_prices(
    prices: list[DailyPrice],
    *,
    category: str | None,
    stock_id: UUID | None = None,
    exchange: ExchangeCode = ExchangeCode.DSE,
    reference_date: date | None = None,
    ex_dividend_dates: set[date] | None = None,
    known_corporate_action_dates: set[date] | None = None,
    exchange_session_dates: list[date] | tuple[date, ...] | None = None,
    is_active: bool = True,
    market_regime: str | None = None,
    calculated_at: datetime | None = None,
) -> StrategyInput:
    if not prices:
        raise ValueError("Strategy input requires at least one daily price")

    sorted_prices = tuple(sorted(prices, key=lambda price: price.trade_date))
    resolved_stock_id = stock_id or sorted_prices[-1].stock_id
    action_dates = frozenset(ex_dividend_dates or ()) | frozenset(
        known_corporate_action_dates or ()
    )
    session_dates = tuple(sorted(set(exchange_session_dates or ())))
    if not session_dates and reference_date is not None:
        session_dates = (reference_date,)

    return StrategyInput(
        stock_id=resolved_stock_id,
        exchange=exchange,
        category=category,
        prices=sorted_prices,
        reference_date=reference_date,
        known_corporate_action_dates=action_dates,
        exchange_session_dates=session_dates,
        is_active=is_active,
        market_regime=market_regime,
        calculated_at=calculated_at or datetime.now(UTC),
    )


def build_canonical_decision_result(
    strategy_input: StrategyInput,
    *,
    recommendation: TraderRecommendation,
    evidence_strength: int,
    opportunity_score: int,
    risk_label: RiskLevelLabel,
    trade_plan_status: TradePlanStatus,
    eligibility_status: EligibilityStatus,
    primary_reason: str,
    primary_reason_code: str,
    stance: TraderStance,
    non_holder_action: NonHolderAction,
    holder_action: HolderAction,
) -> CanonicalDecisionResult:
    lineage = build_decision_input_lineage(strategy_input)
    return CanonicalDecisionResult(
        stock_id=strategy_input.stock_id,
        exchange=strategy_input.exchange,
        strategy_version=TRADING_STRATEGY_VERSION,
        threshold_version=TRADING_THRESHOLD_VERSION,
        action_taxonomy=TRADING_ACTION_TAXONOMY,
        as_of_date=strategy_input.as_of_date,
        previous_session_date=strategy_input.previous_session_date,
        calculated_at=strategy_input.calculated_at,
        shared_decision_id=str(uuid5(_SHARED_DECISION_NAMESPACE, lineage.input_hash)),
        input_schema_version=lineage.input_schema_version,
        data_revision=lineage.data_revision,
        event_revision=lineage.event_revision,
        input_hash=lineage.input_hash,
        replay_status=lineage.replay_status,
        replay_limitations=lineage.replay_limitations,
        result_semantics=CANONICAL_RESULT_SEMANTICS,
        recommendation=recommendation,
        evidence_strength=evidence_strength,
        opportunity_score=opportunity_score,
        risk_label=risk_label,
        trade_plan_status=trade_plan_status,
        eligibility_status=eligibility_status,
        primary_reason=primary_reason,
        primary_reason_code=primary_reason_code,
        stance=stance,
        non_holder_action=non_holder_action,
        holder_action=holder_action,
    )
