from __future__ import annotations

from bisect import bisect_right
from dataclasses import replace
from datetime import datetime, time
from zoneinfo import ZoneInfo

from app.modules.backtesting.backtesting_availability import capture_availability, next_verified_open

from app.core.constants.trading_constants import (
    DECISION_RECOMMENDATION_LOOKBACK,
    ELIGIBILITY_SESSION_LOOKBACK,
)
from app.core.enums import EligibilityStatus, MarketDataState
from app.modules.backtesting.backtesting_execution import (
    compute_forward_outcome,
    observation_block,
    simulate_next_session_execution,
)
from app.modules.backtesting.backtesting_models import (
    BacktestConfig,
    BacktestDataset,
    ForwardOutcome,
    ReplayObservation,
)
from app.modules.market_pulse.pulse_score import compute_pulse_score
from app.modules.stock_details.decision.canonical import build_strategy_input
from app.modules.stock_details.decision.engine import compute_trader_decision
from app.modules.stock_details.decision.event_availability import utc_instant
from app.modules.stock_details.decision.market_regime import (
    resolve_regime_result_from_summaries,
)
from app.modules.stock_details.decision.summary import build_trader_decision_summary
from app.modules.trading_intelligence.input_capture import restore_strategy_input


def replay_canonical_engine(
    dataset: BacktestDataset,
    config: BacktestConfig,
    *, audit: dict | None = None,
) -> tuple[tuple[ReplayObservation, ...], tuple[ForwardOutcome, ...]]:
    """Replay each stock with only bars, events, sessions and summaries known as of that date."""
    observations: list[ReplayObservation] = []
    outcomes: list[ForwardOutcome] = []
    session_dates = dataset.session_dates

    exclusions = []
    classifications = []
    attempted_members = []
    def inputs():
        if config.replay_mode != "reconstructed":
            histories = {str(history.stock.id): history for history in dataset.histories}
            publications = dataset.publications
            if not publications:
                # Compatibility archives carry per-member captures only.
                grouped = {}
                for history in dataset.histories:
                    for capture in history.captured_inputs:
                        key = capture.get("publication_id") or capture["observed_at"]
                        row = grouped.setdefault(key, {"generation_id": key, "session_date": capture["input"]["reference_date"],
                            "strategy_version": capture["input"].get("strategy_version", config.strategy_version), "observed_at": capture["observed_at"], "members": []})
                        row["members"].append(str(history.stock.id))
                publications = tuple(grouped.values())
            if config.publication_ids:
                publications = tuple(row for row in publications if row["generation_id"] in config.publication_ids)
            dates = {row["session_date"] for row in publications}
            for day in session_dates:
                if config.start_date <= day <= config.end_date and day.isoformat() not in dates:
                    exclusions.append({"date": day.isoformat(), "stock_id": None, "classification": "UNAVAILABLE", "reason": "PUBLICATION_UNAVAILABLE"})
            first = {}
            for publication in sorted(publications, key=lambda row: (row["session_date"], row["observed_at"], row["generation_id"])):
                if publication["session_date"] in first:
                    exclusions.append({"date": publication["session_date"], "publication_id": publication["generation_id"], "reason": "NON_PRIMARY_PUBLICATION_VINTAGE", "original_publication_id": first[publication["session_date"]]})
                    continue
                first[publication["session_date"]] = publication["generation_id"]
                day = __import__("datetime").date.fromisoformat(publication["session_date"])
                if not config.start_date <= day <= config.end_date:
                    continue
                declared_exclusions = {str(row["stock_id"]): row["reason_code"] for row in publication.get("excluded_members", ())
                    if row.get("stock_id") and row.get("reason_code")}
                for member in publication["members"]:
                    history = histories.get(member)
                    capture = next((row for row in history.captured_inputs if (row.get("publication_id") or row["observed_at"]) == publication["generation_id"]), None) if history else None
                    base = {"date": day.isoformat(), "stock_id": member, "publication_id": publication["generation_id"]}
                    attempted_members.append(base)
                    if not publication.get("invalidated_at") and member in declared_exclusions:
                        exclusions.append({**base, "classification": "UNAVAILABLE", "reason": declared_exclusions[member], "publisher_declared": True})
                        continue
                    if capture is None or publication.get("invalidated_at"):
                        exclusions.append({**base, "classification": "UNAVAILABLE", "reason": "PUBLICATION_WITHDRAWN" if publication.get("invalidated_at") else "MEMBER_INPUT_UNAVAILABLE"})
                        continue
                    status, reason, deadline = capture_availability(capture, day, session_dates, config, dataset.observed_session_dates)
                    classifications.append({**base, "classification": status, "reason": reason,
                        "observed_at": capture["observed_at"], "calculated_at": capture["input"]["calculated_at"], "cutoff": deadline})
                    if (status != "TIMELY_CAPTURED" and config.replay_mode == "captured") or (
                        status == "UNAVAILABLE" and reason not in {"NEXT_OPEN_UNVERIFIED", "SOURCE_OBSERVATION_UNKNOWN"}
                    ):
                        exclusions.append({**base, "classification": status, "reason": reason})
                        continue
                    value = restore_strategy_input({**capture["input"], "strategy_version": publication["strategy_version"]})
                    if value.finality != MarketDataState.FINALIZED or any(bar.trade_date > day for bar in value.prices):
                        raise ValueError("Captured replay input exceeds its finalized as-of boundary")
                    yield history, day, value, {**capture, "publication_id": publication["generation_id"]}, status, deadline
            return
        for history in dataset.histories:
            price_dates = tuple(price.trade_date for price in history.prices)
            for day in price_dates:
                if not config.start_date <= day <= config.end_date or day not in session_dates:
                    continue
                prefix_end = bisect_right(price_dates, day)
                if prefix_end < config.minimum_history_rows:
                    continue
                window = list(history.prices[max(0, prefix_end-DECISION_RECOMMENDATION_LOOKBACK):prefix_end])
                end = bisect_right(session_dates, day)
                sessions = session_dates[max(0, end-ELIGIBILITY_SESSION_LOOKBACK):end]
                regime = resolve_regime_result_from_summaries([summary for summary in dataset.market_summaries if summary.trade_date <= day], decision_session_date=day)
                value = build_strategy_input(history.stock, window, reference_date=day,
                    event_observations=history.event_observations, exchange_session_dates=sessions,
                    market_regime=regime, calculated_at=datetime.combine(day, time.fromisoformat(config.session_close_time), tzinfo=ZoneInfo("Asia/Dhaka")))
                value = replace(value, strategy_version=config.strategy_version, category=history.stock.category if config.use_current_category_proxy else None, is_active=True)
                classifications.append({"date": day.isoformat(), "stock_id": str(history.stock.id), "classification": "RECONSTRUCTED"})
                yield history, day, value, None, "RECONSTRUCTED", next_verified_open(day, session_dates, config, dataset.observed_session_dates)

    for history, as_of_date, strategy_input, capture, classification, deadline in inputs():
        market_regime = strategy_input.market_regime
        bundle = compute_trader_decision(strategy_input)
        if (
            bundle is None
            or bundle.eligibility is None
            or bundle.evidence_strength is None
            or bundle.canonical_result is None
        ):
            continue
        decision_read = build_trader_decision_summary(bundle)
        pulse = compute_pulse_score(bundle.snapshot, decision_read)
        latest_bar = strategy_input.prices[-1]
        observation = ReplayObservation(
            stock_id=history.stock.id,
            symbol=strategy_input.symbol or history.stock.symbol,
            # Current instrument metadata is not evidence of a historical sector.
            sector=None,
            category=strategy_input.category,
            as_of_date=as_of_date,
            market_regime=market_regime.label,
            recommendation=bundle.decision.recommendation,
            eligibility_status=bundle.eligibility.status,
            eligibility_reason_codes=bundle.eligibility.reason_codes,
            evidence_strength=bundle.evidence_strength.score,
            opportunity_score=bundle.opportunity.score,
            pulse_score=pulse.total,
            median_turnover=bundle.eligibility.median_turnover,
            traded_session_ratio=bundle.eligibility.traded_session_ratio,
            close_price=(
                float(latest_bar.close_price)
                if latest_bar.trade_date == as_of_date and not observation_block(latest_bar)
                else None
            ),
            sma20=bundle.snapshot.sma20,
            sma50=bundle.snapshot.sma50,
            rsi=bundle.snapshot.rsi,
            shared_decision_id=bundle.canonical_result.shared_decision_id,
            opportunity_quality=bundle.canonical_result.opportunity_quality,
            entry_readiness=bundle.canonical_result.entry_readiness,
            entry_timing=bundle.canonical_result.entry_timing,
            blocker_codes=bundle.canonical_result.blocker_codes,
            regime_score=bundle.canonical_result.regime_score,
            regime_phase=bundle.canonical_result.regime_phase,
            regime_confidence=bundle.canonical_result.regime_confidence,
            internal_action=bundle.canonical_result.internal_action,
            display_action=bundle.canonical_result.display_action,
            decision_taxonomy_version=(bundle.canonical_result.decision_taxonomy_version),
            entry_condition=bundle.canonical_result.entry_condition,
            preferred_entry_zone_low=bundle.trade_plan.preferred_entry_zone_low,
            preferred_entry_zone_high=bundle.trade_plan.preferred_entry_zone_high,
            trigger_price=bundle.trade_plan.trigger_price,
            invalidation_price=bundle.trade_plan.invalidation_price,
            expiry_sessions=bundle.trade_plan.expiry_sessions,
            average_volume=bundle.snapshot.average_volume,
            target_price=bundle.trade_plan.target_low,
            controlling_reason=bundle.canonical_result.primary_reason_code,
            liquidity_tier=bundle.liquidity.label.value,
            publication_id=capture.get("publication_id") if capture else None,
            replay_classification=classification,
            publication_observed_at=utc_instant(capture["observed_at"]) if capture else None,
            input_calculated_at=strategy_input.calculated_at,
            selection_at=utc_instant(capture.get("selection_at") or capture["observed_at"]) if capture else strategy_input.calculated_at,
            next_open_at=deadline, engine_version=strategy_input.strategy_version,
            input_hash=bundle.canonical_result.input_hash,
            publication_coverage_status=capture.get("coverage_status", "UNKNOWN") if capture else "UNKNOWN",
            parity_status="MATCH" if capture else "UNAVAILABLE",

        )
        if capture:
            expected = capture.get("expected_decision") or {}
            actual = {key: getattr(observation, key) for key in expected}
            differences = tuple(key for key in expected if actual[key] != expected[key])
            observation = replace(observation, parity_status="UNAVAILABLE" if not expected else "MISMATCH" if differences else "MATCH", parity_differences=differences)
            if (differences or not expected) and config.replay_mode == "captured":
                exclusions.append({"date": as_of_date.isoformat(), "stock_id": str(history.stock.id), "publication_id": observation.publication_id, "reason": "SAME_INPUT_PARITY_MISMATCH", "fields": differences})
                continue
        observations.append(observation)
        execution = simulate_next_session_execution(
            observation,
            history,
            session_dates,
            config,
        )
        for horizon in config.horizons:
            outcomes.append(
                compute_forward_outcome(
                    observation,
                    execution,
                    history,
                    session_dates,
                    dataset.market_summaries,
                    config,
                    horizon,
                )
            )

    observations.sort(
        key=lambda item: (
            item.as_of_date,
            item.symbol.casefold(),
            str(item.stock_id),
        )
    )
    outcomes.sort(
        key=lambda item: (
            item.as_of_date,
            str(item.stock_id),
            item.horizon_sessions,
        )
    )
    if audit is not None:
        audit.update(replay_mode=config.replay_mode, input_classifications=classifications, replay_exclusions=exclusions, attempted_members=attempted_members)
    return tuple(observations), tuple(outcomes)


def eligible_observations(
    observations: tuple[ReplayObservation, ...],
) -> tuple[ReplayObservation, ...]:
    return tuple(
        item for item in observations if item.eligibility_status == EligibilityStatus.ELIGIBLE
    )
