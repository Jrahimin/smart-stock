from __future__ import annotations

from datetime import date

from app.models import DailyPrice, Stock
from app.modules.market_universe.market_universe_schemas import (
    ScoredUniverseRow,
    TechnicalSnapshotRead,
    UniverseSessionRead,
)
from app.modules.stock_details.decision.canonical import build_strategy_input
from app.modules.stock_details.decision.engine import compute_trader_decision
from app.modules.stock_details.decision.summary import build_trader_decision_summary
from app.modules.stock_details.decision.technical import TechnicalSnapshot, build_technical_snapshot
from app.modules.stock_details.stock_details_schemas import EligibilityResultRead
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
        sma50=snapshot.sma50,
        atr14=snapshot.atr14,
        average_turnover=snapshot.average_turnover,
        return_5d_percent=snapshot.return_5d_percent,
        return_20d_percent=snapshot.return_20d_percent,
        is_breakout=snapshot.is_breakout,
        structure=snapshot.structure,
        gap_frequency_percent=snapshot.gap_frequency_percent,
        invalid_ohlcv_row_count=snapshot.invalid_ohlcv_row_count,
        latest_row_valid=snapshot.latest_row_valid,
        traded_session_count=snapshot.traded_session_count,
        zero_volume_session_count=snapshot.zero_volume_session_count,
        traded_session_ratio=snapshot.traded_session_ratio,
        volume_observation_count=snapshot.volume_observation_count,
        median_turnover=snapshot.median_turnover,
        turnover_observation_count=snapshot.turnover_observation_count,
        turnover_provenance=snapshot.turnover_provenance,
        analytical_price_basis=snapshot.analytical_price_basis,
        adjusted_close_coverage_ratio=snapshot.adjusted_close_coverage_ratio,
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
        sma50=read.sma50,
        atr14=read.atr14,
        average_turnover=read.average_turnover,
        return_5d_percent=read.return_5d_percent,
        return_20d_percent=read.return_20d_percent,
        is_breakout=read.is_breakout,
        structure=read.structure,
        gap_frequency_percent=read.gap_frequency_percent,
        invalid_ohlcv_row_count=read.invalid_ohlcv_row_count,
        latest_row_valid=read.latest_row_valid,
        traded_session_count=read.traded_session_count,
        zero_volume_session_count=read.zero_volume_session_count,
        traded_session_ratio=read.traded_session_ratio,
        volume_observation_count=read.volume_observation_count,
        median_turnover=read.median_turnover,
        turnover_observation_count=read.turnover_observation_count,
        turnover_provenance=read.turnover_provenance,
        analytical_price_basis=read.analytical_price_basis,
        adjusted_close_coverage_ratio=read.adjusted_close_coverage_ratio,
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


def build_scored_universe_rows(
    grouped: dict[str, dict[str, object]],
    *,
    market_regime: str | None = None,
    exchange_session_dates: list[date] | tuple[date, ...] | None = None,
    corporate_action_dates_by_stock: dict[object, set[date]] | None = None,
) -> list[ScoredUniverseRow]:
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

        strategy_input = build_strategy_input(
            stock,
            sorted_prices,
            market_regime=market_regime,
            exchange_session_dates=exchange_session_dates,
            known_corporate_action_dates=(corporate_action_dates_by_stock or {}).get(stock.id),
        )
        bundle = compute_trader_decision(strategy_input, snapshot=snapshot)
        decision = build_trader_decision_summary(bundle) if bundle is not None else None
        latest_price = sorted_prices[-1]

        scored.append(
            ScoredUniverseRow(
                stock=StockRead.model_validate(stock),
                technical_snapshot=technical_snapshot_to_read(snapshot),
                decision=decision,
                eligibility=(
                    EligibilityResultRead(
                        status=bundle.eligibility.status,
                        reason_codes=list(bundle.eligibility.reason_codes),
                        exchange_session_date=bundle.eligibility.exchange_session_date,
                        latest_trade_date=bundle.eligibility.latest_trade_date,
                        missed_session_count=bundle.eligibility.missed_session_count,
                        valid_ohlcv_row_count=bundle.eligibility.valid_ohlcv_row_count,
                        invalid_ohlcv_row_count=bundle.eligibility.invalid_ohlcv_row_count,
                        traded_session_count=bundle.eligibility.traded_session_count,
                        zero_volume_session_count=bundle.eligibility.zero_volume_session_count,
                        traded_session_ratio=bundle.eligibility.traded_session_ratio,
                        quality_ok_count=bundle.eligibility.quality_ok_count,
                        quality_partial_count=bundle.eligibility.quality_partial_count,
                        quality_suspicious_count=bundle.eligibility.quality_suspicious_count,
                        median_turnover=bundle.eligibility.median_turnover,
                        turnover_observation_count=bundle.eligibility.turnover_observation_count,
                        turnover_provenance=bundle.eligibility.turnover_provenance,
                        analytical_price_basis=bundle.eligibility.analytical_price_basis,
                        corporate_action_status=bundle.eligibility.corporate_action_status,
                    )
                    if bundle is not None and bundle.eligibility is not None
                    else None
                ),
                session=session_from_latest_price(latest_price),
            )
        )
    return scored
