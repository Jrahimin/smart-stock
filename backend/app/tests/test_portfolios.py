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


class ZeroCloseUniverse:
    def __init__(self, stock_id):
        self.stock_id = stock_id

    async def get_universe_rows(self, *, exchange):
        return SimpleNamespace(
            rows=[
                SimpleNamespace(
                    stock=SimpleNamespace(id=self.stock_id),
                    session=SimpleNamespace(close_price=Decimal("0")),
                    technical_snapshot=None,
                    decision=None,
                    scanner=None,
                )
            ],
            meta=SimpleNamespace(
                session_trade_date=date(2026, 7, 20),
                live_data_as_of=datetime(2026, 7, 20, 18, 0, tzinfo=UTC),
                data_state=MarketDataState.FINALIZED,
                is_live_session=False,
                market_sync_id="test-market-sync",
                decision_session_date=date(2026, 7, 20),
                decision_status="CURRENT",
            ),
        )


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


def _service(items, prices, *, universe=None):
    repository = FakePortfolioRepository(items, prices)
    user_id = uuid4()
    service = PortfoliosService(
        repository,
        UserContext(
            user_id=str(user_id),
            display_name="Portfolio User",
            is_authenticated=True,
        ),
        universe or MissingUniverse(),
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


def test_zero_close_universe_row_falls_back_to_last_positive_price():
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
    service, repository, _ = _service(
        [item],
        prices,
        universe=ZeroCloseUniverse(item.stock.id),
    )

    workspace = asyncio.run(service.get_workspace(exchange=ExchangeCode.DSE))
    holding = workspace.holdings[0]

    assert repository.calls[1] == ("prices", (item.stock.id,), date(2026, 7, 20))
    assert holding.current_price == Decimal("10.0000")
    assert holding.current_value == Decimal("250.00")
    assert holding.price_status == PortfolioPriceStatus.STALE_LAST_KNOWN
    assert workspace.pulse.known_current_value == Decimal("250.00")
    assert workspace.pulse.valued_holding_count == 1


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


def test_account_mark_matches_watch_only_and_holding_money_and_projection():
    from app.modules.market_universe.market_universe_schemas import DisplayQuoteRead
    from app.modules.stock_details.decision.comparison import HolderDecisionComparisonRead
    from app.tests.test_watchlists import _canonical_universe_row
    item = _item(quantity=Decimal("10"), buy_price=Decimal("100"))
    row = _canonical_universe_row(item.stock.id)
    row.decision.holder_action = HolderAction.REDUCE
    row.decision.canonical.holder_action = HolderAction.REDUCE
    row.display_quote = DisplayQuoteRead(current_price=103, previous_close=101, price_change=2,
        price_change_percent=2 / 101 * 100, as_of_trade_date="2026-07-20",
        observation_session_date="2026-07-20", observation_status="FINALIZED", source="fixture",
        source_observed_at=datetime(2026, 7, 20, 8, 0, tzinfo=UTC))
    row.holder_comparison = HolderDecisionComparisonRead(status="CHANGED", previous_action="HOLD",
        current_action="REDUCE", previous_session_date="2026-07-19")
    service, _, _ = _service([], {})
    args = dict(item=item, universe_row=row, fallback_price=None, published_date=date(2026, 7, 20),
        data_state=MarketDataState.FINALIZED, is_provisional=False, relevant_event=None)
    holding = service._build_position(**args)
    assert holding.current_price == Decimal("103.0000")
    assert holding.current_value == Decimal("1030.00")
    assert holding.unrealized_gain_percent == Decimal("3.00")
    assert holding.price_change_percent == Decimal("1.98")
    assert holding.estimated_daily_change_amount == Decimal("20.00")
    assert holding.display_quote == row.display_quote
    assert holding.decision_session_date == row.decision.canonical.as_of_date
    assert holding.holder_comparison.current_action == "REDUCE"
    assert holding.holder_action == HolderAction.REDUCE
    assert holding.action == DecisionDisplayAction.SELL
    item.entry.is_holding = False
    watched = service._build_position(**args)
    assert watched.current_price == holding.current_price
    assert watched.price_change_percent == holding.price_change_percent
    assert watched.display_quote == holding.display_quote
    assert watched.action == DecisionDisplayAction.POTENTIAL_BUY


def test_unified_rows_reuse_final_account_attention_and_weights():
    item = _item(quantity=Decimal("10"), buy_price=None)
    service, _, _ = _service([item], {item.stock.id: _price(item.stock.id, close="103", previous="101", change="2")})
    workspace = asyncio.run(service.get_workspace(exchange=ExchangeCode.DSE))
    assert workspace.watchlist_items[0] == workspace.holdings[0]
    assert workspace.watchlist_items[0].requires_attention
    assert workspace.watchlist_items[0].portfolio_weight == Decimal("100.00")


def _universe_with_row(row):
    class Universe:
        async def get_universe_rows(self, **kwargs):
            return SimpleNamespace(rows=[row], meta=SimpleNamespace(session_trade_date=date(2026, 7, 20),
                live_data_as_of=datetime(2026, 7, 20, 8, tzinfo=UTC), data_state=MarketDataState.FINALIZED,
                is_live_session=False, market_sync_id="quote-1", decision_session_date=row.decision.canonical.as_of_date,
                decision_status="CURRENT"))
    return Universe()


def test_projected_neutral_risk_review_has_own_reason_attention_and_holder_group():
    from app.tests.test_watchlists import _canonical_universe_row
    from app.modules.market_universe.market_universe_schemas import DisplayQuoteRead
    item = _item(quantity=Decimal("10"), buy_price=Decimal("100"))
    row = _canonical_universe_row(item.stock.id)
    row.decision.holder_action = HolderAction.REVIEW
    row.decision.primary_reason_code = "illiquid"
    row.decision.display_action = DecisionDisplayAction.WAIT
    row.technical_snapshot.trend = TrendDirection.UNKNOWN
    row.display_quote = DisplayQuoteRead(current_price=100, previous_close=100, price_change=0,
        price_change_percent=0, as_of_trade_date="2026-07-20", observation_status="FINALIZED", data_quality="OK")
    service, _, _ = _service([item], {}, universe=_universe_with_row(row))
    workspace = asyncio.run(service.get_workspace(exchange=ExchangeCode.DSE))
    holding = workspace.watchlist_items[0]
    assert holding.holder_action == HolderAction.REVIEW and holding.risk == RiskLevelLabel.LOW
    assert holding.what_next_code == PortfolioWhatNextCode.REVIEW_HOLDER_GUIDANCE
    assert holding.requires_attention and holding.primary_reason_code == "illiquid"
    codes = {entry.code for entry in workspace.attention}
    assert PortfolioAttentionCode.HOLDER_REVIEW not in codes
    assert workspace.holder_review_attention.code == PortfolioAttentionCode.HOLDER_REVIEW
    assert PortfolioAttentionCode.ELEVATED_RISK not in codes and PortfolioAttentionCode.INCOMPLETE_HOLDING not in codes
    assert workspace.shape.action_groups[0].action == DecisionDisplayAction.WAIT
    assert workspace.shape.holder_action_groups[0].holder_action == HolderAction.REVIEW
    common = dict(quantity=Decimal("10"), buy_price=Decimal("100"), current_price=Decimal("100"),
        price_status=PortfolioPriceStatus.FINALIZED, action=DecisionDisplayAction.WAIT, holder_action=HolderAction.REVIEW,
        trend=TrendDirection.UNKNOWN, risk=RiskLevelLabel.LOW, scanner_conditions=[], resistance=None)
    assert _what_next_code(**{**common, "quantity": None}) == PortfolioWhatNextCode.DATA_INCOMPLETE
    assert _what_next_code(**{**common, "risk": RiskLevelLabel.HIGH}) == PortfolioWhatNextCode.REVIEW_ELEVATED_RISK
    assert _what_next_code(**{**common, "scanner_conditions": [ScannerConditionId.BREAKDOWN]}) == PortfolioWhatNextCode.REVIEW_SUPPORT_BREAK


def test_precise_holder_groups_keep_review_reduce_sell_and_missing_distinct():
    service, _, _ = _service([], {})
    rows = [PortfolioHoldingRead(watchlist_item_id=uuid4(), stock_id=uuid4(), symbol=str(index), name="Fixture", exchange=ExchangeCode.DSE,
        holder_action=action, action=generic, current_value=Decimal("100"), decision_taxonomy_version="v2")
        for index, (action, generic) in enumerate([(HolderAction.REVIEW, DecisionDisplayAction.WAIT),
            (HolderAction.REDUCE, DecisionDisplayAction.SELL), (HolderAction.SELL, DecisionDisplayAction.SELL), (None, None)])]
    shape = service._build_shape(rows)
    assert {group.holder_action: group.count for group in shape.holder_action_groups} == {None: 1, HolderAction.REVIEW: 1, HolderAction.REDUCE: 1, HolderAction.SELL: 1}
    assert {group.action: group.count for group in shape.action_groups} == {DecisionDisplayAction.WAIT: 1, DecisionDisplayAction.SELL: 2}


def test_daily_contribution_uses_comparable_portfolio_previous_value_including_positive_day():
    a = _item(quantity=Decimal("10"), buy_price=Decimal("100"), symbol="AAA")
    b = _item(quantity=Decimal("10"), buy_price=Decimal("100"), symbol="BBB")
    prices = {a.stock.id: _price(a.stock.id, close="103", previous="101", change="2"),
        b.stock.id: _price(b.stock.id, close="90", previous="100", change="-10")}
    service, _, _ = _service([a, b], prices)
    workspace = asyncio.run(service.get_workspace(exchange=ExchangeCode.DSE))
    assert workspace.shape.worst_daily_contributor.symbol == "BBB"
    assert workspace.shape.worst_daily_contributor.percent == Decimal("-4.98")
    assert workspace.watchlist_items[1].price_change_percent == Decimal("-10.00")
    prices[b.stock.id] = _price(b.stock.id, close="104", previous="100", change="4")
    workspace = asyncio.run(service.get_workspace(exchange=ExchangeCode.DSE))
    assert workspace.shape.worst_daily_contributor.symbol == "AAA"
    assert workspace.shape.worst_daily_contributor.percent == Decimal("1.00")
    prices.clear()
    workspace = asyncio.run(service.get_workspace(exchange=ExchangeCode.DSE))
    assert workspace.shape.worst_daily_contributor is None


def test_suggestion_retains_resolved_account_mark_when_universe_quote_is_unusable():
    from app.tests.test_watchlists import _canonical_universe_row
    from app.modules.market_universe.market_universe_schemas import DisplayQuoteRead, ScannerResultRead, ScannerConditionMatchRead
    item = _item(quantity=None, buy_price=None)
    item.entry.is_holding = False
    row = _canonical_universe_row(item.stock.id)
    row.decision.display_action = DecisionDisplayAction.WAIT
    row.scanner = ScannerResultRead(matches=[ScannerConditionMatchRead(condition_id=ScannerConditionId.SUPPORT_REBOUND,
        reason_code="SUPPORT_REBOUND", reason="Fixture", rank_score=70, capacity_score=70, rank=1)])
    for price, price_date in [(None, "2026-07-20"), (0, "2026-07-20"), (90, None)]:
        row.display_quote = DisplayQuoteRead(current_price=price, as_of_trade_date=price_date)
        service, _, _ = _service([item], {item.stock.id: _price(item.stock.id, close="103", previous="101", change="2")}, universe=_universe_with_row(row))
        workspace = asyncio.run(service.get_workspace(exchange=ExchangeCode.DSE))
        watched = workspace.watchlist_items[0]
        suggestion = workspace.watchlist_to_review[0]
        assert watched.current_price == suggestion.current_price == Decimal("103.0000")
        assert watched.display_quote == suggestion.display_quote
        assert suggestion.display_quote.current_price == 103
        assert suggestion.price_status == watched.price_status == PortfolioPriceStatus.FINALIZED
