from __future__ import annotations

from dataclasses import dataclass

from app.core.constants.trading_constants import (
    HIGH_VOLATILITY_THRESHOLD,
    NEAR_LEVEL_PERCENT_THRESHOLD,
    RSI_OVERBOUGHT_THRESHOLD,
    RSI_OVERSOLD_THRESHOLD,
    VOLUME_EXPANSION_RATIO,
    VOLUME_THIN_RATIO,
)
from app.core.enums import LiquidityLabel, RiskLevelLabel, TrendDirection, WarningSeverity
from app.modules.stock_details.decision.scoring import OpportunityScoreResult, RiskScoreResult
from app.modules.stock_details.decision.technical import TechnicalSnapshot
from app.modules.stock_details.decision.trade_plan import LiquidityAnalysisResult, is_below_support, is_near_resistance


@dataclass(frozen=True)
class SmartWarning:
    code: str
    title: str
    message: str
    severity: WarningSeverity


def generate_warnings(
    snapshot: TechnicalSnapshot,
    opportunity: OpportunityScoreResult,
    risk: RiskScoreResult,
    liquidity: LiquidityAnalysisResult,
    *,
    is_stale: bool,
    is_sparse: bool,
    category: str | None,
    pattern_name: str | None = None,
    pattern_bearish: bool = False,
) -> list[SmartWarning]:
    warnings: list[SmartWarning] = []

    if is_near_resistance(snapshot):
        warnings.append(
            SmartWarning(
                code="near_resistance",
                title="Near resistance",
                message="Price is close to recent resistance; upside may need a breakout.",
                severity=WarningSeverity.WARNING,
            )
        )
    if is_below_support(snapshot):
        warnings.append(
            SmartWarning(
                code="below_support",
                title="Below support",
                message="Price is trading below recent support; structure is weakened.",
                severity=WarningSeverity.CRITICAL,
            )
        )
    if snapshot.rsi is not None and snapshot.rsi > RSI_OVERBOUGHT_THRESHOLD:
        warnings.append(
            SmartWarning(
                code="rsi_overheated",
                title="RSI overheated",
                message=f"RSI at {snapshot.rsi:.1f} suggests extended momentum.",
                severity=WarningSeverity.WARNING,
            )
        )
    if snapshot.rsi is not None and snapshot.rsi < RSI_OVERSOLD_THRESHOLD and snapshot.trend == TrendDirection.DOWNTREND:
        warnings.append(
            SmartWarning(
                code="weak_momentum",
                title="Weak momentum",
                message="RSI is weak while trend remains down; rebound is unconfirmed.",
                severity=WarningSeverity.WARNING,
            )
        )
    if snapshot.average_volume and snapshot.volume / snapshot.average_volume < VOLUME_THIN_RATIO:
        warnings.append(
            SmartWarning(
                code="weak_volume",
                title="Weak volume confirmation",
                message="Latest volume is well below the recent average.",
                severity=WarningSeverity.WARNING,
            )
        )
    elif snapshot.average_volume and snapshot.volume / snapshot.average_volume < VOLUME_EXPANSION_RATIO and opportunity.score >= 60:
        warnings.append(
            SmartWarning(
                code="volume_not_confirming",
                title="Volume not confirming",
                message="Opportunity is present but volume has not expanded enough to confirm.",
                severity=WarningSeverity.INFO,
            )
        )
    if snapshot.volatility is not None and snapshot.volatility >= HIGH_VOLATILITY_THRESHOLD:
        warnings.append(
            SmartWarning(
                code="high_volatility",
                title="High volatility",
                message=f"Recent daily volatility is {snapshot.volatility:.2f}%; reduce position size.",
                severity=WarningSeverity.WARNING,
            )
        )
    if liquidity.label in {LiquidityLabel.THIN, LiquidityLabel.ILLIQUID}:
        warnings.append(
            SmartWarning(
                code="thin_liquidity",
                title="Thin liquidity",
                message=liquidity.explanation,
                severity=WarningSeverity.WARNING,
            )
        )
    category_key = (category or "").upper()
    if category_key == "Z":
        warnings.append(
            SmartWarning(
                code="category_z",
                title="Category Z stock",
                message="Category Z carries higher structural and speculative risk.",
                severity=WarningSeverity.CRITICAL,
            )
        )
    elif category_key == "N":
        warnings.append(
            SmartWarning(
                code="category_n",
                title="Category N stock",
                message="Category N stocks require stronger confirmation before entry.",
                severity=WarningSeverity.INFO,
            )
        )
    if is_stale:
        warnings.append(
            SmartWarning(
                code="stale_data",
                title="Stale price data",
                message="Latest OHLCV is older than the freshness threshold.",
                severity=WarningSeverity.WARNING,
            )
        )
    if is_sparse:
        warnings.append(
            SmartWarning(
                code="sparse_data",
                title="Sparse OHLCV history",
                message="Insufficient price history reduces confidence in technical conclusions.",
                severity=WarningSeverity.WARNING,
            )
        )
    if risk.label in {RiskLevelLabel.HIGH, RiskLevelLabel.SPECULATIVE}:
        warnings.append(
            SmartWarning(
                code="elevated_risk",
                title="Elevated risk profile",
                message=f"Risk level is {risk.label.value}; use conservative sizing.",
                severity=WarningSeverity.WARNING,
            )
        )
    if pattern_bearish and pattern_name:
        warnings.append(
            SmartWarning(
                code="bearish_pattern",
                title="Bearish pattern forming",
                message=f"{pattern_name} suggests downside risk until invalidated.",
                severity=WarningSeverity.WARNING,
            )
        )
    if snapshot.support is not None and snapshot.support > 0 and snapshot.latest_price is not None:
        support_distance = ((snapshot.latest_price - snapshot.support) / snapshot.support) * 100
        if 0 <= support_distance <= NEAR_LEVEL_PERCENT_THRESHOLD:
            warnings.append(
                SmartWarning(
                    code="near_support",
                    title="Near support",
                    message="Price is near support; watch for bounce or breakdown.",
                    severity=WarningSeverity.INFO,
                )
            )
    return warnings
