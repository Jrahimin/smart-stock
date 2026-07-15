from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from app.core.audit_hashing import stable_audit_hash
from app.core.constants.trading_constants import (
    TRADING_ACTION_TAXONOMY,
    TRADING_INPUT_SCHEMA_VERSION,
    TRADING_STRATEGY_VERSION,
    TRADING_THRESHOLD_VERSION,
)
from app.models import DailyPrice

if TYPE_CHECKING:
    from app.modules.stock_details.decision.canonical import StrategyInput


DECISION_REPLAY_LIMITATIONS: tuple[str, ...] = (
    "RAW_INPUT_ROWS_NOT_ARCHIVED_IN_DECISION_SNAPSHOT",
    "EFFECTIVE_DATED_STATUS_CATEGORY_CIRCUIT_HISTORY_INCOMPLETE",
)


@dataclass(frozen=True)
class DecisionInputLineage:
    input_schema_version: str
    data_revision: str
    event_revision: str
    input_hash: str
    replay_status: str
    replay_limitations: tuple[str, ...]


def daily_price_audit_payload(price: DailyPrice) -> dict[str, Any]:
    """Fields capable of changing canonical calculations or eligibility."""

    return {
        "trade_date": price.trade_date,
        "open_price": price.open_price,
        "high_price": price.high_price,
        "low_price": price.low_price,
        "close_price": price.close_price,
        "adjusted_close_price": price.adjusted_close_price,
        "previous_close_price": price.previous_close_price,
        "price_change": price.price_change,
        "price_change_percent": price.price_change_percent,
        "volume": price.volume,
        "turnover": price.turnover,
        "turnover_provenance": price.turnover_provenance,
        "source": price.source,
        "data_quality_flag": price.data_quality_flag,
    }


def build_decision_input_lineage(strategy_input: StrategyInput) -> DecisionInputLineage:
    sorted_prices = sorted(strategy_input.prices, key=lambda price: price.trade_date)
    data_revision = stable_audit_hash(
        {
            "schema": TRADING_INPUT_SCHEMA_VERSION,
            "prices": [daily_price_audit_payload(price) for price in sorted_prices],
        }
    )
    event_revision = stable_audit_hash(
        {
            "schema": TRADING_INPUT_SCHEMA_VERSION,
            "known_corporate_action_dates": sorted(strategy_input.known_corporate_action_dates),
        }
    )
    input_hash = stable_audit_hash(
        {
            "input_schema_version": TRADING_INPUT_SCHEMA_VERSION,
            "strategy_version": TRADING_STRATEGY_VERSION,
            "threshold_version": TRADING_THRESHOLD_VERSION,
            "action_taxonomy": TRADING_ACTION_TAXONOMY,
            "stock_id": strategy_input.stock_id,
            "exchange": strategy_input.exchange,
            "category": strategy_input.category,
            "is_active": strategy_input.is_active,
            "reference_date": strategy_input.reference_date,
            "exchange_session_dates": strategy_input.exchange_session_dates,
            "market_regime": strategy_input.market_regime,
            "data_revision": data_revision,
            "event_revision": event_revision,
        }
    )
    return DecisionInputLineage(
        input_schema_version=TRADING_INPUT_SCHEMA_VERSION,
        data_revision=data_revision,
        event_revision=event_revision,
        input_hash=input_hash,
        replay_status="IDENTIFIED_WITH_LIMITATIONS",
        replay_limitations=DECISION_REPLAY_LIMITATIONS,
    )
