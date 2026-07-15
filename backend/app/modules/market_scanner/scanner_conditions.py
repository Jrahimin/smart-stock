from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

from app.core.constants.trading_constants import (
    SCANNER_COMPRESSION_VOLATILITY_MAX,
    SCANNER_CONDITION_VERSION,
    SCANNER_SUPPORT_REBOUND_MAX_DISTANCE_PERCENT,
    SCANNER_SUPPORT_REBOUND_RSI_MAX,
    VOLUME_EXPANSION_RATIO,
)
from app.core.enums import (
    EligibilityStatus,
    RiskLevelLabel,
    ScannerConditionId,
    TrendDirection,
)
from app.modules.stock_details.decision.technical import TechnicalSnapshot
from app.modules.stock_details.stock_details_schemas import (
    EligibilityResultRead,
    TraderDecisionSummaryRead,
)


@dataclass(frozen=True)
class ScannerConditionMatch:
    condition_id: ScannerConditionId
    reason_code: str
    reason: str
    rank_score: int
    capacity_score: float


@dataclass(frozen=True)
class ScannerRankCandidate:
    stock_id: str
    symbol: str
    match: ScannerConditionMatch


def _bounded_score(value: int | float) -> int:
    return max(0, min(100, round(value)))


def _evidence_score(decision: TraderDecisionSummaryRead) -> int:
    return _bounded_score(
        decision.evidence_strength
        if decision.evidence_strength is not None
        else decision.confidence
    )


def _risk_score(decision: TraderDecisionSummaryRead) -> int:
    if decision.trading_risk is not None:
        return _bounded_score(decision.trading_risk.score)
    return {
        RiskLevelLabel.LOW: 20,
        RiskLevelLabel.MEDIUM: 50,
        RiskLevelLabel.HIGH: 75,
        RiskLevelLabel.SPECULATIVE: 90,
    }[decision.risk_label]


def _capacity_score(
    snapshot: TechnicalSnapshot,
    eligibility: EligibilityResultRead,
) -> float:
    return max(0.0, eligibility.median_turnover or snapshot.median_turnover or 0.0)


def _volume_ratio(snapshot: TechnicalSnapshot) -> float | None:
    if snapshot.average_volume is None or snapshot.average_volume <= 0:
        return None
    return snapshot.volume / snapshot.average_volume


def _is_price_volume_breakout(snapshot: TechnicalSnapshot) -> bool:
    ratio = _volume_ratio(snapshot)
    return (
        snapshot.is_breakout
        and snapshot.latest_price is not None
        and snapshot.previous_close is not None
        and snapshot.resistance is not None
        and snapshot.previous_close <= snapshot.resistance < snapshot.latest_price
        and ratio is not None
        and ratio >= VOLUME_EXPANSION_RATIO
    )


def _is_support_rebound(snapshot: TechnicalSnapshot) -> bool:
    if (
        snapshot.support is None
        or snapshot.support <= 0
        or snapshot.latest_price is None
        or snapshot.previous_close is None
        or snapshot.rsi is None
    ):
        return False
    distance_percent = (snapshot.latest_price / snapshot.support - 1) * 100
    reclaimed_support = snapshot.previous_close <= snapshot.support < snapshot.latest_price
    return (
        0 <= distance_percent <= SCANNER_SUPPORT_REBOUND_MAX_DISTANCE_PERCENT
        and reclaimed_support
        and snapshot.rsi <= SCANNER_SUPPORT_REBOUND_RSI_MAX
        and (snapshot.price_change_percent or 0) > 0
    )


def _is_breakdown(snapshot: TechnicalSnapshot) -> bool:
    return (
        snapshot.support is not None
        and snapshot.latest_price is not None
        and snapshot.previous_close is not None
        and snapshot.previous_close >= snapshot.support > snapshot.latest_price
        and (snapshot.price_change_percent or 0) < 0
    )


def evaluate_scanner_conditions(
    snapshot: TechnicalSnapshot,
    decision: TraderDecisionSummaryRead,
    eligibility: EligibilityResultRead,
) -> tuple[ScannerConditionMatch, ...]:
    """Return server-owned condition matches for one canonical universe row."""
    if eligibility.status != EligibilityStatus.ELIGIBLE:
        return ()

    evidence_score = _evidence_score(decision)
    capacity_score = _capacity_score(snapshot, eligibility)
    matches: list[ScannerConditionMatch] = []

    if _is_price_volume_breakout(snapshot):
        matches.append(
            ScannerConditionMatch(
                condition_id=ScannerConditionId.PRICE_VOLUME_BREAKOUT,
                reason_code="price_volume_break_event",
                reason="Price crossed prior resistance with expanded relative volume.",
                rank_score=evidence_score,
                capacity_score=capacity_score,
            )
        )

    if _is_support_rebound(snapshot):
        matches.append(
            ScannerConditionMatch(
                condition_id=ScannerConditionId.SUPPORT_REBOUND,
                reason_code="support_reclaim_event",
                reason="Price reclaimed support from below and remains within the support band.",
                rank_score=evidence_score,
                capacity_score=capacity_score,
            )
        )

    if (
        snapshot.trend == TrendDirection.UPTREND
        and snapshot.return_5d_percent is not None
        and snapshot.return_5d_percent > 0
    ):
        matches.append(
            ScannerConditionMatch(
                condition_id=ScannerConditionId.MOMENTUM_CONTINUATION,
                reason_code="uptrend_positive_5d_return",
                reason="Canonical uptrend has a positive five-session return.",
                rank_score=evidence_score,
                capacity_score=capacity_score,
            )
        )

    if _is_breakdown(snapshot):
        matches.append(
            ScannerConditionMatch(
                condition_id=ScannerConditionId.BREAKDOWN,
                reason_code="support_break_event",
                reason="Price crossed below canonical support from the prior close.",
                rank_score=evidence_score,
                capacity_score=capacity_score,
            )
        )

    if decision.risk_label in {RiskLevelLabel.HIGH, RiskLevelLabel.SPECULATIVE}:
        matches.append(
            ScannerConditionMatch(
                condition_id=ScannerConditionId.HIGH_RISK_WATCH,
                reason_code="elevated_trading_risk",
                reason="Canonical trading-risk classification is elevated.",
                rank_score=_risk_score(decision),
                capacity_score=capacity_score,
            )
        )

    if (
        snapshot.volatility is not None
        and 0 <= snapshot.volatility < SCANNER_COMPRESSION_VOLATILITY_MAX
    ):
        compression_score = (
            (SCANNER_COMPRESSION_VOLATILITY_MAX - snapshot.volatility)
            / SCANNER_COMPRESSION_VOLATILITY_MAX
            * 100
        )
        matches.append(
            ScannerConditionMatch(
                condition_id=ScannerConditionId.LOW_VOLATILITY_COMPRESSION,
                reason_code="low_volatility_compression",
                reason="Recent analytical volatility is within the compression band.",
                rank_score=_bounded_score(compression_score),
                capacity_score=capacity_score,
            )
        )

    return tuple(matches)


def build_scanner_rankings(
    candidates: Iterable[ScannerRankCandidate],
) -> dict[tuple[str, ScannerConditionId], int]:
    """Rank matches by condition: score, capacity, symbol, then stock identity."""
    buckets: dict[ScannerConditionId, list[ScannerRankCandidate]] = {}
    for candidate in candidates:
        buckets.setdefault(candidate.match.condition_id, []).append(candidate)

    rankings: dict[tuple[str, ScannerConditionId], int] = {}
    for condition_id, condition_candidates in buckets.items():
        ordered = sorted(
            condition_candidates,
            key=lambda candidate: (
                -candidate.match.rank_score,
                -candidate.match.capacity_score,
                candidate.symbol.casefold(),
                candidate.stock_id,
            ),
        )
        for rank, candidate in enumerate(ordered, start=1):
            rankings[(candidate.stock_id, condition_id)] = rank
    return rankings


__all__ = [
    "SCANNER_CONDITION_VERSION",
    "ScannerConditionMatch",
    "ScannerRankCandidate",
    "build_scanner_rankings",
    "evaluate_scanner_conditions",
]
