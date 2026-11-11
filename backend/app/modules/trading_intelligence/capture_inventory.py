"""Read-only publication coverage and matching-version parity diagnostics."""
from collections import Counter

from app.core.constants.trading_constants import SUPPORTED_TRADING_STRATEGY_VERSIONS, TRADING_STRATEGY_VERSION
from app.modules.stock_details.decision.engine import compute_trader_decision
from app.modules.stock_details.decision.lineage import build_decision_input_lineage
from app.modules.trading_intelligence.input_capture import restore_strategy_input


def verify_capture_coverage(facts, published):
    """Internal set equality alone never proves externally observed membership."""
    membership = facts.get("universe_membership") or []
    provenance = facts.get("membership_provenance") or {}
    inputs = facts.get("input_keys") or list((facts.get("inputs") or {}).keys())
    exclusions = facts.get("excluded_members") or []
    excluded = [str(item.get("stock_id")) for item in exclusions if item.get("reason_code")]
    listed, result, keys, omitted = set(membership), set(published), set(inputs), set(excluded)
    internal = bool(listed and result) and len(membership) == len(listed) and len(published) == len(result)
    internal = internal and result <= keys <= listed and not result & omitted and listed == result | omitted
    internal = internal and len(excluded) == len(omitted) == len(exclusions)
    independent = (provenance.get("status") == "OBSERVED_INDEPENDENT_LISTED_SET"
        and bool(provenance.get("observed_at")) and provenance.get("listed_count") == len(listed)
        and provenance.get("market_coverage_verified") is True)
    return {"verified": bool(internal and independent), "internal_reconciles": bool(internal),
            "status": "VERIFIED" if internal and independent else "UNKNOWN"}


def inspect_capture(capture, *, all_members=False):
    inputs = capture.input_payload.get("inputs", {})
    membership = capture.input_payload.get("universe_membership", [])
    rows = capture.result_payload.get("rows", [])
    published = [str(row["stock"]["id"]) for row in rows]
    version = capture.result_payload.get("strategy_version")
    row_map = {str(row["stock"]["id"]): row for row in rows}
    samples = list(row_map) if all_members else []
    if not all_members:
        for eligible in (True, False):
            example = next((key for key, row in row_map.items()
                if (row.get("eligibility", {}).get("status") == "ELIGIBLE") == eligible), None)
            if example:
                samples.append(example)
    parity = []
    for key in samples:
        row = row_map[key]
        expected = (row.get("decision") or {}).get("canonical") or {}
        differences = {}
        if version not in SUPPORTED_TRADING_STRATEGY_VERSIONS:
            parity.append({"stock_id": key, "status": "VERSION_UNAVAILABLE", "version": version})
            continue
        if key not in inputs:
            parity.append({"stock_id": key, "status": "INPUT_UNAVAILABLE"})
            continue
        try:
            value = restore_strategy_input({**inputs[key], "strategy_version": version})
            bundle = compute_trader_decision(value)
            result = bundle.canonical_result if bundle else None
            actual = {"input_hash": build_decision_input_lineage(value).input_hash,
                **({field: getattr(result, field) for field in (
                    "shared_decision_id", "display_action", "eligibility_status", "entry_readiness",
                )} if result else {})}
            for field, observed in actual.items():
                if observed != expected.get(field):
                    differences[field] = {"published": expected.get(field), "restored": observed}
            if bundle:
                plan = (row.get("analysis") or {}).get("trade_plan") or {}
                for field in ("entry_zone_low", "entry_zone_high", "invalidation_price", "target_low", "target_high", "trigger_price"):
                    actual_level = getattr(bundle.trade_plan, field)
                    if actual_level != plan.get(field):
                        differences[field] = {"published": plan.get(field), "restored": actual_level}
            parity.append({"stock_id": key, "status": "MATCH" if result and not differences else "MISMATCH", "differences": differences})
        except (ValueError, KeyError, TypeError) as exc:
            parity.append({"stock_id": key, "status": "RESTORE_FAILED", "detail": str(exc)})
    missing = sorted(set(membership) - set(inputs))
    excluded = sorted(set(membership) - set(published))
    coverage = verify_capture_coverage(capture.input_payload, published)
    return {
        "generation_id": capture.generation_id, "session_date": capture.session_date.isoformat(),
        "observed_at": capture.observed_at.isoformat(),
        "invalidated_at": capture.invalidated_at.isoformat() if capture.invalidated_at else None,
        "strategy_version": version,
        "calculation_times": sorted({item.get("calculated_at") for item in inputs.values() if item.get("calculated_at")}),
        "listed_count": len(membership), "unique_listed_count": len(set(membership)),
        "input_count": len(inputs), "published_count": len(published), "unique_published_count": len(set(published)),
        "missing_input_ids": missing, "excluded_ids": excluded,
        "unexpected_input_ids": sorted(set(inputs) - set(membership)),
        "unexpected_published_ids": sorted(set(published) - set(inputs)),
        "coverage_verified": coverage["verified"],
        "coverage_status": coverage["status"],
        "internal_membership_reconciles": coverage["internal_reconciles"],
        "explicit_exclusions": capture.input_payload.get("excluded_members", []),
        "actions": dict(Counter((row.get("decision") or {}).get("display_action", "UNAVAILABLE") for row in rows)),
        "blockers": dict(Counter(code for row in rows for code in (row.get("decision") or {}).get("blocker_codes", []))),
        "parity_scope": "ALL_PUBLISHED_MEMBERS" if all_members else "ELIGIBLE_AND_BLOCKED_EXAMPLES",
        "parity": parity,
    }


def capture_inventory(captures, *, expected_sessions=(), all_members=False):
    reports = [inspect_capture(capture, all_members=all_members) for capture in captures]
    observed = {capture.session_date for capture in captures if capture.invalidated_at is None}
    compatible = [capture for capture, report in zip(captures, reports, strict=True) if capture.result_payload.get("strategy_version") == TRADING_STRATEGY_VERSION and capture.invalidated_at is None and report["coverage_verified"]]
    first = min(compatible, key=lambda capture: capture.observed_at) if compatible else None
    return {
        "strategy_version": TRADING_STRATEGY_VERSION,
        "first_version_publication_observed_at": first.observed_at.isoformat() if first else None,
        "first_version_publication_generation_id": first.generation_id if first else None,
        "forward_evidence_status": "REQUIRES_TIMELY_FROZEN_DUAL_ARM_SELECTIONS",
        "missing_session_dates": sorted(day.isoformat() for day in set(expected_sessions) - observed),
        "captures": reports,
        "healthy": bool(reports) and not (set(expected_sessions) - observed) and all(item["coverage_verified"] and not item["invalidated_at"] and all(
            sample["status"] == "MATCH" for sample in item["parity"]
        ) and bool(item["parity"]) for item in reports),
    }
