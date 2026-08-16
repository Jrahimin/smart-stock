from __future__ import annotations

from fastapi import Depends

from app.core.constants.trading_constants import DECISION_PATTERN_RESPONSE_LIMIT
from app.core.enums import ExchangeCode, MarketDataState, PatternStatus
from app.core.exception_handlers import NotFoundError
from app.modules.market_universe.market_universe_compute import technical_snapshot_from_read
from app.modules.market_universe.market_universe_service import (
    CanonicalUniverseSnapshot,
    MarketUniverseService,
    UniverseCacheUnavailableError,
    get_market_universe_service,
)
from app.modules.stock_details.decision.breakout import analyze_breakout
from app.modules.stock_details.decision.events import build_event_timeline
from app.modules.stock_details.decision.ownership import build_ownership_insights
from app.modules.stock_details.decision.patterns import detect_patterns
from app.modules.stock_details.decision.valuation import build_valuation_insights
from app.modules.stock_details.decision.warnings import generate_warnings
from app.modules.stock_details.stock_details_repository import (
    StockDetailsRepository,
    get_stock_details_repository,
)
from app.modules.stock_details.stock_details_schemas import (
    BreakoutAnalysisRead,
    BreakoutFactorRead,
    DataFreshnessRead,
    EventTimelineItemRead,
    OwnershipInsightRead,
    PatternDetectionRead,
    SmartWarningRead,
    StockDecisionSupportRead,
    SwingPointRead,
    TraderDecisionRead,
    ValuationInsightRead,
)


class StockDetailsDecisionService:
    """Stock-detail enrichment around the one canonical universe decision."""

    def __init__(
        self,
        repository: StockDetailsRepository,
        universe_service: MarketUniverseService,
    ) -> None:
        self.repository = repository
        self.universe_service = universe_service

    async def get_decision_support(
        self,
        *,
        exchange: ExchangeCode,
        symbol: str,
        canonical_snapshot: CanonicalUniverseSnapshot | None = None,
    ) -> StockDecisionSupportRead:
        """Return one-generation decision support, retrying once on publication races."""

        if canonical_snapshot is not None:
            result = await self._build_decision_support(
                exchange=exchange,
                symbol=symbol,
                canonical_snapshot=canonical_snapshot,
            )
            if not await self.universe_service.is_generation_current(
                canonical_snapshot.generation,
                exchange=exchange,
            ):
                raise UniverseCacheUnavailableError(
                    "Published market generation changed while Stock Details was loading"
                )
            return result

        for _ in range(2):
            snapshot = await self.universe_service.get_canonical_universe(exchange=exchange)
            result = await self._build_decision_support(
                exchange=exchange,
                symbol=symbol,
                canonical_snapshot=snapshot,
            )
            if await self.universe_service.is_generation_current(
                snapshot.generation,
                exchange=exchange,
            ):
                return result
        raise UniverseCacheUnavailableError(
            "Published market generation changed repeatedly while Stock Details was loading"
        )

    async def _build_decision_support(
        self,
        *,
        exchange: ExchangeCode,
        symbol: str,
        canonical_snapshot: CanonicalUniverseSnapshot,
    ) -> StockDecisionSupportRead:
        generation = canonical_snapshot.generation
        stock = await self.repository.get_stock_by_exchange_symbol(exchange=exchange, symbol=symbol)
        if stock is None:
            raise NotFoundError("Stock was not found")

        row = canonical_snapshot.row_for_symbol(symbol)
        if (
            row is None
            or row.decision is None
            or row.decision.canonical is None
            or row.analysis is None
            or row.eligibility is None
        ):
            raise UniverseCacheUnavailableError(
                f"Canonical decision is unavailable for {exchange.value}:{symbol.upper()} "
                f"in generation {generation.sync_id}"
            )

        prices = await self.repository.list_daily_prices_window(
            stock_id=stock.id,
            end_date=generation.trade_date,
        )
        if not prices:
            raise NotFoundError("Insufficient OHLCV data for decision support")

        dividend_events = await self.repository.list_dividend_events(stock_id=stock.id)
        corporate_actions = await self.repository.list_corporate_actions(stock_id=stock.id)
        shareholding = await self.repository.get_latest_shareholding_snapshot(stock.id)
        valuation = await self.repository.get_latest_valuation_snapshot(stock.id)
        market_events = await self.repository.list_market_events(stock_id=stock.id)

        snapshot = technical_snapshot_from_read(row.technical_snapshot)
        analysis = row.analysis
        patterns = detect_patterns(snapshot, prices)[:DECISION_PATTERN_RESPONSE_LIMIT]
        primary_pattern = patterns[0] if patterns else None
        pattern_bearish = primary_pattern.direction == "bearish" if primary_pattern else False
        pattern_confirmed = bool(
            pattern_bearish
            and primary_pattern is not None
            and primary_pattern.status == PatternStatus.CONFIRMED
        )
        warnings = generate_warnings(
            snapshot,
            analysis.opportunity,
            analysis.risk,
            analysis.liquidity,
            is_stale=analysis.is_stale,
            is_sparse=analysis.is_sparse,
            category=stock.category,
            pattern_name=primary_pattern.name if primary_pattern else None,
            pattern_bearish=pattern_bearish,
            pattern_confirmed=pattern_confirmed,
            suspected_adjustment=analysis.suspected_adjustment,
            constraints=tuple(row.decision.constraints),
        )
        breakout = analyze_breakout(snapshot, patterns)
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

        decision = row.decision
        canonical = decision.canonical
        is_live_session = generation.data_state in {
            MarketDataState.LIVE,
            MarketDataState.FINALIZATION_PENDING,
            MarketDataState.STALE,
        }
        pattern_reads = [
            PatternDetectionRead(
                name=pattern.name,
                confidence=pattern.confidence,
                status=pattern.status,
                breakout_level=pattern.breakout_level,
                target_estimate=pattern.target_estimate,
                invalidation_level=pattern.invalidation_level,
                swing_points=[
                    SwingPointRead(
                        index=point.index,
                        date=point.date,
                        price=point.price,
                        kind=point.kind,
                    )
                    for point in pattern.swing_points
                ],
                matched_reasons=list(pattern.matched_reasons),
                target_calculation=pattern.target_calculation,
                direction=pattern.direction,
                pattern_match_score=pattern.pattern_match_score,
            )
            for pattern in patterns
        ]

        return StockDecisionSupportRead(
            stock_id=stock.id,
            symbol=stock.symbol,
            exchange=stock.exchange,
            market_sync_id=generation.sync_id,
            data_state=generation.data_state,
            decision_session_date=generation.trade_date,
            live_data_as_of=(
                generation.source_last_synced_at if is_live_session else None
            ),
            is_live_session=is_live_session,
            decision=TraderDecisionRead(
                recommendation=decision.recommendation,
                internal_action=decision.internal_action,
                display_action=decision.display_action,
                decision_taxonomy_version=decision.decision_taxonomy_version,
                confidence=decision.confidence,
                reasoning=[decision.reason],
                evidence_strength=decision.evidence_strength,
                primary_reason=decision.primary_reason,
                primary_reason_code=decision.primary_reason_code,
                stance=decision.stance,
                non_holder_action=decision.non_holder_action,
                holder_action=decision.holder_action,
                constraints=list(decision.constraints),
                opportunity_quality=decision.opportunity_quality,
                entry_readiness=decision.entry_readiness,
                entry_timing=decision.entry_timing,
                entry_condition=decision.entry_condition,
                blocker_codes=list(decision.blocker_codes),
                canonical=canonical,
            ),
            canonical_decision=canonical,
            technical_snapshot=row.technical_snapshot,
            opportunity=analysis.opportunity,
            risk=analysis.risk,
            directional_evidence=analysis.directional_evidence,
            data_reliability=analysis.data_reliability,
            trading_risk=analysis.trading_risk,
            price_position=analysis.price_position,
            trade_plan=analysis.trade_plan,
            liquidity=analysis.liquidity,
            eligibility=row.eligibility,
            warnings=[SmartWarningRead.model_validate(item, from_attributes=True) for item in warnings],
            data_freshness=DataFreshnessRead(
                latest_trade_date=snapshot.latest_trade_date,
                ohlcv_row_count=snapshot.ohlcv_row_count,
                is_stale=analysis.is_stale,
                is_sparse=analysis.is_sparse,
                missing_fields=missing_fields,
                data_quality=snapshot.data_quality.value,
                source_summary=f"Canonical market universe generation {generation.sync_id}.",
            ),
            support=snapshot.support,
            resistance=snapshot.resistance,
            trend=snapshot.trend.value,
            patterns=pattern_reads,
            primary_pattern=pattern_reads[0] if pattern_reads else None,
            breakout=BreakoutAnalysisRead(
                probability=breakout.probability,
                factors=[
                    BreakoutFactorRead.model_validate(factor, from_attributes=True)
                    for factor in breakout.factors
                ],
                breakout_level=breakout.breakout_level,
                confirmation_level=breakout.confirmation_level,
                projected_target=breakout.projected_target,
                explanation=breakout.explanation,
                direction=breakout.direction,
                evidence_score=breakout.evidence_score,
            ),
            ownership=(
                OwnershipInsightRead.model_validate(ownership, from_attributes=True)
                if ownership is not None
                else None
            ),
            valuation=(
                ValuationInsightRead.model_validate(valuation_insight, from_attributes=True)
                if valuation_insight is not None
                else None
            ),
            events=[
                EventTimelineItemRead.model_validate(event, from_attributes=True)
                for event in events
            ],
        )


def get_stock_details_decision_service(
    repository: StockDetailsRepository = Depends(get_stock_details_repository),
    universe_service: MarketUniverseService = Depends(get_market_universe_service),
) -> StockDetailsDecisionService:
    return StockDetailsDecisionService(repository, universe_service)
