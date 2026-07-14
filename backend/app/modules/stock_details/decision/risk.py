from __future__ import annotations

from dataclasses import dataclass

from app.core.constants.trading_constants import (
    CATEGORY_RISK_SCORES,
    ELEVATED_VOLATILITY_THRESHOLD,
    GAP_RISK_VOLATILITY_BONUS,
    HIGH_VOLATILITY_THRESHOLD,
    OVEREXTENSION_ABOVE_SMA20_PERCENT,
    OVEREXTENSION_RETURN_20D_PERCENT,
    TRADING_RISK_WEIGHT_CATEGORY,
    TRADING_RISK_WEIGHT_OVEREXTENSION,
    TRADING_RISK_WEIGHT_VOLATILITY,
)
from app.core.enums import RiskLevelLabel
from app.modules.stock_details.decision.technical import TechnicalSnapshot


@dataclass(frozen=True)
class TradingRiskComponent:
    key: str
    label: str
    score: int
    weight: float
    explanation: str


@dataclass(frozen=True)
class TradingRiskResult:
    score: int
    label: RiskLevelLabel
    components: tuple[TradingRiskComponent, ...]


def _clamp(value: float) -> int:
    return int(max(0, min(100, round(value))))


def compute_trading_risk(
    snapshot: TechnicalSnapshot,
    category: str | None,
) -> TradingRiskResult:
    volatility_score = 35.0
    if snapshot.volatility is None:
        volatility_explanation = "Analytical volatility is unavailable."
    elif snapshot.volatility >= HIGH_VOLATILITY_THRESHOLD:
        volatility_score = 90
        volatility_explanation = (
            f"Analytical daily volatility is high at {snapshot.volatility:.2f}%."
        )
    elif snapshot.volatility >= ELEVATED_VOLATILITY_THRESHOLD:
        volatility_score = 65
        volatility_explanation = (
            f"Analytical daily volatility is elevated at {snapshot.volatility:.2f}%."
        )
    else:
        volatility_score = 30 + snapshot.volatility * 8
        volatility_explanation = (
            f"Analytical daily volatility is moderate at {snapshot.volatility:.2f}%."
        )
    if snapshot.gap_frequency_percent:
        volatility_score += GAP_RISK_VOLATILITY_BONUS * (snapshot.gap_frequency_percent / 100)
        volatility_explanation += (
            f" Large opening gaps occur in {snapshot.gap_frequency_percent:.0f}% of observations."
        )

    category_key = (category or "").upper()
    category_score = CATEGORY_RISK_SCORES.get(category_key, 40)
    category_explanation = (
        f"Category {category_key or 'unknown'} is treated as a structural trading-risk input."
    )

    above_sma20 = None
    if snapshot.sma20 and snapshot.sma20 > 0 and snapshot.latest_price is not None:
        above_sma20 = (snapshot.latest_price / snapshot.sma20 - 1) * 100
    overextended = bool(
        (
            snapshot.return_20d_percent is not None
            and snapshot.return_20d_percent > OVEREXTENSION_RETURN_20D_PERCENT
        )
        or (above_sma20 is not None and above_sma20 > OVEREXTENSION_ABOVE_SMA20_PERCENT)
    )
    overextension_score = 80 if overextended else 25
    overextension_explanation = (
        "Price is overextended versus its medium-term path."
        if overextended
        else "Price is not overextended versus its medium-term path."
    )

    components = (
        TradingRiskComponent(
            "volatility_gap",
            "Volatility and Gap Risk",
            _clamp(volatility_score),
            TRADING_RISK_WEIGHT_VOLATILITY,
            volatility_explanation,
        ),
        TradingRiskComponent(
            "category",
            "Category Risk",
            _clamp(category_score),
            TRADING_RISK_WEIGHT_CATEGORY,
            category_explanation,
        ),
        TradingRiskComponent(
            "overextension",
            "Overextension Risk",
            overextension_score,
            TRADING_RISK_WEIGHT_OVEREXTENSION,
            overextension_explanation,
        ),
    )
    score = _clamp(sum(component.score * component.weight for component in components))
    if score >= 75 or category_key == "Z":
        label = RiskLevelLabel.SPECULATIVE
    elif score >= 55:
        label = RiskLevelLabel.HIGH
    elif score >= 35:
        label = RiskLevelLabel.MEDIUM
    else:
        label = RiskLevelLabel.LOW
    return TradingRiskResult(score=score, label=label, components=components)
