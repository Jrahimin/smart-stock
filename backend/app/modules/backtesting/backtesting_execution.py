"""Daily-bar research execution. Unknown chronology never creates a profitable fill."""

from __future__ import annotations

from bisect import bisect_right
from dataclasses import replace
from datetime import UTC, date, datetime, time
from decimal import ROUND_CEILING, ROUND_FLOOR, Decimal
from math import isfinite

from app.core.enums import (
    DecisionDisplayAction,
    EligibilityStatus,
    EntryTiming,
    TraderRecommendation,
)
from app.models import DailyMarketSummary
from app.modules.backtesting.backtesting_models import (
    BacktestConfig,
    ExecutionResult,
    ExecutionRule,
    ForwardOutcome,
    ReplayObservation,
    StockReplayHistory,
)
from app.modules.stock_details.decision.event_availability import utc_instant
from app.modules.stock_details.decision.technical import is_valid_ohlc_row


def _slippage_bps(median_turnover: float | None, config: BacktestConfig) -> float:
    tiers = sorted(config.slippage_tiers, key=lambda row: row.minimum_median_turnover, reverse=True)
    return (
        next(
            (
                row.slippage_bps
                for row in tiers
                if (median_turnover or 0) >= row.minimum_median_turnover
            ),
            tiers[-1].slippage_bps,
        )
        * config.slippage_multiplier
    )


def round_tick(value: float, tick: float, *, up: bool) -> float:
    rounding = ROUND_CEILING if up else ROUND_FLOOR
    return float(
        (Decimal(str(value)) / Decimal(str(tick))).to_integral_value(rounding=rounding)
        * Decimal(str(tick))
    )


def rule_on(history: StockReplayHistory, day: date, config: BacktestConfig):
    cutoff = datetime.combine(day, time.min, tzinfo=UTC)
    known = [
        rule
        for rule in history.execution_rules
        if rule.effective_from <= day <= rule.effective_to and utc_instant(rule.known_at) < cutoff
    ]
    if known:
        return max(known, key=lambda rule: (rule.effective_from, utc_instant(rule.known_at))), True
    if config.unknown_rule_policy == "exclude":
        return None, False
    return ExecutionRule(
        day,
        day,
        cutoff,
        "EXPLICIT_UNVERIFIED_ASSUMPTION",
        config.assumed_tick_size,
        config.assumed_lot_size,
        config.assumed_settlement_sessions,
    ), False


def observation_block(bar):
    if bar is None:
        return "NO_STOCK_BAR"
    if bar.volume <= 0:
        return "ZERO_VOLUME"
    if not is_valid_ohlc_row(bar):
        return "INVALID_EXECUTION_PRICE"
    return None


def execution_session_block(history, day):
    if day in history.suspension_dates:
        return "SUSPENDED"
    if day in history.circuit_locked_dates:
        return "CIRCUIT_LOCKED"
    return None


def bar_block(history, bar, day):
    return observation_block(bar) or execution_session_block(history, day)


def price_limit_allows(value, rule):
    return (
        value > 0
        and (rule.lower_price_limit is None or value >= rule.lower_price_limit)
        and (rule.upper_price_limit is None or value <= rule.upper_price_limit)
    )


def simulate_next_session_execution(
    observation: ReplayObservation,
    history: StockReplayHistory,
    session_dates: tuple[date, ...],
    config: BacktestConfig,
    *,
    policy_id: str = "canonical-plan-v1",
) -> ExecutionResult:
    if policy_id not in {
        "canonical-plan-v1",
        "canonical-tight-gap-v1",
        "sma20-next-open-v1",
        "sma50-next-open-v1",
        "rsi-next-open-v1",
        "pulse-next-open-v1",
    }:
        raise ValueError("Unknown predeclared execution policy")
    canonical = policy_id.startswith("canonical-")
    events = [{"state": "SELECTED", "date": observation.as_of_date}]
    attempts = []
    activation = None

    def result(status, day=None, **kwargs):
        return ExecutionResult(
            status=status,
            execution_date=day,
            activation_date=activation,
            attempt_dates=tuple(attempts),
            events=tuple(events),
            policy_id=policy_id,
            **kwargs,
        )

    permitted = observation.display_action == DecisionDisplayAction.POTENTIAL_BUY or (
        observation.display_action is None
        and observation.recommendation == TraderRecommendation.BUY
    )
    if observation.eligibility_status != EligibilityStatus.ELIGIBLE or (
        canonical and not permitted
    ):
        events.append({"state": "NOT_PERMITTED", "date": observation.as_of_date})
        return result("NOT_PERMITTED")
    start = bisect_right(session_dates, observation.as_of_date)
    if start == len(session_dates):
        return result("NO_NEXT_SESSION")
    conditional = canonical and observation.entry_timing in {
        EntryTiming.PULLBACK,
        EntryTiming.BREAKOUT,
    }
    expiry = max(1, observation.expiry_sessions or 1) if canonical else 1
    bars = {bar.trade_date: bar for bar in history.prices}
    last_status = "EXPIRED_WITHOUT_ENTRY"
    stop = observation.invalidation_price if canonical else None
    target = observation.target_price if canonical else None
    for index in range(start, min(len(session_dates), start + expiry)):
        day = session_dates[index]
        bar = bars.get(day)
        blocked = bar_block(history, bar, day)
        if blocked:
            last_status = blocked
            events.append({"state": "SESSION_BLOCKED", "date": day, "reason": blocked})
            continue
        rule, verified = rule_on(history, day, config)
        if rule is None:
            last_status = "RULES_UNAVAILABLE"
            events.append({"state": "EXCLUDED", "date": day, "reason": last_status})
            continue
        rounded_stop = round_tick(stop, rule.tick_size, up=False) if stop is not None else None
        opening = float(bar.open_price)
        raw = opening if config.execution_price == "open" else float(bar.close_price)
        fill_timing = "OPEN" if config.execution_price == "open" else "CLOSE"
        zone_high = None
        # An intervening action changes units of the old plan. It requires a fresh decision.
        if canonical and any(
            observation.as_of_date < action_day <= day
            for action_day in history.corporate_action_dates
            | frozenset(action.effective_date for action in history.corporate_actions)
        ):
            events.append({"state": "INVALIDATED", "date": day, "reason": "ACTION_BEFORE_ENTRY"})
            return result("INVALID_PLAN", day)
        if conditional and activation is None:
            if observation.entry_timing == EntryTiming.PULLBACK:
                low, high = (
                    observation.preferred_entry_zone_low,
                    observation.preferred_entry_zone_high,
                )
                if low is None or high is None:
                    return result("INVALID_PLAN", day)
                low = round_tick(low, rule.tick_size, up=True)
                high = round_tick(high, rule.tick_size, up=False)
                if low > high or (rounded_stop is not None and rounded_stop >= low):
                    return result("INVALID_PLAN", day)
                touched = float(bar.low_price) <= high and float(bar.high_price) >= low
                raw = min(max(opening, low), high)
                fill_timing = "OPEN" if low <= opening <= high else "INTRADAY"
                zone_high = high
            else:
                trigger = observation.trigger_price
                if trigger is None:
                    return result("INVALID_PLAN", day)
                trigger = round_tick(trigger, rule.tick_size, up=True)
                touched = float(bar.high_price) >= trigger
            invalidated = rounded_stop is not None and float(bar.low_price) <= rounded_stop
            # A resting pullback order can already fill at an in-zone open.
            opened_in_zone = (
                observation.entry_timing == EntryTiming.PULLBACK and fill_timing == "OPEN"
            )
            if invalidated and not opened_in_zone:
                state = "AMBIGUOUS_PRE_ENTRY" if touched else "INVALIDATED_BEFORE_ENTRY"
                events.append({"state": state, "date": day})
                return result(state, day)
            if not touched:
                continue
            if observation.entry_timing == EntryTiming.BREAKOUT:
                if not (
                    float(bar.close_price) > trigger
                    and observation.average_volume
                    and bar.volume >= observation.average_volume
                ):
                    continue
                activation = day
                events.append({"state": "ACTIVATED", "date": day, "reason": "COMPLETED_BREAKOUT"})
                # Completed close and volume are not known at this session's open/close auction.
                continue
            activation = day
        elif activation is None:
            activation = observation.as_of_date
        if not any(event["state"] == "ACTIVATED" for event in events):
            events.append({"state": "ACTIVATED", "date": activation})
        attempts.append(day)
        events.append({"state": "ORDER_ATTEMPT", "date": day})
        reference = (
            observation.trigger_price
            if canonical and observation.entry_timing == EntryTiming.BREAKOUT
            else observation.close_price
        )
        if (
            reference is not None
            and isfinite(reference)
            and reference > 0
            and (raw / reference - 1) * 100 > config.maximum_entry_gap_percent
        ):
            events.append({"state": "REJECTED", "date": day, "reason": "GAP_REJECTED"})
            return result("GAP_REJECTED", day)
        slippage = _slippage_bps(observation.median_turnover, config)
        fill = round_tick(raw * (1 + slippage / 10000), rule.tick_size, up=True)
        rounded_target = (
            round_tick(target, rule.tick_size, up=False) if target is not None else None
        )
        if (
            (rounded_stop is not None and fill <= rounded_stop)
            or (rounded_target is not None and fill >= rounded_target)
            or (zone_high is not None and fill > zone_high)
        ):
            return result("INVALID_PLAN", day)
        if not price_limit_allows(fill, rule):
            return result("PRICE_LIMIT", day)
        if (
            config.order_value_bdt
            > (observation.median_turnover or 0) * config.maximum_turnover_fraction
        ):
            return result("CAPACITY_EXCEEDED", day)
        unit_cost = fill * (1 + config.one_way_cost_bps / 10000)
        quantity = int(config.order_value_bdt / unit_cost / rule.lot_size) * rule.lot_size
        if quantity <= 0:
            return result("LOT_TOO_LARGE", day)
        settle_index = index + rule.settlement_sessions
        settlement = session_dates[settle_index] if settle_index < len(session_dates) else None
        events.append(
            {
                "state": "FILLED",
                "date": day,
                "quantity": quantity,
                "price": fill,
                "timing": fill_timing,
            }
        )
        return result(
            "FILLED",
            day,
            raw_price=raw,
            fill_price=fill,
            slippage_bps=slippage,
            quantity=quantity,
            settlement_date=settlement,
            rules_verified=verified,
            fill_timing=fill_timing,
        )
    events.append(
        {"state": "EXPIRED", "date": session_dates[min(start + expiry, len(session_dates)) - 1]}
    )
    return result(last_status, session_dates[min(start + expiry, len(session_dates)) - 1])


def _benchmark_close_by_date(summaries: tuple[DailyMarketSummary, ...]) -> dict[date, float]:
    preferred = [row for row in summaries if row.index_name == "DSEX"]
    return {
        row.trade_date: float(row.index_close)
        for row in (preferred or [row for row in summaries if row.index_name == "GENERAL"])
        if row.index_close is not None and row.index_close > 0
    }


def action_terms(history, start, end):
    actions = sorted(
        (action for action in history.corporate_actions if start < action.effective_date <= end),
        key=lambda row: row.effective_date,
    )
    covered = {action.effective_date for action in actions}
    unresolved = any(
        start < day <= end and day not in covered for day in history.corporate_action_dates
    )
    return actions, unresolved


def compute_forward_outcome(
    observation: ReplayObservation,
    execution: ExecutionResult,
    history: StockReplayHistory,
    session_dates: tuple[date, ...],
    market_summaries: tuple[DailyMarketSummary, ...],
    config: BacktestConfig,
    horizon_sessions: int,
) -> ForwardOutcome:
    base = ForwardOutcome(
        observation.stock_id,
        observation.as_of_date,
        horizon_sessions,
        "UNFILLED",
        execution.status,
        outcome_end_date=execution.execution_date or observation.as_of_date,
    )
    if not execution.is_filled or execution.fill_price is None or execution.execution_date is None:
        return base
    start = bisect_right(session_dates, execution.execution_date) - 1
    end_index = start + horizon_sessions
    if end_index >= len(session_dates):
        return replace(base, status="INSUFFICIENT_HORIZON", outcome_end_date=None)
    horizon = session_dates[end_index]
    base = replace(base, horizon_date=horizon)
    bars = {bar.trade_date: bar for bar in history.prices}
    shares, distribution = 1.0, 0.0
    stop = observation.invalidation_price if execution.policy_id.startswith("canonical-") else None
    target = observation.target_price if execution.policy_id.startswith("canonical-") else None
    pending_exit = None
    events, path = [], []
    for index in range(start, len(session_dates)):
        day = session_dates[index]
        if index > start:
            actions, unresolved = action_terms(history, session_dates[index - 1], day)
            if unresolved:
                return replace(base, status="CORPORATE_ACTION_UNRESOLVED", outcome_end_date=None)
            for action in actions:
                distribution += shares * action.cash_per_old_share
                shares *= action.shares_multiplier
                stop = stop / action.shares_multiplier if stop is not None else None
                target = target / action.shares_multiplier if target is not None else None
                events.append(
                    {
                        "state": "CORPORATE_ACTION",
                        "date": day,
                        "shares_multiplier": action.shares_multiplier,
                        "cash_per_old_share": action.cash_per_old_share,
                    }
                )
        bar = bars.get(day)
        reason = pending_exit
        unavailable = observation_block(bar)
        if unavailable:
            reason = reason or ("HORIZON" if index >= end_index else None)
            if reason:
                pending_exit = reason
                events.append({"state": "EXIT_BLOCKED", "date": day, "reason": unavailable})
            else:
                events.append({"state": "SESSION_BLOCKED", "date": day, "reason": unavailable})
            continue
        opening, close = float(bar.open_price), float(bar.close_price)
        raw = opening
        stop_allowed = index > start or execution.fill_timing in {"OPEN", "INTRADAY"}
        target_allowed = index > start or execution.fill_timing == "OPEN"
        if reason is None and stop_allowed:
            if stop is not None and float(bar.low_price) <= stop:
                reason, raw = "STOP", min(opening, stop)
            elif target_allowed and target is not None and float(bar.high_price) >= target:
                reason, raw = "TARGET", target  # no favorable gap improvement
        if reason is None and index >= end_index:
            reason, raw = "HORIZON", close
        if reason is None:
            path.append(shares * close + distribution)
            continue
        blocked = execution_session_block(history, day)
        rule, _ = rule_on(history, day, config)
        if not blocked and (execution.settlement_date is None or day < execution.settlement_date):
            blocked = "UNSETTLED_SHARES"
        if not blocked and rule is None:
            blocked = "RULES_UNAVAILABLE"
        exit_price = None
        if not blocked:
            exit_price = round_tick(
                raw * (1 - (execution.slippage_bps or 0) / 10000), rule.tick_size, up=False
            )
            if not price_limit_allows(raw, rule) or not price_limit_allows(exit_price, rule):
                blocked = "PRICE_LIMIT"
        if blocked:
            pending_exit = reason
            events.append({"state": "EXIT_BLOCKED", "date": day, "reason": blocked})
            path.append(shares * close + distribution)
            continue
        # A horizon close is observed while holding; a stop/target day's close may be later.
        if reason == "HORIZON" and pending_exit is None:
            path.append(shares * close + distribution)
        entry_cost = execution.fill_price * (1 + config.one_way_cost_bps / 10000)
        proceeds = shares * exit_price * (1 - config.one_way_cost_bps / 10000) + distribution
        net = (proceeds / entry_cost - 1) * 100
        # Open benchmark history is unavailable in this schema. Never align open stock entry
        # with a same-day close benchmark. Close execution alone supports matched excess.
        benchmark = _benchmark_close_by_date(market_summaries)
        benchmark_return = None
        if (
            execution.fill_timing == "CLOSE"
            and reason == "HORIZON"
            and not pending_exit
            and execution.execution_date in benchmark
            and day in benchmark
        ):
            benchmark_return = (benchmark[day] / benchmark[execution.execution_date] - 1) * 100
        events.append({"state": "EXIT", "date": day, "reason": reason, "price": exit_price})
        return replace(
            base,
            status="AVAILABLE",
            outcome_end_date=day,
            net_return_percent=net,
            raw_close_return_percent=((shares * raw + distribution) / execution.raw_price - 1)
            * 100,
            benchmark_return_percent=benchmark_return,
            excess_return_percent=net - benchmark_return if benchmark_return is not None else None,
            maximum_favorable_excursion_percent=(max(path) / entry_cost - 1) * 100
            if path
            else None,
            maximum_adverse_excursion_percent=(min(path) / entry_cost - 1) * 100 if path else None,
            exit_reason=reason,
            exit_price=exit_price,
            exit_quantity=shares * execution.quantity,
            cash_distribution_per_entry_share=distribution,
            events=tuple(events),
        )
    return replace(base, status="EXIT_BLOCKED", outcome_end_date=None, events=tuple(events))


def compute_selection_markout(
    observation, history, session_dates, market_summaries, config, horizon
):
    """Common close-to-close total-return label; never conditioned on orders or fills."""
    start = bisect_right(session_dates, observation.as_of_date) - 1
    base = ForwardOutcome(
        observation.stock_id,
        observation.as_of_date,
        horizon,
        "INSUFFICIENT_HORIZON",
        "NOT_PERMITTED",
    )
    if start < 0 or start + horizon >= len(session_dates):
        return base
    day = session_dates[start + horizon]
    base = replace(base, horizon_date=day, outcome_end_date=day)
    bars = {bar.trade_date: bar for bar in history.prices}
    bar = bars.get(day)
    if bar is None:
        return replace(base, status="NO_HORIZON_BAR")
    if bar.volume <= 0:
        return replace(base, status="ZERO_VOLUME_AT_HORIZON")
    if (
        not observation.close_price
        or not isfinite(observation.close_price)
        or observation.close_price <= 0
        or bar.close_price is None
        or not isfinite(float(bar.close_price))
        or bar.close_price <= 0
    ):
        return replace(base, status="INVALID_MARKOUT_PRICE")
    actions, unresolved = action_terms(history, observation.as_of_date, day)
    if unresolved:
        return replace(base, status="CORPORATE_ACTION_UNRESOLVED")
    shares, cash = 1.0, 0.0
    for action in actions:
        cash += shares * action.cash_per_old_share
        shares *= action.shares_multiplier
    slippage = _slippage_bps(observation.median_turnover, config) / 10000
    fee = config.one_way_cost_bps / 10000
    gross = (shares * float(bar.close_price) + cash) / observation.close_price - 1
    net = (
        (shares * float(bar.close_price) * (1 - slippage) * (1 - fee) + cash)
        / (observation.close_price * (1 + slippage) * (1 + fee))
        - 1
    ) * 100
    benchmark = _benchmark_close_by_date(market_summaries)
    excess = None
    if observation.as_of_date in benchmark and day in benchmark:
        excess = (benchmark[day] / benchmark[observation.as_of_date] - 1) * 100
    return replace(
        base,
        status="AVAILABLE",
        raw_close_return_percent=gross * 100,
        net_return_percent=net,
        benchmark_return_percent=excess,
        excess_return_percent=net - excess if excess is not None else None,
    )
