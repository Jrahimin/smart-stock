import pytest

from app.modules.stock_details.decision.display_metrics import (
    build_display_metrics,
    resolve_live_pe_ratio,
    resolve_scaled_market_cap,
)


def test_resolve_live_pe_prefers_eps_over_scaled_snapshot() -> None:
    assert resolve_live_pe_ratio(28.1, 0.75, 34.4, 25.8) == 28.1 / 0.75


def test_resolve_live_pe_scales_snapshot_when_eps_missing() -> None:
    assert resolve_live_pe_ratio(120.0, None, 12.0, 100.0) == pytest.approx(14.4)


def test_resolve_scaled_market_cap() -> None:
    assert resolve_scaled_market_cap(120.0, 6600.0, 100.0) == 7920.0


def test_build_display_metrics_marks_to_latest_price() -> None:
    result = build_display_metrics(
        current_price=120.0,
        eps=10.0,
        nav=50.0,
        valuation_pe=11.0,
        valuation_pb=2.0,
        valuation_earnings_yield=9.0,
        valuation_close=100.0,
        stored_market_cap=5000.0,
        as_of_trade_date="2026-07-09",
    )
    assert result.pe_ratio == 12.0
    assert result.pb_ratio == 2.4
    assert result.market_cap == 6000.0
    assert result.marked_to_latest_price is True
    assert result.pe_helper == "Marked to latest price"
    assert result.as_of_trade_date == "2026-07-09"


def test_build_display_metrics_eps_unavailable_helper() -> None:
    result = build_display_metrics(
        current_price=100.0,
        eps=None,
        nav=None,
        valuation_pe=None,
        valuation_pb=None,
        valuation_earnings_yield=None,
        valuation_close=100.0,
        stored_market_cap=None,
        as_of_trade_date="2026-07-09",
    )
    assert result.pe_ratio is None
    assert result.pe_helper == "EPS unavailable"
    assert result.marked_to_latest_price is False
