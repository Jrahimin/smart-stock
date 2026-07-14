from __future__ import annotations

import asyncio

from fastapi import Depends

from app.core.constants.trading_constants import (
    DECISION_PATTERN_RESPONSE_LIMIT,
    ELIGIBILITY_SESSION_LOOKBACK,
    REGIME_SUMMARY_FETCH_LIMIT,
)
from app.core.enums import ExchangeCode, PatternStatus
from app.core.exception_handlers import NotFoundError
from app.modules.stock_details.decision.breakout import analyze_breakout
from app.modules.stock_details.decision.canonical import build_strategy_input
from app.modules.stock_details.decision.engine import compute_trader_decision
from app.modules.stock_details.decision.events import build_event_timeline
from app.modules.stock_details.decision.market_regime import resolve_regime_from_summaries
from app.modules.stock_details.decision.ownership import build_ownership_insights
from app.modules.stock_details.decision.patterns import detect_patterns
from app.modules.stock_details.decision.trade_plan import compute_price_position
from app.modules.stock_details.decision.valuation import build_valuation_insights
from app.modules.stock_details.decision.warnings import generate_warnings
from app.modules.stock_details.stock_details_repository import (
    StockDetailsRepository,
    get_stock_details_repository,
)
from app.modules.stock_details.stock_details_schemas import StockDecisionSupportRead


class StockDetailsDecisionService:
    def __init__(self, repository: StockDetailsRepository) -> None:
        self.repository = repository

    async def get_decision_support(
        self, *, exchange: ExchangeCode, symbol: str
    ) -> StockDecisionSupportRead:
        stock = await self.repository.get_stock_by_exchange_symbol(exchange=exchange, symbol=symbol)
        if stock is None:
            raise NotFoundError("Stock was not found")

        prices = await self.repository.list_daily_prices_window(stock_id=stock.id)
        (
            dividend_events,
            corporate_actions,
            decision_corporate_action_dates,
            market_summaries,
            exchange_session_dates,
        ) = await asyncio.gather(
            self.repository.list_dividend_events(stock_id=stock.id),
            self.repository.list_corporate_actions(stock_id=stock.id),
            self.repository.list_decision_corporate_action_dates(stock_id=stock.id),
            self.repository.list_recent_market_summaries(
                exchange=exchange, limit=REGIME_SUMMARY_FETCH_LIMIT
            ),
            self.repository.list_recent_exchange_session_dates(
                exchange=exchange, limit=ELIGIBILITY_SESSION_LOOKBACK
            ),
        )
        market_regime = resolve_regime_from_summaries(market_summaries)
        strategy_input = build_strategy_input(
            stock,
            prices,
            known_corporate_action_dates=decision_corporate_action_dates or None,
            exchange_session_dates=exchange_session_dates,
            market_regime=market_regime,
        )
        decision_bundle = compute_trader_decision(strategy_input)
        if decision_bundle is None:
            raise NotFoundError("Insufficient OHLCV data for decision support")

        snapshot = decision_bundle.snapshot
        liquidity = decision_bundle.liquidity
        risk = decision_bundle.risk
        opportunity = decision_bundle.opportunity
        trade_plan = decision_bundle.trade_plan
        decision = decision_bundle.decision
        confidence = decision_bundle.confidence
        is_stale = decision_bundle.is_stale
        is_sparse = decision_bundle.is_sparse
        directional_evidence = decision_bundle.directional_evidence
        data_reliability = decision_bundle.data_reliability
        trading_risk = decision_bundle.trading_risk
        if directional_evidence is None or data_reliability is None or trading_risk is None:
            raise NotFoundError("Decision model outputs are unavailable")

        price_position = compute_price_position(snapshot)
        patterns = detect_patterns(snapshot, prices)[:DECISION_PATTERN_RESPONSE_LIMIT]
        primary_pattern = patterns[0] if patterns else None
        pattern_bearish = primary_pattern.direction == "bearish" if primary_pattern else False
        pattern_confirmed = (
            pattern_bearish
            and primary_pattern is not None
            and primary_pattern.status == PatternStatus.CONFIRMED
        )
        warnings = generate_warnings(
            snapshot,
            opportunity,
            risk,
            liquidity,
            is_stale=is_stale,
            is_sparse=is_sparse,
            category=stock.category,
            pattern_name=primary_pattern.name if primary_pattern else None,
            pattern_bearish=pattern_bearish,
            pattern_confirmed=pattern_confirmed,
            suspected_adjustment=decision_bundle.suspected_adjustment,
            constraints=decision.constraints,
        )
        breakout = analyze_breakout(snapshot, patterns)

        (
            shareholding,
            valuation,
            market_events,
        ) = await asyncio.gather(
            self.repository.get_latest_shareholding_snapshot(stock.id),
            self.repository.get_latest_valuation_snapshot(stock.id),
            self.repository.list_market_events(stock_id=stock.id),
        )

        ownership = build_ownership_insights(shareholding)
        valuation_insight = build_valuation_insights(valuation)
        events = build_event_timeline(market_events, dividend_events, corporate_actions)

        missing_fields: list[str] = []
        if snapshot.rsi is None:
            missing_fields.append("rsi")
        if snapshot.sma20 is None:
            missing_fields.append("sma20")
        if snapshot.support is None:
            missing_fields.append("support")
        if shareholding is None:
            missing_fields.append("shareholding")
        if valuation is None:
            missing_fields.append("valuation")

        return StockDecisionSupportRead.from_context(
            stock=stock,
            snapshot=snapshot,
            decision=decision,
            confidence=confidence,
            opportunity=opportunity,
            risk=risk,
            price_position=price_position,
            trade_plan=trade_plan,
            liquidity=liquidity,
            warnings=warnings,
            patterns=patterns,
            breakout=breakout,
            ownership=ownership,
            valuation=valuation_insight,
            events=events,
            is_stale=is_stale,
            is_sparse=is_sparse,
            eligibility=decision_bundle.eligibility,
            directional_evidence=directional_evidence,
            data_reliability=data_reliability,
            trading_risk=trading_risk,
            canonical_result=decision_bundle.canonical_result,
            missing_fields=missing_fields,
        )


def get_stock_details_decision_service(
    repository: StockDetailsRepository = Depends(get_stock_details_repository),
) -> StockDetailsDecisionService:
    return StockDetailsDecisionService(repository)
