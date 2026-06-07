import asyncio
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.core.exception_handlers import NotFoundError
from app.core.security_config import UserContext
from app.modules.watchlists.watchlists_schemas import UserWatchlistCreate, UserWatchlistUpdate
from app.modules.watchlists.watchlists_service import WatchlistsService, _build_watching_label, _compute_unrealized_gain_percent


class FakeWatchlistsRepository:
    def __init__(self) -> None:
        self.entries: dict[tuple[object, object], SimpleNamespace] = {}
        self.stocks: dict[object, SimpleNamespace] = {}

    async def get_by_user_and_stock(self, *, user_id, stock_id):
        return self.entries.get((user_id, stock_id))

    async def list_for_user(self, *, user_id, holding_only, limit, offset):
        rows = [entry for (uid, _), entry in self.entries.items() if uid == user_id]
        if holding_only:
            rows = [entry for entry in rows if entry.is_holding]
        rows.sort(key=lambda entry: (not entry.is_holding, entry.created_at), reverse=True)
        return rows[offset : offset + limit]

    async def count_for_user(self, *, user_id):
        rows = [entry for (uid, _), entry in self.entries.items() if uid == user_id]
        holdings = sum(1 for entry in rows if entry.is_holding)
        return len(rows), holdings

    async def create(self, values: dict[str, object]):
        entry = SimpleNamespace(
            id=uuid4(),
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
            **values,
        )
        self.entries[(values["user_id"], values["stock_id"])] = entry
        return entry

    async def update(self, entity, values: dict[str, object]):
        for field_name, value in values.items():
            setattr(entity, field_name, value)
        entity.updated_at = datetime.now(UTC)
        return entity

    async def delete(self, entity) -> None:
        self.entries.pop((entity.user_id, entity.stock_id), None)

    async def delete_by_user_and_stock(self, *, user_id, stock_id):
        return self.entries.pop((user_id, stock_id), None) is not None

    async def commit(self):
        return None

    async def refresh(self, entity):
        return None

    async def get_stock(self, stock_id):
        return self.stocks.get(stock_id)

    async def list_latest_prices_for_stocks(self, stock_ids):
        return {}

    async def list_price_windows_for_stocks(self, stock_ids, *, price_window_limit):
        return {stock_id: [] for stock_id in stock_ids}


def _service(user_id) -> WatchlistsService:
    repository = FakeWatchlistsRepository()
    stock_id = uuid4()
    repository.stocks[stock_id] = SimpleNamespace(id=stock_id, symbol="GP", category="A")
    user_context = UserContext(
        user_id=str(user_id),
        display_name="Trader",
        email="trader@example.com",
        is_authenticated=True,
    )
    return WatchlistsService(repository, user_context), stock_id, repository


def test_compute_unrealized_gain_percent():
    gain = _compute_unrealized_gain_percent(buy_price=Decimal("100"), current_price=Decimal("110"))
    assert gain == Decimal("10.00")


def test_build_watching_label():
    assert _build_watching_label(0) == "Added today"
    assert _build_watching_label(47) == "Watching for 47 days"


def test_add_and_duplicate_add():
    user_id = uuid4()
    service, stock_id, repository = _service(user_id)

    async def run():
        entry, created = await service.add_item(UserWatchlistCreate(stock_id=stock_id))
        assert created is True
        again, created_again = await service.add_item(UserWatchlistCreate(stock_id=stock_id))
        assert created_again is False
        assert again.id == entry.id

    asyncio.run(run())


def test_toggle_add_and_remove():
    user_id = uuid4()
    service, stock_id, _repository = _service(user_id)

    async def run():
        added = await service.toggle_item(stock_id)
        assert added.added is True
        assert added.is_watchlisted is True
        removed = await service.toggle_item(stock_id)
        assert removed.added is False
        assert removed.is_watchlisted is False

    asyncio.run(run())


def test_holding_only_filter_and_has_note():
    user_id = uuid4()
    service, stock_id, repository = _service(user_id)

    async def run():
        entry, _ = await service.add_item(UserWatchlistCreate(stock_id=stock_id))
        other_stock_id = uuid4()
        repository.stocks[other_stock_id] = SimpleNamespace(id=other_stock_id, symbol="BRAC", category="A")
        other, _ = await service.add_item(UserWatchlistCreate(stock_id=other_stock_id))
        await service.update_item(
            stock_id,
            UserWatchlistUpdate(is_holding=True, buy_price=Decimal("250"), note="  Waiting for breakout.  "),
        )
        entry.is_holding = True
        other.is_holding = False

        all_items = await service.list_items(holding_only=False, limit=50, offset=0)
        assert len(all_items) == 2
        holding_items = await service.list_items(holding_only=True, limit=50, offset=0)
        assert len(holding_items) == 1
        assert holding_items[0].has_note is True
        assert holding_items[0].note == "Waiting for breakout."

    asyncio.run(run())


def test_unset_holding_clears_buy_price():
    user_id = uuid4()
    service, stock_id, _repository = _service(user_id)

    async def run():
        await service.add_item(UserWatchlistCreate(stock_id=stock_id))
        await service.update_item(
            stock_id,
            UserWatchlistUpdate(is_holding=True, buy_price=Decimal("250")),
        )
        updated = await service.update_item(stock_id, UserWatchlistUpdate(is_holding=False))
        assert updated.is_holding is False
        assert updated.buy_price is None

    asyncio.run(run())


def test_missing_stock_raises_not_found():
    user_id = uuid4()
    service, _, _ = _service(user_id)

    async def run():
        with pytest.raises(NotFoundError):
            await service.add_item(UserWatchlistCreate(stock_id=uuid4()))

    asyncio.run(run())
