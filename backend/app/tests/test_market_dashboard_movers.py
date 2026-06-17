from __future__ import annotations

from datetime import date
from uuid import uuid4

from app.core.enums import DataQualityFlag, ExchangeCode, RiskLevelLabel, TraderRecommendation, TrendDirection
from app.models import DailyPrice, Stock
from app.modules.market_dashboard.market_dashboard_cache import DASHBOARD_CACHE_KEY_NAMES, dashboard_cache_key
from app.modules.market_dashboard.market_dashboard_compute import (
    ScoredDashboardRow,
    build_market_insights,
    build_scored_rows,
    build_signal_feed,
    derive_market_mood,
    group_price_window_rows,
)
from app.modules.market_dashboard.market_dashboard_service import _build_movers_from_rows
from app.modules.stock_details.decision.summary import TraderDecisionSummaryRead
from app.modules.stock_details.decision.technical import TechnicalSnapshot


def _stock(symbol: str = "TEST") -> Stock:
    return Stock(
        id=uuid4(),
        symbol=symbol,
        name=f"{symbol} Limited",
        exchange=ExchangeCode.DSE,
        is_active=True,
    )


def _snapshot(
    *,
    trade_date: str,
    latest_price: float = 100.0,
    price_change_percent: float = -2.5,
    volume: int = 10_000,
    turnover: float = 1_000_000.0,
) -> TechnicalSnapshot:
    return TechnicalSnapshot(
        latest_price=latest_price,
        previous_close=102.5,
        price_change=-2.5,
        price_change_percent=price_change_percent,
        volume=volume,
        average_volume=8_000.0,
        turnover=turnover,
        rsi=45.0,
        sma20=101.0,
        ema20=100.5,
        volatility=1.2,
        support=95.0,
        resistance=110.0,
        trend=TrendDirection.DOWNTREND,
        data_quality=DataQualityFlag.OK,
        latest_trade_date=trade_date,
        ohlcv_row_count=20,
    )


def _row(
    snapshot: TechnicalSnapshot,
    symbol: str = "TEST",
    *,
    decision: TraderDecisionSummaryRead | None = None,
) -> ScoredDashboardRow:
    stock = _stock(symbol)
    price = DailyPrice(
        stock_id=stock.id,
        trade_date=date.fromisoformat(snapshot.latest_trade_date),
        open_price=100,
        high_price=105,
        low_price=95,
        close_price=snapshot.latest_price or 0,
        volume=snapshot.volume,
        turnover=snapshot.turnover,
        source="TEST",
        data_quality_flag=DataQualityFlag.OK,
    )
    return ScoredDashboardRow(stock=stock, prices=[price], snapshot=snapshot, decision=decision)


def _decision(recommendation: TraderRecommendation, confidence: int = 72) -> TraderDecisionSummaryRead:
    return TraderDecisionSummaryRead(
        recommendation=recommendation,
        confidence=confidence,
        reason="Test reason",
        opportunity_score=65,
        risk_label=RiskLevelLabel.MEDIUM,
    )


def test_dashboard_cache_key_names_include_phase_three_sections() -> None:
    assert dashboard_cache_key("market-sentiment", ExchangeCode.DSE) == "dashboard:market-sentiment:DSE"
    assert "heatmap" in DASHBOARD_CACHE_KEY_NAMES
    assert "stocks-in-focus" in DASHBOARD_CACHE_KEY_NAMES


def test_build_signal_feed_prioritizes_actionable_decisions() -> None:
    rows = [
        _row(_snapshot(trade_date="2026-06-17", price_change_percent=3.0), "BUYME", decision=_decision(TraderRecommendation.BUY, 80)),
        _row(_snapshot(trade_date="2026-06-17", price_change_percent=1.0), "HOLD", decision=_decision(TraderRecommendation.HOLD, 90)),
    ]

    feed = build_signal_feed(rows, limit=2)

    assert feed[0]["symbol"] == "HOLD"
    assert feed[1]["symbol"] == "BUYME"


def test_derive_market_mood_bullish_when_breadth_supports() -> None:
    rows = [
        _row(_snapshot(trade_date="2026-06-17", price_change_percent=2.0, volume=20_000), f"S{i}")
        for i in range(10)
    ]

    mood = derive_market_mood(rows, advancing=8, declining=2)

    assert mood in {"Bullish", "Accumulation"}


def test_build_market_insights_includes_mood_block() -> None:
    insights = build_market_insights(
        market_mood="Bullish",
        has_partial_data=False,
        signal_count=3,
        turnover_label="1.2B",
    )

    assert insights[0]["id"] == "market-mood"
    assert any(insight["id"] == "signal-coverage" for insight in insights)


def test_group_price_window_rows_builds_scored_rows() -> None:
    stock = _stock("GROUP")
    price = DailyPrice(
        stock_id=stock.id,
        trade_date=date(2026, 6, 17),
        open_price=100,
        high_price=105,
        low_price=95,
        close_price=101,
        volume=1_000,
        turnover=100_000,
        source="TEST",
        data_quality_flag=DataQualityFlag.OK,
    )
    grouped = group_price_window_rows([(stock, price)])
    scored = build_scored_rows(grouped)

    assert len(scored) == 1
    assert scored[0].stock.symbol == "GROUP"


def test_build_dashboard_movers_only_includes_traded_session_rows() -> None:
    session_date = date(2026, 6, 17)
    stock = _stock("GAINER")
    rows = [
        (
            stock,
            DailyPrice(
                stock_id=stock.id,
                trade_date=date(2026, 6, 17),
                open_price=100,
                high_price=105,
                low_price=95,
                close_price=100,
                volume=1_000,
                turnover=100_000,
                source="TEST",
                data_quality_flag=DataQualityFlag.OK,
            ),
            _snapshot(trade_date="2026-06-17", price_change_percent=5.0),
        ),
    ]

    movers = _build_movers_from_rows(rows, session_trade_date=session_date)

    assert movers.gainers[0].symbol == "GAINER"
