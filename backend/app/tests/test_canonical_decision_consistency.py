from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

from app.core.constants.trading_constants import (
    TRADING_ACTION_TAXONOMY,
    TRADING_STRATEGY_VERSION,
    TRADING_THRESHOLD_VERSION,
)
from app.core.enums import DataQualityFlag, EligibilityStatus, ExchangeCode
from app.models import DailyPrice, Stock
from app.modules.market_universe.market_universe_compute import build_scored_universe_rows
from app.modules.stock_details.decision.canonical import build_strategy_input
from app.modules.stock_details.decision.engine import compute_trader_decision
from app.modules.stock_details.decision.summary import build_trader_decision_summary


def _stock(symbol: str = "IDENTITY") -> Stock:
    now = datetime(2026, 7, 14)
    return Stock(
        id=uuid4(),
        symbol=symbol,
        name=f"{symbol} Limited",
        exchange=ExchangeCode.DSE,
        category="A",
        is_active=True,
        should_fetch_details=False,
        created_at=now,
        updated_at=now,
    )


def _prices(stock: Stock, count: int = 60) -> list[DailyPrice]:
    start = date(2026, 4, 1)
    rows: list[DailyPrice] = []
    for index in range(count):
        close = Decimal("80") + Decimal(index) * Decimal("0.40")
        rows.append(
            DailyPrice(
                stock_id=stock.id,
                trade_date=start + timedelta(days=index),
                open_price=close - Decimal("0.20"),
                high_price=close + Decimal("1.00"),
                low_price=close - Decimal("1.00"),
                close_price=close,
                volume=200_000 + index * 1_000,
                turnover=Decimal("20000000"),
                source="TEST",
                data_quality_flag=DataQualityFlag.OK,
            )
        )
    return rows


def _assert_same_core(left, right) -> None:
    assert left is not None and right is not None
    assert left.shared_decision_id == right.shared_decision_id
    assert left.stock_id == right.stock_id
    assert left.exchange == right.exchange
    assert left.strategy_version == right.strategy_version == TRADING_STRATEGY_VERSION
    assert left.threshold_version == right.threshold_version == TRADING_THRESHOLD_VERSION
    assert left.action_taxonomy == right.action_taxonomy == TRADING_ACTION_TAXONOMY
    assert left.as_of_date == right.as_of_date
    assert left.previous_session_date == right.previous_session_date
    assert left.recommendation == right.recommendation
    assert left.evidence_strength == right.evidence_strength
    assert left.opportunity_score == right.opportunity_score
    assert left.opportunity_quality == right.opportunity_quality
    assert left.entry_readiness == right.entry_readiness
    assert left.entry_timing == right.entry_timing
    assert left.blocker_codes == right.blocker_codes
    assert left.risk_label == right.risk_label
    assert left.trade_plan_status == right.trade_plan_status
    assert left.eligibility_status == right.eligibility_status
    assert left.primary_reason == right.primary_reason
    assert left.primary_reason_code == right.primary_reason_code
    assert left.result_semantics == right.result_semantics
    assert left.regime_score == right.regime_score
    assert left.regime_label == right.regime_label
    assert left.regime_phase == right.regime_phase
    assert left.regime_confidence == right.regime_confidence


def _direct_and_universe(
    stock: Stock, prices: list[DailyPrice], *, action_dates=None, sessions=None
):
    resolved_sessions = sessions or [price.trade_date for price in prices[-10:]]
    strategy_input = build_strategy_input(
        stock,
        prices,
        known_corporate_action_dates=action_dates,
        exchange_session_dates=resolved_sessions,
    )
    direct_bundle = compute_trader_decision(strategy_input)
    assert direct_bundle is not None
    direct_summary = build_trader_decision_summary(direct_bundle)

    universe_rows = build_scored_universe_rows(
        {str(stock.id): {"stock": stock, "prices": prices}},
        exchange_session_dates=resolved_sessions,
        corporate_action_dates_by_stock=(
            {stock.id: action_dates} if action_dates is not None else None
        ),
    )
    assert len(universe_rows) == 1
    universe_summary = universe_rows[0].decision
    assert universe_summary is not None
    return direct_summary, universe_summary


def test_normal_universe_and_detail_projection_share_canonical_identity() -> None:
    stock = _stock()
    direct, universe = _direct_and_universe(stock, _prices(stock))

    _assert_same_core(direct.canonical, universe.canonical)
    assert direct.recommendation == universe.recommendation
    assert direct.primary_reason == universe.primary_reason


def test_known_ex_date_and_stale_session_keep_cross_surface_identity() -> None:
    stock = _stock("EXDATE")
    prices = _prices(stock)
    action_dates = {prices[-1].trade_date}
    stale_sessions = [price.trade_date for price in prices[-9:]] + [
        prices[-1].trade_date + timedelta(days=1)
    ]
    direct, universe = _direct_and_universe(
        stock,
        prices,
        action_dates=action_dates,
        sessions=stale_sessions,
    )

    _assert_same_core(direct.canonical, universe.canonical)
    assert direct.canonical is not None
    assert direct.canonical.eligibility_status == EligibilityStatus.REVIEW_ONLY
    assert direct.recommendation == universe.recommendation


def test_shared_identity_changes_with_exchange_session() -> None:
    stock = _stock("CHANGE")
    prices = _prices(stock)
    first_input = build_strategy_input(
        stock,
        prices,
        exchange_session_dates=[price.trade_date for price in prices[-10:]],
    )
    first = compute_trader_decision(first_input)
    assert first is not None and first.canonical_result is not None

    next_session = prices[-1].trade_date + timedelta(days=1)
    second_input = build_strategy_input(
        stock,
        prices,
        exchange_session_dates=[next_session],
    )
    second = compute_trader_decision(second_input)
    assert second is not None and second.canonical_result is not None
    assert first.canonical_result.shared_decision_id != second.canonical_result.shared_decision_id
