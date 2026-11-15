"""Offline paired-policy audit over the central engine and production serializers.

Never called by publication/replay paths. Original inputs are immutable; derived
identities and reconstructed market context are explicitly labelled.
"""
from collections import Counter
from dataclasses import asdict, replace
from datetime import date, datetime
from types import SimpleNamespace

from app.core.audit_hashing import canonicalize_audit_value, stable_audit_hash
from app.core.enums import MarketDataState
from app.modules.market_universe.market_universe_compute import canonical_analysis_to_read, technical_snapshot_to_read, project_scanner_rows
from app.modules.market_universe.market_universe_schemas import DisplayQuoteRead, ScoredUniverseRow, UniverseRowsMetaRead, UniverseRowsRead
from app.modules.market_universe.shortlist import apply_shortlist_ranks
from app.modules.stock_details.decision.engine import compute_trader_decision
from app.modules.stock_details.decision.entry_applicability import evaluate_entry_applicability
from app.modules.stock_details.decision.market_regime import compute_shadow_market_regime
from app.modules.stock_details.decision.measured_facts import build_measured_facts
from app.modules.stock_details.decision.policy import decision_policy
from app.modules.stock_details.decision.summary import build_trader_decision_summary
from app.modules.stock_details.decision.trade_plan import compute_trade_plan
from app.modules.stock_details.stock_details_schemas import EligibilityResultRead
from app.modules.trading_intelligence.input_capture import restore_strategy_input

AUDIT_VERSION = "paired-practicality-audit-v1"
ARMS = {"published": None, "v3": "trading-intelligence-v3", "c1": "trading-intelligence-v4",
    "market-only-v3": "trading-intelligence-v3-shadow-market", **{
        key: f"trading-intelligence-v4-shadow-{key}" for key in ("market", "risk", "rsi", "pullback", "ranking", "combined")}}


def arm_reconstruction_enabled(arm, requested):
    return bool(requested and arm not in {"published","v3"})


def market_context_selection(export,capture=None,*,publication_ids=()):
    from app.modules.trading_intelligence.practicality_operational import select_capture_vintages
    from app.modules.stock_details.decision.entry_path_evidence import _time
    from app.modules.stock_details.decision.market_regime import market_observation_valid
    own = (capture or {}).get("input_payload", {}).get("market_context")
    if own is not None:
        prior,excluded=select_capture_vintages([row for row in export.get("captures",[]) if row["session_date"]<capture["session_date"]],
            prefer_publication_ids=publication_ids,context_only=True,known_by=_time(capture["observed_at"]))
        owners=sorted([*prior,capture],key=lambda row:row["session_date"])
        rows=[]
        vintages=[]
        for owner in owners:
            raw=owner["input_payload"]["market_context"]
            valid=isinstance(raw,list) and all(market_observation_valid(row,require_revision=True)
                and row["generation_id"]==owner["generation_id"]
                and row["context_session_date"]==owner["session_date"] for row in raw)
            context=list(raw) if valid else []
            try:
                if not valid:
                    raise ValueError("Invalid producer observation before selection")
                context.sort(key=stable_audit_hash)
                context_hash=stable_audit_hash(context)
            except (TypeError,ValueError):
                # Invalid raw values cannot supply either facts or a canonical
                # value digest. The CLI retains the original export byte hash.
                context=[]
                context_hash=None
                excluded.append({"generation_id":owner["generation_id"],"reason":"INVALID_MARKET_CONTEXT_VALUES"})
            rows.extend(context)
            vintages.append({"session_date":owner["session_date"],"generation_id":owner["generation_id"],"observed_at":owner["observed_at"],"context_hash":context_hash})
        index = "DSEX" if any(row.get("index_name") == "DSEX" for row in rows) else "GENERAL"
        return {"rows":[row for row in rows if row.get("index_name", index)==index],
            "session_cutoffs":{row["session_date"]:row["observed_at"] for row in vintages},"vintages":vintages,"excluded":excluded}
    if export.get("market_context"):
        rows = export["market_context"]
        if not isinstance(rows,list) or not all(market_observation_valid(row) for row in rows):
            return {"rows":[],"session_cutoffs":{},"vintages":[],"excluded":[{"reason":"INVALID_MARKET_CONTEXT_VALUES"}]}
        index = "DSEX" if any(row.get("index_name") == "DSEX" for row in rows) else "GENERAL"
        return {"rows":[row for row in rows if row.get("index_name",index)==index],"session_cutoffs":{},"vintages":[],"excluded":[]}
    summaries = export.get("market_summaries", [])
    if not isinstance(summaries,list) or not all(isinstance(row,dict) for row in summaries):
        return {"rows":[],"session_cutoffs":{},"vintages":[],"excluded":[{"reason":"INVALID_MARKET_CONTEXT_VALUES"}]}
    rows=[{"session_date": row.get("trade_date"), "index_name":row.get("index_name"), "index_close": row.get("index_close"),"is_finalized":row.get("is_finalized"),
        "advancing": row.get("advancing_issues"), "declining": row.get("declining_issues"),
        "unchanged": row.get("unchanged_issues"),
        "authenticated": False, "source_record_id": row.get("id"),
        "source": row.get("source"), "database_updated_at": row.get("updated_at")}
        for row in summaries]
    if not all(market_observation_valid(row) for row in rows):
        return {"rows":[],"session_cutoffs":{},"vintages":[],"excluded":[{"reason":"INVALID_MARKET_CONTEXT_VALUES"}]}
    index = "DSEX" if any(row.get("index_name") == "DSEX" for row in rows) else "GENERAL"
    rows=[row for row in rows if row.get("index_name")==index]
    return {"rows":rows,"session_cutoffs":{},"vintages":[],"excluded":[]}


def market_context_rows(export,capture=None):
    return market_context_selection(export,capture)["rows"]


def _known_market_session_dates(capture, context_selection, *, known_by):
    """Positive observations can contradict a calendar, never complete it."""
    from app.modules.stock_details.decision.entry_path_evidence import _time
    from app.modules.stock_details.decision.market_regime import market_context_day, market_observation_valid, select_market_session_observation
    positive = set()
    owner_known = _time(capture.get("observed_at"))
    if owner_known and known_by and owner_known <= known_by:
        for payload in capture["input_payload"].get("inputs", {}).values():
            days = payload.get("exchange_session_dates", ()) if isinstance(payload, dict) else ()
            if isinstance(days, (list, tuple)):
                positive.update(day for value in days if (day := market_context_day(value)) is not None)
        marker = capture["input_payload"].get("market_calendar")
        if (isinstance(marker, dict) and marker.get("complete") is False
            and marker.get("status") == "INDEPENDENT_CALENDAR_COVERAGE_UNAVAILABLE"
            and marker.get("source") == "OBSERVED_PRICE_DATES_ONLY_NOT_A_COMPLETE_EXCHANGE_CALENDAR"
            and marker.get("generation_id", capture["generation_id"]) == capture["generation_id"]
            and marker.get("context_session_date", capture["session_date"]) == capture["session_date"]
            and ("known_at" not in marker or _time(marker["known_at"]) is not None and _time(marker["known_at"]) <= known_by)):
            days = marker.get("observed_session_dates", ())
            if isinstance(days, (list, tuple)):
                positive.update(day for value in days if (day := market_context_day(value)) is not None)
    vintages = {(item["generation_id"], item["session_date"]): _time(item["observed_at"])
        for item in context_selection["vintages"] if item.get("context_hash")}
    for row in context_selection["rows"]:
        if not market_observation_valid(row, require_revision=True) or row.get("index_name") != "DSEX":
            continue
        cutoff = vintages.get((row["generation_id"], row["context_session_date"]))
        if (cutoff and known_by and cutoff <= known_by and row.get("index_close") is not None and row["index_close"] > 0
            and select_market_session_observation([row], cutoff=cutoff, require_trusted=True) is not None):
            positive.add(market_context_day(row["session_date"]))
    return positive


def select_market_calendar(capture, export, *, as_of, known_by, context_selection):
    """Use a verified owning/supplemental source, never a truthy placeholder."""
    from app.modules.stock_details.decision.entry_path_evidence import _time
    from app.modules.stock_details.decision.market_regime import market_context_day
    supplements = export.get("market_calendars_by_generation", {})
    sources = [("CAPTURED", capture["input_payload"].get("market_calendar")),
        ("GENERATION_SUPPLEMENT", supplements.get(capture["generation_id"]) if isinstance(supplements, dict) else None)]
    positive = _known_market_session_dates(capture, context_selection, known_by=known_by)
    accepted = []
    for source, raw in sources:
        if not isinstance(raw, dict) or raw.get("complete") is not True and raw.get("status") != "VERIFIED_EXCHANGE_SESSION_CALENDAR":
            continue
        sessions = raw.get("sessions")
        days = [market_context_day(day) for day in sessions] if isinstance(sessions, list) else []
        start, end = market_context_day(raw.get("range_start")), market_context_day(raw.get("range_end"))
        known = _time(raw.get("known_at"))
        if (raw.get("complete") is not True or raw.get("status") != "VERIFIED_EXCHANGE_SESSION_CALENDAR"
            or not isinstance(raw.get("source_revision"), str) or not raw["source_revision"].strip()
            or raw.get("generation_id", capture["generation_id"] if source == "CAPTURED" else None) != capture["generation_id"]
            or known is None or known_by is None or known > known_by or not days or any(day is None for day in days)
            or len(set(days)) != len(days) or start is None or end is None or start > end):
            return {"calendar": {}, "status": "INVALID_CLAIMED_CALENDAR", "source": source}
        days = sorted(days)
        required = [day for day in days if day <= as_of][-51:]
        if (len(required) != 51 or required[-1] != as_of or start > required[0] or end < as_of
            or days[0] < start or days[-1] > end):
            return {"calendar": {}, "status": "INCOMPLETE_CALENDAR_RANGE", "source": source}
        contradictions = sorted(day.isoformat() for day in positive if required[0] <= day <= as_of and day not in days)
        if contradictions:
            return {"calendar": {}, "status": "CONTRADICTED_BY_KNOWN_SESSION", "source": source, "contradicting_sessions": contradictions}
        accepted.append((source, {**raw, "sessions": [day.isoformat() for day in days]}, tuple(required)))
    if not accepted:
        return {"calendar": {}, "status": "VERIFIED_CALENDAR_UNAVAILABLE", "source": None}
    if any(item[2] != accepted[0][2] for item in accepted[1:]):
        return {"calendar": {}, "status": "CONFLICTING_VERIFIED_CALENDARS", "source": None}
    return {"calendar": accepted[0][1], "status": "VERIFIED", "source": accepted[0][0]}


def plan_diagnostics(bundle, value):
    policy = decision_policy(value.strategy_version)
    # Same builder, geometry before market veto and action alignment.
    raw = compute_trade_plan(bundle.snapshot, opportunity_quality=bundle.opportunity_quality.quality,
        corrections=policy.corrections, pullback_confirmation=policy.pullback, preserve_rejected_levels=True)
    nearest = compute_trade_plan(bundle.snapshot, opportunity_quality=bundle.opportunity_quality.quality,
        corrections=policy.corrections, pullback_confirmation=policy.pullback, target_discount=1.0, preserve_rejected_levels=True)
    plan = bundle.proposed_trade_plan
    width = ((raw.entry_zone_high - raw.stop_loss) / raw.entry_zone_high * 100
        if raw.entry_zone_high and raw.stop_loss else None)
    obstacle = bundle.snapshot.resistance
    from app.modules.stock_details.decision.technical import is_valid_ohlc_row, resolve_levels
    level_rows = [row for row in value.prices[-90:] if is_valid_ohlc_row(row)]
    levels = resolve_levels(level_rows, bundle.snapshot.latest_price)
    undiscounted = ((obstacle - raw.entry_zone_high) / (raw.entry_zone_high - raw.stop_loss)
        if obstacle and raw.entry_zone_high and raw.stop_loss and raw.stop_loss < raw.entry_zone_high < obstacle else None)
    return {"raw": asdict(raw), "proposed": asdict(plan), "aligned": asdict(bundle.trade_plan),
        "raw_first_failure": raw.reasons[0] if raw.reasons else "PASS",
        "raw_overlapping_failures": list(raw.reasons), "stop_width_percent": width,
        "support": bundle.snapshot.support, "nearest_overhead": obstacle,
        "level_provenance": {"support_source": levels.support_source, "resistance_source": levels.resistance_source,
            "support_age_sessions": levels.support_age_sessions, "resistance_age_sessions": levels.resistance_age_sessions,
            "price_basis": bundle.snapshot.analytical_price_basis},
        "target_discount": 0.97 if raw.entry_timing in {"READY", "PULLBACK"} else None,
        "rr_at_nearest_resistance": undiscounted,
        "nearest_resistance_comparison": asdict(nearest),
        "discount_only_failure": bool(raw.entry_timing in {"READY", "PULLBACK"}
            and raw.status != "VALID_ENTRY_PLAN" and nearest.status == "VALID_ENTRY_PLAN"),
        "relevant_subset": bool(bundle.eligibility.status == "ELIGIBLE" and bundle.liquidity.label in {"NORMAL", "STRONG"}
            and bundle.directional_evidence.direction == "BULLISH" and bundle.opportunity_quality.quality == "STRONG")}


def _quote_for(value, export, source_row):
    rows = [row for row in export.get("quote_prices", []) if row["stock_id"] == str(value.stock_id)
        and row["trade_date"] <= value.as_of_date.isoformat()]
    if rows:
        row = max(rows, key=lambda item: item["trade_date"])
        return DisplayQuoteRead(current_price=float(row["close_price"]), as_of_trade_date=row["trade_date"],
            observation_session_date=row["trade_date"], observation_status="UNAVAILABLE",
            source_observed_at=row.get("source_observed_at"), batch_fetched_at=row.get("batch_fetched_at"),
            volume=row.get("volume"), source=row.get("source"), data_quality=row.get("data_quality_flag"),
            price_change=row.get("price_change"), price_change_percent=row.get("price_change_percent"))
    old = source_row.get("display_quote")
    if old:
        return DisplayQuoteRead.model_validate(old).model_copy(update={"observation_status": "UNAVAILABLE"})
    bar = value.prices[-1]
    return DisplayQuoteRead(current_price=float(bar.close_price), as_of_trade_date=bar.trade_date.isoformat(), observation_status="UNAVAILABLE")


def audit_capture(capture, export, arm, *, reconstructed_market=False, selected_subset=False, market_publication_ids=()):
    reconstructed_market=arm_reconstruction_enabled(arm,reconstructed_market)
    if capture.get("invalidated_at"):
        raise ValueError("Withdrawn capture cannot supply a current policy comparison")
    inputs = capture["input_payload"].get("inputs", {})
    raw_rows = capture["result_payload"].get("rows", [])
    source_rows = {row["stock"]["id"]: row for row in raw_rows}
    from app.modules.trading_intelligence.capture_inventory import verify_capture_coverage
    coverage = verify_capture_coverage(capture["input_payload"], list(source_rows))
    if set(inputs) != set(source_rows) or not inputs or len(raw_rows) != len(source_rows) or (not selected_subset and not coverage["verified"]):
        raise ValueError("Complete input/result membership required; metadata-only exports are unavailable")
    if not selected_subset:
        from app.modules.market_universe.market_universe_lineage import compute_universe_payload_revision
        if capture["result_payload"].get("payload_revision") != compute_universe_payload_revision([ScoredUniverseRow.model_validate(row) for row in raw_rows]):
            raise ValueError("Published result digest does not match its immutable rows")
    selection=market_context_selection(export,capture,publication_ids=market_publication_ids)
    context=selection["rows"]
    if not reconstructed_market and capture["input_payload"].get("market_context") is None:
        context=[] # Later exports are not owning market inputs in strict mode.
    rows, details, diagnostics, parity, pulses = [], {}, {}, {}, []
    bound_count = 0
    version = ARMS[arm]
    from app.modules.trading_intelligence.practicality_entry_evidence import evidence_for, assess_bound_entry,entry_source_hash
    source_hash=entry_source_hash(export)
    entry_evidence = evidence_for(capture, export,source_hash=source_hash)
    observed = datetime.fromisoformat(capture["observed_at"])
    prototype = restore_strategy_input(next(iter(inputs.values())))
    calendar_selection = select_market_calendar(capture, export, as_of=prototype.as_of_date, known_by=observed, context_selection=selection)
    calendar = calendar_selection["calendar"]
    generation = "COUNTERFACTUAL-" + stable_audit_hash({"audit": AUDIT_VERSION, "generation": capture["generation_id"],
        "inputs": inputs, "context": context, "entry_evidence": entry_evidence,
        "market_calendar": calendar, "entry_source_hash": source_hash,
        "market_context_vintages":selection["vintages"],
        "audit_source_hash": export.get("_audit_source_hash"),
        "arm": arm, "reconstructed_market": reconstructed_market})[:24]
    expected_market_sessions = prototype.exchange_session_dates if reconstructed_market else calendar.get("sessions", ())
    cutoffs=selection["session_cutoffs"]
    market_regime = compute_shadow_market_regime(context, as_of=prototype.as_of_date,
        allow_reconstructed=reconstructed_market, expected_sessions=expected_market_sessions,
        selection_at=observed, session_cutoffs=cutoffs)
    from app.modules.stock_details.decision.market_regime import resolve_regime_result_from_summaries,resolve_market_observation_sessions
    current_rows = [row for row in context if row.get("context_session_date") in {None, capture["session_date"]}]
    resolved_rows=resolve_market_observation_sessions(current_rows,as_of=prototype.as_of_date,cutoff=observed,require_trusted=not reconstructed_market)
    required_rows=resolved_rows or []
    trusted_c1=bool(len(required_rows)==51 and "unchanged" in required_rows[-1])
    summary_rows = [SimpleNamespace(trade_date=date.fromisoformat(row["session_date"]), index_name=row.get("index_name", "DSEX"),
        index_close=row.get("index_close"), advancing_issues=row.get("advancing"), declining_issues=row.get("declining"),unchanged_issues=row.get("unchanged"),
        is_finalized=row.get("is_finalized")) for row in (required_rows if reconstructed_market or trusted_c1 else [])]
    correction_regime = resolve_regime_result_from_summaries(summary_rows, decision_session_date=prototype.as_of_date,
        allow_reconstructed=reconstructed_market,exchange_session_dates=prototype.exchange_session_dates)
    if not reconstructed_market and (not trusted_c1 or correction_regime.required_inputs_complete is not True):
        from app.core.enums import MarketRegimePhase
        from app.modules.stock_details.decision.market_regime import MarketRegimeResult
        correction_regime=MarketRegimeResult(50,"NEUTRAL",MarketRegimePhase.HEALTHY,0,
            "Required then-known market evidence is unavailable.","UNKNOWN",None,False)
    for stock_id, payload in sorted(inputs.items()):
        original = restore_strategy_input(payload)
        source = source_rows[stock_id]
        from app.modules.stock_details.decision.lineage import build_decision_input_lineage
        from app.core.constants.trading_constants import production_version_pair
        owner = source["decision"]["canonical"]
        if (original.strategy_version != owner["strategy_version"] or not production_version_pair(owner["strategy_version"], owner["threshold_version"])
            or build_decision_input_lineage(original).input_hash != owner["input_hash"]):
            raise ValueError(f"Source owning policy/input identity mismatch for {stock_id}")
        value = replace(original, strategy_version=version or original.strategy_version)
        if decision_policy(value.strategy_version).market:
            value = replace(value, market_regime=market_regime)
        elif arm != "published" and decision_policy(value.strategy_version).corrections:
            # A supported immutable owning C1 input is already its as-published
            # regime evidence. Later exports cannot silently correct that input.
            owning_c1=original.strategy_version=="trading-intelligence-v4" and owner.get("input_schema_version")=="trading-input-v4"
            value = replace(value, market_regime=original.market_regime if owning_c1 else correction_regime)
        bundle = compute_trader_decision(value)
        if bundle is None:
            raise ValueError(f"No engine result for captured member {stock_id}")
        row = ScoredUniverseRow.model_validate(source)
        analysis = canonical_analysis_to_read(bundle)
        eligibility = EligibilityResultRead.model_validate(canonicalize_audit_value(asdict(bundle.eligibility)))
        quote = _quote_for(value, export, source)
        decision = build_trader_decision_summary(bundle)
        assessment_facts={}
        quote, assessment, evidence_bound = assess_bound_entry(capture=capture, export=export, value=value, bundle=bundle, fallback_quote=quote,assessment_diagnostics=assessment_facts,entry_evidence=entry_evidence)
        bound_count += int(evidence_bound)
        row = row.model_copy(update={"decision": decision.model_copy(update={"entry_applicability": assessment}),
            "technical_snapshot": technical_snapshot_to_read(bundle.snapshot), "analysis": analysis,
            "eligibility": eligibility, "display_quote": quote, "entry_applicability": assessment})
        row = row.model_copy(update={"measured_facts": build_measured_facts(row)})
        rows.append(row)
        canonical = canonicalize_audit_value(asdict(bundle.canonical_result))
        expected = source["decision"].get("canonical", {})
        parity[stock_id] = {key: {"published": expected.get(key), "restored": canonical.get(key)}
            for key in ("input_hash", "shared_decision_id", "recommendation", "opportunity_score", "primary_reason_code", "risk_label", "trade_plan_status")
            if expected.get(key) != canonical.get(key)}
        diagnostics[stock_id] = {"symbol": value.symbol, "canonical": canonical,
            "source_input_hash": expected.get("input_hash"), "source_payload_hash": stable_audit_hash(payload),
            "market_permission": bundle.canonical_result.regime_permission, "regime": asdict(value.market_regime),
            "plan": plan_diagnostics(bundle, value), "assessment": assessment.model_dump(mode="json")}
        diagnostics[stock_id]["entry_evidence"]=assessment_facts
        diagnostics[stock_id]["policy_facts"]={"strategy_version":value.strategy_version,
            "enabled":asdict(decision_policy(value.strategy_version)),"risk_exception_applied":bundle.risk_exception_applied}
        details[value.symbol] = build_workspace_fixture(row, bundle, value, generation)
        from app.modules.market_pulse.market_pulse_service import PulsePresentationRow, is_eligible_pulse_candidate
        from app.modules.market_pulse.pulse_score import compute_pulse_score, derive_pulse_focus_label
        score = compute_pulse_score(bundle.snapshot, row.decision)
        if is_eligible_pulse_candidate(row, value.as_of_date):
            pulses.append(PulsePresentationRow(stock=row.stock, snapshot=bundle.snapshot, decision=row.decision,
                score=score, label=derive_pulse_focus_label(bundle.snapshot, row.decision, score)))
    ranking = "entry-shortlist-v1" if (arm == "published" and original.strategy_version in {"trading-intelligence-v2","trading-intelligence-v3"}) or arm in {"v3", "market-only-v3"} else (
        "entry-shortlist-v3-shadow-quality" if decision_policy(version or original.strategy_version).ranking else "entry-shortlist-v2-permission")
    rows = apply_shortlist_ranks(project_scanner_rows(rows), version=ranking)
    for row in rows:
        diagnostics[str(row.stock.id)]["ranks"] = row.shortlist.model_dump(mode="json")
    meta = UniverseRowsMetaRead(exchange="DSE", listed_stock_count=len(rows), session_trade_date=capture["session_date"],
        decision_session_date=capture["session_date"], source_last_synced_at=observed, market_sync_id=generation,
        data_state=MarketDataState.FINALIZED, decision_generation_id=generation, quote_generation_id=generation,
        strategy_version=version or original.strategy_version, threshold_version=bundle.canonical_result.threshold_version,
        input_schema_version=bundle.canonical_result.input_schema_version,
        payload_revision=stable_audit_hash(diagnostics))
    from app.modules.signals.signals_schemas import StockTraderDecisionRead
    signals = [StockTraderDecisionRead(stock=row.stock, decision=row.decision, latest_trade_date=row.session.latest_trade_date,
        shortlist=row.shortlist, decision_generation_id=generation).model_dump(mode="json") for row in rows]
    from app.modules.market_pulse.market_pulse_service import _diversify_focus_list, _to_focus_stock_read, _select_monitor_rows
    from app.modules.market_pulse.pulse_score import meets_focus_threshold
    selected = _diversify_focus_list([row for row in pulses if meets_focus_threshold(row.score.total)])
    monitor = _select_monitor_rows(pulses, selected)
    return {"manifest": {"audit_version": AUDIT_VERSION, "arm": arm, "source_generation": capture["generation_id"],
        "derived_generation": generation, "source_observed_at": capture["observed_at"],
        "evidence_class": "RESTORATION" if arm == "published" else "RECONSTRUCTED_COUNTERFACTUAL" if reconstructed_market else "COUNTERFACTUAL",
        "market_context_hash": stable_audit_hash(context), "membership": sorted(inputs), "ranking_version": ranking,
        "market_context_vintages":selection["vintages"],"excluded_market_vintages":selection["excluded"],
        "market_calendar_selection": {key:value for key,value in calendar_selection.items() if key != "calendar"},
        "source_input_hash": stable_audit_hash(inputs), "coverage": coverage,
        "source_verification": "SELECTED_SUBSET_ONLY" if selected_subset else "OWNING_HASH_AND_WIRE_DIGEST_VERIFIED",
        "entry_evidence_hash": stable_audit_hash(entry_evidence), "entry_evidence": entry_evidence.get("construction_status") or "EXPLICIT_BOUND_EVIDENCE",
        "entry_evidence_bound_members": bound_count,
        "shadow_active": False},
        "universe": UniverseRowsRead(meta=meta, rows=rows).model_dump(mode="json"), "details": details,
        "signals": signals, "pulse_focus": [_to_focus_stock_read(item, index+1).model_dump(mode="json") for index,item in enumerate(selected)],
        "pulse_monitor": [_to_focus_stock_read(item, index+1).model_dump(mode="json") for index,item in enumerate(monitor)],
        "diagnostics": canonicalize_audit_value(diagnostics), "parity_differences": parity,
        "funnel": summarize_funnel(diagnostics)}


def summarize_funnel(diagnostics):
    items = list(diagnostics.values())
    return {"population": len(items), "actions": dict(Counter(row["canonical"]["display_action"] for row in items)),
        "primary_reasons_exclusive": dict(Counter(row["canonical"]["primary_reason_code"] for row in items)),
        "blockers_overlapping": dict(Counter(code for row in items for code in row["canonical"]["blocker_codes"])),
        "raw_first_failure_exclusive": dict(Counter(row["plan"]["raw_first_failure"] for row in items)),
        "raw_failures_overlapping": dict(Counter(code for row in items for code in row["plan"]["raw_overlapping_failures"])),
        "relevant_subset_population": sum(row["plan"]["relevant_subset"] for row in items),
        "relevant_subset_raw_first_failure": dict(Counter(row["plan"]["raw_first_failure"] for row in items if row["plan"]["relevant_subset"])),
        "discount_only_failures": sum(row["plan"]["discount_only_failure"] for row in items),
        "parity_note": "Restoration parity applies only to the published arm; other arms deliberately change policy."}


def build_workspace_fixture(row, bundle, value, generation):
    from app.models import Stock
    from app.modules.stock_details.decision.breakout import analyze_breakout
    from app.modules.stock_details.decision.trade_plan import compute_price_position
    from app.modules.stock_details.stock_details_schemas import StockDecisionSupportRead, trader_decision_from_summary
    from app.modules.stock_details.stock_details_workspace_schemas import DisplayMetricsRead, StockWorkspaceRead
    stock = Stock(**row.stock.model_dump())
    support = StockDecisionSupportRead.from_context(stock=stock, snapshot=bundle.snapshot, decision=bundle.decision,
        opportunity=bundle.opportunity, risk=bundle.risk, price_position=compute_price_position(bundle.snapshot),
        trade_plan=bundle.trade_plan, liquidity=bundle.liquidity, warnings=[], patterns=[],
        breakout=analyze_breakout(bundle.snapshot, []), ownership=None, valuation=None, events=[],
        is_stale=bundle.is_stale, is_sparse=bundle.is_sparse, missing_fields=[], confidence=bundle.confidence,
        eligibility=bundle.eligibility, directional_evidence=bundle.directional_evidence, data_reliability=bundle.data_reliability,
        trading_risk=bundle.trading_risk, canonical_result=bundle.canonical_result, decision_session_date=value.as_of_date,
        market_sync_id=generation)
    support = support.model_copy(update={"entry_applicability": row.entry_applicability, "measured_facts": row.measured_facts,
        "decision_generation_id": generation, "quote_generation_id": generation,
        "decision": trader_decision_from_summary(row.decision).model_copy(update={"entry_applicability": row.entry_applicability})})
    # No fabricated fundamentals, account values or executable quote authority.
    quote = DisplayMetricsRead.model_validate(row.display_quote.model_dump())
    return StockWorkspaceRead(stock=row.stock, prices=[], latest_trade_date=value.as_of_date.isoformat(),
        decision_support=support, display_metrics=quote, market_sync_id=generation,
        quote_generation_id=generation, decision_generation_id=generation, data_state=MarketDataState.FINALIZED).model_dump(mode="json")
