"""One corporate/ex-dividend price-basis projection for live and offline paths."""
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation

from app.modules.stock_details.decision.entry_applicability import PriceBasisEvent
from app.modules.stock_details.decision.entry_path_evidence import _time


def _value(row,key,default=None):
    return row.get(key,default) if isinstance(row,dict) else getattr(row,key,default)


def _day(value):
    try:
        return date.fromisoformat(value) if isinstance(value,str) else value if type(value) is date else None
    except ValueError:
        return None


@dataclass(frozen=True)
class BasisEventProjection:
    events: dict
    complete: bool


def project_entry_basis_events(corporate_actions,dividend_events,*,end_date,known_by=None):
    """Current DB rows retain live semantics; offline rows also require knowledge.

    Missing/future knowledge yields an uncertain event, never a verified absence.
    Coverage of an empty source is separately owned by the caller/export.
    """
    result={};complete=True
    def add(row,day,kind):
        nonlocal complete
        if day is None:
            complete=False
            return
        if day>end_date:
            return
        known=_time(_value(row,"revision_observed_at") or _value(row,"known_at"))
        verified=_value(row,"verified",True) is True and (known_by is None or known is not None and known<=known_by)
        complete=complete and verified
        result.setdefault(_value(row,"stock_id"),[]).append(PriceBasisEvent(day,kind,verified))
    for row in corporate_actions:
        kind=_value(row,"action_subtype")
        if kind in {"SPLIT","BONUS","RIGHTS","MERGER"}:
            add(row,_day(_value(row,"effective_date")),kind)
    for row in dividend_events:
        if _value(row,"status") not in {"APPROVED","PAID"}:
            continue
        try:
            amounts=[Decimal(str(_value(row,key) or 0)) for key in ("stock_dividend_percent","cash_dividend_percent","cash_amount_per_share")]
            if any(not value.is_finite() for value in amounts):
                raise InvalidOperation
        except (InvalidOperation,ValueError):
            complete=False
            continue
        if any(value>0 for value in amounts):
            add(row,_day(_value(row,"ex_dividend_date")),"EX_DIVIDEND")
    return BasisEventProjection({key:tuple(sorted(events,key=lambda event:(event.effective_date,event.kind,event.verified))) for key,events in result.items()},complete)


def basis_coverage_verified(sources,*,stock_id,reference_date,assessed_at):
    """Validate receipts; payload presence is a separate raw/captured contract."""
    if not isinstance(sources,dict):
        return False
    for table in ("corporate_actions","dividend_events"):
        coverage=sources.get(table,{})
        if not isinstance(coverage,dict):
            return False
        known=_time(coverage.get("known_at"))
        first=_day(str(coverage.get("range_start",""))[:10]);last=_day(str(coverage.get("range_end",""))[:10])
        scope=coverage.get("scope")=="ALL_STOCKS" or str(stock_id) in (coverage.get("stock_ids") or [])
        if not (coverage.get("complete") is True and coverage.get("source_revision") and scope
            and known and known<=assessed_at and first and first<=reference_date and last and last>=assessed_at.date()):
            return False
    return True


def exported_basis_evidence(export,*,stock_id,reference_date,assessed_at):
    """Raw exports require both explicit table arrays, even with complete receipts."""
    from dataclasses import asdict
    coverage=export.get("source_coverage")
    sources={table:coverage.get(table,{}) for table in ("corporate_actions","dividend_events")} if isinstance(coverage,dict) else {}
    covered=basis_coverage_verified(sources,stock_id=stock_id,reference_date=reference_date,assessed_at=assessed_at)
    rows={}
    for table in ("corporate_actions","dividend_events"):
        coverage=sources.get(table,{})
        coverage=coverage if isinstance(coverage,dict) else {}
        payload=export.get(table)
        present=isinstance(payload,list) and all(isinstance(row,dict) for row in payload)
        covered=covered and present
        # A table snapshot observed at its exported coverage clock proves only
        # that current revision's availability at that clock, not earlier PIT.
        rows[table]=[{**row,"known_at":row.get("known_at") or coverage.get("known_at")} for row in payload if str(row.get("stock_id"))==str(stock_id)] if present else []
    projection=project_entry_basis_events(rows["corporate_actions"],rows["dividend_events"],end_date=assessed_at.date(),known_by=assessed_at)
    return {"status":"VERIFIED" if covered and projection.complete else "UNKNOWN","coverage":sources,
        "events":[asdict(event) for event in projection.events.get(str(stock_id),())]}
