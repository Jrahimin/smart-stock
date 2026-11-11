"""Selection denominators, independent policies and cash-constrained portfolio accounting."""

from __future__ import annotations

from collections import Counter, defaultdict
from bisect import bisect_right
from dataclasses import asdict
from statistics import mean
from types import SimpleNamespace

from app.core.enums import EligibilityStatus
from app.modules.backtesting.backtesting_execution import (
    action_terms,
    compute_forward_outcome,
    compute_selection_markout,
    observation_block,
    simulate_next_session_execution,
)
from app.modules.backtesting.backtesting_metrics import (
    _spearman,
    _strategy_summary,
    build_decision_metrics,
    select_pulse_top_k,
)
from app.modules.market_universe.shortlist import entry_sort_key


def observation_key(item):
    return item.stock_id, item.as_of_date


def shortlist_key(item):
    # Adapt to the existing backend owner; do not maintain an independent ranking formula.
    return entry_sort_key(
        SimpleNamespace(
            stock=SimpleNamespace(id=item.stock_id, symbol=item.symbol),
            decision=SimpleNamespace(canonical=item),
            analysis=SimpleNamespace(
                liquidity=SimpleNamespace(
                    label=item.liquidity_tier, median_turnover=item.median_turnover
                )
            ),
        )
    )


def top_five(observations, key=shortlist_key):
    by_day = defaultdict(list)
    for item in observations:
        if item.eligibility_status == EligibilityStatus.ELIGIBLE:
            by_day[item.as_of_date].append(item)
    return tuple(item for day in sorted(by_day) for item in sorted(by_day[day], key=key)[:5])


def strategy_selections(observations, config):
    eligible = tuple(
        item for item in observations if item.eligibility_status == EligibilityStatus.ELIGIBLE
    )
    return {
        "no_trade": ((), "canonical-plan-v1"),
        "corrected_engine": (top_five(eligible), "canonical-plan-v1"),
        "price_above_sma20": (
            tuple(
                item
                for item in eligible
                if item.sma20 is not None
                and item.close_price is not None
                and item.close_price > item.sma20
            ),
            "sma20-next-open-v1",
        ),
        "price_above_sma20_above_sma50": (
            tuple(
                item
                for item in eligible
                if item.sma20 is not None
                and item.sma50 is not None
                and item.close_price is not None
                and item.close_price > item.sma20 > item.sma50
            ),
            "sma50-next-open-v1",
        ),
        "rsi_oversold": (
            tuple(item for item in eligible if item.rsi is not None and item.rsi < 30),
            "rsi-next-open-v1",
        ),
        "pulse_top_k": (
            select_pulse_top_k(
                eligible, threshold=config.pulse_focus_threshold, top_k=config.pulse_top_k
            ),
            "pulse-next-open-v1",
        ),
    }


def common_markouts(observations, dataset, config):
    histories = {row.stock.id: row for row in dataset.histories}
    return tuple(
        compute_selection_markout(
            item,
            histories[item.stock_id],
            dataset.session_dates,
            dataset.market_summaries,
            config,
            horizon,
        )
        for item in observations
        for horizon in config.horizons
    )


def rank_metrics(universe, selections, markouts, horizon, key=shortlist_key):
    outcomes = {observation_key(row): row for row in markouts if row.horizon_sessions == horizon}
    selected_keys = {observation_key(item) for item in selections}
    groups = defaultdict(list)
    for item in universe:
        if item.eligibility_status == EligibilityStatus.ELIGIBLE:
            groups[item.as_of_date].append(item)
    daily = []
    for day, rows in sorted(groups.items()):
        selected = [item for item in rows if observation_key(item) in selected_keys]
        ranked = sorted(rows, key=key)
        paired = [(i, item, outcomes.get(observation_key(item))) for i, item in enumerate(ranked)]
        valid = [
            (i, item, out)
            for i, item, out in paired
            if out is not None
            and out.status == "AVAILABLE"
            and out.excess_return_percent is not None
        ]
        chosen = [out for _, item, out in valid if observation_key(item) in selected_keys]
        all_values = [out.excess_return_percent for _, _, out in valid]
        selected_values = [out.excess_return_percent for out in chosen]
        precision = mean(value > 0 for value in selected_values) if selected_values else None
        universe_precision = mean(value > 0 for value in all_values) if all_values else None
        daily.append(
            {
                "date": day,
                "universe_count": len(rows),
                "universe_evaluable": len(valid),
                "selection_count": len(selected),
                "evaluable_selection_count": len(chosen),
                "missing_selection_count": len(selected) - len(chosen),
                "mean_net_excess_percent": mean(selected_values) if chosen else None,
                "precision": precision,
                "universe_precision": universe_precision,
                "lift_percent_points": mean(selected_values) - mean(all_values) if chosen else None,
                "rank_ic": _spearman([-float(i) for i, _, _ in valid], all_values),
                "fully_observed": bool(selected)
                and len(chosen) == len(selected)
                and len(valid) == len(rows),
            }
        )

    def average(field):
        values = [row[field] for row in daily if row[field] is not None]
        return mean(values) if values else None

    statuses = Counter(
        outcomes[observation_key(item)].status if observation_key(item) in outcomes else "MISSING"
        for item in selections
    )
    return {
        "selection_count": len(selections),
        "status_counts": dict(statuses),
        "missing_selection_count": sum(row["missing_selection_count"] for row in daily),
        "daily": daily,
        "mean_daily_rank_ic": average("rank_ic"),
        "mean_daily_lift_percent_points": average("lift_percent_points"),
        "mean_daily_net_excess_percent": average("mean_net_excess_percent"),
        "mean_daily_precision": average("precision"),
        "mature_distinct_dates": sum(row["fully_observed"] for row in daily),
    }


def portfolio_ledger(selections, executions, outcomes, dataset, config):
    """One position/symbol; no leverage. Receivables are equity, spendable only on pay date."""
    histories = {history.stock.id: history for history in dataset.histories}
    price_maps = {
        sid: {row.trade_date: row for row in history.prices} for sid, history in histories.items()
    }
    by_entry = defaultdict(list)
    for item in selections:
        execution = executions[observation_key(item)]
        if execution.is_filled:
            by_entry[execution.execution_date].append(item)
    cash = config.initial_capital_bdt
    positions, receivables, daily, events = {}, [], [], []
    accepted, rejected = set(), Counter()
    verified_rejected, acceptance = Counter(), {}
    uncertain_from = []
    for item in selections:
        key = observation_key(item)
        execution = executions[key]
        acceptance[key] = False if execution.is_known and not execution.is_filled else None
        if not execution.is_known:
            index = bisect_right(dataset.session_dates, item.as_of_date)
            if index < len(dataset.session_dates):
                uncertain_from.append(dataset.session_dates[index])
    peak = cash
    maximum_drawdown = 0.0
    unresolved = set()
    previous_day = None
    for day in dataset.session_dates:
        if not selections or day < min(item.as_of_date for item in selections):
            continue
        for claim in receivables:
            if not claim["paid"] and claim["pay_date"] is not None and claim["pay_date"] <= day:
                cash += claim["amount"]
                claim["paid"] = True
        for sid, position in positions.items():
            if previous_day is None:
                continue
            actions, missing = action_terms(histories[sid], previous_day, day)
            if missing:
                unresolved.add("UNRESOLVED_CORPORATE_ACTION")
            for action in actions:
                amount = position["shares"] * action.cash_per_old_share
                if amount:
                    paid = action.cash_pay_date is not None and action.cash_pay_date <= day
                    if paid:
                        cash += amount
                    receivables.append(
                        {"amount": amount, "pay_date": action.cash_pay_date, "paid": paid}
                    )
                    if action.cash_pay_date is None:
                        unresolved.add("UNKNOWN_DIVIDEND_PAYMENT_DATE")
                # Rebase the carried ex-action mark before recording the entitlement.
                # The position value plus the distribution must equal its pre-action mark.
                position["mark"] = (
                    position["mark"] - action.cash_per_old_share
                ) / action.shares_multiplier
                position["shares"] *= action.shares_multiplier
        # Conservative cash availability: today's proceeds cannot finance an earlier open order.
        path_known = not any(cutoff <= day for cutoff in uncertain_from)
        for item in sorted(by_entry[day], key=shortlist_key):
            key = observation_key(item)
            execution = executions[key]
            debit = (
                execution.quantity * execution.fill_price * (1 + config.one_way_cost_bps / 10000)
            )
            reason = (
                "ALREADY_HELD"
                if item.stock_id in positions
                else "CASH_UNAVAILABLE"
                if debit > cash
                else None
            )
            if reason:
                rejected[reason] += 1
                acceptance[key] = False if path_known else None
                if path_known:
                    verified_rejected[reason] += 1
                events.append({"date": day, "stock_id": str(item.stock_id), "state": reason, "acceptance_known": path_known})
                continue
            acceptance[key] = True if path_known else None
            cash -= debit
            accepted.add(key)
            positions[item.stock_id] = {
                "shares": execution.quantity,
                "key": key,
                "mark": execution.fill_price,
            }
            # A rejected candidate never becomes a held position. Its
            # hypothetical exit cannot affect later cash/holding evidence.
            out = outcomes.get(key)
            if out is None or out.status != "AVAILABLE":
                history = histories[item.stock_id]
                action_days = [value for value in history.corporate_action_dates if day < value <= dataset.session_dates[-1]]
                index = bisect_right(dataset.session_dates, day)
                if action_days and out and out.status == "CORPORATE_ACTION_UNRESOLVED":
                    uncertain_from.append(min(action_days))
                elif index < len(dataset.session_dates):
                    uncertain_from.append(dataset.session_dates[index])
            events.append(
                {
                    "date": day,
                    "stock_id": str(item.stock_id),
                    "state": "ENTRY",
                    "cash_debit": debit,
                    "quantity": execution.quantity,
                    "timing": execution.fill_timing,
                }
            )
        for sid, position in list(positions.items()):
            outcome = outcomes.get(position["key"])
            if outcome and outcome.status == "AVAILABLE" and outcome.outcome_end_date == day:
                proceeds = (
                    position["shares"] * outcome.exit_price * (1 - config.one_way_cost_bps / 10000)
                )
                cash += proceeds
                events.append(
                    {"date": day, "stock_id": str(sid), "state": "EXIT", "cash_credit": proceeds}
                )
                del positions[sid]
        equity = cash + sum(claim["amount"] for claim in receivables if not claim["paid"])
        stale_marks = 0
        for sid, position in positions.items():
            bar = price_maps[sid].get(day)
            if not observation_block(bar):
                position["mark"] = float(bar.close_price)
            else:
                stale_marks += 1
                if position["mark"] <= 0:
                    unresolved.add("UNSUPPORTED_CARRIED_ACTION_MARK")
            equity += position["shares"] * position["mark"]
        peak = max(peak, equity)
        drawdown = (equity / peak - 1) * 100
        maximum_drawdown = min(maximum_drawdown, drawdown)
        daily.append(
            {
                "date": day,
                "cash_bdt": cash,
                "equity_bdt": equity,
                "positions": len(positions),
                "drawdown_percent": drawdown,
                "stale_mark_count": stale_marks,
            }
        )
        previous_day = day
    if positions:
        unresolved.add("OPEN_OR_UNMATURED_POSITIONS")
    if any(value is None for value in acceptance.values()):
        unresolved.add("PORTFOLIO_ACCEPTANCE_UNVERIFIED")
    complete = not unresolved
    return {
        "status": "AVAILABLE" if complete else "UNSUPPORTED",
        "limitations": sorted(unresolved),
        "initial_capital_bdt": config.initial_capital_bdt,
        "selection_count": len(selections),
        "accepted_fill_count": sum(value is True for value in acceptance.values()) if all(value is not None for value in acceptance.values()) else None,
        "verified_accepted_fill_count": sum(value is True for value in acceptance.values()),
        "portfolio_rejection_counts": dict(verified_rejected),
        "modeled_portfolio_rejection_counts": dict(rejected),
        "acceptance_by_key": {f"{sid}:{day}": value for (sid, day), value in acceptance.items()},
        "acceptance_verified": all(value is not None for value in acceptance.values()),
        "cash_inclusive_net_return_percent": (
            daily[-1]["equity_bdt"] / config.initial_capital_bdt - 1
        )
        * 100
        if daily and complete
        else 0.0
        if not selections
        else None,
        "maximum_drawdown_percent": maximum_drawdown if complete else None,
        "marked_equity_drawdown_percent": maximum_drawdown,
        "daily": daily,
        "events": events,
        "modeled_accepted_keys": sorted(f"{sid}:{day}" for sid, day in accepted),
        "accepted_keys": sorted(f"{sid}:{day}" for (sid, day), value in acceptance.items() if value is True),
    }


def evaluate_selections(selections, dataset, config, policy_id):
    histories = {history.stock.id: history for history in dataset.histories}
    executions = {
        observation_key(item): simulate_next_session_execution(
            item, histories[item.stock_id], dataset.session_dates, config, policy_id=policy_id
        )
        for item in selections
    }
    outcomes = tuple(
        compute_forward_outcome(
            item,
            executions[observation_key(item)],
            histories[item.stock_id],
            dataset.session_dates,
            dataset.market_summaries,
            config,
            horizon,
        )
        for item in selections
        for horizon in config.horizons
    )
    return executions, outcomes


def summarize_policy(
    universe, selections, executions, outcomes, markouts, dataset, config, key=shortlist_key
):
    horizons = {}
    for horizon in config.horizons:
        index = {observation_key(out): out for out in outcomes if out.horizon_sessions == horizon}
        summary = _strategy_summary(selections, index)
        summary.pop("maximum_drawdown_percent", None)  # MAE is not portfolio drawdown.
        summary["activation_count"] = sum(
            executions[observation_key(item)].activation_date is not None for item in selections
        )
        summary["attempt_count"] = sum(
            bool(executions[observation_key(item)].attempt_dates) for item in selections
        )
        summary["trigger_to_attempt_rate"] = (
            summary["attempt_count"] / summary["activation_count"]
            if summary["activation_count"]
            else None
        )
        summary["attempt_to_fill_rate"] = (
            summary["execution_fill_count"] / summary["attempt_count"]
            if summary["attempt_count"]
            else None
        )
        summary["false_breakout_definition"] = (
            "Negative net outcome among filled breakout plans; descriptive proxy."
        )
        summary["wait_by_controlling_reason"] = dict(
            Counter(
                item.controlling_reason or "UNKNOWN"
                for item in selections
                if executions[observation_key(item)].status == "NOT_PERMITTED"
            )
        )
        summary["trigger_activation_rate"] = (
            summary["activation_count"] / len(selections) if selections else None
        )
        summary["execution_status_counts"] = dict(
            Counter(executions[observation_key(item)].status for item in selections)
        )
        summary["selection_markouts"] = rank_metrics(universe, selections, markouts, horizon, key)
        summary["portfolio"] = portfolio_ledger(selections, executions, index, dataset, config)
        dimensions = {
            "market_regime": lambda row: row.market_regime,
            "liquidity": lambda row: row.liquidity_tier,
            "sector": lambda row: row.sector or "UNKNOWN",
            "entry_timing": lambda row: row.entry_timing.value if row.entry_timing else "UNKNOWN",
            "controlling_reason": lambda row: row.controlling_reason or "UNKNOWN",
        }
        summary["stratified"] = {}
        for dimension, resolver in dimensions.items():
            groups = defaultdict(list)
            for row in selections:
                groups[resolver(row)].append(row)
            summary["stratified"][dimension] = {
                label: _strategy_summary(tuple(group), index)
                for label, group in sorted(groups.items())
            }
        horizons[str(horizon)] = summary
    return {"by_horizon": horizons, "selection_count": len(selections)}


def partition_observations(observations, all_outcomes, folds, frozen, config, dataset):
    end_dates = defaultdict(list)
    for outcome in all_outcomes:
        end_dates[observation_key(outcome)].append(outcome.outcome_end_date)

    def before(item, boundary):
        ends = end_dates[observation_key(item)]
        return bool(ends) and all(end is not None and end < boundary for end in ends)

    result = {"all_descriptive": observations}
    for fold in folds:
        result[f"fold_{fold.fold}_train"] = tuple(
            item
            for item in observations
            if fold.train_start <= item.as_of_date <= fold.train_end
            and before(item, fold.validation_start)
        )
        result[f"fold_{fold.fold}_validation"] = tuple(
            item
            for item in observations
            if fold.validation_start <= item.as_of_date <= fold.validation_end
            and (frozen is None or before(item, frozen.start))
        )
    if frozen:
        result["frozen_test"] = tuple(
            item for item in observations if frozen.start <= item.as_of_date <= frozen.end
        )
    return result


def reconcile_coverage(dataset, config, observations, input_audit=None):
    counts = Counter()
    if config.replay_mode != "reconstructed":
        audit = input_audit or {}
        attempts = {(row["publication_id"], row["stock_id"], row["date"]) for row in audit.get("attempted_members", ())}
        if input_audit is None:
            seen_dates = set()
            for publication in sorted(dataset.publications, key=lambda row: (row["session_date"], row["observed_at"], row["generation_id"])):
                day, publication_id = publication["session_date"], publication["generation_id"]
                if config.publication_ids and publication_id not in config.publication_ids:
                    continue
                if day in seen_dates or not config.start_date.isoformat() <= day <= config.end_date.isoformat():
                    continue
                seen_dates.add(day)
                attempts.update((publication_id, member, day) for member in publication["members"])
        actual = {(row.publication_id, str(row.stock_id), row.as_of_date.isoformat()) for row in observations}
        exclusions = {(row.get("publication_id"), row.get("stock_id"), row["date"]): row["reason"]
            for row in audit.get("replay_exclusions", ()) if row.get("stock_id")}
        reasons = Counter(exclusions.get(key, "NO_ENGINE_RESULT") for key in attempts-actual)
        return {"population": "PUBLICATION_MEMBERS", "attempted_instrument_sessions": len(attempts),
            "observations": len(actual), "excluded_members": len(attempts-actual),
            "exclusion_counts": dict(reasons),
            "missing_publication_dates": sum(row["reason"] == "PUBLICATION_UNAVAILABLE" for row in audit.get("replay_exclusions", ())),
            "eligible": sum(item.eligibility_status == EligibilityStatus.ELIGIBLE for item in observations),
            "ineligible": sum(item.eligibility_status != EligibilityStatus.ELIGIBLE for item in observations)}
    present = {observation_key(item) for item in observations}
    for history in dataset.histories:
        prices = {bar.trade_date: bar for bar in history.prices}
        for day in dataset.session_dates:
            if not config.start_date <= day <= config.end_date:
                continue
            counts["attempted_instrument_sessions"] += 1
            if day not in prices:
                counts["missing_bar"] += 1
            elif sum(row_day <= day for row_day in prices) < config.minimum_history_rows:
                counts["warmup"] += 1
            elif (history.stock.id, day) not in present:
                counts["no_engine_result"] += 1
            else:
                counts["observations"] += 1
    counts["eligible"] = sum(
        item.eligibility_status == EligibilityStatus.ELIGIBLE for item in observations
    )
    counts["ineligible"] = len(observations) - counts["eligible"]
    return dict(counts)


def ranking_tie_diagnostics(observations):
    groups = defaultdict(list)
    for row in observations:
        if row.eligibility_status == EligibilityStatus.ELIGIBLE:
            groups[row.as_of_date].append(row)
    deciding = Counter()
    equal_quality = equal_liquidity = stable_ties = compared = 0
    for rows in groups.values():
        ranked = sorted(rows, key=shortlist_key)
        if len(ranked) < 6:
            continue
        compared += 1
        left, right = shortlist_key(ranked[4]), shortlist_key(ranked[5])
        equal_quality += left[:3] == right[:3]
        equal_liquidity += left[:4] == right[:4]
        stable_ties += left[:5] == right[:5]
        index = next((index for index, pair in enumerate(zip(left, right)) if pair[0] != pair[1]), 6)
        deciding[("eligibility", "readiness", "opportunity_quality", "liquidity_tier", "median_turnover", "symbol", "stock_id")[index]] += 1
    return {"eligible_dates": len(groups), "cutoff_comparison_dates": compared,
        "same_readiness_and_quality_at_cutoff": equal_quality, "same_liquidity_tier_at_cutoff": equal_liquidity,
        "stable_name_tiebreak_dates": stable_ties, "deciding_field": dict(deciding)}


def evaluate_replay(dataset, config, observations, folds, frozen):
    markouts = common_markouts(observations, dataset, config)
    strategies = strategy_selections(observations, config)
    evaluated = {
        name: evaluate_selections(selected, dataset, config, policy)
        for name, (selected, policy) in strategies.items()
    }
    all_outcomes = markouts + tuple(out for _, outcomes in evaluated.values() for out in outcomes)
    partitions = partition_observations(observations, all_outcomes, folds, frozen, config, dataset)
    reports = {}
    for partition, rows in partitions.items():
        keys = {observation_key(item) for item in rows}
        report = {
            "observation_count": len(rows),
            "decision_metrics": build_decision_metrics(rows),
            "strategies": {},
        }
        for name, (selected, policy) in strategies.items():
            executions, outcomes = evaluated[name]
            subset = tuple(item for item in selected if observation_key(item) in keys)
            report["strategies"][name] = {
                "policy_id": policy,
                **summarize_policy(rows, subset, executions, outcomes, markouts, dataset, config),
            }
        reports[partition] = report
    audit = {
        "ranking_ties": ranking_tie_diagnostics(observations),
        "observations": [asdict(item) for item in observations],
        "markouts": [asdict(out) for out in markouts],
        "strategies": {
            name: {
                "selections": [asdict(item) for item in selected],
                "executions": [
                    {"stock_id": str(sid), "as_of_date": day, **asdict(execution)}
                    for (sid, day), execution in evaluated[name][0].items()
                ],
                "outcomes": [asdict(out) for out in evaluated[name][1]],
            }
            for name, (selected, _) in strategies.items()
        },
    }
    return reports, audit, markouts
