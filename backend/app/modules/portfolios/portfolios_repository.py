from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import Depends
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database_session import get_db_session
from app.core.enums import ExchangeCode, MarketEventType
from app.models import CorporateAction, DailyPrice, DividendEvent, MarketEvent, Stock, UserWatchlist


@dataclass(frozen=True)
class PortfolioItemRecord:
    entry: UserWatchlist
    stock: Stock


@dataclass(frozen=True)
class PortfolioEventRecord:
    stock_id: UUID
    event_type: str
    event_date: date
    title: str
    summary: str | None


class PortfoliosRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_items(
        self,
        *,
        user_id: UUID,
        exchange: ExchangeCode,
    ) -> list[PortfolioItemRecord]:
        statement = (
            select(UserWatchlist, Stock)
            .join(Stock, Stock.id == UserWatchlist.stock_id)
            .where(UserWatchlist.user_id == user_id, Stock.exchange == exchange)
            .order_by(
                UserWatchlist.is_holding.desc(),
                UserWatchlist.created_at.desc(),
                UserWatchlist.id.desc(),
            )
        )
        rows = await self.session.execute(statement)
        return [PortfolioItemRecord(entry=entry, stock=stock) for entry, stock in rows.all()]

    async def list_latest_positive_prices(
        self,
        *,
        stock_ids: list[UUID],
        end_date: date | None,
    ) -> dict[UUID, DailyPrice]:
        if not stock_ids:
            return {}
        latest_dates = (
            select(
                DailyPrice.stock_id.label("stock_id"),
                func.max(DailyPrice.trade_date).label("latest_trade_date"),
            )
            .where(DailyPrice.stock_id.in_(stock_ids), DailyPrice.close_price > 0)
            .group_by(DailyPrice.stock_id)
        )
        if end_date is not None:
            latest_dates = latest_dates.where(DailyPrice.trade_date <= end_date)
        latest = latest_dates.subquery()
        statement = select(DailyPrice).join(
            latest,
            (DailyPrice.stock_id == latest.c.stock_id)
            & (DailyPrice.trade_date == latest.c.latest_trade_date),
        )
        rows = await self.session.scalars(statement)
        return {row.stock_id: row for row in rows.all()}

    async def list_relevant_events(
        self,
        *,
        stock_ids: list[UUID],
        start_date: date,
        end_date: date,
    ) -> dict[UUID, list[PortfolioEventRecord]]:
        if not stock_ids:
            return {}
        records: list[PortfolioEventRecord] = []
        important_types = (
            MarketEventType.BOARD_MEETING,
            MarketEventType.EARNINGS_RELEASE,
            MarketEventType.DISCLOSURE,
            MarketEventType.REGULATORY,
        )
        market_rows = await self.session.scalars(
            select(MarketEvent).where(
                MarketEvent.stock_id.in_(stock_ids),
                MarketEvent.event_type.in_(important_types),
                MarketEvent.event_date.between(start_date, end_date),
            )
        )
        for event in market_rows.all():
            if event.stock_id is not None:
                records.append(
                    PortfolioEventRecord(
                        stock_id=event.stock_id,
                        event_type=event.event_type.value,
                        event_date=event.event_date,
                        title=event.title,
                        summary=event.summary,
                    )
                )
        action_rows = await self.session.scalars(
            select(CorporateAction).where(
                CorporateAction.stock_id.in_(stock_ids),
                or_(
                    CorporateAction.announcement_date.between(start_date, end_date),
                    CorporateAction.effective_date.between(start_date, end_date),
                ),
            )
        )
        for action in action_rows.all():
            records.append(
                PortfolioEventRecord(
                    stock_id=action.stock_id,
                    event_type=f"{action.action_type.value}:{action.action_subtype.value}",
                    event_date=action.effective_date,
                    title=(
                        action.description or action.action_subtype.value.replace("_", " ").title()
                    ),
                    summary=action.description,
                )
            )
        dividend_rows = await self.session.scalars(
            select(DividendEvent).where(
                DividendEvent.stock_id.in_(stock_ids),
                or_(
                    DividendEvent.declaration_date.between(start_date, end_date),
                    DividendEvent.record_date.between(start_date, end_date),
                    DividendEvent.ex_dividend_date.between(start_date, end_date),
                ),
            )
        )
        for dividend in dividend_rows.all():
            records.append(
                PortfolioEventRecord(
                    stock_id=dividend.stock_id,
                    event_type="DIVIDEND",
                    event_date=dividend.record_date or dividend.declaration_date,
                    title=f"{dividend.dividend_type.value.title()} dividend",
                    summary=f"Status: {dividend.status.value}",
                )
            )
        grouped: dict[UUID, list[PortfolioEventRecord]] = {}
        for record in sorted(records, key=lambda item: item.event_date, reverse=True):
            grouped.setdefault(record.stock_id, []).append(record)
        return grouped


def get_portfolios_repository(
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> PortfoliosRepository:
    return PortfoliosRepository(session)
