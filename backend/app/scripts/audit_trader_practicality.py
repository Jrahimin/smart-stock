"""Run offline: python -m app.scripts.audit_trader_practicality --export FILE --output DIR.

Only explicit counterfactual mode changes owning versions; strict captured replay
is untouched. Optional archive diagnostics retain the existing ten-session model.
"""
import argparse
from collections import Counter, defaultdict
from dataclasses import asdict
from datetime import date, datetime
import hashlib
import json
from pathlib import Path

from app.core.audit_hashing import canonicalize_audit_value, stable_audit_hash
from app.modules.trading_intelligence.practicality_audit import ARMS, audit_capture


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(canonicalize_audit_value(value), ensure_ascii=False, indent=2), encoding="utf8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--export", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--arms", default=",".join(ARMS))
    parser.add_argument("--reconstructed-market", action="store_true", help="Explicitly use unauthenticated summaries as reconstructed counterfactual inputs")
    parser.add_argument("--archive", type=Path)
    parser.add_argument("--archive-sessions", type=int, default=50)
    parser.add_argument("--shadow-freeze", type=date.fromisoformat)
    parser.add_argument("--publication-id", action="append", default=[])
    parser.add_argument("--simulation-now", type=datetime.fromisoformat, help="Aware real/controlled browser clock for separately labelled timing fixtures")
    parser.add_argument("--freeze-manifest", type=Path)
    parser.add_argument("--human-reviews", type=Path)
    parser.add_argument("--expected-sessions", type=Path, help="Authenticated complete exchange-calendar JSON object for the frozen 20-session window")
    args = parser.parse_args()
    export = json.loads(args.export.read_text(encoding="utf8"))
    arms = args.arms.split(",")
    if set(arms) - ARMS.keys():
        parser.error("Unknown frozen arm")
    if not arms or any(not arm for arm in arms) or len(set(arms)) != len(arms):
        parser.error("At least one distinct frozen arm is required")
    code_root = Path(__file__).resolve().parents[1]
    # Bind transitive publication/schedule/model/scanner helpers too. A hand-
    # selected engine list could change derived output without changing identity.
    source_paths = [path for path in code_root.rglob("*.py") if "tests" not in path.relative_to(code_root).parts]
    source_hashes = {str(path.relative_to(code_root)): hashlib.sha256(path.read_bytes()).hexdigest() for path in sorted(set(source_paths))}
    export["_audit_source_hash"] = stable_audit_hash(source_hashes)
    from app.modules.trading_intelligence.practicality_operational import select_capture_vintages, run_guardrails, operational_readiness
    captures, excluded = select_capture_vintages(export["captures"], publication_ids=args.publication_id)
    manifest = {"source_hashes": source_hashes, "export_sha256": hashlib.sha256(args.export.read_bytes()).hexdigest(),
        "export_time": export.get("exported_at"), "excluded_captures": excluded, "runs": []}
    run_decisions = {}
    for capture in captures:
        if not capture.get("input_payload", {}).get("inputs") or not capture.get("result_payload", {}).get("rows"):
            manifest["excluded_captures"].append({"generation_id": capture["generation_id"], "reason": "METADATA_ONLY_EXPORT"})
            continue
        for arm in arms:
            result = audit_capture(capture, export, arm, reconstructed_market=args.reconstructed_market,market_publication_ids=args.publication_id)
            folder = args.output / capture["session_date"] / arm
            for key in ("manifest", "universe", "diagnostics", "funnel", "parity_differences", "signals", "pulse_focus", "pulse_monitor"):
                write(folder / f"{key}.json", result[key])
            for symbol, workspace in result["details"].items():
                write(folder / "details" / f"{symbol}.json", workspace)
            from app.modules.market_universe.market_universe_schemas import UniverseRowsRead
            from app.modules.trading_intelligence.practicality_transitions import controlled_entry_transitions, controlled_fixture_payloads
            transitions = controlled_entry_transitions(UniverseRowsRead.model_validate(result["universe"]), simulation_now=args.simulation_now)
            write(folder / "controlled-transitions.json", transitions)
            if arm == "market":
                for name, fixture in controlled_fixture_payloads(result, transitions).items():
                    controlled_folder = args.output / capture["session_date"] / f"controlled-{name}"
                    for key in ("manifest", "universe", "freshness"):
                        write(controlled_folder / f"{key}.json", fixture[key])
                    write(controlled_folder / "details" / "BSRMSTEEL.json", fixture["details"])
            evidence = {**result["manifest"], "freeze_source_hash": export["_audit_source_hash"]}
            evidence["output_hash"] = stable_audit_hash(result["universe"])
            manifest["runs"].append({"session": capture["session_date"], "arm": arm, "funnel": result["funnel"],
                "evidence": evidence, "guardrails": run_guardrails(result),
                "members_with_parity_differences": sum(bool(value) for value in result["parity_differences"].values())})
            run_decisions[(capture["session_date"], arm)] = {key: value["canonical"] for key,value in result["diagnostics"].items()}
            print(capture["session_date"], arm, result["funnel"]["actions"], flush=True)
    # The eight Nov11 accepted members are a selected subset, never a full-generation denominator.
    selected = export.get("nov11_accepted_members", [])
    if selected:
        partial = {"generation_id": "NOV11_ACCEPTED_SUBSET", "session_date": "2026-11-11",
            "observed_at": selected[0]["input"]["calculated_at"], "input_payload": {"inputs": {row["input"]["stock_id"]: row["input"] for row in selected}},
            "result_payload": {"rows": [row["result"] for row in selected]}}
        result = audit_capture(partial, export, "published", selected_subset=True)
        write(args.output / "nov11-accepted-subset.json", {key: result[key] for key in ("manifest", "funnel", "parity_differences", "diagnostics")})
    if args.archive:
        manifest["archive"] = archive_audit(args.archive, args.output, args.archive_sessions, reconstructed_market=args.reconstructed_market)
    if args.shadow_freeze:
        expected = json.loads(args.expected_sessions.read_text(encoding="utf8")) if args.expected_sessions else []
        frozen = json.loads(args.freeze_manifest.read_text(encoding="utf8")) if args.freeze_manifest else None
        reviews = json.loads(args.human_reviews.read_text(encoding="utf8")) if args.human_reviews else None
    for run in manifest["runs"]:
        baseline = run_decisions.get((run["session"], "c1"))
        current = run_decisions[(run["session"],run["arm"])]
        changes = []
        for key, canonical in current.items():
            before = baseline.get(key) if baseline else None
            fields = [field for field in ("display_action","non_holder_action","holder_action") if before and before[field] != canonical[field]]
            if fields:
                changes.append({"stock_id": key, "fields": fields, "before": {field: before[field] for field in fields},
                    "after": {field: canonical[field] for field in fields}, "arm": run["arm"],
                    "controlling_reason": canonical["primary_reason_code"], "blockers": canonical["blocker_codes"]})
        run["changed_actions"] = changes
        from app.modules.trading_intelligence.practicality_operational import permission_changed
        changed_permissions={row["stock_id"] for row in changes if "non_holder_action" in row["fields"] and permission_changed(row["before"],row["after"])}
        for case in run["guardrails"].get("chart_cases",[]):
            if case["stock_id"] in changed_permissions:
                case["strata"]=sorted((set(case["strata"])-{"unchanged_permitted"})|{"changed_permission"})
                case["case_hash"]=stable_audit_hash({key:value for key,value in case.items() if key!="case_hash"})
        run["changed_actions_unattributed"] = baseline is None or baseline.keys() != current.keys() or any(not row["controlling_reason"] for row in changes)
        write(args.output / run["session"] / run["arm"] / "paired-evidence.json", run)
    if args.shadow_freeze:
        manifest["operational_shadow"] = operational_readiness(captures, manifest["runs"], freeze=args.shadow_freeze,
            calendar=expected, freeze_manifest=frozen, human_reviews=reviews, as_of=export.get("exported_at"))
    write(args.output / "manifest.json", manifest)


def archive_audit(path, output, sessions, *, reconstructed_market=False):
    from app.core.enums import ExchangeCode
    from app.modules.backtesting.backtesting_archive import restore_dataset
    from app.modules.backtesting.backtesting_engine import replay_canonical_engine
    from app.modules.backtesting.backtesting_evaluation import common_markouts, top_five, rank_metrics, evaluate_selections, ranking_tie_diagnostics
    from app.modules.backtesting.backtesting_models import BacktestConfig
    dataset = restore_dataset(json.loads(path.read_text(encoding="utf8")))
    # Last fifty diagnostic selection sessions with the existing primary horizon.
    dates = dataset.session_dates[-sessions:]
    summary = {"sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "dates": [day.isoformat() for day in dates],
        "classification": "RECONSTRUCTED_CURRENT_METADATA_PROXY", "category": "CURRENT_PROXY_EXPLICIT", "primary_horizon": 10,
        "versions": {}, "strict_category_unavailable_versions": {}}
    paired = {}
    from app.modules.stock_details.decision.market_regime import compute_shadow_market_regime
    from app.modules.stock_details.decision.policy import decision_policy
    index = "DSEX" if any(row.index_name == "DSEX" for row in dataset.market_summaries) else "GENERAL"
    context = [{"session_date":row.trade_date.isoformat(),"index_close":row.index_close,
        "advancing":row.advancing_issues,"declining":row.declining_issues,"authenticated":False}
        for row in dataset.market_summaries if row.index_name == index]
    reconstructed_regimes = {day:compute_shadow_market_regime(context,as_of=day,allow_reconstructed=True,
        expected_sessions=dataset.session_dates) for day in dates} if reconstructed_market else None
    versions = ("trading-intelligence-v3", "trading-intelligence-v4", *[ARMS[arm] for arm in ("market", "risk", "rsi", "pullback", "ranking", "combined")])
    for version, category_proxy in [*( (version, True) for version in versions), ("trading-intelligence-v3", False), ("trading-intelligence-v4", False)]:
        config = BacktestConfig(exchange=ExchangeCode.DSE, start_date=dates[0], end_date=dates[-1], horizons=(10,),
            strategy_version=version, use_current_category_proxy=category_proxy)
        identity = version if category_proxy else f"{version}-category-unavailable"
        raw_plans = []
        market_override = reconstructed_regimes if decision_policy(version).market else None
        observations, outcomes = replay_canonical_engine(dataset, config, decision_audit=raw_plans,
            counterfactual_market_regimes=market_override)
        selections = top_five(observations)
        markouts = common_markouts(observations, dataset, config)
        executions, fill_outcomes = evaluate_selections(selections, dataset, config, "canonical-plan-v1")
        daily = {day.isoformat(): {"buys": 0, "stocks": 0} for day in dates}
        for row in observations:
            value = daily[row.as_of_date.isoformat()]
            value["stocks"] += 1
            value["buys"] += row.display_action == "POTENTIAL_BUY"
            value["regime"] = row.market_regime
            value["regime_phase"] = row.regime_phase
            value["regime_coverage"] = row.regime_confidence
            value["market_permission"] = row.regime_permission
        record = {"classification": "RECONSTRUCTED_CURRENT_METADATA_PROXY" if category_proxy else "RECONSTRUCTED_CATEGORY_UNAVAILABLE",
            "market_context": "RECONSTRUCTED_SUMMARIES_NOT_AUTHENTICATED" if market_override is not None else "STRICT_SHADOW_UNKNOWN_WITHOUT_AUTHENTICATED_CONTEXT" if decision_policy(version).market else "OWNING_LEGACY_REGIME_INPUTS",
            "category_unavailable_observations": sum(row.category is None for row in observations),
            "category_proxy": category_proxy, "observations": len(observations), "actions": dict(Counter(row.display_action for row in observations)),
            "daily_including_zero_buys": daily, "regime_session_counts": dict(Counter(row.get("regime", "UNAVAILABLE") for row in daily.values())),
            "market_permission_session_counts": dict(Counter(row.get("market_permission") or "LEGACY_LABEL" for row in daily.values())),
            "exclusions": dict(Counter(code for row in observations for code in row.eligibility_reason_codes)),
            "controlling_reasons": dict(Counter(row.controlling_reason for row in observations)),
            "blockers_overlapping": dict(Counter(code for row in observations for code in row.blocker_codes)),
            "selected": len(selections), "selected_without_permission": sum(row.non_holder_action != "BUY" for row in selections),
            "ranking": rank_metrics(observations, selections, markouts, 10),
            "ranking_ties": ranking_tie_diagnostics(observations),
            "raw_first_failure_exclusive": dict(Counter(row["plan"]["raw_first_failure"] for row in raw_plans)),
            "raw_failures_overlapping": dict(Counter(code for row in raw_plans for code in row["plan"]["raw_overlapping_failures"])),
            "relevant_subset_population": sum(row["plan"]["relevant_subset"] for row in raw_plans),
            "execution_status": dict(Counter(row.status for row in executions.values())),
            "accepted_verified_fills": sum(row.is_filled and row.rules_verified for row in executions.values()),
            "mature_fill_outcomes": sum(row.status == "AVAILABLE" for row in fill_outcomes),
            "execution_note": "Absent verified rules/fills means execution performance cannot be assessed."}
        write(output / f"archive-{identity}.json", {"summary": record, "observations": [asdict(row) for row in observations],
            "selections": [asdict(row) for row in selections], "markouts": [asdict(row) for row in markouts],
            "executions": [asdict(row) for row in executions.values()]})
        write(output / f"archive-raw-plans-{identity}.json", raw_plans)
        summary["versions" if category_proxy else "strict_category_unavailable_versions"][version] = record
        paired[identity] = {(str(row.stock_id), row.as_of_date.isoformat()): row for row in observations}
        print("archive", identity, len(observations), record["actions"], flush=True)
    baseline = paired["trading-intelligence-v3"]
    transitions = {}
    for version, rows in paired.items():
        if rows.keys() != baseline.keys():
            raise ValueError("Paired archive membership changed")
        changed = []
        for key, row in rows.items():
            before = baseline[key]
            fields = [name for name in ("display_action", "non_holder_action", "opportunity_score", "controlling_reason", "entry_timing", "blocker_codes") if getattr(before, name) != getattr(row, name)]
            if fields:
                changed.append({"stock_id": key[0], "session_date": key[1], "symbol": row.symbol, "changed_fields": fields,
                    "before": {name: getattr(before, name) for name in fields}, "after": {name: getattr(row, name) for name in fields}})
        transitions[version] = changed
    write(output / "archive-paired-transitions.json", transitions)
    return summary


if __name__ == "__main__":
    main()
