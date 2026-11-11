from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    CorporateAction,
    DecisionGenerationCapture,
    DailyMarketSummary,
    DailyPrice,
    DividendEvent,
    Stock,
    MarketDataGeneration,
)
from app.modules.backtesting.backtesting_models import (
    BacktestConfig,
    BacktestDataset,
    StockReplayHistory,
)


class BacktestingRepository:
    """Read-only historical loader. It deliberately does not filter on current is_active."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def load_dataset(self, config: BacktestConfig) -> BacktestDataset:
        history_start = config.start_date - timedelta(days=365)
        finalized_session_dates = tuple(
            (
                await self.session.scalars(
                    select(DailyMarketSummary.trade_date)
                    .where(
                        DailyMarketSummary.exchange == config.exchange,
                        DailyMarketSummary.index_name == "DSEX",
                        DailyMarketSummary.is_finalized.is_(True),
                        DailyMarketSummary.trade_date >= history_start,
                        DailyMarketSummary.trade_date <= config.end_date,
                    )
                    .distinct()
                    .order_by(DailyMarketSummary.trade_date)
                )
            ).all()
        )
        observed_session_dates = tuple((await self.session.scalars(
            select(MarketDataGeneration.trade_date).where(
                MarketDataGeneration.exchange == config.exchange,
                MarketDataGeneration.accepted_count > 0,
                MarketDataGeneration.trade_date >= history_start,
                MarketDataGeneration.trade_date <= config.end_date,
            ).distinct().order_by(MarketDataGeneration.trade_date)
        )).all())
        price_rows = (
            await self.session.execute(
                select(Stock, DailyPrice)
                .join(DailyPrice, DailyPrice.stock_id == Stock.id)
                .where(
                    Stock.exchange == config.exchange,
                    DailyPrice.trade_date >= history_start,
                    DailyPrice.trade_date <= config.end_date,
                    DailyPrice.trade_date.in_(finalized_session_dates),
                )
                .order_by(Stock.symbol, Stock.id, DailyPrice.trade_date, DailyPrice.id)
            )
        ).all()

        all_stocks = list((await self.session.scalars(select(Stock).where(Stock.exchange == config.exchange))).all())
        stock_by_id: dict[UUID, Stock] = {stock.id: stock for stock in all_stocks}
        prices_by_stock: dict[UUID, list[DailyPrice]] = defaultdict(list)
        for stock, price in price_rows:
            stock_by_id[stock.id] = stock
            prices_by_stock[stock.id].append(price)

        action_dates: dict[UUID, set[date]] = defaultdict(set)
        if stock_by_id:
            stock_ids = list(stock_by_id)
            dividend_dates = (
                await self.session.execute(
                    select(DividendEvent.stock_id, DividendEvent.ex_dividend_date).where(
                        DividendEvent.stock_id.in_(stock_ids),
                        DividendEvent.ex_dividend_date >= history_start,
                        DividendEvent.ex_dividend_date <= config.end_date,
                    )
                )
            ).all()
            corporate_dates = (
                await self.session.execute(
                    select(CorporateAction.stock_id, CorporateAction.effective_date).where(
                        CorporateAction.stock_id.in_(stock_ids),
                        CorporateAction.effective_date >= history_start,
                        CorporateAction.effective_date <= config.end_date,
                    )
                )
            ).all()
            for stock_id, action_date in dividend_dates:
                action_dates[stock_id].add(action_date)
            for stock_id, action_date in corporate_dates:
                action_dates[stock_id].add(action_date)

        summaries = tuple(
            (
                await self.session.execute(
                    select(DailyMarketSummary)
                    .where(
                        DailyMarketSummary.exchange == config.exchange,
                        DailyMarketSummary.trade_date >= history_start,
                        DailyMarketSummary.trade_date <= config.end_date,
                        DailyMarketSummary.trade_date.in_(finalized_session_dates),
                    )
                    .order_by(
                        DailyMarketSummary.trade_date,
                        DailyMarketSummary.index_name,
                        DailyMarketSummary.id,
                    )
                )
            )
            .scalars()
            .all()
        )
        from app.modules.trading_intelligence.capture_inventory import verify_capture_coverage
        captures = list((await self.session.scalars(select(DecisionGenerationCapture).where(
            DecisionGenerationCapture.exchange == config.exchange,
            DecisionGenerationCapture.session_date >= history_start,
            DecisionGenerationCapture.session_date <= config.end_date,
        ).order_by(DecisionGenerationCapture.session_date, DecisionGenerationCapture.observed_at))).all())
        captured_by_stock = defaultdict(list)
        publications = []
        for capture in captures:
            source = capture.input_payload
            result = capture.result_payload
            rows = {str(row["stock"]["id"]): row for row in result.get("rows", [])}
            coverage = verify_capture_coverage(source, list(rows))["status"]
            publications.append({"generation_id": capture.generation_id, "session_date": capture.session_date.isoformat(),
                "observed_at": capture.observed_at.isoformat(), "invalidated_at": capture.invalidated_at.isoformat() if capture.invalidated_at else None,
                "strategy_version": result.get("strategy_version"), "members": source.get("universe_membership", []),
                "excluded_members": source.get("excluded_members", []), "coverage_status": coverage})
            for stock_key, value in source.get("inputs", {}).items():
                stock_id = UUID(stock_key)
                if stock_id not in stock_by_id:
                    fields = source.get("stocks", {}).get(stock_key, {})
                    stock_by_id[stock_id] = Stock(id=stock_id, symbol=value["symbol"], name=fields.get("name", value["symbol"]),
                        exchange=config.exchange, category=value.get("category"), sector=fields.get("sector"), is_active=value["is_active"])
                row = rows.get(stock_key, {})
                canonical = (row.get("decision") or {}).get("canonical") or {}
                plan = (row.get("analysis") or {}).get("trade_plan") or {}
                expected = {key: canonical.get(key) for key in ("input_hash", "shared_decision_id", "display_action", "eligibility_status", "entry_readiness", "opportunity_quality")}
                expected.update({key: plan.get(key) for key in ("trigger_price", "invalidation_price", "preferred_entry_zone_low", "preferred_entry_zone_high")})
                expected["target_price"] = plan.get("target_low")
                captured_by_stock[stock_id].append({"publication_id": capture.generation_id,
                    "observed_at": capture.observed_at.isoformat(), "input": {**value, "strategy_version": result.get("strategy_version")},
                    "expected_decision": expected, "coverage_status": coverage})
        from app.modules.market_data.market_data_repository import MarketDataRepository
        event_facts = await MarketDataRepository(self.session).list_decision_event_observations(stock_ids=set(stock_by_id))
        histories = tuple(
            StockReplayHistory(
                stock=stock_by_id[stock_id],
                prices=tuple(prices_by_stock[stock_id]),
                corporate_action_dates=frozenset(action_dates.get(stock_id, ())),
                captured_inputs=tuple(captured_by_stock.get(stock_id, ())),
                event_observations=tuple(event_facts.get(stock_id, ())),
            )
            for stock_id in sorted(
                stock_by_id,
                key=lambda item: (stock_by_id[item].symbol.casefold(), str(item)),
            )
        )
        # Calendar denominator comes from finalized exchange evidence, including dates on
        # which a stock (or the entire loaded price table) has no row. Preserve warmup dates.
        session_dates = finalized_session_dates

        adjusted_count = sum(
            price.adjusted_close_price is not None
            for history in histories
            for price in history.prices
        )
        limitations = [
            "Historical price revisions, immutable capture coverage, rule evidence and "
            "event knowledge times are unverified. Promotion is blocked.",
            "Replay observations include only explicitly finalized exchange sessions.",
            "Historical exchange membership is reconstructed from observed price rows; "
            "deleted securities cannot be recovered.",
            "Category and sector are not effective-dated. Current values are reported for "
            "stratification, but category is excluded from engine inputs unless explicitly "
            "enabled.",
            "Suspension and circuit-lock histories are unavailable in the current schema; known "
            "non-fills are enforced, but unknown historical locks cannot be inferred.",
            "Corporate-action coverage is limited to stored effective/ex-dividend dates; missing "
            "events cannot be reconstructed.",
        ]
        if adjusted_count == 0:
            limitations.append(
                "No adjusted closes are stored; known corporate-action windows fail closed and "
                "unrecorded actions remain a data limitation."
            )
        if not summaries:
            limitations.append(
                "No point-in-time benchmark summaries are available; benchmark-relative metrics "
                "and regime context will be incomplete."
            )

        return BacktestDataset(
            histories=histories,
            session_dates=session_dates,
            market_summaries=summaries,
            limitations=tuple(limitations),
            publications=tuple(publications),
            observed_session_dates=observed_session_dates,
        )
