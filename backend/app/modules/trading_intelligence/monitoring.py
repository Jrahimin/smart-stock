from __future__ import annotations

import logging
from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime
from typing import Literal

from app.core.constants.trading_constants import (
    DECISION_TAXONOMY_VERSION,
    TRADING_INPUT_SCHEMA_VERSION,
    TRADING_MONITOR_ACTION_DISTRIBUTION_DELTA,
    TRADING_MONITOR_ELIGIBILITY_RATE_DELTA,
    TRADING_STRATEGY_VERSION,
    TRADING_THRESHOLD_VERSION,
)
from app.modules.market_universe.market_universe_lineage import (
    compute_universe_payload_revision,
)
from app.modules.market_universe.market_universe_schemas import (
    ScoredUniverseCacheRead,
    ScoredUniverseRow,
)
from app.modules.stock_details.stock_details_schemas import CanonicalDecisionResultRead

logger = logging.getLogger(__name__)

MonitoringSeverity = Literal["INFO", "WARNING", "ERROR"]


@dataclass(frozen=True)
class TradingIntelligenceMonitoringIssue:
    code: str
    severity: MonitoringSeverity
    message: str
    stock_id: str | None = None


@dataclass(frozen=True)
class TradingIntelligenceMonitoringReport:
    issues: tuple[TradingIntelligenceMonitoringIssue, ...]

    @property
    def has_errors(self) -> bool:
        return any(issue.severity == "ERROR" for issue in self.issues)

    @property
    def is_healthy(self) -> bool:
        return not self.issues


@dataclass(frozen=True)
class DecisionFunnel:
    total_universe: int
    eligible: int
    bullish_opportunity: int
    potential_buy: int
    hold: int
    wait: int
    sell: int
    unavailable: int
    blocked_by_data: int
    blocked_by_liquidity: int
    blocked_by_extension: int
    blocked_by_entry_plan: int
    blocked_by_risk: int
    other_or_unblocked: int

    @property
    def reconciles(self) -> bool:
        return self.total_universe == (
            self.potential_buy + self.hold + self.wait + self.sell + self.unavailable
        )

    @property
    def buy(self) -> int:
        """Compatibility alias for the pre-v2 operator field name."""
        return self.potential_buy


def build_decision_funnel(rows: list[ScoredUniverseRow]) -> DecisionFunnel:
    actions: Counter[str] = Counter()
    blockers: Counter[str] = Counter()
    eligible = 0
    bullish_opportunity = 0

    for row in rows:
        canonical = row.decision.canonical if row.decision is not None else None
        if canonical is None:
            actions["UNAVAILABLE"] += 1
        else:
            actions[canonical.display_action.value] += 1
            if canonical.eligibility_status.value == "ELIGIBLE":
                eligible += 1
            if canonical.display_action.value == "POTENTIAL_BUY":
                bullish_opportunity += 1

        constraint_codes = {
            constraint.code for constraint in row.decision.constraints
        } if row.decision is not None else set()
        if constraint_codes & {"data_eligibility", "corporate_action_review"}:
            blockers["data"] += 1
        elif constraint_codes & {"illiquid", "thin_liquidity"}:
            blockers["liquidity"] += 1
        elif constraint_codes & {"extended_momentum", "near_resistance"}:
            blockers["extension"] += 1
        elif "entry_plan_not_valid" in constraint_codes:
            blockers["entry_plan"] += 1
        elif "elevated_trading_risk" in constraint_codes:
            blockers["risk"] += 1
        else:
            blockers["other_or_unblocked"] += 1

    return DecisionFunnel(
        total_universe=len(rows),
        eligible=eligible,
        bullish_opportunity=bullish_opportunity,
        potential_buy=actions["POTENTIAL_BUY"],
        hold=actions["HOLD"],
        wait=actions["WAIT"],
        sell=actions["SELL"],
        unavailable=actions["UNAVAILABLE"],
        blocked_by_data=blockers["data"],
        blocked_by_liquidity=blockers["liquidity"],
        blocked_by_extension=blockers["extension"],
        blocked_by_entry_plan=blockers["entry_plan"],
        blocked_by_risk=blockers["risk"],
        other_or_unblocked=blockers["other_or_unblocked"],
    )


def _action_distribution(payload: ScoredUniverseCacheRead) -> dict[str, float]:
    actions = [
        row.decision.canonical.display_action.value
        for row in payload.rows
        if row.decision is not None and row.decision.canonical is not None
    ]
    if not actions:
        return {}
    counts = Counter(actions)
    return {action: count / len(actions) for action, count in counts.items()}


def _eligible_rate(payload: ScoredUniverseCacheRead) -> float | None:
    statuses = [
        row.decision.canonical.eligibility_status.value
        for row in payload.rows
        if row.decision is not None and row.decision.canonical is not None
    ]
    if not statuses:
        return None
    return statuses.count("ELIGIBLE") / len(statuses)


def _like_for_like(
    current: ScoredUniverseCacheRead,
    previous: ScoredUniverseCacheRead,
) -> bool:
    return (
        current.strategy_version == previous.strategy_version
        and current.threshold_version == previous.threshold_version
        and current.input_schema_version == previous.input_schema_version
        and current.decision_taxonomy_version == previous.decision_taxonomy_version
    )


def monitor_universe_payload(
    payload: ScoredUniverseCacheRead,
    *,
    expected_session_date: date | None,
    expected_source_last_synced_at: datetime | None,
    previous_payload: ScoredUniverseCacheRead | None = None,
    cross_surface_results: tuple[CanonicalDecisionResultRead, ...] = (),
) -> TradingIntelligenceMonitoringReport:
    issues: list[TradingIntelligenceMonitoringIssue] = []

    def add(
        code: str,
        severity: MonitoringSeverity,
        message: str,
        stock_id: str | None = None,
    ) -> None:
        issues.append(TradingIntelligenceMonitoringIssue(code, severity, message, stock_id))

    if payload.strategy_version != TRADING_STRATEGY_VERSION:
        add("STALE_STRATEGY_VERSION", "ERROR", "Universe strategy version is not current.")
    if payload.threshold_version != TRADING_THRESHOLD_VERSION:
        add("STALE_THRESHOLD_VERSION", "ERROR", "Universe threshold version is not current.")
    if payload.input_schema_version != TRADING_INPUT_SCHEMA_VERSION:
        add("STALE_INPUT_SCHEMA_VERSION", "ERROR", "Universe input schema is not current.")
    if payload.decision_taxonomy_version != DECISION_TAXONOMY_VERSION:
        add(
            "STALE_DECISION_TAXONOMY_VERSION",
            "ERROR",
            "Universe public decision taxonomy is not current.",
        )
    if expected_session_date is not None and payload.session_trade_date != expected_session_date:
        add("STALE_SESSION", "ERROR", "Universe session does not match current market freshness.")
    if (
        expected_source_last_synced_at is not None
        and payload.source_last_synced_at != expected_source_last_synced_at
    ):
        add(
            "STALE_SOURCE_REVISION",
            "ERROR",
            "Universe source revision does not match the latest price synchronization.",
        )

    actual_payload_revision = compute_universe_payload_revision(payload.rows)
    if payload.payload_revision != actual_payload_revision:
        add(
            "PAYLOAD_REVISION_MISMATCH",
            "ERROR",
            "Universe row identities do not match the cache envelope revision.",
        )

    shared_ids: set[str] = set()
    universe_by_stock: dict[str, CanonicalDecisionResultRead] = {}
    for row in payload.rows:
        canonical = row.decision.canonical if row.decision is not None else None
        stock_id = str(row.stock.id)
        if canonical is None:
            add(
                "MISSING_CANONICAL_DECISION",
                "ERROR",
                "Universe row has no canonical decision.",
                stock_id,
            )
            continue
        universe_by_stock[stock_id] = canonical
        if canonical.input_hash is None or len(canonical.input_hash) != 64:
            add(
                "INVALID_INPUT_HASH",
                "ERROR",
                "Canonical input hash is missing or malformed.",
                stock_id,
            )
        if canonical.shared_decision_id in shared_ids:
            add(
                "DUPLICATE_SHARED_DECISION_ID",
                "ERROR",
                "Shared decision ID is duplicated.",
                stock_id,
            )
        shared_ids.add(canonical.shared_decision_id)
        if expected_session_date is not None and canonical.as_of_date != expected_session_date:
            add(
                "ROW_SESSION_MISMATCH",
                "ERROR",
                "Canonical row is not for the cache session.",
                stock_id,
            )
        if canonical.decision_taxonomy_version != payload.decision_taxonomy_version:
            add(
                "ROW_TAXONOMY_MISMATCH",
                "ERROR",
                "Canonical row taxonomy does not match the cache envelope.",
                stock_id,
            )

    for other in cross_surface_results:
        stock_id = str(other.stock_id)
        canonical = universe_by_stock.get(stock_id)
        if canonical is None:
            continue
        comparable = (
            canonical.as_of_date == other.as_of_date
            and canonical.strategy_version == other.strategy_version
            and canonical.threshold_version == other.threshold_version
            and canonical.decision_taxonomy_version
            == other.decision_taxonomy_version
        )
        if not comparable:
            continue
        if canonical.input_hash != other.input_hash:
            add(
                "CROSS_SURFACE_INPUT_MISMATCH",
                "WARNING",
                "Comparable surfaces used different input revisions.",
                stock_id,
            )
        elif (
            canonical.shared_decision_id != other.shared_decision_id
            or canonical.recommendation != other.recommendation
            or canonical.display_action != other.display_action
            or canonical.primary_reason_code != other.primary_reason_code
        ):
            add(
                "CROSS_SURFACE_RESULT_MISMATCH",
                "ERROR",
                "Comparable surfaces disagree despite an identical input hash.",
                stock_id,
            )

    if previous_payload is not None and _like_for_like(payload, previous_payload):
        current_distribution = _action_distribution(payload)
        previous_distribution = _action_distribution(previous_payload)
        action_keys = set(current_distribution) | set(previous_distribution)
        total_variation = sum(
            abs(current_distribution.get(key, 0.0) - previous_distribution.get(key, 0.0))
            for key in action_keys
        ) / 2
        if total_variation >= TRADING_MONITOR_ACTION_DISTRIBUTION_DELTA:
            add(
                "ACTION_DISTRIBUTION_DRIFT",
                "WARNING",
                f"Action distribution total variation is {total_variation:.3f}.",
            )
        current_eligible = _eligible_rate(payload)
        previous_eligible = _eligible_rate(previous_payload)
        if (
            current_eligible is not None
            and previous_eligible is not None
            and abs(current_eligible - previous_eligible) >= TRADING_MONITOR_ELIGIBILITY_RATE_DELTA
        ):
            add(
                "ELIGIBILITY_RATE_DRIFT",
                "WARNING",
                "Eligible-universe rate changed beyond the operational threshold.",
            )

    return TradingIntelligenceMonitoringReport(tuple(issues))


def log_monitoring_report(
    report: TradingIntelligenceMonitoringReport,
    *,
    exchange: str,
) -> None:
    for issue in report.issues:
        log = logger.error if issue.severity == "ERROR" else logger.warning
        log(
            "trading_intelligence_monitor exchange=%s code=%s stock_id=%s message=%s",
            exchange,
            issue.code,
            issue.stock_id,
            issue.message,
        )
