"""Map AmarStock news titles/content to MarketEventType."""

from __future__ import annotations

from app.core.enums import MarketEventType


def classify_market_event_type(*, title: str, content: str) -> MarketEventType:
    combined = f"{title}\n{content}".lower()
    if "board meeting" in combined or "board of directors" in combined and "meeting" in combined:
        return MarketEventType.BOARD_MEETING
    if "agm" in combined or "annual general meeting" in combined:
        return MarketEventType.OTHER
    if "egm" in combined or "extraordinary general meeting" in combined:
        return MarketEventType.OTHER
    if "dividend" in combined:
        return MarketEventType.DISCLOSURE
    if "appointment" in combined or "company secretary" in combined:
        return MarketEventType.DISCLOSURE
    if "price sensitive" in combined or "material information" in combined:
        return MarketEventType.REGULATORY
    if "turnover" in combined and ("main board" in combined or "dse" in combined or "exchange" in combined):
        return MarketEventType.NEWS
    if "daily turnover" in combined:
        return MarketEventType.NEWS
    return MarketEventType.NEWS
