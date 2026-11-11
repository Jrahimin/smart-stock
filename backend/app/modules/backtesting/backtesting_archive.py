"""Portable frozen research inputs; archive round-trips never turn snapshots into PIT history."""

from dataclasses import asdict
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from app.core.audit_hashing import canonicalize_audit_value
from app.core.enums import DataQualityFlag, ExchangeCode, TurnoverProvenance
from app.models import DailyMarketSummary, DailyPrice, Stock
from app.modules.backtesting.backtesting_challengers import CHALLENGER_INPUT_PROVENANCE
from app.modules.backtesting.backtesting_manifest import _market_summary_payload
from app.modules.backtesting.backtesting_models import (
    BacktestDataset,
    CorporateActionTerms,
    ExecutionRule,
    StockReplayHistory,
)
from app.modules.stock_details.decision.lineage import daily_price_audit_payload


def dataset_archive(dataset):
    return canonicalize_audit_value(
        {
            "schema": "replay-input-archive-v1",
            "session_dates": dataset.session_dates,
            "observed_session_dates": dataset.observed_session_dates,
            "publications": dataset.publications,
            "limitations": dataset.limitations,
            "market_summaries": [_market_summary_payload(row) for row in dataset.market_summaries],
            "challenger_input_provenance": CHALLENGER_INPUT_PROVENANCE,
            "histories": [
                {
                    "stock": {
                        key: getattr(history.stock, key)
                        for key in (
                            "id",
                            "symbol",
                            "name",
                            "exchange",
                            "sector",
                            "category",
                            "listing_date",
                            "is_active",
                        )
                    },
                    "prices": [
                        {**daily_price_audit_payload(row), "observed_at": row.updated_at}
                        for row in history.prices
                    ],
                    **{
                        key: getattr(history, key)
                        for key in (
                            "corporate_action_dates",
                            "suspension_dates",
                            "circuit_locked_dates",
                            "event_observations",
                            "captured_inputs",
                            "event_coverage_verified",
                            "point_in_time_verified",
                            "instrument_history_verified",
                        )
                    },
                    "execution_rules": [asdict(row) for row in history.execution_rules],
                    "corporate_actions": [asdict(row) for row in history.corporate_actions],
                }
                for history in dataset.histories
            ],
        }
    )


def restore_dataset(payload):
    if payload.get("schema") != "replay-input-archive-v1":
        raise ValueError("Unsupported replay input archive")
    histories = []
    for data in payload["histories"]:
        stock_data = dict(data["stock"])
        stock_data["id"] = UUID(stock_data["id"])
        stock_data["exchange"] = ExchangeCode(stock_data["exchange"])
        if stock_data.get("listing_date"):
            stock_data["listing_date"] = date.fromisoformat(stock_data["listing_date"])
        stock = Stock(**stock_data)
        prices = []
        for fields in data["prices"]:
            fields = dict(fields)
            fields["trade_date"] = date.fromisoformat(fields["trade_date"])
            fields["updated_at"] = (
                datetime.fromisoformat(fields.pop("observed_at"))
                if fields.get("observed_at")
                else fields.pop("observed_at", None)
            )
            fields["data_quality_flag"] = DataQualityFlag(fields["data_quality_flag"])
            if fields.get("turnover_provenance"):
                fields["turnover_provenance"] = TurnoverProvenance(fields["turnover_provenance"])
            for key, value in fields.items():
                if value is not None and (
                    key.endswith("price")
                    or key in {"price_change", "price_change_percent", "turnover"}
                ):
                    fields[key] = Decimal(str(value))
            prices.append(DailyPrice(stock_id=stock.id, **fields))
        rules = tuple(
            ExecutionRule(
                **{
                    **row,
                    "effective_from": date.fromisoformat(row["effective_from"]),
                    "effective_to": date.fromisoformat(row["effective_to"]),
                    "known_at": datetime.fromisoformat(row["known_at"]),
                }
            )
            for row in data["execution_rules"]
        )
        actions = tuple(
            CorporateActionTerms(
                **{
                    **row,
                    "effective_date": date.fromisoformat(row["effective_date"]),
                    "known_at": datetime.fromisoformat(row["known_at"]),
                    "cash_pay_date": date.fromisoformat(row["cash_pay_date"])
                    if row["cash_pay_date"]
                    else None,
                }
            )
            for row in data["corporate_actions"]
        )
        histories.append(
            StockReplayHistory(
                stock=stock,
                prices=tuple(prices),
                execution_rules=rules,
                corporate_actions=actions,
                **{
                    key: frozenset(map(date.fromisoformat, data[key]))
                    for key in (
                        "corporate_action_dates",
                        "suspension_dates",
                        "circuit_locked_dates",
                    )
                },
                **{key: tuple(data[key]) for key in ("event_observations", "captured_inputs")},
                **{
                    key: data[key]
                    for key in (
                        "event_coverage_verified",
                        "point_in_time_verified",
                        "instrument_history_verified",
                    )
                },
            )
        )
    summaries = []
    for fields in payload["market_summaries"]:
        fields = dict(fields)
        fields["trade_date"] = date.fromisoformat(fields["trade_date"])
        fields["exchange"] = ExchangeCode(fields["exchange"])
        if fields.get("data_quality_flag"):
            fields["data_quality_flag"] = DataQualityFlag(fields["data_quality_flag"])
        for key in ("created_at", "updated_at"):
            if fields.get(key) is not None:
                fields[key] = datetime.fromisoformat(fields[key])
        for key in (
            "index_close",
            "index_change",
            "index_change_percent",
            "total_turnover",
            "market_cap",
        ):
            if fields.get(key) is not None:
                fields[key] = Decimal(str(fields[key]))
        summaries.append(DailyMarketSummary(**fields))
    return BacktestDataset(
        tuple(histories),
        tuple(map(date.fromisoformat, payload["session_dates"])),
        tuple(summaries),
        tuple(payload["limitations"]),
        tuple(payload.get("publications", ())),
        tuple(map(date.fromisoformat, payload.get("observed_session_dates", ()))),
    )
