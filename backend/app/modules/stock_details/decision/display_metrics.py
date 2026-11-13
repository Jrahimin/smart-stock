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


def build_quote_projection(prices, *, finality="FINALIZED", session_date=None) -> dict:
    """Publish a price/change/date unit; a placeholder never supplies a raw -100% return."""
    from app.modules.stock_details.decision.technical import select_valid_ohlc_rows
    ordered = sorted(prices, key=lambda row: row.trade_date)
    valid = select_valid_ohlc_rows(ordered)
    latest = valid[-1] if valid else None
    observed = ordered[-1] if ordered else None
    status = "UNAVAILABLE"
    if observed is not None and (session_date is None or observed.trade_date == session_date):
        if observed.volume == 0:
            status = "NO_TRADE"
        elif latest is observed:
            status = "FINALIZED" if finality == "FINALIZED" else "PROVISIONAL"
    return {
        "volume": observed.volume if observed is not None else 0,
        "previous_close": float(latest.previous_close_price) if latest and latest.previous_close_price is not None else None,
        "source": latest.source if latest else None,
        "data_quality": latest.data_quality_flag.value if latest else None,
        "ingested_at": latest.updated_at if latest else None,
        # Provider observation and actual batch receipt have distinct meanings.
        "source_observed_at": getattr(latest, "source_observed_at", None) if latest else None,
        "batch_fetched_at": getattr(latest, "batch_fetched_at", None) if latest else None,
        "current_price": float(latest.close_price) if latest else None,
        "price_change_percent": float(latest.price_change_percent)
        if latest and latest.price_change_percent is not None
        else None,
        "price_change": float(latest.price_change)
        if latest and latest.price_change is not None
        else None,
        "as_of_trade_date": latest.trade_date.isoformat() if latest else None,
        "observation_session_date": observed.trade_date.isoformat() if observed else None,
        "observation_status": status,
    }


def account_mark_is_usable(mark):
    from math import isfinite
    return bool(mark and mark.current_price is not None and isfinite(mark.current_price)
                and mark.current_price > 0 and mark.as_of_trade_date)


def resolve_account_mark(*, row=None, fallback_price=None):
    """The displayed quote and holding arithmetic share this exact observation."""
    display = getattr(row, "display_quote", None) if row is not None else None
    if account_mark_is_usable(display):
        return display
    from app.modules.market_universe.market_universe_schemas import DisplayQuoteRead
    if fallback_price is not None:
        value = fallback_price.close_price
        return DisplayQuoteRead(
            current_price=float(value) if value is not None and value.is_finite() and value > 0 else None,
            previous_close=fallback_price.previous_close_price,
            price_change=fallback_price.price_change, price_change_percent=fallback_price.price_change_percent,
            as_of_trade_date=fallback_price.trade_date.isoformat(),
            observation_status="NO_TRADE" if fallback_price.volume == 0 else "FINALIZED",
            source=getattr(fallback_price, "source", None), data_quality=fallback_price.data_quality_flag,
            ingested_at=getattr(fallback_price, "updated_at", None),
            source_observed_at=getattr(fallback_price, "source_observed_at", None),
            batch_fetched_at=getattr(fallback_price, "batch_fetched_at", None),
        )
    if display is None and row is not None and row.technical_snapshot is not None:
        # Compatibility for old cached rows: the dated session is an explicitly dated mark.
        technical = row.technical_snapshot
        return DisplayQuoteRead(current_price=float(row.session.close_price) if row.session.close_price > 0 else None,
            previous_close=technical.previous_close, price_change=technical.price_change,
            price_change_percent=row.session.change_percent,
            as_of_trade_date=row.session.latest_trade_date.isoformat(),
            observation_status="FINALIZED", data_quality=row.session.data_quality_flag.value,
            ingested_at=row.session.updated_at)
    return DisplayQuoteRead(current_price=None)
