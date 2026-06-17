from __future__ import annotations

from datetime import date
from decimal import Decimal

from app.models import DailyPrice, Stock
from app.modules.market_universe.market_universe_schemas import (
    ScoredUniverseRow,
    TechnicalSnapshotRead,
    UniverseSessionRead,
)
from app.modules.stock_details.decision.engine import compute_trader_decision_from_prices
from app.modules.stock_details.decision.summary import build_trader_decision_summary
from app.modules.stock_details.decision.technical import TechnicalSnapshot, build_technical_snapshot
from app.modules.stocks.stocks_schemas import StockRead


def group_price_window_rows(
    rows: list[tuple[Stock, DailyPrice]],
) -> dict[str, dict[str, object]]:
    grouped: dict[str, dict[str, object]] = {}
    for stock, price in rows:
        stock_id = str(stock.id)
        if stock_id not in grouped:
            grouped[stock_id] = {"stock": stock, "prices": []}
        grouped[stock_id]["prices"].append(price)
    return grouped


def technical_snapshot_to_read(snapshot: TechnicalSnapshot) -> TechnicalSnapshotRead:
    return TechnicalSnapshotRead(
        latest_price=snapshot.latest_price,
        previous_close=snapshot.previous_close,
        price_change=snapshot.price_change,
        price_change_percent=snapshot.price_change_percent,
        volume=snapshot.volume,
        average_volume=snapshot.average_volume,
        turnover=snapshot.turnover,
        rsi=snapshot.rsi,
        sma20=snapshot.sma20,
        ema20=snapshot.ema20,
        volatility=snapshot.volatility,
        support=snapshot.support,
        resistance=snapshot.resistance,
        trend=snapshot.trend,
        data_quality=snapshot.data_quality,
        latest_trade_date=snapshot.latest_trade_date,
        ohlcv_row_count=snapshot.ohlcv_row_count,
        sparkline_closes=list(snapshot.sparkline_closes),
    )


def technical_snapshot_from_read(read: TechnicalSnapshotRead) -> TechnicalSnapshot:
    return TechnicalSnapshot(
        latest_price=read.latest_price,
        previous_close=read.previous_close,
        price_change=read.price_change,
        price_change_percent=read.price_change_percent,
        volume=read.volume,
        average_volume=read.average_volume,
        turnover=read.turnover,
        rsi=read.rsi,
        sma20=read.sma20,
        ema20=read.ema20,
        volatility=read.volatility,
        support=read.support,
        resistance=read.resistance,
        trend=read.trend,
        data_quality=read.data_quality,
        latest_trade_date=read.latest_trade_date,
        ohlcv_row_count=read.ohlcv_row_count,
        sparkline_closes=tuple(read.sparkline_closes),
    )


def session_from_latest_price(price: DailyPrice) -> UniverseSessionRead:
    return UniverseSessionRead(
        latest_trade_date=price.trade_date,
        close_price=price.close_price,
        open_price=price.open_price,
        volume=price.volume,
        turnover=price.turnover,
        change_percent=price.price_change_percent,
        data_quality_flag=price.data_quality_flag,
        updated_at=price.updated_at,
    )


def build_scored_universe_rows(grouped: dict[str, dict[str, object]]) -> list[ScoredUniverseRow]:
    scored: list[ScoredUniverseRow] = []
    for entry in grouped.values():
        stock = entry["stock"]
        prices = entry["prices"]
        if not isinstance(stock, Stock) or not isinstance(prices, list) or not prices:
            continue

        sorted_prices = sorted(prices, key=lambda row: row.trade_date)
        snapshot = build_technical_snapshot(sorted_prices)
        if snapshot is None:
            continue

        bundle = compute_trader_decision_from_prices(
            sorted_prices,
            category=stock.category,
            snapshot=snapshot,
        )
        decision = build_trader_decision_summary(bundle) if bundle is not None else None
        latest_price = sorted_prices[-1]

        scored.append(
            ScoredUniverseRow(
                stock=StockRead.model_validate(stock),
                technical_snapshot=technical_snapshot_to_read(snapshot),
                decision=decision,
                session=session_from_latest_price(latest_price),
            )
        )
    return scored
