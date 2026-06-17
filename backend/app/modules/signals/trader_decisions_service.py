from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from fastapi import Depends

from app.core.enums import ExchangeCode
from app.modules.market_universe.market_universe_service import MarketUniverseService, get_market_universe_service
from app.modules.stock_details.stock_details_schemas import TraderDecisionSummaryRead
from app.modules.stocks.stocks_schemas import StockRead


@dataclass(frozen=True)
class StockTraderDecisionRow:
    stock: StockRead
    decision: TraderDecisionSummaryRead
    latest_trade_date: date | None


class TraderDecisionsService:
    def __init__(self, universe_service: MarketUniverseService) -> None:
        self.universe_service = universe_service

    async def list_latest_trader_decisions(
        self,
        *,
        exchange: ExchangeCode | None,
        limit: int,
        offset: int,
        price_window_limit: int,
    ) -> list[StockTraderDecisionRow]:
        del price_window_limit  # universe service uses canonical window from trading_constants
        resolved_exchange = exchange or ExchangeCode.DSE
        rows = await self.universe_service.get_scored_universe(exchange=resolved_exchange)
        sliced = rows[offset : offset + limit]

        results: list[StockTraderDecisionRow] = []
        for row in sliced:
            if row.decision is None:
                continue
            results.append(
                StockTraderDecisionRow(
                    stock=row.stock,
                    decision=row.decision,
                    latest_trade_date=row.session.latest_trade_date,
                )
            )
        return results


def get_trader_decisions_service(
    universe_service: MarketUniverseService = Depends(get_market_universe_service),
) -> TraderDecisionsService:
    return TraderDecisionsService(universe_service)
