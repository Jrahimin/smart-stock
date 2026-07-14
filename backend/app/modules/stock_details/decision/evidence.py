from __future__ import annotations

from dataclasses import dataclass

from app.core.constants.trading_constants import (
    DATA_RELIABILITY_HIGH_MIN,
    DATA_RELIABILITY_LOW_MIN,
    DATA_RELIABILITY_MEDIUM_MIN,
    DIRECTIONAL_EVIDENCE_EVENT_WEIGHT,
    DIRECTIONAL_EVIDENCE_MOMENTUM_WEIGHT,
    DIRECTIONAL_EVIDENCE_TREND_WEIGHT,
    NEAR_LEVEL_PERCENT_THRESHOLD,
)
from app.core.enums import (
    DataReliabilityLabel,
    EligibilityStatus,
    EvidenceDirection,
    TraderRecommendation,
)
from app.modules.stock_details.decision.data_eligibility import EligibilityResult
from app.modules.stock_details.decision.technical import TechnicalSnapshot


@dataclass(frozen=True)
class DirectionalEvidenceComponent:
    key: str
    label: str
    direction: EvidenceDirection
    strength: int
    weight: float
    explanation: str


@dataclass(frozen=True)
class DirectionalEvidenceResult:
    direction: EvidenceDirection
    bullish_score: int
    bearish_score: int
    coverage_percent: int
    components: tuple[DirectionalEvidenceComponent, ...]


@dataclass(frozen=True)
class EvidenceStrengthResult:
    score: int
    direction: EvidenceDirection
    agreement_score: int
    coverage_percent: int
    explanation: str


@dataclass(frozen=True)
class DataReliabilityResult:
    score: int
    label: DataReliabilityLabel
    reason_codes: tuple[str, ...]
    explanation: str


def _clamp(value: float) -> int:
    return int(max(0, min(100, round(value))))


def _trend_component(snapshot: TechnicalSnapshot) -> DirectionalEvidenceComponent:
    mapping = {
        "UPTREND": (EvidenceDirection.BULLISH, 85, "The established trend is upward."),
        "DOWNTREND": (EvidenceDirection.BEARISH, 85, "The established trend is downward."),
        "SIDEWAYS": (EvidenceDirection.NEUTRAL, 70, "The established trend is sideways."),
        "UNKNOWN": (EvidenceDirection.UNKNOWN, 0, "Trend evidence is unavailable."),
    }
    direction, strength, explanation = mapping[snapshot.trend.value]
    return DirectionalEvidenceComponent(
        key="trend",
        label="Trend",
        direction=direction,
        strength=strength,
        weight=DIRECTIONAL_EVIDENCE_TREND_WEIGHT,
        explanation=explanation,
    )


def _momentum_component(snapshot: TechnicalSnapshot) -> DirectionalEvidenceComponent:
    momentum = snapshot.return_20d_percent
    horizon = "20-session"
    if momentum is None:
        momentum = snapshot.return_5d_percent
        horizon = "5-session"
    if momentum is None:
        return DirectionalEvidenceComponent(
            key="momentum",
            label="Momentum",
            direction=EvidenceDirection.UNKNOWN,
            strength=0,
            weight=DIRECTIONAL_EVIDENCE_MOMENTUM_WEIGHT,
            explanation="Multi-session return evidence is unavailable.",
        )
    if abs(momentum) < 2:
        direction = EvidenceDirection.NEUTRAL
        strength = 65
    else:
        direction = EvidenceDirection.BULLISH if momentum > 0 else EvidenceDirection.BEARISH
        strength = _clamp(55 + min(abs(momentum), 20) * 2)
    return DirectionalEvidenceComponent(
        key="momentum",
        label="Momentum",
        direction=direction,
        strength=strength,
        weight=DIRECTIONAL_EVIDENCE_MOMENTUM_WEIGHT,
        explanation=f"{horizon} analytical return is {momentum:.2f}%.",
    )


def _level_event_component(snapshot: TechnicalSnapshot) -> DirectionalEvidenceComponent:
    price = snapshot.latest_price
    support = snapshot.support
    below_support = bool(
        price is not None
        and support is not None
        and support > 0
        and price < support * (1 - NEAR_LEVEL_PERCENT_THRESHOLD / 200)
    )
    if snapshot.is_breakout:
        direction = EvidenceDirection.BULLISH
        strength = 95
        explanation = "A current price-volume break event supports the bullish direction."
    elif below_support:
        direction = EvidenceDirection.BEARISH
        strength = 95
        explanation = "Price has broken below the current structural support threshold."
    elif snapshot.support is not None or snapshot.resistance is not None:
        direction = EvidenceDirection.NEUTRAL
        strength = 60
        explanation = "No current structural price-break event is present."
    else:
        direction = EvidenceDirection.UNKNOWN
        strength = 0
        explanation = "Structural level-event evidence is unavailable."
    return DirectionalEvidenceComponent(
        key="level_event",
        label="Level Event",
        direction=direction,
        strength=strength,
        weight=DIRECTIONAL_EVIDENCE_EVENT_WEIGHT,
        explanation=explanation,
    )


def compute_directional_evidence(snapshot: TechnicalSnapshot) -> DirectionalEvidenceResult:
    """Build a small direction-only result without risk, liquidity, or data quality."""
    components = (
        _trend_component(snapshot),
        _momentum_component(snapshot),
        _level_event_component(snapshot),
    )
    known_weight = sum(
        component.weight
        for component in components
        if component.direction != EvidenceDirection.UNKNOWN
    )
    if known_weight <= 0:
        return DirectionalEvidenceResult(
            direction=EvidenceDirection.UNKNOWN,
            bullish_score=0,
            bearish_score=0,
            coverage_percent=0,
            components=components,
        )

    bullish = 0.0
    bearish = 0.0
    for component in components:
        if component.direction == EvidenceDirection.UNKNOWN:
            continue
        if component.direction == EvidenceDirection.BULLISH:
            bullish_value = component.strength
            bearish_value = 100 - component.strength
        elif component.direction == EvidenceDirection.BEARISH:
            bullish_value = 100 - component.strength
            bearish_value = component.strength
        else:
            bullish_value = bearish_value = 50
        bullish += bullish_value * component.weight
        bearish += bearish_value * component.weight

    bullish_score = _clamp(bullish / known_weight)
    bearish_score = _clamp(bearish / known_weight)
    difference = bullish_score - bearish_score
    if difference >= 12:
        direction = EvidenceDirection.BULLISH
    elif difference <= -12:
        direction = EvidenceDirection.BEARISH
    else:
        direction = EvidenceDirection.NEUTRAL
    return DirectionalEvidenceResult(
        direction=direction,
        bullish_score=bullish_score,
        bearish_score=bearish_score,
        coverage_percent=_clamp(known_weight * 100),
        components=components,
    )


def compute_evidence_strength(
    evidence: DirectionalEvidenceResult,
    recommendation: TraderRecommendation,
) -> EvidenceStrengthResult:
    if recommendation in {TraderRecommendation.BUY, TraderRecommendation.HOLD}:
        direction = EvidenceDirection.BULLISH
        agreement = evidence.bullish_score
    elif recommendation == TraderRecommendation.SELL:
        direction = EvidenceDirection.BEARISH
        agreement = evidence.bearish_score
    else:
        direction = EvidenceDirection.NEUTRAL
        agreement = _clamp(100 - abs(evidence.bullish_score - evidence.bearish_score))
    score = _clamp(agreement * evidence.coverage_percent / 100)
    return EvidenceStrengthResult(
        score=score,
        direction=direction,
        agreement_score=agreement,
        coverage_percent=evidence.coverage_percent,
        explanation=(
            "Heuristic evidence strength measures directional agreement and available "
            "technical coverage; it is not probability or data reliability."
        ),
    )


def compute_data_reliability(
    eligibility: EligibilityResult,
    snapshot: TechnicalSnapshot,
) -> DataReliabilityResult:
    status_caps = {
        EligibilityStatus.ELIGIBLE: 100,
        EligibilityStatus.LIMITED: 75,
        EligibilityStatus.REVIEW_ONLY: 45,
        EligibilityStatus.INELIGIBLE: 20,
    }
    score = status_caps[eligibility.status]
    reasons = list(eligibility.reason_codes)
    quality_total = (
        eligibility.quality_ok_count
        + eligibility.quality_partial_count
        + eligibility.quality_suspicious_count
    )
    if quality_total:
        partial_ratio = eligibility.quality_partial_count / quality_total
        score -= min(15, round(partial_ratio * 20))
    if eligibility.quality_suspicious_count:
        score = min(score, 30)
    if eligibility.invalid_ohlcv_row_count:
        invalid_total = eligibility.valid_ohlcv_row_count + eligibility.invalid_ohlcv_row_count
        if invalid_total:
            score -= min(15, round(eligibility.invalid_ohlcv_row_count / invalid_total * 30))
    if eligibility.missed_session_count:
        score = min(score, max(20, 70 - eligibility.missed_session_count * 15))
    if eligibility.corporate_action_status in {
        "KNOWN_UNADJUSTED",
        "UNRESOLVED_DISCONTINUITY",
    }:
        score = min(score, 25)
    if snapshot.analytical_price_basis == "RAW_UNADJUSTED":
        score = min(score, 85)
        reasons.append("raw_unadjusted_analytical_series")

    score = _clamp(score)
    if score >= DATA_RELIABILITY_HIGH_MIN:
        label = DataReliabilityLabel.HIGH
    elif score >= DATA_RELIABILITY_MEDIUM_MIN:
        label = DataReliabilityLabel.MEDIUM
    elif score >= DATA_RELIABILITY_LOW_MIN:
        label = DataReliabilityLabel.LOW
    else:
        label = DataReliabilityLabel.UNRELIABLE
    return DataReliabilityResult(
        score=score,
        label=label,
        reason_codes=tuple(dict.fromkeys(reasons)),
        explanation=(
            "Deterministic input reliability reflects freshness, history coverage, source "
            "quality, row validity, and corporate-action resolution."
        ),
    )


def data_reliability_from_flags(*, is_stale: bool, is_sparse: bool) -> DataReliabilityResult:
    score = 45 if is_stale else (60 if is_sparse else 85)
    label = (
        DataReliabilityLabel.LOW
        if is_stale
        else (DataReliabilityLabel.MEDIUM if is_sparse else DataReliabilityLabel.HIGH)
    )
    reasons = tuple(
        code for code, present in (("stale_data", is_stale), ("sparse_data", is_sparse)) if present
    )
    return DataReliabilityResult(
        score=score,
        label=label,
        reason_codes=reasons,
        explanation="Compatibility reliability projection from stale/sparse flags.",
    )
