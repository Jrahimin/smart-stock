from __future__ import annotations

from dataclasses import asdict
from hashlib import sha256
from pathlib import Path
from typing import Any

from app.core.audit_hashing import stable_audit_hash
from app.core.constants.trading_constants import (
    DECISION_TAXONOMY_VERSION,
    TRADING_INPUT_SCHEMA_VERSION,
)
from app.models import DailyMarketSummary
from app.modules.backtesting.backtesting_models import (
    BacktestConfig,
    BacktestDataset,
    ForwardOutcome,
    ReplayManifest,
    ReplayObservation,
)
from app.modules.stock_details.decision.lineage import daily_price_audit_payload

TRADING_REPLAY_MANIFEST_VERSION = "trading-replay-manifest-v3"


def _market_summary_payload(summary: DailyMarketSummary) -> dict[str, Any]:
    return {
        "exchange": summary.exchange,
        "trade_date": summary.trade_date,
        "index_name": summary.index_name,
        "index_close": summary.index_close,
        "index_change": summary.index_change,
        "index_change_percent": summary.index_change_percent,
        "total_volume": summary.total_volume,
        "total_turnover": summary.total_turnover,
        "total_trades": summary.total_trades,
        "advancing_issues": summary.advancing_issues,
        "declining_issues": summary.declining_issues,
        "unchanged_issues": summary.unchanged_issues,
        "market_cap": summary.market_cap,
        "source": summary.source,
        "created_at": summary.created_at,
        "updated_at": summary.updated_at,
        "is_finalized": summary.is_finalized,
        "has_suspicious_prices": summary.has_suspicious_prices,
        "data_quality_flag": summary.data_quality_flag,
    }


def build_dataset_revision(dataset: BacktestDataset) -> str:
    histories = []
    for history in sorted(dataset.histories, key=lambda item: str(item.stock.id)):
        histories.append(
            {
                "stock": {
                    "id": history.stock.id,
                    "symbol": history.stock.symbol,
                    "exchange": history.stock.exchange,
                    "sector": history.stock.sector,
                    "category": history.stock.category,
                    "listing_date": history.stock.listing_date,
                    "is_active": history.stock.is_active,
                },
                "prices": [
                    daily_price_audit_payload(price)
                    for price in sorted(history.prices, key=lambda item: item.trade_date)
                ],
                "corporate_action_dates": history.corporate_action_dates,
                "suspension_dates": history.suspension_dates,
                "circuit_locked_dates": history.circuit_locked_dates,
                "execution_rules": history.execution_rules,
                "corporate_actions": history.corporate_actions,
                "event_observations": history.event_observations,
                "captured_inputs": history.captured_inputs,
                "observed_at": [row.updated_at for row in history.prices],
                "coverage": (
                    history.event_coverage_verified,
                    history.point_in_time_verified,
                    history.instrument_history_verified,
                ),
            }
        )
    return stable_audit_hash(
        {
            "input_schema_version": TRADING_INPUT_SCHEMA_VERSION,
            "histories": histories,
            "session_dates": dataset.session_dates,
            "market_summaries": [
                _market_summary_payload(summary)
                for summary in sorted(
                    dataset.market_summaries,
                    key=lambda item: (item.trade_date, item.index_name),
                )
            ],
            "limitations": dataset.limitations,
        }
    )


def build_replay_manifest(
    config: BacktestConfig,
    dataset: BacktestDataset,
    observations: tuple[ReplayObservation, ...],
    outcomes: tuple[ForwardOutcome, ...],
    audit: dict | None = None,
    research: dict | None = None,
) -> ReplayManifest:
    config_hash = stable_audit_hash(asdict(config))
    dataset_revision = build_dataset_revision(dataset)
    observation_revision = stable_audit_hash(observations)
    outcome_revision = stable_audit_hash(outcomes)
    selection_revision = stable_audit_hash(audit or {})
    research_revision = stable_audit_hash(research or {})
    modules = Path(__file__).resolve().parents[1]
    source_files = sorted(
        [
            *(modules / "stock_details" / "decision").glob("*.py"),
            *(modules / "backtesting").glob("*.py"),
            modules / "market_universe" / "shortlist.py",
            modules.parent / "core" / "constants" / "trading_constants.py",
        ]
    )
    source_revision = stable_audit_hash(
        {
            str(path.relative_to(modules.parent)): sha256(path.read_bytes()).hexdigest()
            for path in source_files
        }
    )
    identity = {
        "schema_version": TRADING_REPLAY_MANIFEST_VERSION,
        "strategy_version": config.strategy_version,
        "threshold_version": config.threshold_version,
        "input_schema_version": TRADING_INPUT_SCHEMA_VERSION,
        "decision_taxonomy_version": DECISION_TAXONOMY_VERSION,
        "config_hash": config_hash,
        "dataset_revision": dataset_revision,
        "observation_revision": observation_revision,
        "outcome_revision": outcome_revision,
        "limitations": dataset.limitations,
        "replay_version": config.replay_version,
        "selection_revision": selection_revision,
        "research_revision": research_revision,
        "engine_source_revision": source_revision,
    }
    return ReplayManifest(
        schema_version=TRADING_REPLAY_MANIFEST_VERSION,
        strategy_version=config.strategy_version,
        threshold_version=config.threshold_version,
        input_schema_version=TRADING_INPUT_SCHEMA_VERSION,
        decision_taxonomy_version=DECISION_TAXONOMY_VERSION,
        config_hash=config_hash,
        dataset_revision=dataset_revision,
        observation_revision=observation_revision,
        outcome_revision=outcome_revision,
        manifest_id=stable_audit_hash(identity),
        limitations=dataset.limitations,
        replay_version=config.replay_version,
        selection_revision=selection_revision,
        research_revision=research_revision,
        engine_source_revision=source_revision,
    )


def replay_manifest_mismatches(
    expected: dict[str, Any],
    actual: ReplayManifest,
) -> tuple[str, ...]:
    actual_values = asdict(actual)
    fields = (
        "schema_version",
        "strategy_version",
        "threshold_version",
        "input_schema_version",
        "decision_taxonomy_version",
        "config_hash",
        "dataset_revision",
        "observation_revision",
        "outcome_revision",
        "manifest_id",
        "replay_version",
        "selection_revision",
        "research_revision",
        "engine_source_revision",
    )
    return tuple(field for field in fields if expected.get(field) != actual_values[field])
