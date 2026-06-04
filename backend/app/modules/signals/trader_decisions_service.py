from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends

from app.core.enums import ExchangeCode
from app.models import DailyPrice, Stock
from app.modules.market_data.market_data_repository import MarketDataRepository, get_market_data_repository
from app.modules.stock_details.decision.summary import compute_trader_decision_summary_for_stock
from app.modules.stock_details.stock_details_schemas import TraderDecisionSummaryRead
from app.modules.stocks.stocks_schemas import StockRead


@dataclass(frozen=True)
class StockTraderDecisionRow:
    stock: Stock
    prices: list[DailyPrice]
    decision: TraderDecisionSummaryRead


class TraderDecisionsService:
    def __init__(self, market_repository: MarketDataRepository) -> None:
        self.market_repository = market_repository

    async def list_latest_trader_decisions(
        self,
        *,
        exchange: ExchangeCode | None,
        limit: int,
        offset: int,
        price_window_limit: int,
    ) -> list[StockTraderDecisionRow]:
        rows = await self.market_repository.list_market_price_windows(
            exchange=exchange,
            limit=limit,
            offset=offset,
            price_window_limit=price_window_limit,
        )
        grouped: dict[str, dict[str, object]] = {}
        for stock, price in rows:
            stock_id = str(stock.id)
            if stock_id not in grouped:
                grouped[stock_id] = {"stock": stock, "prices": []}
            grouped[stock_id]["prices"].append(price)

        results: list[StockTraderDecisionRow] = []
        for entry in grouped.values():
            stock = entry["stock"]
            prices = entry["prices"]
            decision = compute_trader_decision_summary_for_stock(stock, prices)
            if decision is None:
                continue
            results.append(StockTraderDecisionRow(stock=stock, prices=prices, decision=decision))
        return results


def get_trader_decisions_service(
    market_repository: MarketDataRepository = Depends(get_market_data_repository),
) -> TraderDecisionsService:
    return TraderDecisionsService(market_repository)
