import asyncio
from datetime import UTC, date, datetime
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

from app.core.enums import (
    DataQualityFlag,
    DecisionDisplayAction,
    ExchangeCode,
    HolderAction,
    MarketDataState,
    PortfolioAttentionCode,
    PortfolioPriceStatus,
    PortfolioWhatNextCode,
    RiskLevelLabel,
    ScannerConditionId,
    TrendDirection,
)
from app.core.security_config import UserContext
from app.modules.market_universe.market_universe_service import UniverseCacheUnavailableError
from app.modules.portfolios.portfolios_repository import PortfolioItemRecord
from app.modules.portfolios.portfolios_schemas import PortfolioHoldingRead
from app.modules.portfolios.portfolios_service import PortfoliosService, _what_next_code


class FakePortfolioRepository:
    def __init__(self, items, prices):
        self.items = items
        self.prices = prices
        self.calls = []

    async def list_items(self, *, user_id, exchange):
        self.calls.append(("items", user_id, exchange))
        return self.items

    async def list_latest_positive_prices(self, *, stock_ids, end_date):
        self.calls.append(("prices", tuple(stock_ids), end_date))
        return self.prices

    async def list_relevant_events(self, *, stock_ids, start_date, end_date):
        self.calls.append(("events", tuple(stock_ids), start_date, end_date))
        return {}


class MissingUniverse:
    async def get_universe_rows(self, *, exchange):
        raise UniverseCacheUnavailableError()


class FinalizedFreshness:
    async def get_market_freshness(self, *, exchange):
        return SimpleNamespace(
            trade_date=date(2026, 7, 20),
            live_data_as_of=datetime(2026, 7, 20, 18, 0, tzinfo=UTC),
            data_state=MarketDataState.FINALIZED,
            is_live_session=False,
        )


def _item(*, quantity, buy_price, symbol="GP", sector="Telecommunication"):
    stock_id = uuid4()
    return PortfolioItemRecord(
        entry=SimpleNamespace(
            id=uuid4(),
            stock_id=stock_id,
            is_holding=True,
            quantity=quantity,
            buy_price=buy_price,
            note=None,
        ),
        stock=SimpleNamespace(
            id=stock_id,
            symbol=symbol,
            name=f"{symbol} Limited",
            exchange=ExchangeCode.DSE,
            sector=sector,
        ),
    )


def _price(
    stock_id,
    *,
    close,
    previous,
    change,
    trade_date=date(2026, 7, 20),
    quality=DataQualityFlag.OK,
    volume=100,
):
    return SimpleNamespace(
        stock_id=stock_id,
        close_price=Decimal(close),
        previous_close_price=Decimal(previous),
        price_change=Decimal(change),
        price_change_percent=(Decimal(change) / Decimal(previous) * Decimal("100")),
        trade_date=trade_date,
        data_quality_flag=quality,
        volume=volume,
    )


def _service(items, prices):
    repository = FakePortfolioRepository(items, prices)
    user_id = uuid4()
    service = PortfoliosService(
        repository,
        UserContext(
            user_id=str(user_id),
            display_name="Portfolio User",
            is_authenticated=True,
        ),
        MissingUniverse(),
        FinalizedFreshness(),
    )
    return service, repository, user_id


def test_workspace_decimal_totals_and_incomplete_coverage():
    first = _item(quantity=Decimal("100"), buy_price=Decimal("10"), symbol="AAA")
    second = _item(quantity=Decimal("50"), buy_price=None, symbol="BBB", sector=None)
    prices = {
        first.stock.id: _price(first.stock.id, close="12", previous="11", change="1"),
        second.stock.id: _price(second.stock.id, close="20", previous="20", change="0"),
    }
    service, repository, user_id = _service([first, second], prices)

    workspace = asyncio.run(service.get_workspace(exchange=ExchangeCode.DSE))

    assert workspace.pulse.known_current_value == Decimal("2200.00")
    assert workspace.pulse.known_invested_amount == Decimal("1000.00")
    assert workspace.pulse.known_unrealized_gain_amount == Decimal("200.00")
    assert workspace.pulse.estimated_daily_change_amount == Decimal("100.00")
    assert workspace.pulse.current_value_is_complete is True
    assert workspace.pulse.invested_amount_is_complete is False
    assert workspace.holdings[0].portfolio_weight == Decimal("54.55")
    assert workspace.holdings[1].portfolio_weight == Decimal("45.45")
    assert workspace.holdings[1].what_next_code == PortfolioWhatNextCode.DATA_INCOMPLETE
    assert any(
        item.code == PortfolioAttentionCode.INCOMPLETE_HOLDING for item in workspace.attention
    )
    assert any(
        item.code == PortfolioAttentionCode.HIGH_CONCENTRATION for item in workspace.attention
    )
    assert [call[0] for call in repository.calls] == ["items", "prices", "events"]
    assert repository.calls[0][1] == user_id


def test_stale_price_keeps_value_but_suppresses_daily_movement():
    item = _item(quantity=Decimal("25"), buy_price=Decimal("8"))
    prices = {
        item.stock.id: _price(
            item.stock.id,
            close="10",
            previous="9",
            change="1",
            trade_date=date(2026, 7, 17),
        )
    }
    service, _, _ = _service([item], prices)

    workspace = asyncio.run(service.get_workspace(exchange=ExchangeCode.DSE))
    holding = workspace.holdings[0]

    assert holding.current_value == Decimal("250.00")
    assert holding.price_status == PortfolioPriceStatus.STALE_LAST_KNOWN
    assert holding.estimated_daily_change_amount is None
    assert holding.what_next_code == PortfolioWhatNextCode.PRICE_STALE_OR_SUSPENDED
    assert workspace.pulse.current_value_is_complete is False
    assert workspace.pulse.daily_change_is_complete is False


def test_guidance_priority_is_deterministic():
    common = dict(
        quantity=Decimal("10"),
        buy_price=Decimal("100"),
        current_price=Decimal("90"),
        price_status=PortfolioPriceStatus.FINALIZED,
        action=DecisionDisplayAction.SELL,
        holder_action=HolderAction.SELL,
        trend=TrendDirection.DOWNTREND,
        risk=RiskLevelLabel.HIGH,
        scanner_conditions=[ScannerConditionId.BREAKDOWN],
        resistance=Decimal("95"),
    )
    assert _what_next_code(**common) == PortfolioWhatNextCode.REVIEW_SUPPORT_BREAK
    assert _what_next_code(**{**common, "quantity": None}) == PortfolioWhatNextCode.DATA_INCOMPLETE
    assert (
        _what_next_code(
            **{**common, "scanner_conditions": [], "price_status": PortfolioPriceStatus.SUSPICIOUS}
        )
        == PortfolioWhatNextCode.PRICE_STALE_OR_SUSPENDED
    )


def test_suspicious_position_is_excluded_from_shape_rankings():
    service, _, _ = _service([], {})
    holding = PortfolioHoldingRead(
        watchlist_item_id=uuid4(),
        stock_id=uuid4(),
        symbol="ODD",
        name="Odd Price Limited",
        exchange=ExchangeCode.DSE,
        quantity=Decimal("10"),
        average_buy_price=Decimal("10"),
        current_price=Decimal("1000"),
        price_status=PortfolioPriceStatus.SUSPICIOUS,
        current_value=Decimal("10000"),
        unrealized_gain_amount=Decimal("9900"),
        unrealized_gain_percent=Decimal("9900"),
        portfolio_weight=Decimal("100"),
        action=DecisionDisplayAction.WAIT,
        trend=TrendDirection.UNKNOWN,
        what_next_code=PortfolioWhatNextCode.PRICE_STALE_OR_SUSPENDED,
    )

    shape = service._build_shape([holding])

    assert shape.position_exposure == []
    assert shape.largest_holding is None
    assert shape.strongest_position is None
