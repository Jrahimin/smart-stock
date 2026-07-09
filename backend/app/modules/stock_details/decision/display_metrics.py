"""Resolved mark-to-market display metrics for the stock details page aggregate.

Rule #1: one calculation site for live P/E, P/B, earnings yield, and scaled market cap.
Frontend view models format these values; they must not recompute them.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class DisplayMetricsResult:
    current_price: float | None
    pe_ratio: float | None
    pb_ratio: float | None
    earnings_yield: float | None
    market_cap: float | None
    marked_to_latest_price: bool
    pe_helper: str | None
    as_of_trade_date: str | None


def _positive(value: float | None) -> float | None:
    if value is None or value <= 0:
        return None
    return value


def resolve_live_pe_ratio(
    current_price: float | None,
    eps: float | None,
    valuation_pe: float | None,
    valuation_close: float | None,
) -> float | None:
    price = _positive(current_price)
    earnings = _positive(eps)
    if price is not None and earnings is not None:
        return price / earnings

    stored_pe = _positive(valuation_pe)
    close = _positive(valuation_close)
    if price is not None and stored_pe is not None and close is not None:
        return stored_pe * (price / close)

    return valuation_pe


def resolve_live_pb_ratio(
    current_price: float | None,
    nav: float | None,
    valuation_pb: float | None,
    valuation_close: float | None,
) -> float | None:
    price = _positive(current_price)
    book = _positive(nav)
    if price is not None and book is not None:
        return price / book

    stored_pb = _positive(valuation_pb)
    close = _positive(valuation_close)
    if price is not None and stored_pb is not None and close is not None:
        return stored_pb * (price / close)

    return valuation_pb


def resolve_live_earnings_yield(
    current_price: float | None,
    eps: float | None,
    valuation_earnings_yield: float | None,
    valuation_close: float | None,
) -> float | None:
    price = _positive(current_price)
    earnings = _positive(eps)
    if price is not None and earnings is not None:
        return (earnings / price) * 100

    close = _positive(valuation_close)
    if (
        price is not None
        and valuation_earnings_yield is not None
        and close is not None
    ):
        return valuation_earnings_yield * (close / price)

    return valuation_earnings_yield


def resolve_scaled_market_cap(
    current_price: float | None,
    stored_market_cap: float | None,
    valuation_close: float | None,
) -> float | None:
    price = _positive(current_price)
    close = _positive(valuation_close)
    if stored_market_cap is None:
        return None
    if price is not None and close is not None:
        return stored_market_cap * (price / close)
    return stored_market_cap


def build_display_metrics(
    *,
    current_price: float | None,
    eps: float | None,
    nav: float | None,
    valuation_pe: float | None,
    valuation_pb: float | None,
    valuation_earnings_yield: float | None,
    valuation_close: float | None,
    stored_market_cap: float | None,
    as_of_trade_date: str | None,
) -> DisplayMetricsResult:
    pe = resolve_live_pe_ratio(current_price, eps, valuation_pe, valuation_close)
    pb = resolve_live_pb_ratio(current_price, nav, valuation_pb, valuation_close)
    earnings_yield = resolve_live_earnings_yield(
        current_price,
        eps,
        valuation_earnings_yield,
        valuation_close,
    )
    market_cap = resolve_scaled_market_cap(current_price, stored_market_cap, valuation_close)

    marked = (
        current_price is not None
        and valuation_close is not None
        and current_price > 0
        and valuation_close > 0
        and abs(current_price - valuation_close) > 1e-9
    )

    pe_helper: str | None = None
    if pe is None and eps is None:
        pe_helper = "EPS unavailable"
    elif pe is not None and (eps is None or eps <= 0) and valuation_pe is not None:
        pe_helper = "From valuation snapshot"
    elif marked:
        pe_helper = "Marked to latest price"

    return DisplayMetricsResult(
        current_price=current_price,
        pe_ratio=pe,
        pb_ratio=pb,
        earnings_yield=earnings_yield,
        market_cap=market_cap,
        marked_to_latest_price=marked,
        pe_helper=pe_helper,
        as_of_trade_date=as_of_trade_date,
    )
