from dataclasses import replace

from app.core.enums import (
    DataQualityFlag,
    EligibilityStatus,
    RiskLevelLabel,
    ScannerConditionId,
    TraderRecommendation,
    TrendDirection,
)
from app.modules.market_scanner.scanner_conditions import (
    ScannerConditionMatch,
    ScannerRankCandidate,
    build_scanner_rankings,
    evaluate_scanner_conditions,
)
from app.modules.stock_details.decision.technical import TechnicalSnapshot
from app.modules.stock_details.stock_details_schemas import (
    EligibilityResultRead,
    TraderDecisionSummaryRead,
)


def _snapshot(**changes: object) -> TechnicalSnapshot:
    base = TechnicalSnapshot(
        latest_price=102.0,
        previous_close=99.0,
        price_change=3.0,
        price_change_percent=3.03,
        volume=200_000,
        average_volume=100_000.0,
        turnover=20_000_000.0,
        rsi=44.0,
        sma20=100.0,
        ema20=100.0,
        volatility=1.4,
        support=100.0,
        resistance=101.0,
        trend=TrendDirection.UPTREND,
        data_quality=DataQualityFlag.OK,
        latest_trade_date="2026-07-15",
        ohlcv_row_count=60,
        return_5d_percent=2.0,
        is_breakout=True,
        median_turnover=15_000_000.0,
    )
    return replace(base, **changes)


def _decision(
    *,
    risk_label: RiskLevelLabel = RiskLevelLabel.MEDIUM,
) -> TraderDecisionSummaryRead:
    return TraderDecisionSummaryRead(
        recommendation=TraderRecommendation.BUY,
        confidence=72,
        evidence_strength=72,
        reason="Canonical reason",
        opportunity_score=65,
        risk_label=risk_label,
    )


def _eligibility(
    status: EligibilityStatus = EligibilityStatus.ELIGIBLE,
) -> EligibilityResultRead:
    return EligibilityResultRead(
        status=status,
        median_turnover=15_000_000.0,
    )


def _condition_ids(
    snapshot: TechnicalSnapshot,
    *,
    decision: TraderDecisionSummaryRead | None = None,
    eligibility: EligibilityResultRead | None = None,
) -> set[ScannerConditionId]:
    return {
        match.condition_id
        for match in evaluate_scanner_conditions(
            snapshot,
            decision or _decision(),
            eligibility or _eligibility(),
        )
    }


def test_scanner_excludes_noneligible_rows_before_all_predicates() -> None:
    assert evaluate_scanner_conditions(
        _snapshot(),
        _decision(),
        _eligibility(EligibilityStatus.REVIEW_ONLY),
    ) == ()


def test_price_volume_breakout_requires_a_current_crossing_and_volume_baseline() -> None:
    assert ScannerConditionId.PRICE_VOLUME_BREAKOUT in _condition_ids(_snapshot())
    assert ScannerConditionId.PRICE_VOLUME_BREAKOUT not in _condition_ids(
        _snapshot(previous_close=101.5)
    )
    assert ScannerConditionId.PRICE_VOLUME_BREAKOUT not in _condition_ids(
        _snapshot(average_volume=None)
    )


def test_support_rebound_requires_reclaim_and_rejects_a_below_support_close() -> None:
    assert ScannerConditionId.SUPPORT_REBOUND in _condition_ids(
        _snapshot(is_breakout=False, resistance=110.0)
    )
    assert ScannerConditionId.SUPPORT_REBOUND not in _condition_ids(
        _snapshot(
            latest_price=99.0,
            previous_close=98.0,
            price_change=-1.0,
            price_change_percent=-1.0,
            is_breakout=False,
        )
    )
    assert ScannerConditionId.SUPPORT_REBOUND not in _condition_ids(
        _snapshot(previous_close=101.0, is_breakout=False)
    )


def test_breakdown_is_a_support_cross_not_a_risk_alias() -> None:
    breakdown = _snapshot(
        latest_price=99.0,
        previous_close=101.0,
        price_change=-2.0,
        price_change_percent=-1.98,
        is_breakout=False,
        trend=TrendDirection.DOWNTREND,
    )
    assert ScannerConditionId.BREAKDOWN in _condition_ids(breakdown)

    high_risk_without_break = _condition_ids(
        _snapshot(is_breakout=False, support=95.0),
        decision=_decision(risk_label=RiskLevelLabel.HIGH),
    )
    assert ScannerConditionId.HIGH_RISK_WATCH in high_risk_without_break
    assert ScannerConditionId.BREAKDOWN not in high_risk_without_break


def test_high_risk_watch_and_low_volatility_compression_are_distinct() -> None:
    conditions = _condition_ids(
        _snapshot(volatility=0.8, is_breakout=False),
        decision=_decision(risk_label=RiskLevelLabel.HIGH),
    )
    assert ScannerConditionId.HIGH_RISK_WATCH in conditions
    assert ScannerConditionId.LOW_VOLATILITY_COMPRESSION in conditions

    high_risk_only = _condition_ids(
        _snapshot(volatility=1.5, is_breakout=False),
        decision=_decision(risk_label=RiskLevelLabel.HIGH),
    )
    assert ScannerConditionId.HIGH_RISK_WATCH in high_risk_only
    assert ScannerConditionId.LOW_VOLATILITY_COMPRESSION not in high_risk_only


def test_scanner_rank_order_is_stable_by_score_capacity_symbol_and_identity() -> None:
    def candidate(stock_id: str, symbol: str, score: int, capacity: float) -> ScannerRankCandidate:
        return ScannerRankCandidate(
            stock_id=stock_id,
            symbol=symbol,
            match=ScannerConditionMatch(
                condition_id=ScannerConditionId.MOMENTUM_CONTINUATION,
                reason_code="test",
                reason="test",
                rank_score=score,
                capacity_score=capacity,
            ),
        )

    candidates = [
        candidate("3", "CCC", 70, 20.0),
        candidate("2", "BBB", 70, 30.0),
        candidate("1", "AAA", 70, 30.0),
    ]
    forward = build_scanner_rankings(candidates)
    reverse = build_scanner_rankings(reversed(candidates))

    assert forward == reverse
    assert forward[("1", ScannerConditionId.MOMENTUM_CONTINUATION)] == 1
    assert forward[("2", ScannerConditionId.MOMENTUM_CONTINUATION)] == 2
    assert forward[("3", ScannerConditionId.MOMENTUM_CONTINUATION)] == 3
