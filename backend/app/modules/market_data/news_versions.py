"""One read model for current and retained MarketEvent publication versions.

No position supplies identity, publication time or receipt. PostgreSQL projects
the same bounded versions before deduplication and either candidate-pool limit.
"""
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import Date, DateTime, String, and_, case, cast, func, literal, or_, select, true
from sqlalchemy.dialects.postgresql import JSONB, JSONPATH

from app.models import MarketEvent, Stock


def aware_time(value):
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00")) if value else None
        return parsed.astimezone(UTC) if parsed is not None and parsed.tzinfo is not None else None
    except (ValueError, TypeError, OverflowError):
        return None


def publication_day(value):
    try:
        return date.fromisoformat(str(value)) if value else None
    except (ValueError, TypeError):
        return None


def merge_received_news_payloads(previous, received):
    """Retain delivered versions independently of arrival order and slot position.

    A newer source clock remains the parent. Corrections replace that version's
    body, while an absent version keeps its own receipt (including unknown).
    """
    versions = {}
    for parent in (previous, received):
        if not parent:
            continue
        archives = parent.get("source_versions", [])
        payloads = [*archives, parent] if isinstance(archives, list) else [parent]
        for raw in payloads:
            if not isinstance(raw, dict):
                continue
            payload = {key: value for key, value in raw.items() if key != "source_versions"}
            clock = aware_time(payload.get("published_at"))
            identity = (payload.get("publication_date"), clock.isoformat() if clock else payload.get("published_at"),
                " ".join(str(payload.get("title") or "").casefold().split()))
            prior = versions.get(identity)
            receipt = aware_time(payload.get("ingested_at"))
            old_receipt = aware_time(prior.get("ingested_at")) if prior else None
            if prior is None or old_receipt is None or receipt is not None and receipt >= old_receipt:
                versions[identity] = payload
    def order(payload):
        return (publication_day(payload.get("publication_date")) or date.min,
            aware_time(payload.get("published_at")) or datetime.min.replace(tzinfo=UTC),
            aware_time(payload.get("ingested_at")) or datetime.min.replace(tzinfo=UTC))
    ordered = sorted(versions.values(), key=order, reverse=True)
    main = ordered[0]
    return {**main, "source_versions": ordered[1:11]}


@dataclass(frozen=True)
class NewsVersion:
    source: str
    stock_key: str | None
    symbol: str | None
    title: str
    summary: str | None
    event_type: str
    source_url: str | None
    publication_date: date | None
    published_at: datetime | None
    ingested_at: datetime | None
    effective_date: date | None
    material: bool
    revision_at: datetime | None = None
    recorded_date: date | None = None

    @property
    def identity(self):
        return (self.source, self.stock_key or self.symbol, (self.publication_date or self.recorded_date).isoformat(), "PUBLICATION" if self.publication_date else "RECORDED_DATE",
            " ".join(self.title.casefold().split()), self.published_at.isoformat() if self.published_at else None)


def project_news_versions(records):
    """Accept repository versions and legacy/test ORM records through one shape."""
    for event, symbol in records:
        if isinstance(event, NewsVersion):
            yield event
            continue
        metadata = event.metadata_json or {}
        current = {**metadata, "title": event.title, "summary": event.summary,
            "event_type": str(event.event_type), "source_url": event.source_url}
        archived = metadata.get("source_versions", [])
        for index, payload in enumerate([current] + (archived[:10] if isinstance(archived, list) else [])):
            if not isinstance(payload, dict):
                continue
            day = publication_day(payload.get("publication_date"))
            raw_clock = payload.get("published_at")
            if isinstance(raw_clock, str): raw_clock = raw_clock.strip() or None
            clock = aware_time(raw_clock)
            if day is None or raw_clock and clock is None:
                continue
            if clock and clock.astimezone(ZoneInfo("Asia/Dhaka")).date() != day:
                continue
            title = payload.get("title") or event.title
            receipt = aware_time(payload.get("ingested_at"))
            yield NewsVersion(source=str(event.source), stock_key=str(event.stock_id) if getattr(event, "stock_id", None) else None,
                symbol=symbol, title=title, summary=payload.get("summary"),
                event_type=str(payload.get("event_type") or "NEWS"), source_url=payload.get("source_url"),
                publication_date=day, published_at=clock, ingested_at=receipt,
                effective_date=publication_day(payload.get("effective_date")), material=payload.get("material") is True,
                revision_at=receipt or (getattr(event, "updated_at", None) if index == 0 else None))


def _sql_time(text_value):
    # pg_input_is_valid is available in the existing PostgreSQL17 runtime.
    # CASE guards the cast itself, including malformed calendar values.
    return case((and_(text_value.op("~")(r"(Z|[+-][0-9]{2}:?[0-9]{2})$"),
        func.pg_input_is_valid(text_value, "timestamp with time zone")), cast(text_value, DateTime(timezone=True))))


def _sql_day(text_value):
    return case((and_(text_value.op("~")(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$"),
        func.pg_input_is_valid(text_value, "date")), cast(text_value, Date)))


def _sql_title(value):
    return func.trim(func.regexp_replace(func.lower(value), r"\s+", " ", "g"))


def _sql_unknown_publication(payload):
    return and_(*(func.coalesce(func.trim(payload[key].astext), "") == "" for key in (
        "publication_date","published_at","source_news_date")),
        func.upper(func.coalesce(func.trim(payload["publication_date_basis"].astext), "")).in_(["","UNKNOWN","UNAVAILABLE"]))


def news_version_pool(*, exchange, start_date, end_date, known_at):
    """A normalized/deduplicated version CTE, before material/chrono limits."""
    metadata = MarketEvent.metadata_json
    main = func.jsonb_build_object("publication_date", metadata["publication_date"],
        "published_at", metadata["published_at"], "ingested_at", metadata["ingested_at"],
        "effective_date", metadata["effective_date"], "material", metadata["material"],
        "title", MarketEvent.title, "summary", MarketEvent.summary,
        "event_type", cast(MarketEvent.event_type, String), "source_url", MarketEvent.source_url)
    archives = case((func.jsonb_typeof(metadata["source_versions"]) == "array", metadata["source_versions"]),
        else_=cast(literal("[]"), JSONB))
    bounded = func.jsonb_path_query_array(archives, cast(literal("$[0 to 9]"), JSONPATH))
    versions = func.jsonb_array_elements(func.jsonb_build_array(main).op("||")(bounded)).table_valued("value", with_ordinality="ordinality").render_derived().lateral("version")
    payload = cast(versions.c.value, JSONB)
    raw_clock = func.nullif(func.trim(payload["published_at"].astext), "")
    clock = _sql_time(raw_clock)
    day = _sql_day(payload["publication_date"].astext)
    receipt = _sql_time(payload["ingested_at"].astext)
    title = func.coalesce(payload["title"].astext, MarketEvent.title)
    normalized_title = _sql_title(title)
    eligible = and_(day.between(start_date, min(end_date, known_at.astimezone(ZoneInfo("Asia/Dhaka")).date())),
        or_(raw_clock.is_(None), and_(clock <= known_at, cast(func.timezone("Asia/Dhaka", clock), Date) == day)))
    # The key uses normalized instants, never the original offset spelling or
    # mutable parent/archive position. Unknown-date-only clocks remain null.
    key = cast(func.jsonb_build_array(MarketEvent.source, MarketEvent.stock_id, normalized_title, day, clock), String)
    raw = select(MarketEvent.source.label("source"), cast(MarketEvent.stock_id, String).label("stock_key"),
        Stock.symbol.label("symbol"), title.label("title"), payload["summary"].astext.label("summary"),
        func.coalesce(payload["event_type"].astext, "NEWS").label("event_type"),
        payload["source_url"].astext.label("source_url"), day.label("publication_date"), clock.label("published_at"),
        receipt.label("ingested_at"), _sql_day(payload["effective_date"].astext).label("effective_date"),
        (payload["material"].astext == "true").label("material"), key.label("version_key"),
        func.row_number().over(partition_by=key, order_by=(receipt.desc().nullslast(),
            versions.c.ordinality.asc(), MarketEvent.updated_at.desc(), MarketEvent.id)).label("revision_rank")
    ).select_from(MarketEvent).outerjoin(Stock, Stock.id == MarketEvent.stock_id).join(versions, true()).where(
        MarketEvent.exchange == exchange, eligible).cte("normalized_news_versions")
    return select(raw).where(raw.c.revision_rank == 1).cte("eligible_news_versions")


async def read_session_news(session, *, exchange, start_date, end_date, known_at, limit):
    pool = news_version_pool(exchange=exchange, start_date=start_date, end_date=end_date, known_at=known_at)
    ordering = (pool.c.publication_date.desc(), pool.c.published_at.desc().nullslast(), pool.c.version_key)
    recent = or_(pool.c.published_at >= known_at - timedelta(hours=24),
        and_(pool.c.published_at.is_(None), pool.c.publication_date == known_at.astimezone(ZoneInfo("Asia/Dhaka")).date()))
    material = and_(recent, or_(pool.c.event_type.in_(["REGULATORY", "EARNINGS_RELEASE"]), pool.c.material.is_(True)))
    priority = list((await session.execute(select(pool).where(material).order_by(*ordering).limit(min(20, limit)))).mappings())
    keys = [row["version_key"] for row in priority]
    rest = select(pool).where(pool.c.version_key.not_in(keys)) if keys else select(pool)
    ordinary = list((await session.execute(rest.order_by(*ordering).limit(max(0, limit-len(priority))))).mappings())
    result = []
    for row in priority + ordinary:
        values = {name: row[name] for name in NewsVersion.__dataclass_fields__ if name in row}
        values.update(published_at=aware_time(row["published_at"]), ingested_at=aware_time(row["ingested_at"]), material=row["material"] is True)
        value = NewsVersion(**values)
        result.append((value, value.symbol))
    return result


async def latest_verified_news_day(session, *, exchange, known_at):
    pool = news_version_pool(exchange=exchange,start_date=date.min,
        end_date=known_at.astimezone(ZoneInfo("Asia/Dhaka")).date(),known_at=known_at)
    return await session.scalar(select(func.max(pool.c.publication_date)))


async def read_latest_recorded_news(session, *, exchange, known_at, limit):
    """Legacy news only, never a substitute publication claim or material pin."""
    metadata=MarketEvent.metadata_json
    archive_type=func.jsonb_typeof(metadata["source_versions"])
    archives=case((archive_type=="array",metadata["source_versions"]),else_=cast(literal("[]"),JSONB))
    version=func.jsonb_array_elements(archives).table_valued("value").render_derived().lateral("legacy_version")
    payload=cast(version.c.value,JSONB)
    has_archive_evidence=select(literal(1)).select_from(version).where(
        ~and_(func.jsonb_typeof(payload)=="object",_sql_unknown_publication(payload))).exists()
    no_structured_evidence=and_(_sql_unknown_publication(metadata),
        or_(archive_type.is_(None),archive_type.in_(["null","array"])),~has_archive_evidence)
    genuine=or_(and_(MarketEvent.source=="AMARSTOCK_NEWS_API",metadata["source_api"].astext=="info/News"),
        and_(MarketEvent.source=="AMARSTOCK_API",metadata["news_index"].astext.op("~")(r"^[1-9][0-9]*$")))
    eligible=and_(MarketEvent.exchange==exchange,MarketEvent.event_date<=known_at.astimezone(ZoneInfo("Asia/Dhaka")).date(),genuine,no_structured_evidence)
    latest=select(func.max(MarketEvent.event_date)).where(eligible).scalar_subquery()
    key=(MarketEvent.source,MarketEvent.stock_id,MarketEvent.event_date,_sql_title(MarketEvent.title))
    rows=(await session.execute(select(MarketEvent,Stock.symbol).outerjoin(Stock,Stock.id==MarketEvent.stock_id)
        .where(eligible,MarketEvent.event_date==latest).distinct(*key)
        .order_by(*key,MarketEvent.updated_at.desc(),MarketEvent.id.desc()).limit(limit))).all()
    return [(NewsVersion(source=event.source,stock_key=str(event.stock_id) if event.stock_id else None,symbol=symbol,
        title=event.title,summary=event.summary,event_type="NEWS",source_url=event.source_url,publication_date=None,
        published_at=None,ingested_at=None,effective_date=None,material=False,recorded_date=event.event_date),symbol)
        for event,symbol in rows]
