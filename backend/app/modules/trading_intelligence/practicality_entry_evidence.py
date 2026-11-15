"""Bound offline entry evidence uses the same publication/path/assessment owners."""
from datetime import date
from types import SimpleNamespace

from app.modules.market_universe.market_universe_schemas import DisplayQuoteRead
from app.modules.stock_details.decision.entry_applicability import PriceBasisEvent, build_entry_path_facts, evaluate_entry_applicability
from app.modules.stock_details.decision.entry_basis_events import exported_basis_evidence, basis_coverage_verified
from app.modules.stock_details.decision.entry_path_evidence import _time, _row, build_entry_price_evidence, published_price_matches
from app.modules.stock_details.decision.display_metrics import build_quote_projection
from app.core.enums import DataQualityFlag


def entry_source_hash(export):
    from app.core.audit_hashing import stable_audit_hash
    return stable_audit_hash({key:export.get(key) for key in (
        "quote_prices","price_observations","price_publication_observations","market_generations","market_schedule",
        "source_coverage","corporate_actions","dividend_events","exported_at")})


def evidence_for(capture, export, *, source_hash=None):
    explicit = capture.get("input_payload", {}).get("entry_evidence") or export.get("entry_evidence_by_generation", {}).get(capture["generation_id"])
    if explicit:
        return explicit
    cache = export.setdefault("_derived_entry_evidence", {})
    key=capture["generation_id"];source_hash=source_hash or entry_source_hash(export)
    if key not in cache or cache[key]["source_hash"]!=source_hash:
        cache[key]={"source_hash":source_hash,"value":construct_entry_evidence(capture, export)}
    return cache[key]["value"]


def construct_entry_evidence(capture, export):
    """Read-only export records -> the existing producer publication contract.

    Required source coverage and schedule are exported facts. Their absence is
    recorded, never replaced with an authenticated flag or a guessed calendar.
    """
    from dataclasses import asdict
    from datetime import time
    from zoneinfo import ZoneInfo
    from app.core.core_config import Settings
    from app.core.enums import ExchangeCode, MarketSessionStatus
    from app.core.audit_hashing import canonicalize_audit_value
    from app.jobs.market_session_schedule import entry_quote_session, resolve_market_status
    from app.modules.market_data.price_publication_evidence import publication_evidence
    from app.modules.stock_details.decision.entry_path_evidence import _valid, _source_proven, _day
    from app.modules.trading_intelligence.capture_inventory import verify_capture_coverage
    schedule = export.get("market_schedule")
    assessed = _time(export.get("exported_at"))
    if not schedule or not schedule.get("source_revision") or assessed is None:
        return {"construction_status": "SCHEDULE_OR_EXPORT_CLOCK_UNAVAILABLE", "source_tables": "EXPORTED_READ_ONLY_RECORDS"}
    now = assessed.astimezone(ZoneInfo("Asia/Dhaka"))
    settings = Settings(**{key:value for key,value in schedule.items() if key in Settings.model_fields})
    opening, closing, recheck = entry_quote_session(now, settings)
    manifests = []
    for raw in export.get("market_generations", []):
        if raw.get("exchange") != capture.get("exchange", "DSE") or (raw.get("accepted_count") or 0) <= 0:
            continue
        value = {**raw, "exchange": ExchangeCode(raw["exchange"]), "trade_date": date.fromisoformat(raw["trade_date"]),
            "published_at": _time(raw["published_at"]), "source_last_synced_at": _time(raw["source_last_synced_at"])}
        if value["published_at"] and value["published_at"] <= now:
            manifests.append(SimpleNamespace(**value))
    observations = [SimpleNamespace(**{**raw,"observed_at":_time(raw["observed_at"])}) for raw in export.get("price_publication_observations", [])
        if _time(raw.get("observed_at")) and _time(raw["observed_at"]) <= now]
    publications = [publication_evidence(manifest, observations) for manifest in manifests if manifest.state == "FINALIZED"]
    proven_publications = [row for row in publications if row.evidence_observed_at and row.evidence_observed_at <= now]
    is_open = resolve_market_status(now, settings) == MarketSessionStatus.OPEN
    candidates = [row for row in manifests if row.trade_date == now.date() and row.state in {"LIVE","FINALIZATION_PENDING"}] if is_open else []
    if not candidates:
        candidates = [row for row in manifests if row.state == "FINALIZED"]
    if not candidates:
        return {"construction_status": "QUOTE_GENERATION_UNAVAILABLE"}
    context = max(candidates, key=lambda row:(row.trade_date,row.published_at))
    coverage = export.get("source_coverage", {})
    journal = coverage.get("price_observations", {})
    journal_start = _time(journal.get("range_start")) if journal.get("complete") is True else None
    quote_rows = [row for row in export.get("quote_prices", []) if row["trade_date"] <= context.trade_date.isoformat()]
    revisions = [row for row in export.get("price_observations", []) if _time(row.get("observed_at")) and _time(row["observed_at"]) <= now]
    traded = set()
    for payload in quote_rows + [body for row in revisions for body in (row.get("payload"), row.get("previous_payload")) if body]:
        row = _row(payload)
        day = _day(row)
        if day and _valid(row) and _source_proven(row, day, now, now):
            traded.add(day)
    proto = next(iter(capture["input_payload"]["inputs"].values()))
    sessions = sorted({date.fromisoformat(day) for day in proto["exchange_session_dates"] if day <= now.date().isoformat()}
        | traded | {row.trade_date for row in proven_publications})
    ended = [day for day in sessions if day < now.date() or day == now.date() and now >= closing]
    completed = [day for day in ended if any(row.trade_date == day for row in proven_publications)]
    closing_day = context.trade_date if context.state == "FINALIZED" and context.trade_date == closing.date() and context.trade_date in completed else None
    ids = [row["stock"]["id"] for row in capture["result_payload"]["rows"]]
    input_coverage = verify_capture_coverage(capture["input_payload"], ids)["verified"]
    members = {}
    for raw in capture["result_payload"]["rows"]:
        stock_id = raw["stock"]["id"]
        price_rows = [row for row in quote_rows if row["stock_id"] == stock_id]
        members[stock_id] = {"input_hash": raw["decision"]["canonical"]["input_hash"], "prices": price_rows,
            "basis_evidence": exported_basis_evidence(export,stock_id=stock_id,reference_date=date.fromisoformat(capture.get("session_date") or raw["decision"]["canonical"]["as_of_date"]),assessed_at=now),
            "revisions": [row for row in revisions if (row.get("payload") or {}).get("stock_id") == stock_id],
            "quote": {"observation_status": "FINALIZED" if context.state == "FINALIZED" else "PROVISIONAL",
                "observation_session_date": context.trade_date.isoformat(), "max_age_seconds": settings.market_snapshot_interval_minutes*120}}
    return canonicalize_audit_value({"construction_status": "CONSTRUCTED_FROM_EXPORTED_SOURCE_TABLES", "assessed_at": now,
        "decision_generation_id": capture["generation_id"], "publication_observed_at": capture["observed_at"],
        "quote_generation_id": context.sync_id, "market_open": is_open, "session_open_at": opening, "session_close_at": closing,
        "recheck_at": recheck, "finalized_session_date": closing_day, "sessions": sessions, "ended_sessions": ended,
        "completed_sessions": completed, "price_publications": [asdict(row) for row in publications],
        "journal_started_at": journal_start,
        "calendar_authenticated": bool(input_coverage and coverage.get("market_generations", {}).get("complete") is True
            and journal.get("complete") is True and coverage.get("quote_prices", {}).get("complete") is True
            and coverage.get("price_publication_observations", {}).get("complete") is True),
        "source_coverage": coverage, "members": members})


def assess_bound_entry(*, capture, export, value, bundle, fallback_quote, assessment_diagnostics=None, entry_evidence=None):
    evidence = entry_evidence if entry_evidence is not None else evidence_for(capture, export)
    original_hash = capture["result_payload"]["rows"]
    original = next(row["decision"]["canonical"]["input_hash"] for row in original_hash if row["stock"]["id"] == str(value.stock_id))
    member = evidence.get("members", {}).get(str(value.stock_id), {})
    now = _time(evidence.get("assessed_at")) or _time(capture["observed_at"])
    published = _time(capture["observed_at"])
    bound = (evidence.get("decision_generation_id") == capture["generation_id"]
        and bool(evidence.get("quote_generation_id")) and member.get("input_hash") == original
        and _time(evidence.get("publication_observed_at")) == published
        and _time(evidence.get("assessed_at")) is not None)
    quote = fallback_quote
    kwargs = {}
    if assessment_diagnostics is not None:
        assessment_diagnostics.update(bound=bool(bound),coverage_verified=False)
    if bound:
        prices = []
        for payload in member.get("prices", []):
            row = dict(payload)
            row = {"previous_close_price": None, "price_change": None, "price_change_percent": None, "source": "CAPTURED_INPUT", **row}
            row["data_quality_flag"] = DataQualityFlag(row["data_quality_flag"])
            row["trade_date"] = date.fromisoformat(row["trade_date"])
            row["updated_at"] = _time(row.get("updated_at"))
            for key in ("source_observed_at", "batch_fetched_at"):
                row[key] = _time(row.get(key))
            prices.append(SimpleNamespace(**row))
        revisions = [SimpleNamespace(**{**row, "observed_at": _time(row.get("observed_at")),
            "session_date": date.fromisoformat(row["session_date"])}) for row in member.get("revisions", [])]
        publications = [SimpleNamespace(**{**row, "trade_date": date.fromisoformat(row["trade_date"]),
            "evidence_observed_at": _time(row.get("evidence_observed_at")), "source_last_synced_at": _time(row.get("source_last_synced_at"))})
            for row in evidence.get("price_publications", []) if row.get("sync_id") == evidence["quote_generation_id"] or row.get("price_versions")]
        projection = member.get("quote")
        if projection and prices:
            quote = DisplayQuoteRead(**build_quote_projection(prices,
                finality="FINALIZED" if projection.get("observation_status") == "FINALIZED" else "LIVE",
                session_date=date.fromisoformat(projection["observation_session_date"])),
                session_date_verified=evidence.get("calendar_authenticated") is True and projection["observation_session_date"] in evidence.get("sessions", []),
                max_age_seconds=projection.get("max_age_seconds", 1800))
            if quote.observation_status == "FINALIZED":
                current = next((row for row in prices if row.trade_date.isoformat() == quote.as_of_trade_date), None)
                authenticated = bool(current and any(pub.evidence_observed_at and pub.evidence_observed_at <= now
                    and pub.sync_id == evidence["quote_generation_id"] and pub.trade_date == current.trade_date
                    and current.updated_at and current.updated_at <= pub.source_last_synced_at
                    and any(published_price_matches(current, _row(item)) for item in pub.price_versions) for pub in publications))
                if not authenticated:
                    quote = quote.model_copy(update={"observation_status": "UNAVAILABLE"})
        sessions = tuple(date.fromisoformat(day) for day in evidence.get("sessions", []))
        completed = frozenset(date.fromisoformat(day) for day in evidence.get("completed_sessions", []))
        price_evidence = build_entry_price_evidence(prices=prices, revisions=revisions, publications=publications,
            assessed_at=now, stock_id=value.stock_id)
        basis=member.get("basis_evidence",{})
        basis_covered=basis.get("status")=="VERIFIED" and isinstance(basis.get("events"),list) and basis_coverage_verified(basis.get("coverage",{}),
            stock_id=value.stock_id,reference_date=value.as_of_date,assessed_at=now)
        event_rows=basis.get("events")
        basis_events=tuple(PriceBasisEvent(date.fromisoformat(item["effective_date"]),item["kind"],item.get("verified") is True) for item in (event_rows if isinstance(event_rows,list) else []))
        path = build_entry_path_facts(prices=prices, revisions=revisions, sessions=sessions, completed_sessions=completed,
            ended_sessions=frozenset(date.fromisoformat(day) for day in evidence.get("ended_sessions", [])),
            reference_date=value.as_of_date, published_at=published, journal_started_at=_time(evidence.get("journal_started_at")),
            plan=bundle.trade_plan, average_volume=bundle.snapshot.average_volume, assessed_at=now,basis_events=basis_events,
            price_publications=publications, price_evidence=price_evidence, authenticated_sessions=True, price_basis_v2=True)
        kwargs = {"path": path, "market_open": evidence.get("market_open") is True,
            "coverage_verified": evidence.get("calendar_authenticated") is True and bool(sessions) and basis_covered,
            "session_open_at": _time(evidence.get("session_open_at")), "session_close_at": _time(evidence.get("session_close_at")),
            "recheck_at": _time(evidence.get("recheck_at")), "session_settling": evidence.get("session_settling") is True,
            "finalized_session_date": date.fromisoformat(evidence["finalized_session_date"]) if evidence.get("finalized_session_date") else None}
        if assessment_diagnostics is not None:
            from dataclasses import asdict
            from app.core.audit_hashing import canonicalize_audit_value
            assessment_diagnostics.update(coverage_verified=kwargs["coverage_verified"],basis_evidence=canonicalize_audit_value(basis),
                path=canonicalize_audit_value(asdict(path)))
    return quote, evaluate_entry_applicability(decision=bundle.canonical_result, plan=bundle.trade_plan,
        eligibility=bundle.eligibility, quote=quote, reference_date=value.as_of_date, now=now,
        publication_observed_at=published, price_basis_v2=True,
        **({"market_open": False, "coverage_verified": False} if not bound else kwargs)), bound
