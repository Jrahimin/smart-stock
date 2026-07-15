from dataclasses import replace
from datetime import date, datetime
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

from app.core.enums import (
    DataQualityFlag,
    DecisionDisplayAction,
    EligibilityStatus,
    ExchangeCode,
    PulseFocusLabel,
    RiskLevelLabel,
    TraderRecommendation,
    TrendDirection,
)
from app.modules.market_pulse.market_pulse_schemas import MarketPulsePreviousSnapshot
from app.modules.market_pulse.market_pulse_service import (
    PulsePresentationRow,
    _comparable_previous_snapshot,
    _diversify_focus_list,
    _select_monitor_rows,
    is_eligible_pulse_candidate,
)
from app.modules.market_pulse.pulse_score import (
    compute_pulse_score,
    get_volume_ratio,
    meets_focus_threshold,
)
from app.modules.market_universe.market_universe_compute import technical_snapshot_to_read
from app.modules.market_universe.market_universe_schemas import (
    ScoredUniverseRow,
    UniverseSessionRead,
)
from app.modules.stock_details.decision.technical import TechnicalSnapshot
from app.modules.stock_details.stock_details_schemas import (
    EligibilityResultRead,
    TraderDecisionSummaryRead,
)
from app.modules.stocks.stocks_schemas import StockRead


def _snapshot(**changes: object) -> TechnicalSnapshot:
    base = TechnicalSnapshot(
        latest_price=102.0,
        previous_close=100.0,
        price_change=2.0,
        price_change_percent=2.0,
        volume=100_000,
        average_volume=100_000.0,
        turnover=10_000_000.0,
        rsi=50.0,
        sma20=100.0,
        ema20=100.0,
        volatility=1.2,
        support=96.0,
        resistance=110.0,
        trend=TrendDirection.UPTREND,
        data_quality=DataQualityFlag.OK,
        latest_trade_date="2026-07-15",
        ohlcv_row_count=60,
        return_5d_percent=2.0,
        median_turnover=10_000_000.0,
    )
    return replace(base, **changes)


def _decision() -> TraderDecisionSummaryRead:
    return TraderDecisionSummaryRead(
        recommendation=TraderRecommendation.BUY,
        internal_action=TraderRecommendation.BUY,
        display_action=DecisionDisplayAction.POTENTIAL_BUY,
        decision_taxonomy_version="v2",
        confidence=70,
        evidence_strength=70,
        reason="Canonical reason",
        opportunity_score=65,
        risk_label=RiskLevelLabel.LOW,
    )


def _presentation_row(
    symbol: str,
    sector: str,
    score: int,
    *,
    capacity: float = 10_000_000.0,
) -> PulsePresentationRow:
    return PulsePresentationRow(
        stock=SimpleNamespace(
            id=uuid4(),
            symbol=symbol,
            name=symbol,
            exchange=ExchangeCode.DSE,
            sector=sector,
            category="A",
        ),
        snapshot=_snapshot(median_turnover=capacity),
        decision=_decision(),
        score=SimpleNamespace(total=score),
        label=PulseFocusLabel.WATCH_CLOSELY,
    )


def _universe_row(*, stock_date: date, exchange_date: date) -> ScoredUniverseRow:
    now = datetime(2026, 7, 15, 15, 0)
    stock = StockRead(
        id=uuid4(),
        symbol="SESSION",
        name="Session Limited",
        exchange=ExchangeCode.DSE,
        sector="Bank",
        category="A",
        created_at=now,
        updated_at=now,
    )
    snapshot = _snapshot(latest_trade_date=stock_date.isoformat())
    return ScoredUniverseRow(
        stock=stock,
        technical_snapshot=technical_snapshot_to_read(snapshot),
        decision=_decision(),
        eligibility=EligibilityResultRead(
            status=EligibilityStatus.ELIGIBLE,
            exchange_session_date=exchange_date,
            latest_trade_date=stock_date,
        ),
        session=UniverseSessionRead(
            latest_trade_date=stock_date,
            close_price=Decimal("102"),
            volume=100_000,
        ),
    )


def test_missing_volume_baseline_contributes_zero_not_a_default_positive() -> None:
    snapshot = _snapshot(average_volume=None)
    score = compute_pulse_score(snapshot, _decision())

    assert get_volume_ratio(snapshot) is None
    assert score.volume == 0
    assert score.total == 65


def test_focus_threshold_is_inclusive_only_at_sixty() -> None:
    assert meets_focus_threshold(59) is False
    assert meets_focus_threshold(60) is True


def test_previous_snapshot_requires_the_current_score_version_for_comparison() -> None:
    legacy = MarketPulsePreviousSnapshot(scores={"stock": 72})
    current = MarketPulsePreviousSnapshot(
        score_version="pulse-attention-v2",
        decision_taxonomy_version="v2",
        scores={"stock": 72},
    )

    assert _comparable_previous_snapshot(legacy) is None
    assert _comparable_previous_snapshot(current) is current


def test_pulse_candidate_must_match_the_current_exchange_session() -> None:
    current = date(2026, 7, 15)
    assert is_eligible_pulse_candidate(
        _universe_row(stock_date=current, exchange_date=current),
        current,
    )
    assert not is_eligible_pulse_candidate(
        _universe_row(stock_date=date(2026, 7, 14), exchange_date=current),
        current,
    )


def test_focus_ties_are_stable_independent_of_input_order() -> None:
    rows = [
        _presentation_row("BBB", "Bank", 70, capacity=20.0),
        _presentation_row("AAA", "Bank", 70, capacity=20.0),
        _presentation_row("CCC", "Cement", 70, capacity=10.0),
    ]
    forward = [row.stock.symbol for row in _diversify_focus_list(rows)]
    reverse = [row.stock.symbol for row in _diversify_focus_list(list(reversed(rows)))]

    assert forward == reverse == ["AAA", "BBB", "CCC"]


def test_third_same_sector_uses_the_documented_score_gap_exception() -> None:
    without_exception = [
        _presentation_row("A1", "Bank", 100),
        _presentation_row("A2", "Bank", 99),
        _presentation_row("A3", "Bank", 92),
        _presentation_row("B1", "Cement", 85),
        _presentation_row("C1", "Pharma", 84),
    ]
    selected = [row.stock.symbol for row in _diversify_focus_list(without_exception)]
    assert selected == ["A1", "A2", "B1", "C1", "A3"]

    with_exception = [
        _presentation_row("A1", "Bank", 100),
        _presentation_row("A2", "Bank", 99),
        _presentation_row("A3", "Bank", 96),
        _presentation_row("B1", "Cement", 85),
        _presentation_row("C1", "Pharma", 84),
    ]
    selected = [row.stock.symbol for row in _diversify_focus_list(with_exception)]
    assert selected[:3] == ["A1", "A2", "A3"]


def test_monitor_candidates_are_disjoint_from_focus() -> None:
    rows = [
        _presentation_row("FOCUS", "Bank", 80),
        _presentation_row("WATCH1", "Cement", 59),
        _presentation_row("WATCH2", "Pharma", 58),
    ]
    focus = _diversify_focus_list([rows[0]])
    monitor = _select_monitor_rows(rows, focus)

    assert [row.stock.symbol for row in monitor] == ["WATCH1", "WATCH2"]
    assert {str(row.stock.id) for row in focus}.isdisjoint(
        {str(row.stock.id) for row in monitor}
    )
