"""Predeclared, fixed-weight research challengers. No parameter fitting or production changes."""

from collections import defaultdict
from dataclasses import replace
from datetime import UTC, datetime, time
from statistics import mean, median

from app.core.audit_hashing import stable_audit_hash
from app.core.enums import EligibilityStatus
from app.modules.backtesting.backtesting_evaluation import observation_key, shortlist_key, top_five
from app.modules.market_universe.shortlist import RANKING_POLICY_VERSION
from app.modules.stock_details.decision.event_availability import utc_instant
from app.modules.trading_intelligence.input_capture import restore_strategy_input

# The archive carries retrospective summaries/current classifications for audit.
# It has no independently versioned point-in-time observations for these inputs.
CHALLENGER_INPUT_GAPS = {
    "relative_strength": ("MARKET_SUMMARY_PIT_UNKNOWN", "SECTOR_CLASSIFICATION_PIT_UNKNOWN"),
    "breadth_persistence": ("MARKET_SUMMARY_PIT_UNKNOWN",),
}
CHALLENGER_INPUT_PROVENANCE = {
    "market_summaries": "RETROSPECTIVE_SNAPSHOT",
    "sector_classifications": "CURRENT_METADATA",
    "challenger_input_gaps": CHALLENGER_INPUT_GAPS,
}

EXPERIMENT = {
    "version": "phase2-shadow-factors-v2",
    "ranking_baseline": RANKING_POLICY_VERSION,
    "entry_baseline": "canonical-plan-v1",
    "families": (
        "relative_strength",
        "breadth_persistence",
        "turnover_trades",
        "followthrough_exhaustion",
    ),
    "lookbacks": {
        "relative_strength": 20,
        "breadth_persistence": 5,
        "turnover_trades": (5, 20),
        "followthrough_exhaustion": (3, 20),
    },
    "weights": "Equal same-date percentile weights; no fitted transformations. Missing "
    "features retain baseline ordering.",
    "exhaustion_threshold_percent": 15.0,
    "entry_challenger": {"version": "canonical-tight-gap-v1", "maximum_entry_gap_percent": 2.5},
    "primary_horizon": 10,
    "diagnostic_horizons": (3, 5, 20),
    "ranking_gate": {
        "minimum_dates": 60,
        "minimum_evaluable_selections": 200,
        "minimum_excess_improvement_pp": 0.25,
        "minimum_relative_precision_improvement": 0.10,
    },
    "entry_gate": {
        "minimum_dates": 60,
        "minimum_filled_outcomes": 200,
        "maximum_cohort_loss_pp": 0.5,
        "maximum_fill_rate_loss": 0.05,
        "sufficient_cohort_dates": 20,
        "sufficient_cohort_selections": 30,
    },
    "uncertainty": {
        "method": "paired nonoverlapping date-block mean bootstrap",
        "block_sessions": 20,
        "replicates": 2000,
        "seed": 271828,
        "interval": (0.025, 0.975),
    },
    "safeguards": {
        "maximum_sector_concentration_increase": 0.05,
        "minimum_relative_median_turnover": 0.9,
        "maximum_turnover_increase": 0.10,
    },
    "model": "Not fitted: deterministic factors first; future fitting requires a new "
    "frozen training-only protocol.",
    "patterns": "No pattern challenger: not captured as an independent PIT factor; "
    "incremental test remains unsupported.",
    "events": "No event-alpha challenger: only known-at events may enter future "
    "predeclared variants.",
    "prospective_shadow_required": True,
    "unsupported_family_input_gaps": CHALLENGER_INPUT_GAPS,
}
EXPERIMENT_ID = stable_audit_hash(EXPERIMENT)


def enrich_features(observations, dataset):
    histories = {row.stock.id: row for row in dataset.histories}
    grouped = defaultdict(list)
    for item in observations:
        grouped[item.as_of_date].append(item)
    enriched = []
    for day, rows in sorted(grouped.items()):
        for item in rows:
            bars = [bar for bar in histories[item.stock_id].prices if bar.trade_date <= day]
            captures = [
                capture
                for capture in histories[item.stock_id].captured_inputs
                if capture["input"]["reference_date"] == day.isoformat()
                and utc_instant(capture["observed_at"])
                <= datetime.combine(day, time(18), tzinfo=UTC)
            ]
            if captures:
                capture = max(captures, key=lambda row: utc_instant(row["observed_at"]))
                bars = list(restore_strategy_input(capture["input"]).prices)
            # Missing or untraded rows are not compressed into a fabricated consecutive window.
            sessions = [session for session in dataset.session_dates if session <= day][-25:]
            by_date = {bar.trade_date: bar for bar in bars}
            window = [by_date.get(session) for session in sessions]
            valid = len(window) == 25 and all(
                bar is not None
                and bar.volume > 0
                and bar.close_price is not None
                and bar.close_price > 0
                for bar in window
            )
            factors = {family: None for family in EXPERIMENT["families"]}
            if valid and any(
                sessions[0] <= action.effective_date <= day
                and utc_instant(action.known_at) <= datetime.combine(day, time(18), tzinfo=UTC)
                for action in histories[item.stock_id].corporate_actions
            ):
                valid = False  # Raw-share factors need clean post-action windows.
            if valid:
                stock_return = (
                    float(window[-1].close_price) / float(window[-21].close_price) - 1
                ) * 100
                prior = window[-25:-5]
                recent = window[-5:]
                turnovers = [
                    float(bar.turnover)
                    for bar in prior
                    if bar.turnover is not None and bar.turnover > 0
                ]
                trades = [
                    bar.trade_count
                    for bar in prior
                    if bar.trade_count is not None and bar.trade_count > 0
                ]
                if (
                    len(turnovers) == 20
                    and len(trades) == 20
                    and all(
                        bar.turnover is not None
                        and bar.turnover > 0
                        and bar.trade_count is not None
                        and bar.trade_count > 0
                        for bar in recent
                    )
                ):
                    factors["turnover_trades"] = (
                        median(float(bar.turnover) for bar in recent) / median(turnovers)
                        - 1
                        + median(bar.trade_count for bar in recent) / median(trades)
                        - 1
                    ) / 2
                factors["followthrough_exhaustion"] = (
                    float(window[-1].close_price) / float(window[-4].close_price) - 1
                ) * 100 - max(0, stock_return - EXPERIMENT["exhaustion_threshold_percent"])
            # Relative strength and breadth stay missing until independent as-of capture
            # exists. A matching canonical decision cannot establish their inputs.
            enriched.append(replace(item, research_features=tuple(sorted(factors.items()))))
    return tuple(enriched)


def variants():
    families = EXPERIMENT["families"]
    return {
        **{family: (family,) for family in families},
        "all_families": families,
        **{
            f"without_{family}": tuple(other for other in families if other != family)
            for family in families
        },
    }


def challenger_ranking(observations, families):
    by_date = defaultdict(list)
    for item in observations:
        if item.eligibility_status == EligibilityStatus.ELIGIBLE:
            by_date[item.as_of_date].append(item)
    scores, coverage = {}, CounterCoverage()
    for rows in by_date.values():
        features = {observation_key(row): dict(row.research_features) for row in rows}
        for row in rows:
            key = observation_key(row)
            coverage.total += 1
            if any(features[key].get(family) is None for family in families):
                scores[key] = None
                continue
            coverage.available += 1
            percentiles = []
            for family in families:
                values = [
                    features[observation_key(other)][family]
                    for other in rows
                    if features[observation_key(other)].get(family) is not None
                ]
                value = features[key][family]
                percentiles.append(
                    (
                        sum(other < value for other in values)
                        + 0.5 * sum(other == value for other in values)
                    )
                    / len(values)
                )
            scores[key] = mean(percentiles)
    # Any missing member retains the WHOLE date's baseline order; never drop a hard cohort.
    incomplete_days = {
        day
        for day, rows in by_date.items()
        if any(scores[observation_key(row)] is None for row in rows)
    }

    def key(row):
        base = shortlist_key(row)
        if row.as_of_date in incomplete_days:
            return (*base[:3], 0.0, *base[3:])
        return (*base[:3], -scores[observation_key(row)], *base[3:])

    return (
        top_five(observations, key),
        key,
        {
            "available": coverage.available,
            "total": coverage.total,
            "fallback_dates": len(incomplete_days),
        },
    )


class CounterCoverage:
    def __init__(self):
        self.total = 0
        self.available = 0
