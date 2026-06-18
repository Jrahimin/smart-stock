from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date

from app.models import DividendEvent, MarketEvent

_CASH_PERCENT_PATTERN = re.compile(
    r"(?P<value>\d+(?:\.\d+)?)\s*%\s*(?:cash|stock)?\s*dividend",
    re.IGNORECASE,
)
_CASH_AMOUNT_PATTERN = re.compile(
    r"(?:cash|tk\.?|bdt)\s*(?P<value>\d+(?:\.\d+)?)",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class DividendIntelligenceResult:
    last_dividend_year: int | None
    last_dividend_value: str | None


def _format_dividend_event(event: DividendEvent) -> str | None:
    if event.cash_dividend_percent is not None:
        return f"{float(event.cash_dividend_percent):g}% cash"
    if event.stock_dividend_percent is not None:
        return f"{float(event.stock_dividend_percent):g}% stock"
    if event.cash_amount_per_share is not None:
        return f"{float(event.cash_amount_per_share):g} per share"
    return None


def _parse_market_event_value(title: str, summary: str | None) -> str | None:
    combined = f"{title}\n{summary or ''}"
    cash_percent = _CASH_PERCENT_PATTERN.search(combined)
    if cash_percent:
        return f"{cash_percent.group('value')}% cash"
    cash_amount = _CASH_AMOUNT_PATTERN.search(combined)
    if cash_amount:
        return f"{cash_amount.group('value')} per share"
    if "stock dividend" in combined.lower():
        return "Stock dividend"
    if "cash dividend" in combined.lower():
        return "Cash dividend"
    return None


def _is_dividend_market_event(event: MarketEvent) -> bool:
    combined = f"{event.title}\n{event.summary or ''}".lower()
    return "dividend" in combined


def build_dividend_intelligence(
    *,
    dividend_events: list[DividendEvent],
    market_events: list[MarketEvent],
) -> DividendIntelligenceResult | None:
    candidates: list[tuple[date, int, str]] = []

    for event in dividend_events:
        formatted = _format_dividend_event(event)
        if formatted is None:
            continue
        year = event.fiscal_year or event.declaration_date.year
        candidates.append((event.declaration_date, year, formatted))

    for event in market_events:
        if not _is_dividend_market_event(event):
            continue
        formatted = _parse_market_event_value(event.title, event.summary)
        if formatted is None:
            continue
        candidates.append((event.event_date, event.event_date.year, formatted))

    if not candidates:
        return None

    candidates.sort(key=lambda item: item[0], reverse=True)
    _, year, value = candidates[0]
    return DividendIntelligenceResult(last_dividend_year=year, last_dividend_value=value)
