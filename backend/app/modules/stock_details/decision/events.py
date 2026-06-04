from __future__ import annotations

from dataclasses import dataclass

from app.core.enums import CorporateActionSubtype, CorporateActionType, MarketEventType
from app.models import CorporateAction, DividendEvent, MarketEvent


@dataclass(frozen=True)
class EventTimelineItem:
    event_type: str
    category: str
    event_date: str
    title: str
    summary: str | None
    source: str | None


def _event_category(event_type: MarketEventType) -> str:
    mapping = {
        MarketEventType.BOARD_MEETING: "Board Meetings",
        MarketEventType.EARNINGS_RELEASE: "Earnings",
        MarketEventType.DISCLOSURE: "Corporate Announcements",
        MarketEventType.NEWS: "Corporate Announcements",
        MarketEventType.REGULATORY: "Corporate Announcements",
        MarketEventType.OTHER: "Corporate Announcements",
    }
    return mapping.get(event_type, "Corporate Announcements")


def build_event_timeline(
    market_events: list[MarketEvent],
    dividend_events: list[DividendEvent],
    corporate_actions: list[CorporateAction],
    *,
    limit: int = 20,
) -> list[EventTimelineItem]:
    items: list[EventTimelineItem] = []
    for event in market_events:
        items.append(
            EventTimelineItem(
                event_type=event.event_type.value,
                category=_event_category(event.event_type),
                event_date=event.event_date.isoformat(),
                title=event.title,
                summary=event.summary,
                source=event.source,
            )
        )
    for event in dividend_events:
        items.append(
            EventTimelineItem(
                event_type="DIVIDEND",
                category="Dividends",
                event_date=event.declaration_date.isoformat(),
                title=f"{event.dividend_type.value} dividend FY {event.fiscal_year}",
                summary=f"Status: {event.status.value}",
                source=event.source,
            )
        )
    for action in corporate_actions:
        category = "Board Meetings"
        if action.action_type == CorporateActionType.DIVIDEND:
            category = "Dividends"
        elif action.action_subtype in {CorporateActionSubtype.AGM, CorporateActionSubtype.EGM}:
            category = "Board Meetings"
        elif action.action_type in {CorporateActionType.MEETING, CorporateActionType.RESTRUCTURING}:
            category = "Corporate Announcements"
        items.append(
            EventTimelineItem(
                event_type=action.action_type.value,
                category=category,
                event_date=action.announcement_date.isoformat(),
                title=action.description or f"{action.action_type.value} announcement",
                summary=action.description,
                source=action.source,
            )
        )
    items.sort(key=lambda item: item.event_date, reverse=True)
    deduped: list[EventTimelineItem] = []
    seen: set[tuple[str, str, str, str]] = set()
    for item in items:
        identity = (item.event_date, item.event_type, item.title, item.category)
        if identity in seen:
            continue
        seen.add(identity)
        deduped.append(item)
    return deduped[:limit]
