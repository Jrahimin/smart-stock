from __future__ import annotations

from dataclasses import dataclass

from app.core.constants.trading_constants import MARKET_REGIME_BEARISH, STRUCTURE_LOWER
from app.core.enums import (
    DecisionConstraintKind,
    EligibilityStatus,
    LiquidityLabel,
    RiskLevelLabel,
    TradePlanStatus,
)
from app.modules.stock_details.decision.technical import TechnicalSnapshot


@dataclass(frozen=True)
class DecisionConstraint:
    code: str
    title: str
    kind: DecisionConstraintKind
    reason: str
    is_critical: bool = False


@dataclass(frozen=True)
class ConstraintResult:
    constraints: tuple[DecisionConstraint, ...]

    def has_code(self, *codes: str) -> bool:
        wanted = set(codes)
        return any(constraint.code in wanted for constraint in self.constraints)

    @property
    def blocks_new_entry(self) -> bool:
        return any(
            constraint.kind == DecisionConstraintKind.BLOCK for constraint in self.constraints
        )

    @property
    def requires_exit_or_avoid(self) -> bool:
        return any(
            constraint.kind == DecisionConstraintKind.EXIT_AVOID for constraint in self.constraints
        )


def build_decision_constraints(
    snapshot: TechnicalSnapshot,
    *,
    trading_risk_label: RiskLevelLabel,
    liquidity_label: LiquidityLabel | None,
    trade_plan_status: TradePlanStatus | None,
    eligibility_status: EligibilityStatus | None,
    eligibility_reasons: tuple[str, ...] = (),
    is_stale: bool,
    is_sparse: bool,
    suspected_adjustment: bool,
    below_support: bool,
    near_resistance: bool,
    market_regime: str | None,
) -> ConstraintResult:
    constraints: list[DecisionConstraint] = []

    def add(
        code: str,
        title: str,
        kind: DecisionConstraintKind,
        reason: str,
        *,
        critical: bool = False,
    ) -> None:
        if any(item.code == code for item in constraints):
            return
        constraints.append(DecisionConstraint(code, title, kind, reason, critical))

    if eligibility_status is not None and eligibility_status != EligibilityStatus.ELIGIBLE:
        reason_codes = ", ".join(eligibility_reasons) or "eligibility policy"
        add(
            "data_eligibility",
            "Data eligibility block",
            DecisionConstraintKind.BLOCK,
            f"Data eligibility is {eligibility_status.value}: {reason_codes}.",
            critical=eligibility_status
            in {EligibilityStatus.REVIEW_ONLY, EligibilityStatus.INELIGIBLE},
        )
    elif is_stale or is_sparse:
        add(
            "data_eligibility",
            "Data reliability block",
            DecisionConstraintKind.BLOCK,
            "Stale or sparse data cannot support a fresh directional action.",
            critical=is_stale,
        )
    if suspected_adjustment:
        add(
            "corporate_action_review",
            "Corporate-action review",
            DecisionConstraintKind.BLOCK,
            "An unresolved corporate-action discontinuity requires review.",
            critical=True,
        )
    if below_support and not suspected_adjustment:
        add(
            "below_support",
            "Support break",
            DecisionConstraintKind.EXIT_AVOID,
            "Current eligible price has failed the structural support threshold.",
            critical=True,
        )
    if trading_risk_label in {RiskLevelLabel.HIGH, RiskLevelLabel.SPECULATIVE}:
        add(
            "elevated_trading_risk",
            "Elevated trading risk",
            DecisionConstraintKind.BLOCK,
            f"Trading-risk tier is {trading_risk_label.value}; fresh entry is blocked.",
        )
    if liquidity_label == LiquidityLabel.ILLIQUID:
        add(
            "illiquid",
            "Illiquid market",
            DecisionConstraintKind.BLOCK,
            "Illiquid trading conditions block a fresh entry plan.",
        )
    elif liquidity_label == LiquidityLabel.THIN:
        add(
            "thin_liquidity",
            "Thin liquidity",
            DecisionConstraintKind.DOWNGRADE,
            "Thin liquidity requires a watch-only posture.",
        )
    if trade_plan_status != TradePlanStatus.VALID_ENTRY_PLAN:
        add(
            "entry_plan_not_valid",
            "Entry plan not valid",
            DecisionConstraintKind.BLOCK,
            "The current structural plan is not valid for a fresh entry.",
        )
    if market_regime == MARKET_REGIME_BEARISH and not snapshot.is_breakout:
        add(
            "bearish_market_regime",
            "Bearish market regime",
            DecisionConstraintKind.DOWNGRADE,
            "The broad market regime downgrades new long exposure.",
        )
    if near_resistance and not snapshot.is_breakout:
        add(
            "near_resistance",
            "Near resistance",
            DecisionConstraintKind.DOWNGRADE,
            "Price is near resistance without a current break event.",
        )
    if snapshot.rsi is not None and snapshot.rsi > 78:
        add(
            "extended_momentum",
            "Extended momentum",
            DecisionConstraintKind.DOWNGRADE,
            "RSI is above the fresh-entry limit.",
        )
    if snapshot.structure == STRUCTURE_LOWER and not snapshot.is_breakout:
        add(
            "lower_structure",
            "Lower market structure",
            DecisionConstraintKind.DOWNGRADE,
            "Lower-high/lower-low structure conflicts with a fresh long entry.",
        )
    return ConstraintResult(tuple(constraints))
