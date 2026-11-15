"""Sourced announcements and explicitly generated session highlights."""
from datetime import timedelta
from hashlib import sha256
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo
from app.modules.market_data.news_versions import project_news_versions


def session_news_items(records, highlights, *, start_date, now, exchange):
    by_key = {}
    today=now.astimezone(ZoneInfo("Asia/Dhaka")).date()
    for version in project_news_versions(records):
        published, published_at = version.publication_date, version.published_at
        recorded=published is None and version.recorded_date is not None
        display_date=version.recorded_date if recorded else published
        if display_date is None or not start_date <= display_date <= today or published_at and published_at > now:
            continue
        event, symbol = version, version.symbol
        kind = "NEWS" if event.event_type == "NEWS" else "DISCLOSURE"
        url = event.source_url
        try:
            parsed = urlsplit(url) if isinstance(url, str) else None
        except ValueError:
            parsed = None
        if parsed is None or parsed.scheme not in {"http", "https"} or not parsed.netloc:
            url = None
        key = event.identity
        # Re-ingestion collapses; substantive changed summaries remain visible
        # as the latest version of the same announcement, not duplicate rows.
        item = {"id": "news-"+sha256(repr(key).encode()).hexdigest()[:20], "kind": kind,
            "time": display_date.isoformat(), "publication_date": published,
            "date_basis":"RECORDED_DATE" if recorded else "PUBLICATION",
            "date_label":"RECORDED_DATE" if recorded else "TODAY" if published==today else "DATE",
            "date_label_as_of":today,
            "published_at": published_at, "effective_date": event.effective_date,
            "ingested_at": event.ingested_at, "source": event.source, "source_url": url,
            "href": url or (f"/stocks/{exchange.value}/{symbol}" if symbol else None), "symbol": symbol,
            "title": event.title, "description": event.summary or "",
            "priority": "MATERIAL" if not recorded and (event.event_type in {"REGULATORY", "EARNINGS_RELEASE"} or event.material is True) and (
                now-published_at <= timedelta(hours=24) if published_at else published == today) else "NORMAL"}
        prior = by_key.get(key)
        if prior is None or (event.revision_at is not None and (prior[0] is None or event.revision_at > prior[0])):
            by_key[key] = (event.revision_at, item)
    ordered = sorted((pair[1] for pair in by_key.values()), key=lambda item: (item["time"], item["published_at"].timestamp() if item["published_at"] else -1, item["id"]), reverse=True)
    pinned = [item for item in ordered if item["priority"] == "MATERIAL"][:2]
    pinned_ids = {item["id"] for item in pinned}
    generated = [{**item, "id": "highlight-"+sha256((item["time"]+item["title"]).encode()).hexdigest()[:20],
        "kind": "HIGHLIGHT", "source": "Session data",
        "href": item.get("href") or (f"/stocks/{exchange.value}/{item["symbol"]}" if item.get("symbol") else None)} for item in highlights
        if item["title"] not in {"Market snapshot ready", "Suspicious activity flagged"}]
    remaining = [item for item in ordered if item["id"] not in pinned_ids][:30-len(pinned)] + generated[:3]
    remaining.sort(key=lambda item: (item["time"], item.get("published_at").timestamp() if item.get("published_at") else -1, item["id"]), reverse=True)
    return (pinned+remaining)[:33]
