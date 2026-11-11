from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from fastapi import Depends

from app.core.enums import ExchangeCode
from app.modules.market_universe.market_universe_schemas import ShortlistRead
from app.modules.market_universe.market_universe_service import MarketUniverseService, get_market_universe_service
from app.modules.stock_details.stock_details_schemas import TraderDecisionSummaryRead
from app.modules.stocks.stocks_schemas import StockRead


@dataclass(frozen=True)
class StockTraderDecisionRow:
    stock: StockRead
    decision: TraderDecisionSummaryRead
    latest_trade_date: date | None
    shortlist: ShortlistRead | None = None
    decision_generation_id: str | None = None
    decision_status: str = "CURRENT"


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
        snapshot = await self.universe_service.get_canonical_universe(exchange=resolved_exchange)
        snapshot = await self.universe_service.project_current_entries(snapshot, exchange=resolved_exchange)
        rows = snapshot.rows
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
                    decision_generation_id=snapshot.generation.sync_id,
                    shortlist=row.shortlist,
                    decision_status="UPDATING" if snapshot.updating else "CURRENT",
                )
            )
        return results


def get_trader_decisions_service(
    universe_service: MarketUniverseService = Depends(get_market_universe_service),
) -> TraderDecisionsService:
    return TraderDecisionsService(universe_service)
