import asyncio
from datetime import UTC, date, datetime
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.core.enums import (
    DataQualityFlag,
    DecisionDisplayAction,
    EligibilityStatus,
    ExchangeCode,
    HolderAction,
    NonHolderAction,
    RiskLevelLabel,
    TradePlanStatus,
    TraderRecommendation,
    TraderStance,
    TrendDirection,
)
from app.core.exception_handlers import NotFoundError
from app.core.security_config import UserContext
from app.modules.market_universe.market_universe_schemas import (
    ScoredUniverseRow,
    UniverseSessionRead,
)
from app.modules.stock_details.stock_details_schemas import (
    CanonicalDecisionResultRead,
    TechnicalSnapshotRead,
    TraderDecisionSummaryRead,
)
from app.modules.stocks.stocks_schemas import StockRead
from app.modules.watchlists.watchlists_schemas import UserWatchlistCreate, UserWatchlistUpdate
from app.modules.watchlists.watchlists_service import (
    WatchlistsService,
    _build_watching_label,
    _compute_unrealized_gain_percent,
)


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


def _service(user_id) -> WatchlistsService:
    repository = FakeWatchlistsRepository()
    stock_id = uuid4()
    repository.stocks[stock_id] = SimpleNamespace(
        id=stock_id,
        symbol="GP",
        category="A",
        exchange=ExchangeCode.DSE,
    )
    user_context = UserContext(
        user_id=str(user_id),
        display_name="Trader",
        email="trader@example.com",
        is_authenticated=True,
    )
    return WatchlistsService(repository, user_context), stock_id, repository


def _canonical_universe_row(stock_id, *, stale: bool = False) -> ScoredUniverseRow:
    now = datetime(2026, 7, 14, tzinfo=UTC)
    recommendation = TraderRecommendation.WAIT if stale else TraderRecommendation.BUY
    non_holder_action = NonHolderAction.WAIT if stale else NonHolderAction.BUY
    holder_action = HolderAction.REVIEW if stale else HolderAction.SELL
    eligibility_status = EligibilityStatus.REVIEW_ONLY if stale else EligibilityStatus.ELIGIBLE
    canonical = CanonicalDecisionResultRead(
        stock_id=stock_id,
        exchange=ExchangeCode.DSE,
        strategy_version="trading-intelligence-v1",
        threshold_version="trading-thresholds-v1",
        action_taxonomy="TRADER_DECISION_V2",
        decision_taxonomy_version="v2",
        as_of_date=date(2026, 7, 14),
        previous_session_date=date(2026, 7, 13),
        calculated_at=now,
        shared_decision_id="watchlist-stale-id" if stale else "watchlist-normal-id",
        result_semantics={"recommendation": "CANONICAL_CONTEXTUAL_ACTION"},
        recommendation=recommendation,
        internal_action=recommendation,
        display_action=(
            DecisionDisplayAction.WAIT
            if stale
            else DecisionDisplayAction.POTENTIAL_BUY
        ),
        evidence_strength=72,
        opportunity_score=66,
        risk_label=RiskLevelLabel.LOW,
        trade_plan_status=(
            TradePlanStatus.WATCH_ONLY
            if stale
            else TradePlanStatus.VALID_ENTRY_PLAN
        ),
        eligibility_status=eligibility_status,
        primary_reason="Canonical reason",
        primary_reason_code="canonical_test",
        stance=TraderStance.NEUTRAL if stale else TraderStance.CONSTRUCTIVE,
        non_holder_action=non_holder_action,
        holder_action=holder_action,
    )
    return ScoredUniverseRow(
        stock=StockRead(
            id=stock_id,
            symbol="GP",
            name="Grameenphone",
            exchange="DSE",
            sector="Telecommunication",
            category="A",
            created_at=now,
            updated_at=now,
        ),
        technical_snapshot=TechnicalSnapshotRead(
            latest_price=300,
            previous_close=298,
            price_change=2,
            price_change_percent=0.67,
            volume=100_000,
            average_volume=80_000,
            turnover=30_000_000,
            rsi=58,
            trend=TrendDirection.UPTREND,
            data_quality=DataQualityFlag.OK,
            latest_trade_date="2026-07-14",
            ohlcv_row_count=90,
        ),
        decision=TraderDecisionSummaryRead(
            recommendation=recommendation,
            internal_action=recommendation,
            display_action=(
                DecisionDisplayAction.WAIT
                if stale
                else DecisionDisplayAction.POTENTIAL_BUY
            ),
            decision_taxonomy_version="v2",
            confidence=72,
            reason="Canonical reason",
            opportunity_score=66,
            risk_label=RiskLevelLabel.LOW,
            non_holder_action=non_holder_action,
            holder_action=holder_action,
            canonical=canonical,
        ),
        session=UniverseSessionRead(
            latest_trade_date=date(2026, 7, 14),
            close_price=Decimal("300"),
            volume=100_000,
            turnover=Decimal("30000000"),
            change_percent=Decimal("0.67"),
            data_quality_flag=DataQualityFlag.OK,
            updated_at=now,
        ),
    )


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
        repository.stocks[other_stock_id] = SimpleNamespace(
            id=other_stock_id, symbol="BRAC", category="A"
        )
        other, _ = await service.add_item(UserWatchlistCreate(stock_id=other_stock_id))
        await service.update_item(
            stock_id,
            UserWatchlistUpdate(
                is_holding=True, buy_price=Decimal("250"), note="  Waiting for breakout.  "
            ),
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
            UserWatchlistUpdate(
                is_holding=True,
                buy_price=Decimal("250"),
                quantity=Decimal("12.5"),
            ),
        )
        updated = await service.update_item(stock_id, UserWatchlistUpdate(is_holding=False))
        assert updated.is_holding is False
        assert updated.buy_price is None
        assert updated.quantity is None

    asyncio.run(run())


def test_quantity_and_buy_price_require_holding_status():
    user_id = uuid4()
    service, stock_id, _repository = _service(user_id)

    async def run():
        await service.add_item(UserWatchlistCreate(stock_id=stock_id))
        with pytest.raises(Exception, match="require holding status"):
            await service.update_item(
                stock_id,
                UserWatchlistUpdate(quantity=Decimal("10")),
            )

    asyncio.run(run())


def test_missing_stock_raises_not_found():
    user_id = uuid4()
    service, _, _ = _service(user_id)

    async def run():
        with pytest.raises(NotFoundError):
            await service.add_item(UserWatchlistCreate(stock_id=uuid4()))

    asyncio.run(run())


def test_watchlist_projects_canonical_universe_decision_and_holding_context() -> None:
    user_id = uuid4()
    service, stock_id, _repository = _service(user_id)

    class FakeUniverseService:
        async def get_scored_universe(self, *, exchange):
            assert str(exchange) == "DSE"
            return [_canonical_universe_row(stock_id)]

    service.universe_service = FakeUniverseService()

    async def run():
        await service.add_item(UserWatchlistCreate(stock_id=stock_id))
        non_holder = (await service.list_items(holding_only=False, limit=10, offset=0))[0]
        assert non_holder.decision_source == "CANONICAL_UNIVERSE"
        assert non_holder.contextual_action == "POTENTIAL_BUY"
        assert non_holder.trader_decision is not None
        assert non_holder.trader_decision.reason == "Canonical reason"
        assert non_holder.trader_decision.canonical is not None
        assert non_holder.trader_decision.canonical.shared_decision_id == "watchlist-normal-id"
        assert non_holder.technical_snapshot is not None
        assert non_holder.technical_snapshot.rsi == 58

        await service.update_item(stock_id, UserWatchlistUpdate(is_holding=True))
        holder = (await service.list_items(holding_only=False, limit=10, offset=0))[0]
        assert holder.contextual_action == "SELL"
        assert holder.trader_decision == non_holder.trader_decision

    asyncio.run(run())


def test_watchlist_preserves_stale_review_only_canonical_identity() -> None:
    user_id = uuid4()
    service, stock_id, _repository = _service(user_id)

    class FakeUniverseService:
        async def get_scored_universe(self, *, exchange):
            assert exchange == ExchangeCode.DSE
            return [_canonical_universe_row(stock_id, stale=True)]

    service.universe_service = FakeUniverseService()

    async def run():
        await service.add_item(UserWatchlistCreate(stock_id=stock_id))
        item = (await service.list_items(holding_only=False, limit=10, offset=0))[0]
        assert item.contextual_action == "WAIT"
        assert item.trader_decision is not None
        assert item.trader_decision.recommendation == TraderRecommendation.WAIT
        assert item.trader_decision.canonical is not None
        assert item.trader_decision.canonical.shared_decision_id == "watchlist-stale-id"
        assert item.trader_decision.canonical.eligibility_status == EligibilityStatus.REVIEW_ONLY

    asyncio.run(run())


def test_watchlist_service_has_no_parallel_decision_computation() -> None:
    import app.modules.watchlists.watchlists_service as module

    source = open(module.__file__, encoding="utf-8").read()
    assert "compute_trader_decision" not in source
    assert "build_technical_snapshot" not in source
    assert "list_price_windows_for_stocks" not in source
