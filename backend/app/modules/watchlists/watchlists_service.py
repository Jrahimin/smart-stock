import asyncio
from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

from fastapi import Depends

from app.api.dependencies.auth_dependencies import get_current_user
from app.core.exception_handlers import NotFoundError
from app.core.security_config import UserContext
from app.models import UserWatchlist
from app.modules.market_universe.market_universe_schemas import ScoredUniverseRow
from app.modules.market_universe.market_universe_service import (
    MarketUniverseService,
    UniverseCacheUnavailableError,
    get_market_universe_service,
)
from app.modules.watchlists.watchlists_repository import (
    WatchlistsRepository,
    get_watchlists_repository,
)
from app.modules.watchlists.watchlists_schemas import (
    UserWatchlistCreate,
    UserWatchlistRead,
    UserWatchlistSummaryRead,
    UserWatchlistToggleResult,
    UserWatchlistUpdate,
)


def _build_watching_label(watching_days: int) -> str:
    if watching_days <= 0:
        return "Added today"
    if watching_days == 1:
        return "Watching for 1 day"
    return f"Watching for {watching_days} days"


def _compute_unrealized_gain_percent(
    *,
    buy_price: Decimal | None,
    current_price: Decimal | None,
) -> Decimal | None:
    if buy_price is None or current_price is None or buy_price <= 0:
        return None
    gain = (current_price - buy_price) / buy_price * Decimal("100")
    return gain.quantize(Decimal("0.01"))


class WatchlistsService:
    def __init__(
        self,
        repository: WatchlistsRepository,
        user_context: UserContext,
        universe_service: MarketUniverseService | None = None,
    ) -> None:
        self.repository = repository
        self.user_context = user_context
        self.universe_service = universe_service

    def _user_id(self) -> UUID:
        return UUID(self.user_context.user_id)

    async def list_items(
        self,
        *,
        holding_only: bool,
        limit: int,
        offset: int,
    ) -> list[UserWatchlistRead]:
        entries = await self.repository.list_for_user(
            user_id=self._user_id(),
            holding_only=holding_only,
            limit=limit,
            offset=offset,
        )
        return await self._to_read_list(entries)

    async def get_summary(self) -> UserWatchlistSummaryRead:
        total, holdings = await self.repository.count_for_user(user_id=self._user_id())
        return UserWatchlistSummaryRead(total_watchlisted=total, total_holdings=holdings)

    async def add_item(self, payload: UserWatchlistCreate) -> tuple[UserWatchlist, bool]:
        stock = await self._require_stock(payload.stock_id)
        existing = await self.repository.get_by_user_and_stock(
            user_id=self._user_id(),
            stock_id=payload.stock_id,
        )
        if existing is not None:
            return existing, False

        entry = await self.repository.create(
            {
                "user_id": self._user_id(),
                "stock_id": stock.id,
                "stock_symbol": stock.symbol,
                "is_holding": False,
                "buy_price": None,
                "note": None,
            }
        )
        await self.repository.commit()
        await self.repository.refresh(entry)
        return entry, True

    async def update_item(self, stock_id: UUID, payload: UserWatchlistUpdate) -> UserWatchlist:
        entry = await self._require_entry(stock_id)
        values = payload.model_dump(exclude_unset=True)
        if "note" in values and values["note"] is not None:
            values["note"] = values["note"].strip() or None

        next_is_holding = values["is_holding"] if "is_holding" in values else entry.is_holding
        if "is_holding" in values and values["is_holding"] is False:
            values["buy_price"] = None
        if "buy_price" in values and values.get("buy_price") is not None and not next_is_holding:
            values.pop("buy_price")

        updated = await self.repository.update(entry, values)
        await self.repository.commit()
        await self.repository.refresh(updated)
        return updated

    async def remove_item(self, stock_id: UUID) -> None:
        removed = await self.repository.delete_by_user_and_stock(
            user_id=self._user_id(),
            stock_id=stock_id,
        )
        if not removed:
            raise NotFoundError("Watchlist entry was not found")
        await self.repository.commit()

    async def toggle_item(self, stock_id: UUID) -> UserWatchlistToggleResult:
        existing = await self.repository.get_by_user_and_stock(
            user_id=self._user_id(),
            stock_id=stock_id,
        )
        if existing is not None:
            await self.repository.delete(existing)
            await self.repository.commit()
            return UserWatchlistToggleResult(added=False, is_watchlisted=False, item=None)

        entry, _ = await self.add_item(UserWatchlistCreate(stock_id=stock_id))
        read_item = (await self._to_read_list([entry]))[0]
        return UserWatchlistToggleResult(added=True, is_watchlisted=True, item=read_item)

    async def _require_stock(self, stock_id: UUID):
        stock = await self.repository.get_stock(stock_id)
        if stock is None:
            raise NotFoundError("Stock was not found")
        return stock

    async def _require_entry(self, stock_id: UUID) -> UserWatchlist:
        entry = await self.repository.get_by_user_and_stock(
            user_id=self._user_id(),
            stock_id=stock_id,
        )
        if entry is None:
            raise NotFoundError("Watchlist entry was not found")
        return entry

    async def _to_read_list(self, entries: list[UserWatchlist]) -> list[UserWatchlistRead]:
        if not entries:
            return []

        stock_ids = [entry.stock_id for entry in entries]
        latest_prices = await self.repository.list_latest_prices_for_stocks(stock_ids)
        stocks = {
            entry.stock_id: await self.repository.get_stock(entry.stock_id)
            for entry in entries
        }
        canonical_rows: dict[str, ScoredUniverseRow] = {}
        if self.universe_service is not None:
            exchanges = sorted(
                {stock.exchange for stock in stocks.values() if stock is not None},
                key=lambda exchange: exchange.value,
            )
            try:
                universe_results = await asyncio.gather(
                    *(
                        self.universe_service.get_scored_universe(exchange=exchange)
                        for exchange in exchanges
                    )
                )
            except UniverseCacheUnavailableError:
                universe_results = []
            canonical_rows = {
                str(row.stock.id): row
                for rows in universe_results
                for row in rows
            }
        today = datetime.now(UTC).date()
        reads: list[UserWatchlistRead] = []

        for entry in entries:
            latest_price = latest_prices.get(entry.stock_id)
            current_price = latest_price.close_price if latest_price is not None else None
            canonical_row = canonical_rows.get(str(entry.stock_id))
            technical_snapshot = (
                canonical_row.technical_snapshot if canonical_row is not None else None
            )
            trader_decision = canonical_row.decision if canonical_row is not None else None
            if canonical_row is not None:
                current_price = canonical_row.session.close_price
            contextual_action = "WAIT"
            if trader_decision is not None:
                selected_action = (
                    trader_decision.holder_action
                    if entry.is_holding
                    else trader_decision.non_holder_action
                )
                if selected_action is not None:
                    contextual_action = selected_action.value

            created_date = (
                entry.created_at.date()
                if entry.created_at.tzinfo
                else entry.created_at.replace(tzinfo=UTC).date()
            )
            watching_days = max(0, (today - created_date).days)
            note_text = entry.note.strip() if entry.note else ""

            reads.append(
                UserWatchlistRead(
                    id=entry.id,
                    user_id=entry.user_id,
                    stock_id=entry.stock_id,
                    stock_symbol=entry.stock_symbol,
                    is_holding=entry.is_holding,
                    buy_price=entry.buy_price,
                    note=entry.note,
                    created_at=entry.created_at,
                    updated_at=entry.updated_at,
                    unrealized_gain_percent=_compute_unrealized_gain_percent(
                        buy_price=entry.buy_price,
                        current_price=current_price,
                    ),
                    has_note=bool(note_text),
                    watching_days=watching_days,
                    watching_label=_build_watching_label(watching_days),
                    current_price=current_price,
                    trader_decision=trader_decision,
                    technical_snapshot=technical_snapshot,
                    decision_source=(
                        "CANONICAL_UNIVERSE" if canonical_row is not None else "UNAVAILABLE"
                    ),
                    contextual_action=contextual_action,
                )
            )

        return reads

    async def to_read(self, entry: UserWatchlist) -> UserWatchlistRead:
        return (await self._to_read_list([entry]))[0]


def get_watchlists_service(
    repository: WatchlistsRepository = Depends(get_watchlists_repository),
    user_context: UserContext = Depends(get_current_user),
    universe_service: MarketUniverseService = Depends(get_market_universe_service),
) -> WatchlistsService:
    return WatchlistsService(repository, user_context, universe_service)
