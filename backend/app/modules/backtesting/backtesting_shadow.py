"""Sealed paired selections and separately appended modeled outcomes. Never promotes policy."""
from dataclasses import asdict, fields, replace
from datetime import UTC, date, datetime
from uuid import UUID

from app.core.audit_hashing import canonicalize_audit_value, stable_audit_hash
from app.core.constants.trading_constants import TRADING_STRATEGY_VERSION
from app.core.enums import ExchangeCode
from app.models import Stock
from app.modules.backtesting.backtesting_availability import next_verified_open, capture_availability
from app.modules.backtesting.backtesting_challengers import EXPERIMENT, EXPERIMENT_ID, challenger_ranking, enrich_features
from app.modules.backtesting.backtesting_engine import replay_canonical_engine
from app.modules.backtesting.backtesting_evaluation import shortlist_key, top_five, evaluate_selections, portfolio_ledger, observation_key
from app.modules.backtesting.backtesting_execution import compute_forward_outcome, compute_selection_markout, simulate_next_session_execution
from app.modules.backtesting.backtesting_models import BacktestConfig, BacktestDataset, ReplayObservation, StockReplayHistory, ForwardOutcome, ExecutionResult
from app.modules.backtesting.backtesting_shadow_repository import TradingShadowRepository
from app.modules.trading_intelligence.capture_inventory import verify_capture_coverage
from app.modules.trading_intelligence.input_capture import restore_strategy_input


def capture_dataset(capture):
    source, result = capture.input_payload, capture.result_payload
    histories = []
    sessions = set()
    results = {str(row["stock"]["id"]): row for row in result["rows"]}
    for key, payload in source["inputs"].items():
        value = restore_strategy_input({**payload, "strategy_version": result["strategy_version"]})
        sessions.update(value.exchange_session_dates)
        stock = Stock(id=value.stock_id, symbol=value.symbol, name=source.get("stocks", {}).get(key, {}).get("name", value.symbol),
            exchange=value.exchange, category=value.category, is_active=value.is_active)
        row = results.get(key, {})
        canonical = (row.get("decision") or {}).get("canonical") or {}
        plan = (row.get("analysis") or {}).get("trade_plan") or {}
        expected = {field: canonical.get(field) for field in ("input_hash", "shared_decision_id", "display_action", "eligibility_status", "entry_readiness")}
        expected.update({field: plan.get(field) for field in ("invalidation_price", "trigger_price", "preferred_entry_zone_low", "preferred_entry_zone_high")})
        expected["target_price"] = plan.get("target_low")
        histories.append(StockReplayHistory(stock, value.prices,
            corporate_action_dates=value.known_corporate_action_dates, event_observations=value.event_observations,
            event_coverage_verified=value.event_coverage_status == "VERIFIED", captured_inputs=({
            "publication_id": capture.generation_id, "observed_at": capture.observed_at.isoformat(), "input": payload,
            "coverage_status": "VERIFIED", "expected_decision": expected,
        },)))
    publication = {"generation_id": capture.generation_id, "session_date": capture.session_date.isoformat(),
        "observed_at": capture.observed_at.isoformat(), "strategy_version": result["strategy_version"],
        "members": source["universe_membership"], "excluded_members": source.get("excluded_members", [])}
    return BacktestDataset(tuple(histories), tuple(sorted(sessions)), publications=(publication,))


async def record_shadow_selection(session, capture, settings):
    repository = TradingShadowRepository(session)
    if not await repository.available():
        return None
    if capture.invalidated_at or capture.result_payload.get("strategy_version") != TRADING_STRATEGY_VERSION:
        return None
    ids = [str(row["stock"]["id"]) for row in capture.result_payload.get("rows", [])]
    if not verify_capture_coverage(capture.input_payload, ids)["verified"]:
        return None
    selected_at = datetime.now(UTC)
    config = BacktestConfig(capture.exchange, capture.session_date, capture.session_date,
        horizons=(10,), replay_mode="capture_diagnostic", session_open_time=settings.market_open_time,
        session_close_time=settings.market_close_time,
        session_open_overrides=tuple(sorted(settings.market_session_open_overrides.items())))
    dataset = capture_dataset(capture)
    observations, _ = replay_canonical_engine(dataset, config)
    if len(observations) != len(ids) or any(row.parity_status != "MATCH" for row in observations):
        return None
    observations = tuple(replace(row, selection_at=selected_at) for row in observations)
    enriched = enrich_features(observations, dataset, config)
    baseline = top_five(enriched)
    challenger, _, feature_coverage = challenger_ranking(enriched, EXPERIMENT["families"])
    # The frozen clock is cumulative 120 recorded sessions, including empty slates.
    ranks = [{"stock_id": str(row.stock_id), "rank": rank, "ranking_fields": shortlist_key(row)}
        for rank, row in enumerate(sorted(enriched, key=shortlist_key), 1)]
    payload = canonicalize_audit_value({
        "experiment": EXPERIMENT, "experiment_id": EXPERIMENT_ID, "config": asdict(config),
        "input_generation": capture.generation_id, "input_observed_at": capture.observed_at,
        "input_calculation_times": sorted({value["calculated_at"] for value in capture.input_payload["inputs"].values()}),
        "selected_at": selected_at, "cutoff_status": "NEXT_OPEN_UNVERIFIED", "primary_horizon": 10,
        "ranks": ranks, "feature_coverage": feature_coverage,
        "universe": [asdict(row) for row in enriched],
        "source_knowledge_verified": all(capture_availability(value, capture.session_date, dataset.session_dates, config)[1]
            in {"BEFORE_NEXT_VERIFIED_OPEN", "AT_OR_AFTER_NEXT_OPEN", "NEXT_OPEN_UNVERIFIED"}
            for history in dataset.histories for value in history.captured_inputs),
        "ranking_arms": {"baseline": [asdict(row) for row in baseline], "challenger": [asdict(row) for row in challenger]},
        "entry_arms": {"baseline": [asdict(row) for row in baseline], "challenger": [asdict(row) for row in baseline]},
        "entry_policies": {"baseline": "canonical-plan-v1", "challenger": EXPERIMENT["entry_challenger"]},
        "empty_session": not baseline, "safeguard_bypasses": None,
        "safeguard_evidence_status": "UNMEASURED", "promoted": False,
    })
    return await repository.record_selection(capture=capture, selected_at=selected_at, next_open_at=None,
        experiment_id=EXPERIMENT_ID, payload=payload, record_hash=stable_audit_hash(payload))


def restore_observation(payload):
    from app.core.enums import EligibilityStatus, EntryReadiness, EntryTiming, MarketRegimePhase, OpportunityQuality, TraderRecommendation, DecisionDisplayAction
    value = dict(payload)
    value["stock_id"] = UUID(value["stock_id"])
    value["as_of_date"] = date.fromisoformat(value["as_of_date"])
    for key in ("publication_observed_at", "input_calculated_at", "selection_at", "next_open_at"):
        value[key] = datetime.fromisoformat(value[key]) if value.get(key) else None
    for key, enum in {"recommendation": TraderRecommendation, "internal_action": TraderRecommendation,
        "display_action": DecisionDisplayAction, "eligibility_status": EligibilityStatus, "entry_readiness": EntryReadiness,
        "entry_timing": EntryTiming, "regime_phase": MarketRegimePhase, "opportunity_quality": OpportunityQuality}.items():
        value[key] = enum(value[key]) if value.get(key) else None
    for key in ("eligibility_reason_codes", "blocker_codes", "research_features", "parity_differences"):
        value[key] = tuple(value.get(key, ()))
    return ReplayObservation(**value)


def restore_shadow_config(payload):
    from app.modules.backtesting.backtesting_models import SlippageTier
    value = dict(payload)
    value["exchange"] = ExchangeCode(value["exchange"])
    for key in ("start_date", "end_date"):
        value[key] = date.fromisoformat(value[key])
    value["slippage_tiers"] = tuple(SlippageTier(**row) for row in value["slippage_tiers"])
    for key in ("horizons", "publication_ids", "sensitivity_order_values", "sensitivity_cost_bps", "sensitivity_pulse_thresholds"):
        value[key] = tuple(value[key])
    value["session_open_overrides"] = tuple(tuple(row) for row in value["session_open_overrides"])
    return BacktestConfig(**value)


def receipt_timely(selection, dataset):
    frozen = selection.payload
    config = restore_shadow_config(frozen["config"])
    deadline = next_verified_open(selection.session_date, dataset.session_dates, config, dataset.observed_session_dates)
    timely = bool(deadline and frozen.get("source_knowledge_verified") is True
        and selection.recorded_at < deadline and selection.selected_at < deadline
        and datetime.fromisoformat(frozen["input_observed_at"]) <= selection.selected_at
        and all(datetime.fromisoformat(value) <= selection.selected_at and datetime.fromisoformat(value) < deadline
            for value in frozen["input_calculation_times"]))
    return deadline, timely


def receipt_rows(selection, kind, arm=None):
    payloads = selection.payload[kind] if arm is None else selection.payload[kind][arm]
    bypasses = selection.payload.get("safeguard_bypasses")
    measured = selection.payload.get("safeguard_evidence_status") == "MEASURED"
    return tuple(replace(restore_observation(value), forward_selection_id=str(selection.id),
        safeguard_bypasses=tuple(bypasses) if bypasses is not None and (bypasses or measured) else None) for value in payloads)


def missing_history_outcome(row):
    return ForwardOutcome(row.stock_id, row.as_of_date, 10, "NO_STOCK_HISTORY", "EXECUTION_UNVERIFIED")


def receipt_window(selection, dataset):
    rows = [row for values in selection.payload["entry_arms"].values() for row in values]
    required = 10 + max((row.get("expiry_sessions") or 1 for row in rows), default=0)
    future = [day for day in dataset.session_dates if day > selection.session_date]
    return (future[min(required, len(future))-1] if future else selection.session_date), len(future) >= required


def portfolio_fact_dates(receipt):
    return [date.fromisoformat(str(row["date"])) for portfolio in receipt.get("portfolios", {}).values()
        for kind in ("daily", "events") for row in portfolio.get(kind, ()) if row.get("date")]


def receipt_input_revision(selection, dataset, end, *, include_universe=True):
    from app.modules.stock_details.decision.lineage import daily_price_audit_payload
    from app.modules.backtesting.backtesting_manifest import _market_summary_payload
    ids = {value["stock_id"] for value in selection.payload.get("universe", ())} if include_universe else set()
    ids.update(value["stock_id"] for values in selection.payload["entry_arms"].values() for value in values)
    histories = {str(row.stock.id): row for row in dataset.histories}
    facts = {}
    for stock_id in sorted(ids):
        history = histories.get(stock_id)
        facts[stock_id] = None if history is None else {
            "prices": [{**daily_price_audit_payload(row), "observed_at": row.updated_at} for row in history.prices if selection.session_date < row.trade_date <= end],
            "action_dates": sorted(day for day in history.corporate_action_dates if selection.session_date < day <= end),
            "actions": [asdict(row) for row in history.corporate_actions if selection.session_date < row.effective_date <= end],
            "rules": [asdict(row) for row in history.execution_rules if row.effective_from <= end and row.effective_to > selection.session_date],
            "suspensions": sorted(day for day in history.suspension_dates if selection.session_date < day <= end),
            "locks": sorted(day for day in history.circuit_locked_dates if selection.session_date < day <= end)}
    return stable_audit_hash({"selection":selection.record_hash, "facts":facts,
        "calendar":[day for day in dataset.session_dates if selection.session_date < day <= end],
        "benchmark":[_market_summary_payload(row) for row in dataset.market_summaries if selection.session_date <= row.trade_date <= end]})


async def mature_shadow_outcomes(session, dataset, config):
    from copy import deepcopy
    from app.modules.backtesting.backtesting_shadow_assessment import restore_execution, restore_outcome
    repository = TradingShadowRepository(session)
    if not await repository.available() or not dataset.session_dates:
        return []
    selections = await repository.selections(exchange=config.exchange, experiment_id=EXPERIMENT_ID, strategy_version=config.strategy_version)
    selections = sorted({row.session_date: row for row in reversed(selections)}.values(), key=lambda row:row.session_date)
    timely = [row for row in selections if receipt_timely(row, dataset)[1]][:EXPERIMENT["forward_cohort"]["selection_sessions"]]
    if len(timely) == EXPERIMENT["forward_cohort"]["selection_sessions"]:
        selections = [row for row in selections if row.session_date <= timely[-1].session_date]
    latest = await repository.latest_outcomes([row.id for row in selections])
    histories = {row.stock.id: row for row in dataset.histories}
    receipts, reusable = {}, set()
    for selection in selections:
        deadline, confirmed = receipt_timely(selection, dataset)
        end, mature_calendar = receipt_window(selection, dataset)
        previous = latest.get(selection.id)
        if previous:
            end = max([end] + portfolio_fact_dates(previous.payload) + [date.fromisoformat(value["outcome_end_date"]) for values in previous.payload.get("entry_arms",{}).values() for value in values if value.get("outcome_end_date")])
        end = min(end, dataset.session_dates[-1])
        revision = receipt_input_revision(selection, dataset, end)
        if (previous and previous.payload.get("model_revision") == "shadow-outcomes-v3"
            and previous.payload.get("mature") and previous.payload.get("input_revision") == revision
            and previous.payload.get("prospective_selections_confirmed") == confirmed
            and previous.payload.get("next_open_at") == (deadline.isoformat() if deadline else None)):
            receipts[selection.id] = deepcopy(previous.payload)
            receipts[selection.id]["portfolios"] = {}
            receipts[selection.id].pop("portfolio_sources", None)
            receipts[selection.id].pop("portfolio_source_through_date", None)
            reusable.add(selection.id)
            continue
        frozen_config = restore_shadow_config(selection.payload["config"])
        universe = receipt_rows(selection, "universe") if "universe" in selection.payload else ()
        receipt = {"kind":"MODELED_OUTCOMES", "model_revision":"shadow-outcomes-v3", "input_revision":revision,
            "input_generation":selection.payload["input_generation"], "experiment_id":selection.experiment_id,
            "strategy_version":selection.strategy_version, "through_date":dataset.session_dates[-1],
            "next_open_at":deadline, "availability":"TIMELY_RECORDED" if confirmed else "NEXT_OPEN_UNVERIFIED" if deadline is None else "LATE_RECORDED",
            "prospective_selections_confirmed":confirmed, "primary_horizon":10, "ranking_arms":{}, "entry_arms":{}, "portfolios":{},
            "mature":mature_calendar, "promoted":False,
            "universe_markouts":[asdict(compute_selection_markout(row, histories[row.stock_id], dataset.session_dates, dataset.market_summaries, frozen_config,10)
                if row.stock_id in histories else missing_history_outcome(row)) for row in universe]}
        for arm in ("baseline","challenger"):
            receipt["ranking_arms"][arm] = [asdict(compute_selection_markout(row, histories[row.stock_id], dataset.session_dates, dataset.market_summaries,frozen_config,10)
                if row.stock_id in histories else missing_history_outcome(row)) for row in receipt_rows(selection,"ranking_arms",arm)]
        receipts[selection.id] = receipt
    snapshot_id = timely[-1].id if timely else selections[-1].id if selections else None
    for arm in ("baseline","challenger"):
        if not selections:
            continue
        frozen_config = restore_shadow_config(selections[0].payload["config"])
        if arm == "challenger":
            frozen_config = replace(frozen_config, maximum_entry_gap_percent=selections[0].payload["entry_policies"]["challenger"]["maximum_entry_gap_percent"])
        policy = "canonical-plan-v1" if arm == "baseline" else EXPERIMENT["entry_challenger"]["version"]
        rows, executions, index = [], {}, {}
        for selection in timely:
            for position,row in enumerate(receipt_rows(selection,"entry_arms",arm)):
                key = observation_key(row)
                rows.append(row)
                cached = receipts[selection.id].get("entry_arms",{}).get(arm,[])
                if selection.id in reusable and position < len(cached) and cached[position].get("execution"):
                    executions[key], index[key] = restore_execution(cached[position]["execution"]), restore_outcome(cached[position])
                elif row.stock_id not in histories:
                    executions[key], index[key] = ExecutionResult("NO_STOCK_HISTORY"), missing_history_outcome(row)
                else:
                    executions[key] = simulate_next_session_execution(row, histories[row.stock_id],dataset.session_dates,frozen_config,policy_id=policy)
                    index[key] = compute_forward_outcome(row,executions[key],histories[row.stock_id],dataset.session_dates,dataset.market_summaries,frozen_config,10)
        ledger_dataset = dataset
        if timely and all(receipts[row.id]["mature"] for row in timely) and all(value.status not in {"INSUFFICIENT_HORIZON","EXIT_BLOCKED"} for value in index.values()):
            last = max([receipt_window(row,dataset)[0] for row in timely] + [value.outcome_end_date for value in index.values() if value.outcome_end_date])
            ledger_dataset = replace(dataset,session_dates=tuple(day for day in dataset.session_dates if day <= last))
        portfolio = portfolio_ledger(tuple(rows),executions,index,ledger_dataset,frozen_config)
        for selection in selections:
            values = []
            for row in receipt_rows(selection,"entry_arms",arm):
                key = observation_key(row)
                outcome, execution = index.get(key), executions.get(key)
                values.append({**(asdict(outcome) if outcome else {"stock_id":str(row.stock_id),"as_of_date":row.as_of_date,"status":"NOT_IN_TIMELY_COHORT"}),
                    "accepted":portfolio["acceptance_by_key"].get(f"{row.stock_id}:{row.as_of_date}"),
                    "execution":asdict(execution) if execution else None})
            receipts[selection.id]["entry_arms"][arm] = values
            if selection.id == snapshot_id:
                receipts[selection.id]["portfolios"][arm] = portfolio
    result = []
    for selection in selections:
        receipt = receipts[selection.id]
        if any(value.get("status") in {"INSUFFICIENT_HORIZON","EXIT_BLOCKED"} for kind in ("ranking_arms","entry_arms") for values in receipt[kind].values() for value in values):
            receipt["mature"] = False
        portfolio_dates = portfolio_fact_dates(receipt)
        actual_end = max([receipt_window(selection,dataset)[0]] + portfolio_dates + [date.fromisoformat(str(value["outcome_end_date"])) for values in receipt["entry_arms"].values() for value in values if value.get("outcome_end_date")])
        if receipt["mature"]:
            previous_date = latest[selection.id].through_date if selection.id in latest else selection.session_date
            # Delayed executable exits are evidence too. Keep mature history
            # stable, but never date it before its facts or beyond this evaluation.
            receipt["through_date"] = min(dataset.session_dates[-1],max(previous_date,actual_end)).isoformat()
        receipt["input_revision"] = receipt_input_revision(selection,dataset,actual_end)
        if receipt["portfolios"]:
            snapshot_end = min(dataset.session_dates[-1], max(portfolio_dates, default=selection.session_date))
            receipt["portfolio_source_through_date"] = snapshot_end.isoformat()
            receipt["portfolio_sources"] = {str(source.id): {
                "selection_hash": source.record_hash,
                "input_revision": receipt_input_revision(source,dataset,snapshot_end,include_universe=False),
            } for source in timely}
        payload = canonicalize_audit_value(receipt)
        revision = stable_audit_hash(payload)
        if selection.id not in latest or latest[selection.id].outcome_revision != revision:
            await repository.record_outcome(selection,through_date=date.fromisoformat(payload["through_date"]),revision=revision,payload=payload)
        result.append(payload)
    return result


async def active_receipt_cohort(repository, exchange, strategy_version, *, summary_only=False):
    selections = await repository.selections(exchange=exchange, experiment_id=EXPERIMENT_ID, strategy_version=strategy_version, summary_only=summary_only)
    latest = await repository.latest_outcomes([row.id for row in selections],summary_only=summary_only)
    eligible, dates = [], set()
    for row in selections:
        outcome = latest.get(row.id)
        if row.session_date not in dates and outcome and not outcome.invalidated_at and outcome.payload.get("prospective_selections_confirmed"):
            dates.add(row.session_date)
            eligible.append(row)
    return selections, latest, eligible[:EXPERIMENT["forward_cohort"]["selection_sessions"]]


async def assessment_valid(repository, assessment, selections, latest):
    required = set(assessment.payload["selection_ids"])
    active_ids = {str(row.id) for row in selections}
    vintages = await repository.outcome_vintages([UUID(value) for value in assessment.payload["outcome_ids"].values()])
    dates, current_cohort = set(), []
    for row in selections:
        outcome = latest.get(row.id)
        if row.session_date not in dates and outcome and not outcome.invalidated_at and outcome.payload.get("prospective_selections_confirmed"):
            dates.add(row.session_date)
            current_cohort.append(str(row.id))
    current_cohort = current_cohort[:EXPERIMENT["forward_cohort"]["selection_sessions"]]
    return (not assessment.invalidated_at and assessment.payload["selection_ids"] == current_cohort
        and required <= active_ids and len(vintages) == len(required)
        and all(not row.invalidated_at for row in vintages)
        and all(row.id in latest and not latest[row.id].invalidated_at for row in selections if str(row.id) in required))


async def shadow_progress(session, *, exchange, strategy_version=TRADING_STRATEGY_VERSION):
    repository = TradingShadowRepository(session)
    if not await repository.available():
        return {"status": "SCHEMA_UNAVAILABLE", "promoted": False}
    selections, latest, cohort = await active_receipt_cohort(repository, exchange, strategy_version, summary_only=True)
    all_rows = await repository.selections(exchange=exchange, experiment_id=EXPERIMENT_ID, strategy_version=strategy_version, valid_only=False,summary_only=True)
    counts = {kind: {arm: {"selections": 0, "available_outcomes": 0, "modeled_filled_outcomes": 0,
        "filled_outcomes": 0, "acceptance_unknown": 0, "fill_bearing_dates": []}
        for arm in ("baseline", "challenger")} for kind in ("ranking_arms", "entry_arms")}
    for selection in cohort:
        for kind in counts:
            for arm in counts[kind]:
                values = latest[selection.id].payload[kind][arm]
                count = counts[kind][arm]
                count["selections"] += len(selection.payload[kind][arm])
                count["available_outcomes"] += sum(value.get("status") == "AVAILABLE" for value in values)
                count["modeled_filled_outcomes"] += sum(value.get("status") == "AVAILABLE" and value.get("execution_status") == "FILLED" for value in values)
                filled = sum(value.get("status") == "AVAILABLE" and value.get("execution_status") == "FILLED" and value.get("accepted") is True for value in values)
                count["filled_outcomes"] += filled
                if kind == "entry_arms":
                    count["acceptance_unknown"] += sum(value.get("accepted") is None for value in values)
                if filled:
                    count["fill_bearing_dates"].append(selection.session_date.isoformat())
    assessment = await repository.assessment(exchange=exchange, experiment_id=EXPERIMENT_ID, strategy_version=strategy_version)
    formal_status = "ENDPOINT_REACHED_AWAITING_MATURITY_AND_EXPLICIT_ASSESSMENT" if len(cohort) == 120 else "BLOCKED_UNTIL_FROZEN_ENDPOINT"
    if assessment:
        valid = await assessment_valid(repository, assessment, selections, latest)
        formal_status = assessment.payload["status"] if valid else "ASSESSMENT_INVALIDATED_OR_SUPERSEDED"
    valid_outcomes = [row for row in latest.values() if not row.invalidated_at]
    return {"status": "RECORDING" if selections else "NO_SELECTION_RECEIPTS", "experiment_id": EXPERIMENT_ID,
        "strategy_version": strategy_version, "selection_dates": len({row.session_date for row in selections}),
        "withdrawn_receipts": len(all_rows)-len(selections), "eligible_cohort_dates": len(cohort),
        "recorded_selection_counts": {kind: {arm: sum(len(row.payload[kind][arm]) for row in selections) for arm in ("baseline", "challenger")} for kind in counts},
        "empty_dates": sum(row.payload["empty_session"] for row in selections),
        "timely_empty_dates": sum(row.payload["empty_session"] for row in cohort),
        "late_receipts": sum(row.payload["availability"] == "LATE_RECORDED" for row in valid_outcomes),
        "unknown_next_open_receipts": sum(row.payload["availability"] == "NEXT_OPEN_UNVERIFIED" for row in valid_outcomes),
        "timely_receipts": len(cohort), "counts": counts, "formal_endpoint_selection_dates": 120,
        "promoted": False, "formal_comparison_status": formal_status,
        "assessment_id": str(assessment.id) if assessment else None,
        "next_checkpoint": "NEXT_VERIFIED_SESSION_AND_PRIMARY_TEN_SESSION_MATURITY"}


async def publish_shadow_receipts(session, capture, settings):
    selection = await record_shadow_selection(session, capture, settings)
    if selection is None:
        return None
    from datetime import timedelta
    from app.modules.backtesting.backtesting_repository import BacktestingRepository
    config = BacktestConfig(capture.exchange, capture.session_date-timedelta(days=365), capture.session_date,
        horizons=(10,), session_open_time=settings.market_open_time, session_close_time=settings.market_close_time,
        session_open_overrides=tuple(sorted(settings.market_session_open_overrides.items())))
    dataset = await BacktestingRepository(session).load_dataset(config)
    await mature_shadow_outcomes(session, dataset, config)
    return selection
