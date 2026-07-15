from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    CorporateAction,
    DailyMarketSummary,
    DailyPrice,
    DividendEvent,
    Stock,
)
from app.modules.backtesting.backtesting_models import (
    BacktestConfig,
    BacktestDataset,
    StockReplayHistory,
)


class BacktestingRepository:
    """Read-only historical loader. It deliberately does not filter on current is_active."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def load_dataset(self, config: BacktestConfig) -> BacktestDataset:
        history_start = config.start_date - timedelta(days=365)
        price_rows = (
            await self.session.execute(
                select(Stock, DailyPrice)
                .join(DailyPrice, DailyPrice.stock_id == Stock.id)
                .where(
                    Stock.exchange == config.exchange,
                    DailyPrice.trade_date >= history_start,
                    DailyPrice.trade_date <= config.end_date,
                )
                .order_by(Stock.symbol, Stock.id, DailyPrice.trade_date, DailyPrice.id)
            )
        ).all()

        stock_by_id: dict[UUID, Stock] = {}
        prices_by_stock: dict[UUID, list[DailyPrice]] = defaultdict(list)
        for stock, price in price_rows:
            stock_by_id[stock.id] = stock
            prices_by_stock[stock.id].append(price)

        action_dates: dict[UUID, set[date]] = defaultdict(set)
        if stock_by_id:
            stock_ids = list(stock_by_id)
            dividend_dates = (
                await self.session.execute(
                    select(DividendEvent.stock_id, DividendEvent.ex_dividend_date).where(
                        DividendEvent.stock_id.in_(stock_ids),
                        DividendEvent.ex_dividend_date >= history_start,
                        DividendEvent.ex_dividend_date <= config.end_date,
                    )
                )
            ).all()
            corporate_dates = (
                await self.session.execute(
                    select(CorporateAction.stock_id, CorporateAction.effective_date).where(
                        CorporateAction.stock_id.in_(stock_ids),
                        CorporateAction.effective_date >= history_start,
                        CorporateAction.effective_date <= config.end_date,
                    )
                )
            ).all()
            for stock_id, action_date in dividend_dates:
                action_dates[stock_id].add(action_date)
            for stock_id, action_date in corporate_dates:
                action_dates[stock_id].add(action_date)

        summaries = tuple(
            (
                await self.session.execute(
                    select(DailyMarketSummary)
                    .where(
                        DailyMarketSummary.exchange == config.exchange,
                        DailyMarketSummary.trade_date >= history_start,
                        DailyMarketSummary.trade_date <= config.end_date,
                    )
                    .order_by(
                        DailyMarketSummary.trade_date,
                        DailyMarketSummary.index_name,
                        DailyMarketSummary.id,
                    )
                )
            )
            .scalars()
            .all()
        )
        histories = tuple(
            StockReplayHistory(
                stock=stock_by_id[stock_id],
                prices=tuple(prices_by_stock[stock_id]),
                corporate_action_dates=frozenset(action_dates.get(stock_id, ())),
            )
            for stock_id in sorted(
                stock_by_id,
                key=lambda item: (stock_by_id[item].symbol.casefold(), str(item)),
            )
        )
        session_dates = tuple(
            sorted(
                {
                    price.trade_date
                    for history in histories
                    for price in history.prices
                    if config.start_date <= price.trade_date <= config.end_date
                }
            )
        )

        adjusted_count = sum(
            price.adjusted_close_price is not None
            for history in histories
            for price in history.prices
        )
        limitations = [
            "Historical exchange membership is reconstructed from observed price rows; "
            "deleted securities cannot be recovered.",
            "Category and sector are not effective-dated. Current values are reported for "
            "stratification, but category is excluded from engine inputs unless explicitly "
            "enabled.",
            "Suspension and circuit-lock histories are unavailable in the current schema; known "
            "non-fills are enforced, but unknown historical locks cannot be inferred.",
            "Corporate-action coverage is limited to stored effective/ex-dividend dates; missing "
            "events cannot be reconstructed.",
        ]
        if adjusted_count == 0:
            limitations.append(
                "No adjusted closes are stored; known corporate-action windows fail closed and "
                "unrecorded actions remain a data limitation."
            )
        if not summaries:
            limitations.append(
                "No point-in-time benchmark summaries are available; benchmark-relative metrics "
                "and regime context will be incomplete."
            )

        return BacktestDataset(
            histories=histories,
            session_dates=session_dates,
            market_summaries=summaries,
            limitations=tuple(limitations),
        )
