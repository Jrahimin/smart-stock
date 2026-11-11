"""Lossless canonical inputs. Observed-at is capture time, never a backdated PIT claim."""

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from app.core.audit_hashing import canonicalize_audit_value
from app.core.enums import (
    DataQualityFlag,
    ExchangeCode,
    MarketDataState,
    MarketRegimePhase,
    TurnoverProvenance,
)
from app.models import DailyPrice
from app.modules.stock_details.decision.canonical import StrategyInput
from app.modules.stock_details.decision.lineage import daily_price_audit_payload
from app.modules.stock_details.decision.market_regime import MarketRegimeResult


def capture_strategy_input(value: StrategyInput) -> dict:
    return canonicalize_audit_value(
        {
            "strategy_version": value.strategy_version,
            "stock_id": value.stock_id,
            "symbol": value.symbol,
            "exchange": value.exchange,
            "category": value.category,
            "is_active": value.is_active,
            "reference_date": value.reference_date,
            "finality": value.finality,
            "prices": [daily_price_audit_payload(row) for row in value.prices],
            "source_observations": [
                {"session": row.trade_date, "source": row.source, "observed_at": row.updated_at}
                for row in value.prices
            ],
            "known_corporate_action_dates": value.known_corporate_action_dates,
            "event_observations": value.event_observations,
            "event_coverage_status": value.event_coverage_status,
            "adjustment_coverage": value.adjustment_coverage,
            "exchange_session_dates": value.exchange_session_dates,
            "market_regime": value.market_regime,
            "calculated_at": value.calculated_at,
            "gaps": [
                "PRE_CAPTURE_REVISIONS_UNAVAILABLE",
                "EFFECTIVE_DATED_INSTRUMENT_RULES_INCOMPLETE",
                "EVENT_FEED_COMPLETENESS_UNKNOWN",
                "ADJUSTMENT_COVERAGE_UNVERIFIED",
            ],
        }
    )


def restore_strategy_input(payload: dict) -> StrategyInput:
    prices = []
    decimal_fields = {
        "open_price",
        "high_price",
        "low_price",
        "close_price",
        "adjusted_close_price",
        "previous_close_price",
        "price_change",
        "price_change_percent",
        "turnover",
    }
    for item in payload["prices"]:
        fields = dict(item)
        fields["trade_date"] = date.fromisoformat(fields["trade_date"])
        for key in decimal_fields:
            fields[key] = Decimal(fields[key]) if fields[key] is not None else None
        fields["data_quality_flag"] = DataQualityFlag(fields["data_quality_flag"])
        fields["turnover_provenance"] = (
            TurnoverProvenance(fields["turnover_provenance"])
            if fields["turnover_provenance"] is not None else None
        )
        prices.append(DailyPrice(stock_id=UUID(payload["stock_id"]), **fields))
    regime = dict(payload["market_regime"])
    regime["phase"] = MarketRegimePhase(regime["phase"])
    return StrategyInput(
        strategy_version=payload.get("strategy_version", "trading-intelligence-v2"),
        stock_id=UUID(payload["stock_id"]),
        symbol=payload["symbol"],
        exchange=ExchangeCode(payload["exchange"]),
        category=payload["category"],
        is_active=payload["is_active"],
        prices=tuple(prices),
        reference_date=date.fromisoformat(payload["reference_date"])
        if payload["reference_date"]
        else None,
        finality=MarketDataState(payload["finality"]),
        known_corporate_action_dates=frozenset(
            map(date.fromisoformat, payload["known_corporate_action_dates"])
        ),
        exchange_session_dates=tuple(map(date.fromisoformat, payload["exchange_session_dates"])),
        market_regime=MarketRegimeResult(**regime),
        calculated_at=datetime.fromisoformat(payload["calculated_at"]),
        event_observations=tuple(payload["event_observations"]),
        event_coverage_status=payload["event_coverage_status"],
        adjustment_coverage=payload["adjustment_coverage"],
    )
