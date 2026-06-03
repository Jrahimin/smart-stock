from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from app.models import ValuationSnapshot


def _to_float(value: Decimal | float | int | None) -> float | None:
    if value is None:
        return None
    return float(value)


@dataclass(frozen=True)
class ValuationInsightResult:
    close_price: float | None
    market_cap: float | None
    pe_ratio: float | None
    pb_ratio: float | None
    dividend_yield: float | None
    earnings_yield: float | None
    interpretations: list[str]
    valuation_date: str | None
    source: str | None


def build_valuation_insights(snapshot: ValuationSnapshot | None) -> ValuationInsightResult | None:
    if snapshot is None:
        return None
    pe = _to_float(snapshot.pe_ratio)
    pb = _to_float(snapshot.pb_ratio)
    dividend_yield = _to_float(snapshot.dividend_yield)
    earnings_yield = _to_float(snapshot.earnings_yield)
    interpretations: list[str] = []
    if pe is not None:
        if pe <= 12:
            interpretations.append("PE suggests relatively inexpensive earnings relative to price.")
        elif pe >= 25:
            interpretations.append("PE is elevated; growth expectations may already be priced in.")
        else:
            interpretations.append("PE is in a moderate range.")
    if pb is not None:
        if pb <= 1:
            interpretations.append("Price is near or below book/NAV context.")
        elif pb >= 3:
            interpretations.append("Premium to book/NAV indicates higher market expectations.")
    if dividend_yield is not None and dividend_yield >= 3:
        interpretations.append("Dividend yield offers income support.")
    if earnings_yield is not None and earnings_yield >= 8:
        interpretations.append("Earnings yield is attractive on a relative basis.")
    if not interpretations:
        interpretations.append("Valuation snapshot available without extreme signals.")
    return ValuationInsightResult(
        close_price=_to_float(snapshot.close_price),
        market_cap=_to_float(snapshot.market_cap),
        pe_ratio=pe,
        pb_ratio=pb,
        dividend_yield=dividend_yield,
        earnings_yield=earnings_yield,
        interpretations=interpretations,
        valuation_date=snapshot.valuation_date.isoformat(),
        source=snapshot.source,
    )
