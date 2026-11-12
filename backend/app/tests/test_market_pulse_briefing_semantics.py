from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.core.enums import DataQualityFlag, ExchangeCode, TrendDirection
from app.modules.market_pulse.market_pulse_briefing import PulseBriefingRow, build_market_briefing
from app.modules.stock_details.decision.technical import TechnicalSnapshot


def _snapshot(change_percent: float) -> TechnicalSnapshot:
    return TechnicalSnapshot(
        latest_price=100.0 + change_percent,
        previous_close=100.0,
        price_change=change_percent,
        price_change_percent=change_percent,
        volume=1_000_000,
        average_volume=1_000_000.0,
        turnover=100_000_000.0,
        rsi=50.0,
        sma20=100.0,
        ema20=100.0,
        volatility=1.0,
        support=95.0,
        resistance=110.0,
        trend=TrendDirection.SIDEWAYS,
        data_quality=DataQualityFlag.OK,
        latest_trade_date="2026-07-14",
        ohlcv_row_count=60,
    )


def _rows(changes: list[float]) -> list[PulseBriefingRow]:
    return [
        PulseBriefingRow(
            stock=SimpleNamespace(
                id=uuid4(),
                symbol=f"TEST{index}",
                name=f"Test {index}",
                exchange=ExchangeCode.DSE,
                sector="Bank",
                category="A",
            ),
            snapshot=_snapshot(change),
            decision=SimpleNamespace(),
            score=SimpleNamespace(total=60),
        )
        for index, change in enumerate(changes)
    ]


@pytest.mark.parametrize(
    ("changes", "expected_leaders", "expected_laggards"),
    [
        ([1.0, 2.0, 3.0], 1, 0),
        ([-1.0, -2.0, -3.0], 0, 1),
        ([0.0, 0.0, 0.0], 0, 0),
    ],
)
def test_sector_price_change_never_fabricates_a_missing_side(
    changes: list[float],
    expected_leaders: int,
    expected_laggards: int,
) -> None:
    briefing = build_market_briefing(
        _rows(changes),
        [],
        [],
        [],
        market_summaries=[],
        format_number=lambda value: str(value),
        format_percent=lambda value: f"{value:.2f}%",
        price_tone=lambda value: "neutral",
        sparkline_points=lambda *args: [],
    )

    assert briefing is not None
    assert briefing.money_flow.semantics == "SECTOR_PRICE_CHANGE"
    assert len(briefing.money_flow.inflows) == expected_leaders
    assert len(briefing.money_flow.outflows) == expected_laggards
    if expected_leaders == 0:
        assert "No positive sector side" in briefing.story.explanation
        assert briefing.leadership.cards[0].name == "N/A"
        assert briefing.leadership.cards[0].tone == "neutral"
    assert briefing.opportunity_score.history == []
    assert briefing.opportunity_score.previous_session is None
    assert briefing.opportunity_score.weekly_average is None
    assert briefing.opportunity_score.trend_label is None


def test_zero_known_breadth_and_missing_sector_changes_stay_unknown():
    from dataclasses import replace
    from app.modules.market_pulse.market_pulse_briefing import _compute_breadth, _sector_performance
    rows = [replace(row, snapshot=replace(row.snapshot, price_change_percent=None)) for row in _rows([1, 2, 3])]
    assert _compute_breadth(rows)["total"] == 0
    assert not _sector_performance(rows)
    briefing = build_market_briefing(rows, [], [], [], market_summaries=[], format_number=str,
        format_percent=lambda value: str(value), price_tone=lambda value: "neutral", sparkline_points=lambda *args: [])
    assert briefing.story.headline == "BREADTH UNAVAILABLE"
    assert briefing.state.dimensions[0].value == "Unknown"
    assert not briefing.money_flow.inflows and not briefing.money_flow.outflows
    assert all(metric.sub_value is None for metric in briefing.story.metrics[:3])


@pytest.mark.parametrize("all_unknown", [False, True])
def test_price_leadership_uses_measured_changes_and_keeps_independent_volume(all_unknown):
    from dataclasses import replace
    rows = _rows([-1.0, -2.0])
    rows[0] = replace(rows[0], snapshot=replace(rows[0].snapshot, price_change_percent=None))
    if all_unknown:
        rows[1] = replace(rows[1], snapshot=replace(rows[1].snapshot, price_change_percent=None))
    briefing = build_market_briefing(rows, [], [], [], market_summaries=[], format_number=str,
        format_percent=lambda value: f"{value:.2f}%", price_tone=lambda value: "negative", sparkline_points=lambda *args: [])
    stock_cards = [card for card in briefing.leadership.cards if card.kind == "stock"]
    if all_unknown:
        assert stock_cards == []
    else:
        assert stock_cards[0].name == "TEST1"
        assert stock_cards[0].detail == "-2.00%"
    volume_cards = [card for card in briefing.leadership.cards if card.kind == "accumulation"]
    assert volume_cards[0].name == "TEST0"
