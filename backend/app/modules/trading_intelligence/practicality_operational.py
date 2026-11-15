"""Fail-closed readiness for the separate twenty-session operational shadow.

This report neither records research receipts nor activates a strategy. Human
chart review and activation are explicit external decisions, never inferred.
"""
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from app.core.audit_hashing import stable_audit_hash
from app.modules.stock_details.decision.entry_path_evidence import _time
from app.modules.trading_intelligence.capture_inventory import verify_capture_coverage
from app.modules.stock_details.decision.entry_applicability import EntryApplicabilityRead, is_current_entry_trigger

REQUIRED_ARMS = ("c1", "market", "risk", "rsi", "pullback", "ranking", "combined")
CHART_STRATA = ("changed_permission", "unchanged_permitted", "high_risk_exception", "bearish_support_break",
    "missing_objective", "discount_only_geometry", "missing_market_or_quote_evidence")
EXCEPTION_ARMS={"high_risk_exception":("risk","combined"),"pullback_hold":("pullback","combined")}


def permitted_thesis(decision):
    return decision.get("non_holder_action")=="BUY"


def permission_changed(before,after):
    return permitted_thesis(before)!=permitted_thesis(after)


def _chart_sample_key(case):
    return (case["stock_id"],case["session_date"],case["source_generation"],case["source_input_hash"],case["permitted"],case["thesis_hash"])


def _distinct_chart_cases(cases):
    """One chart per unchanged economic thesis; retain all arm evidence separately."""
    grouped={}
    for case in cases:
        key=_chart_sample_key(case)
        grouped.setdefault(key,{**case,"strata":set()})["strata"].update(case["strata"])
    return {key:{**case,"strata":sorted(case["strata"])} for key,case in grouped.items()}


def _conditional_exception_exercised(record, arm):
    """Trust the central assessment's basis; exercise is neither a trigger nor a fill."""
    from app.modules.stock_details.decision.policy import decision_policy
    exception=record.get("exception");version=record.get("strategy_version")
    if arm not in EXCEPTION_ARMS.get(exception,()) or record.get("arm")!=arm or version!=f"trading-intelligence-v4-shadow-{arm}":
        return False
    assessment=record.get("assessment",{});binding=record.get("entry_binding",{});path=record.get("path",{})
    facts=record.get("central_policy_facts",{})
    try:
        typed_assessment=EntryApplicabilityRead.model_validate(assessment)
    except (ValueError,TypeError):
        return False
    if (assessment.get("status")!="APPLICABLE" or assessment.get("reason_code")!="ENTRY_TERMS_MET"
        or assessment.get("price_basis") not in {"CURRENT","SNAPSHOT","LAST_CLOSE"} or _time(assessment.get("assessed_at")) is None
        or typed_assessment.quote_session_date is None
        or binding.get("bound") is not True or binding.get("coverage_verified") is not True
        or path.get("complete") is not True or path!=binding.get("path") or path.get("basis_changed") is True
        or binding.get("basis_evidence",{}).get("status")!="VERIFIED" or facts.get("strategy_version")!=version):
        return False
    policy=decision_policy(version)
    if exception=="high_risk_exception":
        return policy.risk and facts.get("enabled",{}).get("risk") is True and facts.get("risk_exception_applied") is True and record.get("risk_label")=="HIGH"
    confirmed=path.get("confirmed_on")
    return bool(policy.pullback and facts.get("enabled",{}).get("pullback") is True and record.get("confirmation_rule")=="COMPLETED_PULLBACK_HOLD"
        and confirmed and confirmed in path.get("completed_sessions",[]) and record.get("reference_date","")<confirmed<str(assessment.get("quote_session_date") or ""))


def select_capture_vintages(captures, *, publication_ids=(), prefer_publication_ids=(), context_only=False, known_by=None):
    """Original non-withdrawn vintage per date, or explicit selected correction."""
    selected, excluded = {}, []
    explicit={}
    for row in captures:
        if row["generation_id"] in set(publication_ids)|set(prefer_publication_ids):
            explicit.setdefault(row["session_date"],set()).add(row["generation_id"])
    for capture in sorted(captures, key=lambda row: (row["session_date"], _time(row.get("observed_at")) or datetime.min.replace(tzinfo=UTC), row["generation_id"])):
        reason = "WITHDRAWN" if capture.get("invalidated_at") else None
        if publication_ids and capture["generation_id"] not in publication_ids:
            reason = "NOT_SELECTED_VINTAGE"
        if capture["session_date"] in explicit and (len(explicit[capture["session_date"]])!=1 or capture["generation_id"] not in explicit[capture["session_date"]]):
            reason=reason or "NOT_UNAMBIGUOUS_SELECTED_VINTAGE"
        observed=_time(capture.get("observed_at"))
        if observed is None or known_by is not None and observed>known_by:
            reason=reason or "UNKNOWN_OR_FUTURE_VINTAGE_CLOCK"
        if context_only and not capture.get("input_payload",{}).get("market_context"):
            reason=reason or "MARKET_CONTEXT_UNAVAILABLE"
        if not context_only and (not capture.get("input_payload", {}).get("inputs") or not capture.get("result_payload", {}).get("rows")):
            reason = reason or "METADATA_ONLY_EXPORT"
        if capture["session_date"] in selected:
            reason = reason or "NON_PRIMARY_VINTAGE_REQUIRES_EXPLICIT_SELECTION"
        if reason:
            excluded.append({"session_date": capture["session_date"], "generation_id": capture["generation_id"], "reason": reason})
        else:
            selected[capture["session_date"]] = capture
    return list(selected.values()), excluded


def run_guardrails(result):
    from app.modules.stock_details.decision.policy import decision_policy
    manifest=result["manifest"]
    arm=manifest["arm"]
    violations, unverified, exercises, chart_cases = [], [], [], []
    for stock_id,row in result["diagnostics"].items():
        canonical, plan, assessment = row["canonical"], row["plan"]["proposed"], row["assessment"]
        version=canonical["strategy_version"]
        policy=decision_policy(version)
        enabled=row.get("policy_facts",{})
        entry=row.get("entry_evidence",{})
        path=entry.get("path",{})
        permission = permitted_thesis(canonical)
        strata=[]
        if permission:
            strata.append("unchanged_permitted")
            if (canonical["eligibility_status"] != "ELIGIBLE" or canonical["risk_label"] == "SPECULATIVE"
                or plan["status"] != "VALID_ENTRY_PLAN" or (row["plan"]["stop_width_percent"] or 0) > 8
                or plan["management_mode"] != "TRAILING" and (plan["risk_reward_ratio"] is None or plan["risk_reward_ratio"] < 1.2)):
                violations.append({"symbol": row["symbol"], "code": "PERMISSION_SAFEGUARD_VIOLATION"})
            if assessment["status"] == "UNVERIFIED":
                unverified.append(row["symbol"])
            actual_risk=bool(policy.risk and enabled.get("strategy_version")==version and enabled.get("risk_exception_applied") is True and canonical["risk_label"]=="HIGH")
            if actual_risk:
                strata.append("high_risk_exception")
            for exception in EXCEPTION_ARMS:
                record={"contract":"CENTRAL_EXCEPTION_ENTRY_PROOF_V1","exception":exception,"arm":arm,"strategy_version":version,
                        "stock_id":stock_id,"symbol":row["symbol"],"source_generation":manifest["source_generation"],
                        "source_input_hash":row["source_input_hash"],"candidate_input_hash":canonical["input_hash"],"shared_decision_id":canonical["shared_decision_id"],
                        "assessment":assessment,"central_policy_facts":enabled,"path":path,"confirmation_rule":plan.get("confirmation_rule"),
                        "risk_label":canonical["risk_label"],"entry_binding":entry,"reference_date":canonical["as_of_date"],
                        "current_trigger":is_current_entry_trigger(EntryApplicabilityRead.model_validate(assessment))}
                if _conditional_exception_exercised(record,arm):
                    exercises.append({**record,"proof_hash":stable_audit_hash(record)})
        if assessment["status"] == "APPLICABLE" and assessment.get("price_basis") == "CURRENT" and not assessment.get("source_observed_at"):
            violations.append({"symbol": row["symbol"], "code": "CURRENT_WITHOUT_SOURCE_CLOCK"})
        if any(code in {"below_support","bearish_directional_evidence"} for code in [canonical.get("primary_reason_code"),*canonical.get("blocker_codes",[])]):
            strata.append("bearish_support_break")
        if "missing_resistance" in row["plan"].get("raw_overlapping_failures",[]):
            strata.append("missing_objective")
        if row["plan"].get("discount_only_failure"):
            strata.append("discount_only_geometry")
        if assessment["status"]=="UNVERIFIED" or canonical.get("regime_permission")=="UNKNOWN":
            strata.append("missing_market_or_quote_evidence")
        case={"session_date":canonical["as_of_date"],"arm":arm,"stock_id":stock_id,"symbol":row["symbol"],
            "permitted":permission,"strata":sorted(set(strata)),"source_generation":manifest["source_generation"],
            "known_at":manifest.get("source_observed_at",canonical["calculated_at"]),
            "source_input_hash":row["source_input_hash"],"shared_decision_id":canonical["shared_decision_id"]}
        case["candidate_input_hash"]=canonical["input_hash"]
        # Lineage/policy IDs differ even when a candidate changes no chart fact.
        lineage={"stock_id","exchange","strategy_version","threshold_version","action_taxonomy","decision_taxonomy_version",
            "as_of_date","previous_session_date","calculated_at","shared_decision_id","input_schema_version","data_revision",
            "event_revision","input_hash","replay_status","replay_limitations","result_semantics","primary_reason","entry_condition"}
        case["thesis_hash"]=stable_audit_hash({"decision":{key:value for key,value in canonical.items() if key not in lineage},
            "plan":{key:value for key,value in plan.items() if key not in {"explanation","condition_text"}}})
        chart_cases.append({**case,"case_hash":stable_audit_hash(case)})
    return {"hard_violations": violations, "unverified_permitted_quotes": unverified,
        "market_unknown": any(row["canonical"].get("regime_permission") == "UNKNOWN" for row in result["diagnostics"].values()),
        "exercised_exceptions": sorted({record["exception"] for record in exercises}),"exception_evidence":exercises,
        "current_trigger_exceptions": sorted({record["exception"] for record in exercises if record["current_trigger"]}),
        "chart_cases":chart_cases,"population":len(result["diagnostics"])}


def _weekly_review_failures(reviews,runs,window,known_by):
    """Review receipts bind actual dated chart cases, counts and distinct weeks."""
    def week(day):
        value=date.fromisoformat(day)
        return (value-timedelta(days=(value.weekday()+1)%7)).isoformat()
    expected={week(day) for day in window}
    records=reviews.get("weekly_reviews",[])
    if (not isinstance(reviews.get("operational_owner"),str) or not reviews["operational_owner"].strip() or not expected or not isinstance(records,list)
        or any(not isinstance(row,dict) for row in records)):
        return ["HUMAN_ROLE_AND_WEEKLY_CHART_REVIEW_PENDING"]
    weeks=[row.get("week_start") for row in records]
    receipts=[row.get("review_id") for row in records]
    if any(not isinstance(value,str) or not value.strip() for value in [*weeks,*receipts]):
        return ["DISTINCT_DATED_WEEKLY_REVIEW_RECEIPTS_REQUIRED"]
    if set(weeks)!=expected or len(set(weeks))!=len(weeks) or len(set(receipts))!=len(receipts) or any(not value for value in receipts):
        return ["DISTINCT_DATED_WEEKLY_REVIEW_RECEIPTS_REQUIRED"]
    inventory={}
    for run in runs:
        if run["session"] not in window or run["arm"] not in REQUIRED_ARMS:
            continue
        for case in run.get("guardrails",{}).get("chart_cases",[]):
            body={key:value for key,value in case.items() if key!="case_hash"}
            if (case.get("case_hash")==stable_audit_hash(body) and case.get("session_date")==run["session"] and case.get("arm")==run["arm"]
                and case.get("source_generation")==run.get("evidence",{}).get("source_generation")
                and case.get("stock_id") in run.get("evidence",{}).get("membership",[])
                and isinstance(case.get("thesis_hash"),str) and len(case["thesis_hash"])==64):
                inventory[case["case_hash"]]=case
    distinct=_distinct_chart_cases(inventory.values())
    failures=[]
    for record in records:
        current_week=record["week_start"]
        reviewed=_time(record.get("reviewed_at"))
        reviewed_day=reviewed.astimezone(ZoneInfo("Asia/Dhaka")).date() if reviewed else None
        last=max(day for day in window if week(day)==current_week)
        if (not record.get("reviewer") or record.get("signed_by")!=record.get("reviewer") or record.get("decision")!="SIGNED_ACCEPT"
            or reviewed is None or known_by is None or reviewed>known_by or reviewed_day.isoformat()<last
            or reviewed_day>=date.fromisoformat(current_week)+timedelta(days=7)):
            failures.append("DATED_WEEKLY_SIGNOFF_REQUIRED")
        selected=[];hashes=[]
        selected_items=record.get("cases",[])
        for item in selected_items if isinstance(selected_items,list) else []:
            case=inventory.get(item.get("case_hash")) if isinstance(item,dict) else None
            if not case or week(case["session_date"])!=current_week or any(item.get(key)!=case[key] for key in ("session_date","arm","stock_id")):
                failures.append("WEEKLY_SELECTED_CASE_EVIDENCE_INVALID")
                continue
            if reviewed is None or _time(case.get("known_at")) is None or _time(case["known_at"])>reviewed:
                failures.append("WEEKLY_CASE_NOT_YET_KNOWN_AT_SIGNOFF")
            selected.append(case);hashes.append(case["case_hash"])
        if len(hashes)!=len(set(hashes)):
            failures.append("DUPLICATED_WEEKLY_SELECTED_CASE")
        # Receipt references keep their arm identity, while counts/strata refer
        # to the paired comparison's distinct economic charts.
        selected=list({key:distinct[key] for case in selected for key in [_chart_sample_key(case)]}.values())
        if (any(type(record.get(key)) is not int or record[key]<0 for key in ("case_count","permitted_count","rejected_count"))
            or record.get("case_count")!=len(selected) or record.get("permitted_count")!=sum(case["permitted"] for case in selected)
            or record.get("rejected_count")!=sum(not case["permitted"] for case in selected) or not isinstance(record.get("shortfalls"),list)):
            failures.append("WEEKLY_COUNTS_OR_SHORTFALLS_REQUIRED")
        available=[case for case in distinct.values() if week(case["session_date"])==current_week]
        if not available or not selected:
            failures.append("WEEKLY_CHART_CASES_REQUIRED")
        shortfalls=record.get("shortfalls")
        for population,permitted in (("PERMITTED",True),("REJECTED",False)):
            total=sum(case["permitted"] is permitted for case in available)
            count=sum(case["permitted"] is permitted for case in selected)
            if count<min(10,total):
                failures.append("WEEKLY_TEN_OR_ALL_AVAILABLE_REQUIRED")
            if total<10 and not any(isinstance(item,dict) and item.get("population")==population
                and type(item.get("available_count")) is int and item["available_count"]==total
                and type(item.get("reviewed_count")) is int and item["reviewed_count"]==count
                and type(item.get("target_count")) is int and item["target_count"]==10
                and isinstance(item.get("reason"),str) and item["reason"].strip()
                for item in (shortfalls if isinstance(shortfalls,list) else [])):
                failures.append("WEEKLY_SAMPLE_COUNT_SHORTFALL_REQUIRED")
        for stratum in CHART_STRATA:
            coverage=record.get("coverage")
            proof=coverage.get(stratum,{}) if isinstance(coverage,dict) else {}
            proof=proof if isinstance(proof,dict) else {}
            total=sum(stratum in case["strata"] for case in available);count=sum(stratum in case["strata"] for case in selected)
            if any(type(proof.get(key)) is not int for key in ("available_count","reviewed_count")) or proof.get("available_count")!=total or proof.get("reviewed_count")!=count or (total>0 and count==0):
                failures.append("WEEKLY_STRATUM_COVERAGE_REQUIRED")
            shortfalls=record.get("shortfalls")
            if total==0 and not any(isinstance(item,dict) and item.get("stratum")==stratum and item.get("reason") for item in (shortfalls if isinstance(shortfalls,list) else [])):
                failures.append("WEEKLY_UNAVAILABLE_STRATUM_SHORTFALL_REQUIRED")
    return sorted(set(failures))


def _valid_exception_record(record,run,capture):
    arm=run["arm"];exception=record.get("exception")
    if arm not in EXCEPTION_ARMS.get(exception,()) or record.get("arm")!=arm or record.get("strategy_version")!=f"trading-intelligence-v4-shadow-{arm}":
        return False
    expected={row["stock"]["id"]:row.get("decision",{}).get("canonical",{}).get("input_hash") for row in capture["result_payload"]["rows"]}
    body={key:value for key,value in record.items() if key!="proof_hash"}
    if (record.get("contract")!="CENTRAL_EXCEPTION_ENTRY_PROOF_V1" or record.get("proof_hash")!=stable_audit_hash(body)
        or record.get("source_generation")!=capture["generation_id"] or record.get("stock_id") not in capture["input_payload"]["inputs"]
        or not expected.get(record.get("stock_id")) or record.get("source_input_hash")!=expected.get(record.get("stock_id"))):
        return False
    candidate=next((case for case in run.get("guardrails",{}).get("chart_cases",[]) if case.get("stock_id")==record.get("stock_id") and case.get("arm")==arm),{})
    if (candidate.get("permitted") is not True or candidate.get("candidate_input_hash")!=record.get("candidate_input_hash") or candidate.get("shared_decision_id")!=record.get("shared_decision_id")
        or record.get("reference_date")!=capture["session_date"] or not _conditional_exception_exercised(record,arm)):
        return False
    return record.get("current_trigger") is is_current_entry_trigger(EntryApplicabilityRead.model_validate(record["assessment"]))


def operational_readiness(captures, runs, *, freeze, calendar, freeze_manifest=None, human_reviews=None, as_of=None):
    failures = []
    supplied = calendar.get("sessions", []) if isinstance(calendar, dict) else []
    records = []
    for row in supplied if isinstance(supplied, list) else []:
        try:
            if not isinstance(row, dict) or date.fromisoformat(row["session_date"]).isoformat() != row["session_date"]:
                raise ValueError
            records.append(row)
        except (ValueError, KeyError, TypeError):
            failures.append("AUTHENTICATED_DISTINCT_EXCHANGE_CALENDAR_REQUIRED")
    raw_days = [row.get("session_date") for row in records]
    if (not isinstance(calendar, dict) or calendar.get("complete") is not True or not calendar.get("source_revision") or len(set(raw_days)) != len(raw_days)
        or any(row.get("authenticated") is not True or _time(row.get("next_open_at")) is None for row in records)):
        failures.append("AUTHENTICATED_DISTINCT_EXCHANGE_CALENDAR_REQUIRED")
    ordered_records = sorted(records, key=lambda row: row.get("session_date", ""))
    if any(_time(left.get("next_open_at")) and _time(left["next_open_at"]).date().isoformat() != right.get("session_date")
        for left,right in zip(ordered_records, ordered_records[1:])):
        failures.append("CONSECUTIVE_NEXT_OPEN_CALENDAR_MISMATCH")
    window = sorted(day for day in set(raw_days) if day and date.fromisoformat(day) >= freeze)[:20]
    if len(window) != 20:
        failures.append("FIRST_20_CONSECUTIVE_SESSIONS_NOT_ESTABLISHED")
    known_by = _time(as_of)
    if (calendar and isinstance(calendar, dict) and (calendar.get("range_start", "9999") > freeze.isoformat()
        or not window or calendar.get("range_end", "") < window[-1] or _time(calendar.get("known_at")) is None
        or known_by is None or _time(calendar["known_at"]) > known_by)):
        failures.append("COMPLETE_CALENDAR_RANGE_AND_KNOWLEDGE_REQUIRED")
    if known_by is None or window and date.fromisoformat(window[-1]) > known_by.date():
        failures.append("ELAPSED_OBSERVATION_WINDOW_NOT_ESTABLISHED")
    frozen = freeze_manifest or {}
    if (len(str(frozen.get("source_hash", ""))) != 64 or frozen.get("baseline") != "trading-intelligence-v4"
        or set(frozen.get("arms", [])) != set(REQUIRED_ARMS) or frozen.get("freeze_date") != freeze.isoformat()
        or _time(frozen.get("recorded_at")) is None or known_by is None or _time(frozen["recorded_at"]) > known_by):
        failures.append("FROZEN_PAIRED_POLICY_IDENTITY_REQUIRED")
    selected, exclusions = select_capture_vintages(captures)
    by_day = {row["session_date"]: row for row in selected}
    reports = {(row["session"], row["arm"]): row for row in runs}
    missing, unexplained, exceptions, current_exceptions, unverified_quotes = [], [], set(), set(), []
    for day in window:
        capture = by_day.get(day)
        if capture is None:
            missing.append(day)
            continue
        ids = [row["stock"]["id"] for row in capture["result_payload"].get("rows", [])]
        if not verify_capture_coverage(capture["input_payload"], ids)["verified"]:
            failures.append(f"{day}:MEMBERSHIP_OR_INPUT_COVERAGE_UNVERIFIED")
        if capture["result_payload"].get("strategy_version") != "trading-intelligence-v4":
            failures.append(f"{day}:OWNING_CORRECTION_BASELINE_REQUIRED")
        next_open = _time(next((row["next_open_at"] for row in records if row["session_date"] == day), None))
        observed = _time(capture["observed_at"])
        if not observed or not next_open or observed >= next_open:
            failures.append(f"{day}:LATE_OR_UNKNOWN_CAPTURE")
        if observed and (known_by is None or observed > known_by or _time(frozen.get("recorded_at")) is None or observed < _time(frozen["recorded_at"])):
            failures.append(f"{day}:OUTSIDE_FROZEN_KNOWLEDGE_WINDOW")
        baseline = reports.get((day, "c1"))
        for arm in REQUIRED_ARMS:
            run = reports.get((day, arm))
            if not run or not run.get("guardrails") or not run.get("evidence"):
                failures.append(f"{day}:{arm}:PAIRED_PROOF_ABSENT")
                continue
            guard, evidence = run["guardrails"], run["evidence"]
            if evidence.get("evidence_class") != "COUNTERFACTUAL" or evidence.get("source_generation") != capture["generation_id"]:
                failures.append(f"{day}:{arm}:PROVENANCE_OR_RECONSTRUCTION_MISMATCH")
            if (evidence.get("source_input_hash") != stable_audit_hash(capture["input_payload"]["inputs"])
                or evidence.get("membership") != sorted(ids)
                or evidence.get("source_verification") != "OWNING_HASH_AND_WIRE_DIGEST_VERIFIED"
                or len(evidence.get("output_hash", "")) != 64):
                failures.append(f"{day}:{arm}:VERIFIED_INPUT_OUTPUT_PROOF_REQUIRED")
            if evidence.get("freeze_source_hash") != frozen.get("source_hash"):
                failures.append(f"{day}:{arm}:SOURCE_CHANGED_AFTER_FREEZE")
            if baseline and (evidence.get("source_input_hash") != baseline.get("evidence", {}).get("source_input_hash")
                or evidence.get("membership") != baseline.get("evidence", {}).get("membership")):
                failures.append(f"{day}:{arm}:PAIRED_INPUT_MISMATCH")
            if guard["hard_violations"] or guard["market_unknown"]:
                failures.append(f"{day}:{arm}:SAFETY_OR_REQUIRED_EVIDENCE_SHORTFALL")
            if guard["unverified_permitted_quotes"]:
                unverified_quotes.append({"session":day,"arm":arm,"symbols":guard["unverified_permitted_quotes"]})
            if run.get("changed_actions_unattributed", True):
                unexplained.append(f"{day}:{arm}")
            for record in guard.get("exception_evidence",[]):
                if _valid_exception_record(record,run,capture):
                    exceptions.add((arm,record["exception"]))
                    if record["current_trigger"]:
                        current_exceptions.add((arm,record["exception"]))
                else:
                    failures.append(f"{day}:{arm}:EXCEPTION_EVIDENCE_INVALID")
    if missing:
        failures.append("MISSING_CAPTURE_SESSIONS")
    if unexplained:
        failures.append("CHANGED_ACTION_ATTRIBUTION_INCOMPLETE")
    missing_exercises=sorted((arm,exception) for exception,arms in EXCEPTION_ARMS.items() for arm in arms if (arm,exception) not in exceptions)
    unexercised=sorted({exception for _,exception in missing_exercises})
    if unexercised:
        failures.append("EXCEPTIONS_UNEXERCISED_RETAIN_IN_SHADOW")
    reviews = human_reviews or {}
    failures.extend(_weekly_review_failures(reviews,runs,window,known_by))
    return {"status": "NOT_READY" if failures else "READY_FOR_DAY_20_HUMAN_DECISION", "activation": "HUMAN_DECISION_REQUIRED",
        "freeze": freeze.isoformat(), "expected_first_20_sessions": window, "failures": sorted(set(failures)),
        "missing_capture_sessions": missing, "unattributed_pairs": unexplained, "unexercised_exceptions": unexercised,
        "unexercised_exception_arms":[{"arm":arm,"exception":exception} for arm,exception in missing_exercises],
        "current_trigger_exception_arms":[{"arm":arm,"exception":exception} for arm,exception in sorted(current_exceptions)],
        "unverified_permitted_quote_observations":unverified_quotes,
        "excluded_vintages": exclusions, "operational_role": reviews.get("operational_owner") or "Trading intelligence operations owner: human assignment pending",
        "weekly_chart_sampling_strata": list(CHART_STRATA), "prospective_evidence": "NO_ELAPSED_WINDOW_ASSUMED"}
