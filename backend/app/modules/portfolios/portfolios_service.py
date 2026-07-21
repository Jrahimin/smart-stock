from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Annotated
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import Depends

from app.api.dependencies.auth_dependencies import get_current_user
from app.core.enums import (
    DataQualityFlag,
    DecisionDisplayAction,
    ExchangeCode,
    HolderAction,
    MarketDataState,
    PortfolioAttentionCode,
    PortfolioAttentionSeverity,
    PortfolioPriceStatus,
    PortfolioWhatNextCode,
    RiskLevelLabel,
    ScannerConditionId,
    TrendDirection,
)
from app.core.security_config import UserContext
from app.modules.market_data.market_data_service import MarketDataService, get_market_data_service
from app.modules.market_universe.market_universe_schemas import ScoredUniverseRow
from app.modules.market_universe.market_universe_service import (
    MarketUniverseService,
    UniverseCacheUnavailableError,
    get_market_universe_service,
)
from app.modules.portfolios.portfolios_repository import (
    PortfolioEventRecord,
    PortfolioItemRecord,
    PortfoliosRepository,
    get_portfolios_repository,
)
from app.modules.portfolios.portfolios_schemas import (
    PortfolioActionGroupRead,
    PortfolioAttentionRead,
    PortfolioEventRead,
    PortfolioExposureRead,
    PortfolioHoldingRead,
    PortfolioPositionReferenceRead,
    PortfolioPulseRead,
    PortfolioShapeRead,
    PortfolioWatchlistSuggestionRead,
    PortfolioWorkspaceMetaRead,
    PortfolioWorkspaceRead,
)
from app.modules.stock_details.decision.display_taxonomy import resolve_holder_display_action

DHAKA_TZ = ZoneInfo("Asia/Dhaka")
MONEY_QUANTUM = Decimal("0.01")
PRICE_QUANTUM = Decimal("0.0001")
PERCENT_QUANTUM = Decimal("0.01")
NEAR_RESISTANCE_PERCENT = Decimal("2.5")
CONCENTRATION_PERCENT = Decimal("35")


def _decimal(value: object | None) -> Decimal | None:
    if value is None:
        return None
    return Decimal(str(value))


def _quantize(value: Decimal | None, quantum: Decimal) -> Decimal | None:
    if value is None:
        return None
    return value.quantize(quantum, rounding=ROUND_HALF_UP)


def _money(value: Decimal | None) -> Decimal | None:
    return _quantize(value, MONEY_QUANTUM)


def _percent(value: Decimal | None) -> Decimal | None:
    return _quantize(value, PERCENT_QUANTUM)


def _event_read(record: PortfolioEventRecord | None) -> PortfolioEventRead | None:
    if record is None:
        return None
    return PortfolioEventRead(
        event_type=record.event_type,
        event_date=record.event_date,
        title=record.title,
        summary=record.summary,
    )


def _is_near_resistance(current_price: Decimal | None, resistance: Decimal | None) -> bool:
    if current_price is None or resistance is None or resistance <= 0 or current_price > resistance:
        return False
    distance = (resistance - current_price) / resistance * Decimal("100")
    return distance <= NEAR_RESISTANCE_PERCENT


def _what_next_code(
    *,
    quantity: Decimal | None,
    buy_price: Decimal | None,
    current_price: Decimal | None,
    price_status: PortfolioPriceStatus,
    action: DecisionDisplayAction,
    holder_action: HolderAction | None,
    trend: TrendDirection,
    risk: RiskLevelLabel | None,
    scanner_conditions: list[ScannerConditionId],
    resistance: Decimal | None,
) -> PortfolioWhatNextCode:
    if quantity is None or buy_price is None or current_price is None:
        return PortfolioWhatNextCode.DATA_INCOMPLETE
    if price_status in {
        PortfolioPriceStatus.STALE_LAST_KNOWN,
        PortfolioPriceStatus.SUSPENDED,
        PortfolioPriceStatus.SUSPICIOUS,
        PortfolioPriceStatus.UNAVAILABLE,
    }:
        return PortfolioWhatNextCode.PRICE_STALE_OR_SUSPENDED
    if ScannerConditionId.BREAKDOWN in scanner_conditions:
        return PortfolioWhatNextCode.REVIEW_SUPPORT_BREAK
    if (
        holder_action in {HolderAction.SELL, HolderAction.REDUCE}
        or action == DecisionDisplayAction.SELL
    ):
        return PortfolioWhatNextCode.REVIEW_SELL_OR_REDUCE
    if risk in {RiskLevelLabel.HIGH, RiskLevelLabel.SPECULATIVE}:
        return PortfolioWhatNextCode.REVIEW_ELEVATED_RISK
    if current_price < buy_price and trend != TrendDirection.UPTREND:
        return PortfolioWhatNextCode.DO_NOT_AVERAGE_DOWN_FOR_COST_ONLY
    if _is_near_resistance(current_price, resistance):
        return PortfolioWhatNextCode.WATCH_RESISTANCE
    if current_price > buy_price and trend == TrendDirection.UPTREND:
        return PortfolioWhatNextCode.PROFITABLE_TREND_INTACT
    return PortfolioWhatNextCode.NO_ACTION_NEEDED


class PortfoliosService:
    def __init__(
        self,
        repository: PortfoliosRepository,
        user_context: UserContext,
        universe_service: MarketUniverseService,
        market_data_service: MarketDataService,
    ) -> None:
        self.repository = repository
        self.user_context = user_context
        self.universe_service = universe_service
        self.market_data_service = market_data_service

    def _user_id(self) -> UUID:
        return UUID(self.user_context.user_id)

    async def get_workspace(self, *, exchange: ExchangeCode) -> PortfolioWorkspaceRead:
        items = await self.repository.list_items(user_id=self._user_id(), exchange=exchange)
        universe_rows: list[ScoredUniverseRow] = []
        try:
            universe = await self.universe_service.get_universe_rows(exchange=exchange)
            universe_rows = universe.rows
            published_date = universe.meta.session_trade_date
            live_as_of = universe.meta.live_data_as_of
            data_state = universe.meta.data_state
            is_provisional = universe.meta.is_live_session
        except UniverseCacheUnavailableError:
            freshness = await self.market_data_service.get_market_freshness(exchange=exchange)
            published_date = freshness.trade_date
            live_as_of = freshness.live_data_as_of
            data_state = freshness.data_state or MarketDataState.STALE
            is_provisional = bool(freshness.is_live_session)

        universe_by_stock = {row.stock.id: row for row in universe_rows}
        fallback_stock_ids = [
            item.stock.id for item in items if item.stock.id not in universe_by_stock
        ]
        fallback_prices = await self.repository.list_latest_positive_prices(
            stock_ids=fallback_stock_ids,
            end_date=published_date,
        )
        stock_ids = [item.stock.id for item in items]
        today = datetime.now(DHAKA_TZ).date()
        events = await self.repository.list_relevant_events(
            stock_ids=stock_ids,
            start_date=today - timedelta(days=7),
            end_date=today + timedelta(days=30),
        )
        positioned: list[tuple[PortfolioItemRecord, PortfolioHoldingRead]] = []
        for item in items:
            stock_events = events.get(item.stock.id, [])
            positioned.append(
                (
                    item,
                    self._build_position(
                        item=item,
                        universe_row=universe_by_stock.get(item.stock.id),
                        fallback_price=fallback_prices.get(item.stock.id),
                        published_date=published_date,
                        data_state=data_state,
                        is_provisional=is_provisional,
                        relevant_event=stock_events[0] if stock_events else None,
                    ),
                )
            )

        holdings = [position for item, position in positioned if item.entry.is_holding]
        known_current_value = sum(
            (holding.current_value or Decimal("0") for holding in holdings), Decimal("0")
        )
        comparable_previous_value = sum(
            (
                (holding.quantity or Decimal("0")) * (holding.previous_close or Decimal("0"))
                for holding in holdings
                if holding.estimated_daily_change_amount is not None
            ),
            Decimal("0"),
        )
        holdings = [
            holding.model_copy(
                update={
                    "portfolio_weight": _percent(
                        holding.current_value / known_current_value * Decimal("100")
                        if holding.current_value is not None and known_current_value > 0
                        else None
                    ),
                    "estimated_daily_contribution_percent": _percent(
                        holding.estimated_daily_change_amount
                        / comparable_previous_value
                        * Decimal("100")
                        if holding.estimated_daily_change_amount is not None
                        and comparable_previous_value > 0
                        else None
                    ),
                }
            )
            for holding in holdings
        ]

        reliable_value_statuses = {
            PortfolioPriceStatus.FINALIZED,
            PortfolioPriceStatus.PROVISIONAL,
            PortfolioPriceStatus.NON_TRADED,
        }
        current_complete = all(
            holding.current_value is not None and holding.price_status in reliable_value_statuses
            for holding in holdings
        )
        invested_complete = all(holding.invested_amount is not None for holding in holdings)
        unrealized_complete = all(
            holding.unrealized_gain_amount is not None for holding in holdings
        )
        daily_complete = all(
            holding.estimated_daily_change_amount is not None for holding in holdings
        )
        known_invested = sum(
            (holding.invested_amount or Decimal("0") for holding in holdings), Decimal("0")
        )
        known_unrealized = sum(
            (holding.unrealized_gain_amount or Decimal("0") for holding in holdings), Decimal("0")
        )
        comparable_invested = sum(
            (
                holding.invested_amount or Decimal("0")
                for holding in holdings
                if holding.unrealized_gain_amount is not None
            ),
            Decimal("0"),
        )
        daily_change = sum(
            (holding.estimated_daily_change_amount or Decimal("0") for holding in holdings),
            Decimal("0"),
        )
        holdings = [
            holding.model_copy(
                update={
                    "requires_attention": holding.what_next_code
                    not in {
                        PortfolioWhatNextCode.NO_ACTION_NEEDED,
                        PortfolioWhatNextCode.PROFITABLE_TREND_INTACT,
                    }
                }
            )
            for holding in holdings
        ]
        pulse = PortfolioPulseRead(
            known_current_value=_money(known_current_value) or Decimal("0"),
            current_value_is_complete=current_complete,
            known_invested_amount=_money(known_invested) or Decimal("0"),
            invested_amount_is_complete=invested_complete,
            known_unrealized_gain_amount=_money(known_unrealized) or Decimal("0"),
            known_unrealized_gain_percent=_percent(
                known_unrealized / comparable_invested * Decimal("100")
                if comparable_invested > 0
                else None
            ),
            unrealized_gain_is_complete=unrealized_complete,
            estimated_daily_change_amount=_money(daily_change) or Decimal("0"),
            estimated_daily_change_percent=_percent(
                daily_change / comparable_previous_value * Decimal("100")
                if comparable_previous_value > 0
                else None
            ),
            daily_change_is_complete=daily_complete,
            holding_count=len(holdings),
            valued_holding_count=sum(holding.current_value is not None for holding in holdings),
        )
        meta = PortfolioWorkspaceMetaRead(
            exchange=exchange,
            published_market_date=published_date,
            live_data_as_of=live_as_of,
            data_state=data_state,
            is_provisional=is_provisional,
            total_watchlisted=len(items),
            holding_count=len(holdings),
            valued_holding_count=pulse.valued_holding_count,
            costed_holding_count=sum(holding.invested_amount is not None for holding in holdings),
        )
        return PortfolioWorkspaceRead(
            meta=meta,
            pulse=pulse,
            attention=self._build_attention(holdings, current_complete=current_complete),
            holdings=holdings,
            watchlist_items=[position for _, position in positioned],
            shape=self._build_shape(holdings),
            watchlist_to_review=self._build_watchlist_suggestions(positioned),
        )

    def _build_position(
        self,
        *,
        item: PortfolioItemRecord,
        universe_row: ScoredUniverseRow | None,
        fallback_price,
        published_date,
        data_state: MarketDataState,
        is_provisional: bool,
        relevant_event: PortfolioEventRecord | None,
    ) -> PortfolioHoldingRead:
        technical = universe_row.technical_snapshot if universe_row is not None else None
        decision = universe_row.decision if universe_row is not None else None
        if (
            universe_row is not None
            and technical is not None
            and universe_row.session.close_price > 0
        ):
            current_price = _decimal(universe_row.session.close_price)
            previous_close = _decimal(technical.previous_close)
            price_change = _decimal(technical.price_change)
            change_percent = _decimal(universe_row.session.change_percent)
            latest_trade_date = universe_row.session.latest_trade_date
            data_quality = universe_row.session.data_quality_flag
            volume = universe_row.session.volume
        elif fallback_price is not None:
            current_price = _decimal(fallback_price.close_price)
            previous_close = _decimal(fallback_price.previous_close_price)
            price_change = _decimal(fallback_price.price_change)
            change_percent = _decimal(fallback_price.price_change_percent)
            latest_trade_date = fallback_price.trade_date
            data_quality = fallback_price.data_quality_flag
            volume = fallback_price.volume
        else:
            current_price = previous_close = price_change = change_percent = None
            latest_trade_date = None
            data_quality = DataQualityFlag.PARTIAL
            volume = 0

        event_records = [] if relevant_event is None else [relevant_event]
        latest_trading_event = next(
            (event for event in event_records if event.event_type.startswith("TRADING_STATUS:")),
            None,
        )
        suspended = bool(
            latest_trading_event is not None
            and latest_trading_event.event_type.endswith("TRADING_SUSPENSION")
        )
        if current_price is None:
            price_status = PortfolioPriceStatus.UNAVAILABLE
        elif suspended:
            price_status = PortfolioPriceStatus.SUSPENDED
        elif data_quality == DataQualityFlag.SUSPICIOUS:
            price_status = PortfolioPriceStatus.SUSPICIOUS
        elif latest_trade_date != published_date or data_state == MarketDataState.STALE:
            price_status = PortfolioPriceStatus.STALE_LAST_KNOWN
        elif volume == 0:
            price_status = PortfolioPriceStatus.NON_TRADED
        elif is_provisional:
            price_status = PortfolioPriceStatus.PROVISIONAL
        else:
            price_status = PortfolioPriceStatus.FINALIZED

        holder_action = decision.holder_action if decision is not None else None
        if item.entry.is_holding and holder_action is not None:
            action = resolve_holder_display_action(holder_action)
        elif decision is not None:
            action = decision.display_action
        else:
            action = DecisionDisplayAction.WAIT
        risk = None
        if decision is not None:
            risk = (
                decision.trading_risk.label
                if decision.trading_risk is not None
                else decision.risk_label
            )
        trend = technical.trend if technical is not None else TrendDirection.UNKNOWN
        scanner_conditions = (
            [match.condition_id for match in universe_row.scanner.matches]
            if universe_row is not None and universe_row.scanner is not None
            else []
        )
        quantity = _decimal(item.entry.quantity)
        buy_price = _decimal(item.entry.buy_price)
        invested = quantity * buy_price if quantity is not None and buy_price is not None else None
        current_value = (
            quantity * current_price if quantity is not None and current_price is not None else None
        )
        unrealized = (
            current_value - invested if current_value is not None and invested is not None else None
        )
        daily_statuses = {
            PortfolioPriceStatus.FINALIZED,
            PortfolioPriceStatus.PROVISIONAL,
            PortfolioPriceStatus.NON_TRADED,
        }
        daily_change = (
            quantity * price_change
            if quantity is not None and price_change is not None and price_status in daily_statuses
            else None
        )
        resistance = _decimal(technical.resistance) if technical is not None else None
        what_next = _what_next_code(
            quantity=quantity,
            buy_price=buy_price,
            current_price=current_price,
            price_status=price_status,
            action=action,
            holder_action=holder_action,
            trend=trend,
            risk=risk,
            scanner_conditions=scanner_conditions,
            resistance=resistance,
        )
        return PortfolioHoldingRead(
            watchlist_item_id=item.entry.id,
            stock_id=item.stock.id,
            is_holding=item.entry.is_holding,
            symbol=item.stock.symbol,
            name=item.stock.name,
            exchange=item.stock.exchange,
            sector=item.stock.sector,
            quantity=_quantize(quantity, PRICE_QUANTUM),
            average_buy_price=_quantize(buy_price, PRICE_QUANTUM),
            note=item.entry.note,
            current_price=_quantize(current_price, PRICE_QUANTUM),
            previous_close=_quantize(previous_close, PRICE_QUANTUM),
            price_change=_quantize(price_change, PRICE_QUANTUM),
            price_change_percent=_percent(change_percent),
            price_status=price_status,
            latest_trade_date=latest_trade_date,
            invested_amount=_money(invested),
            current_value=_money(current_value),
            unrealized_gain_amount=_money(unrealized),
            unrealized_gain_percent=_percent(
                unrealized / invested * Decimal("100")
                if unrealized is not None and invested is not None and invested > 0
                else None
            ),
            estimated_daily_change_amount=_money(daily_change),
            action=action,
            holder_action=holder_action,
            trend=trend,
            risk=risk,
            rsi=_percent(_decimal(technical.rsi)) if technical is not None else None,
            support=_quantize(_decimal(technical.support), PRICE_QUANTUM) if technical else None,
            resistance=_quantize(resistance, PRICE_QUANTUM),
            scanner_conditions=scanner_conditions,
            relevant_event=_event_read(relevant_event),
            decision_reason=decision.reason if decision is not None else None,
            what_next_code=what_next,
        )

    @staticmethod
    def _build_attention(
        holdings: list[PortfolioHoldingRead],
        *,
        current_complete: bool,
    ) -> list[PortfolioAttentionRead]:
        grouped: dict[PortfolioAttentionCode, list[PortfolioHoldingRead]] = defaultdict(list)
        for holding in holdings:
            if holding.what_next_code == PortfolioWhatNextCode.REVIEW_SUPPORT_BREAK:
                grouped[PortfolioAttentionCode.SUPPORT_BREAK].append(holding)
            if holding.what_next_code == PortfolioWhatNextCode.REVIEW_SELL_OR_REDUCE:
                grouped[PortfolioAttentionCode.SELL_OR_REDUCE].append(holding)
            if holding.price_status in {
                PortfolioPriceStatus.SUSPENDED,
                PortfolioPriceStatus.SUSPICIOUS,
                PortfolioPriceStatus.STALE_LAST_KNOWN,
                PortfolioPriceStatus.UNAVAILABLE,
            }:
                grouped[PortfolioAttentionCode.PRICE_QUALITY].append(holding)
            if holding.risk in {RiskLevelLabel.HIGH, RiskLevelLabel.SPECULATIVE}:
                grouped[PortfolioAttentionCode.ELEVATED_RISK].append(holding)
            if holding.quantity is None or holding.average_buy_price is None:
                grouped[PortfolioAttentionCode.INCOMPLETE_HOLDING].append(holding)
            if holding.what_next_code == PortfolioWhatNextCode.WATCH_RESISTANCE:
                grouped[PortfolioAttentionCode.WATCH_RESISTANCE].append(holding)
            if ScannerConditionId.PRICE_VOLUME_BREAKOUT in holding.scanner_conditions:
                grouped[PortfolioAttentionCode.UNUSUAL_VOLUME].append(holding)
            if holding.relevant_event is not None:
                grouped[PortfolioAttentionCode.IMPORTANT_EVENT].append(holding)
        if current_complete and len(holdings) >= 2:
            concentrated = [
                holding
                for holding in holdings
                if holding.portfolio_weight is not None
                and holding.portfolio_weight >= CONCENTRATION_PERCENT
            ]
            if concentrated:
                grouped[PortfolioAttentionCode.HIGH_CONCENTRATION] = concentrated
        severity = {
            PortfolioAttentionCode.SUPPORT_BREAK: PortfolioAttentionSeverity.HIGH,
            PortfolioAttentionCode.SELL_OR_REDUCE: PortfolioAttentionSeverity.HIGH,
            PortfolioAttentionCode.PRICE_QUALITY: PortfolioAttentionSeverity.MEDIUM,
            PortfolioAttentionCode.ELEVATED_RISK: PortfolioAttentionSeverity.MEDIUM,
            PortfolioAttentionCode.INCOMPLETE_HOLDING: PortfolioAttentionSeverity.LOW,
            PortfolioAttentionCode.HIGH_CONCENTRATION: PortfolioAttentionSeverity.MEDIUM,
            PortfolioAttentionCode.WATCH_RESISTANCE: PortfolioAttentionSeverity.INFO,
            PortfolioAttentionCode.UNUSUAL_VOLUME: PortfolioAttentionSeverity.INFO,
            PortfolioAttentionCode.IMPORTANT_EVENT: PortfolioAttentionSeverity.INFO,
        }
        priority = list(severity)
        return [
            PortfolioAttentionRead(
                code=code,
                severity=severity[code],
                stock_ids=[holding.stock_id for holding in grouped[code]],
                symbols=[holding.symbol for holding in grouped[code]],
                count=len(grouped[code]),
            )
            for code in priority
            if grouped.get(code)
        ]

    @staticmethod
    def _position_reference(
        holding: PortfolioHoldingRead | None,
        *,
        amount: Decimal | None,
        percent: Decimal | None,
    ) -> PortfolioPositionReferenceRead | None:
        if holding is None:
            return None
        return PortfolioPositionReferenceRead(
            stock_id=holding.stock_id,
            symbol=holding.symbol,
            name=holding.name,
            amount=amount,
            percent=percent,
        )

    def _build_shape(self, holdings: list[PortfolioHoldingRead]) -> PortfolioShapeRead:
        rankable_statuses = {
            PortfolioPriceStatus.FINALIZED,
            PortfolioPriceStatus.PROVISIONAL,
            PortfolioPriceStatus.NON_TRADED,
            PortfolioPriceStatus.STALE_LAST_KNOWN,
        }
        position_exposure = [
            PortfolioExposureRead(
                label=holding.symbol,
                current_value=holding.current_value,
                weight_percent=holding.portfolio_weight or Decimal("0"),
            )
            for holding in holdings
            if holding.current_value is not None and holding.price_status in rankable_statuses
        ]
        position_exposure.sort(key=lambda row: row.current_value, reverse=True)
        sector_values: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
        total_value = sum((row.current_value for row in position_exposure), Decimal("0"))
        for holding in holdings:
            if holding.current_value is not None and holding.price_status in rankable_statuses:
                sector_values[holding.sector or "Unknown"] += holding.current_value
        sector_exposure = [
            PortfolioExposureRead(
                label=sector,
                current_value=_money(value) or Decimal("0"),
                weight_percent=_percent(value / total_value * Decimal("100")) or Decimal("0"),
            )
            for sector, value in sector_values.items()
            if total_value > 0
        ]
        sector_exposure.sort(key=lambda row: row.current_value, reverse=True)
        action_values: dict[DecisionDisplayAction, tuple[int, Decimal]] = {}
        for holding in holdings:
            count, value = action_values.get(holding.action, (0, Decimal("0")))
            action_values[holding.action] = (
                count + 1,
                value + (holding.current_value or Decimal("0")),
            )
        action_groups = [
            PortfolioActionGroupRead(
                action=action,
                count=count,
                current_value=_money(value) or Decimal("0"),
            )
            for action, (count, value) in sorted(
                action_values.items(), key=lambda item: item[0].value
            )
        ]
        valued = [
            holding
            for holding in holdings
            if holding.current_value is not None and holding.price_status in rankable_statuses
        ]
        complete_positions = [
            holding
            for holding in holdings
            if holding.unrealized_gain_percent is not None
            and holding.price_status in rankable_statuses
        ]
        contributors = [
            holding for holding in holdings if holding.estimated_daily_change_amount is not None
        ]
        largest = max(valued, key=lambda row: row.current_value or Decimal("0"), default=None)
        strongest = max(
            complete_positions,
            key=lambda row: row.unrealized_gain_percent or Decimal("0"),
            default=None,
        )
        weakest = min(
            complete_positions,
            key=lambda row: row.unrealized_gain_percent or Decimal("0"),
            default=None,
        )
        best = max(
            contributors,
            key=lambda row: row.estimated_daily_change_amount or Decimal("0"),
            default=None,
        )
        worst = min(
            contributors,
            key=lambda row: row.estimated_daily_change_amount or Decimal("0"),
            default=None,
        )
        return PortfolioShapeRead(
            position_exposure=position_exposure,
            sector_exposure=sector_exposure,
            action_groups=action_groups,
            largest_holding=self._position_reference(
                largest,
                amount=largest.current_value if largest else None,
                percent=largest.portfolio_weight if largest else None,
            ),
            strongest_position=self._position_reference(
                strongest,
                amount=strongest.unrealized_gain_amount if strongest else None,
                percent=strongest.unrealized_gain_percent if strongest else None,
            ),
            weakest_position=self._position_reference(
                weakest,
                amount=weakest.unrealized_gain_amount if weakest else None,
                percent=weakest.unrealized_gain_percent if weakest else None,
            ),
            best_daily_contributor=self._position_reference(
                best,
                amount=best.estimated_daily_change_amount if best else None,
                percent=best.estimated_daily_contribution_percent if best else None,
            ),
            worst_daily_contributor=self._position_reference(
                worst,
                amount=worst.estimated_daily_change_amount if worst else None,
                percent=worst.estimated_daily_contribution_percent if worst else None,
            ),
        )

    @staticmethod
    def _build_watchlist_suggestions(
        positioned: list[tuple[PortfolioItemRecord, PortfolioHoldingRead]],
    ) -> list[PortfolioWatchlistSuggestionRead]:
        suggestions: list[tuple[int, PortfolioWatchlistSuggestionRead]] = []
        scanner_priority = {
            ScannerConditionId.PRICE_VOLUME_BREAKOUT: 90,
            ScannerConditionId.SUPPORT_REBOUND: 80,
            ScannerConditionId.MOMENTUM_CONTINUATION: 70,
            ScannerConditionId.LOW_VOLATILITY_COMPRESSION: 65,
            ScannerConditionId.BREAKDOWN: 55,
            ScannerConditionId.HIGH_RISK_WATCH: 50,
        }
        for item, position in positioned:
            if item.entry.is_holding:
                continue
            score = 0
            reason_code: str | None = None
            scanner_condition: ScannerConditionId | None = None
            if position.action == DecisionDisplayAction.POTENTIAL_BUY:
                score = 100
                reason_code = "ACTIONABLE_POTENTIAL_BUY"
            if position.scanner_conditions:
                best_scanner = max(
                    position.scanner_conditions,
                    key=lambda condition: scanner_priority.get(condition, 0),
                )
                if scanner_priority.get(best_scanner, 0) > score:
                    score = scanner_priority[best_scanner]
                    reason_code = best_scanner.value
                    scanner_condition = best_scanner
            if position.relevant_event is not None and score < 60:
                score = 60
                reason_code = "IMPORTANT_EVENT"
            if position.risk in {RiskLevelLabel.HIGH, RiskLevelLabel.SPECULATIVE} and score < 50:
                score = 50
                reason_code = "ELEVATED_RISK"
            if reason_code is None:
                continue
            suggestions.append(
                (
                    score,
                    PortfolioWatchlistSuggestionRead(
                        stock_id=position.stock_id,
                        symbol=position.symbol,
                        name=position.name,
                        exchange=position.exchange,
                        sector=position.sector,
                        current_price=position.current_price,
                        price_change_percent=position.price_change_percent,
                        action=position.action,
                        trend=position.trend,
                        risk=position.risk,
                        reason_code=reason_code,
                        scanner_condition=scanner_condition,
                        relevant_event=position.relevant_event,
                    ),
                )
            )
        suggestions.sort(key=lambda item: (-item[0], item[1].symbol))
        return [suggestion for _, suggestion in suggestions[:5]]


def get_portfolios_service(
    repository: Annotated[PortfoliosRepository, Depends(get_portfolios_repository)],
    user_context: Annotated[UserContext, Depends(get_current_user)],
    universe_service: Annotated[MarketUniverseService, Depends(get_market_universe_service)],
    market_data_service: Annotated[MarketDataService, Depends(get_market_data_service)],
) -> PortfoliosService:
    return PortfoliosService(repository, user_context, universe_service, market_data_service)
