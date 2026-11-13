from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from fastapi import Depends
from sqlalchemy import String, and_, cast, func, or_, select, true, union, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.base_repository import BaseRepository
from app.core.database_session import get_db_session
from app.core.enums import DataQualityFlag, ExchangeCode, MarketDataState, TurnoverProvenance
from app.models import (
    CorporateAction,
    DailyMarketSummary,
    DailyPrice,
    DividendEvent,
    MarketDataGeneration,
    Stock,
    TradingSourceObservation,
)


class MarketDataRepository(BaseRepository[DailyPrice]):
    model = DailyPrice

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def list_daily_prices(self, *, stock_id: UUID, limit: int, offset: int) -> list[DailyPrice]:
        return await self.list_daily_prices_filtered(
            stock_id=stock_id,
            start_date=None,
            end_date=None,
            data_quality_flag=None,
            source=None,
            limit=limit,
            offset=offset,
        )

    async def list_daily_prices_filtered(
        self,
        *,
        stock_id: UUID,
        start_date: date | None,
        end_date: date | None,
        data_quality_flag: DataQualityFlag | None,
        source: str | None,
        limit: int,
        offset: int,
    ) -> list[DailyPrice]:
        statement = (
            select(DailyPrice)
            .where(DailyPrice.stock_id == stock_id)
            .order_by(DailyPrice.trade_date.desc(), DailyPrice.id.desc())
        )
        if start_date is not None:
            statement = statement.where(DailyPrice.trade_date >= start_date)
        if end_date is not None:
            statement = statement.where(DailyPrice.trade_date <= end_date)
        if data_quality_flag is not None:
            statement = statement.where(DailyPrice.data_quality_flag == data_quality_flag)
        if source is not None:
            statement = statement.where(func.upper(DailyPrice.source) == source.upper())

        statement = statement.limit(limit).offset(offset)
        result = await self.session.scalars(statement)
        return list(result.all())

    async def list_latest_daily_prices(
        self,
        *,
        exchange: ExchangeCode | None,
        limit: int,
        offset: int,
        end_date: date | None = None,
    ) -> list[tuple[Stock, DailyPrice]]:
        latest_price_dates_statement = (
            select(
                DailyPrice.stock_id.label("stock_id"),
                func.max(DailyPrice.trade_date).label("latest_trade_date"),
            )
            .group_by(DailyPrice.stock_id)
        )
        if end_date is not None:
            latest_price_dates_statement = latest_price_dates_statement.where(
                DailyPrice.trade_date <= end_date
            )
        latest_price_dates = latest_price_dates_statement.subquery()
        statement = (
            select(Stock, DailyPrice)
            .join(latest_price_dates, latest_price_dates.c.stock_id == Stock.id)
            .join(
                DailyPrice,
                (DailyPrice.stock_id == latest_price_dates.c.stock_id)
                & (DailyPrice.trade_date == latest_price_dates.c.latest_trade_date),
            )
            .where(Stock.is_active.is_(True))
            .order_by(Stock.exchange, Stock.symbol, Stock.id)
            .limit(limit)
            .offset(offset)
        )
        if exchange is not None:
            statement = statement.where(Stock.exchange == exchange)

        result = await self.session.execute(statement)
        return [(stock, price) for stock, price in result.all()]

    async def list_quote_price_observations(
        self, *, stock_ids: set[UUID], end_date: date,
    ) -> list[DailyPrice]:
        """In one bulk query, find the latest observation and latest valid OHLC per stock."""
        if not stock_ids:
            return []
        price = DailyPrice
        ohlc = (price.open_price, price.high_price, price.low_price, price.close_price)
        latest = select(price.id).where(
            price.stock_id == Stock.id, price.trade_date <= end_date,
        ).order_by(price.trade_date.desc(), price.id.desc()).limit(1)
        latest_valid = latest.where(
            *(column > 0 for column in ohlc),
            *(column != Decimal("NaN") for column in ohlc),
            price.high_price >= func.greatest(price.open_price, price.low_price, price.close_price),
            price.low_price <= func.least(price.open_price, price.high_price, price.close_price),
        ).lateral()
        latest = latest.lateral()
        ids = union(
            select(latest.c.id)
            .select_from(Stock)
            .join(latest, true())
            .where(Stock.id.in_(stock_ids)),
            select(latest_valid.c.id)
            .select_from(Stock)
            .join(latest_valid, true())
            .where(Stock.id.in_(stock_ids)),
        )
        return list((await self.session.scalars(select(price).where(price.id.in_(ids)))).all())

    async def list_decision_universe_membership(self, *, exchange):
        """Independent listed population at this calculation instant, before any price join."""
        return list((await self.session.scalars(select(Stock.id).where(
            Stock.exchange == exchange, Stock.is_active.is_(True),
        ).order_by(Stock.id))).all())

    async def list_observed_exchange_session_dates(self, *, exchange, start_date, end_date):
        return list((await self.session.scalars(select(MarketDataGeneration.trade_date).where(
            MarketDataGeneration.exchange == exchange, MarketDataGeneration.accepted_count > 0,
            MarketDataGeneration.trade_date > start_date, MarketDataGeneration.trade_date <= end_date,
        ).distinct().order_by(MarketDataGeneration.trade_date))).all())

    async def list_published_finalized_price_cutoffs(self, *, exchange, start_date, end_date):
        """A finalized summary alone is not the price-publication barrier."""
        statement = select(MarketDataGeneration.trade_date,
            func.max(MarketDataGeneration.source_last_synced_at)).where(
                MarketDataGeneration.exchange == exchange,
                MarketDataGeneration.state == MarketDataState.FINALIZED,
                MarketDataGeneration.accepted_count > 0,
                MarketDataGeneration.trade_date > start_date,
                MarketDataGeneration.trade_date <= end_date,
            ).group_by(MarketDataGeneration.trade_date)
        return dict((await self.session.execute(statement)).all())

    async def list_finalized_price_publications(self, *, exchange, start_date, end_date, known_by):
        """Retain each real barrier, including earlier publications of corrected days."""
        from app.modules.market_data.price_publication_evidence import PRICE_PUBLICATION_SOURCE, publication_evidence
        manifests = list((await self.session.scalars(select(MarketDataGeneration).where(
            MarketDataGeneration.exchange == exchange, MarketDataGeneration.state == MarketDataState.FINALIZED,
            MarketDataGeneration.accepted_count > 0, MarketDataGeneration.trade_date > start_date,
            MarketDataGeneration.trade_date <= end_date, MarketDataGeneration.published_at <= known_by,
        ).order_by(MarketDataGeneration.published_at, MarketDataGeneration.id))).all())
        if not manifests:
            return []
        observations = list((await self.session.scalars(select(TradingSourceObservation).where(
            TradingSourceObservation.source_table == PRICE_PUBLICATION_SOURCE,
            TradingSourceObservation.source_row_id.in_([str(item.id) for item in manifests]),
            TradingSourceObservation.observed_at <= known_by,
        ))).all())
        by_manifest = {}
        for observation in observations:
            by_manifest.setdefault(observation.source_row_id, []).append(observation)
        return [publication_evidence(item, by_manifest.get(str(item.id), ())) for item in manifests]

    async def list_authenticated_exchange_session_dates(self, *, exchange, start_date, end_date, known_by):
        """One exchange calendar, independent of requested IDs or candidate actions."""
        from app.modules.stock_details.decision.entry_path_evidence import _day, _row, _source_proven, _valid
        current = list((await self.session.scalars(select(DailyPrice).join(Stock, Stock.id == DailyPrice.stock_id).where(
            Stock.exchange == exchange, DailyPrice.trade_date > start_date, DailyPrice.trade_date <= end_date,
            DailyPrice.source_observed_at.is_not(None), DailyPrice.source_observed_at <= known_by,
        ))).all())
        dates = {item.trade_date for item in current if _valid(item) and _source_proven(item, item.trade_date, known_by, known_by)}
        revisions = list((await self.session.scalars(select(TradingSourceObservation).join(Stock,
            cast(Stock.id, String) == TradingSourceObservation.payload["stock_id"].astext).where(
                Stock.exchange == exchange, TradingSourceObservation.source_table == "daily_prices",
                TradingSourceObservation.session_date > start_date, TradingSourceObservation.session_date <= end_date,
                TradingSourceObservation.observed_at <= known_by,
                or_(TradingSourceObservation.payload["source_observed_at"].astext.is_not(None),
                    TradingSourceObservation.previous_payload["source_observed_at"].astext.is_not(None)),
        ))).all())
        for revision in revisions:
            payloads = (revision.payload, revision.previous_payload) if revision.operation == "UPDATE" else (revision.payload,) if revision.operation in {"INSERT", "DELETE"} else ()
            for payload in payloads:
                row = _row(payload) if payload else None
                if (row is not None and str(getattr(row, "stock_id", None)) == str(revision.payload.get("stock_id"))
                    and str(getattr(row, "id", None)) == revision.source_row_id and _day(row) == revision.session_date
                    and _valid(row) and _source_proven(row, revision.session_date, revision.observed_at, known_by)):
                    dates.add(revision.session_date)
        return sorted(dates)

    async def list_traded_exchange_session_dates(self, *, exchange, start_date, end_date):
        """Source-confirmed trades establish a pending session, never an undated replay."""
        price = DailyPrice
        statement = select(price.trade_date).join(Stock, Stock.id == price.stock_id).where(
            Stock.exchange == exchange, price.trade_date > start_date, price.trade_date <= end_date,
            price.source_observed_at.is_not(None), price.source_observed_at <= func.now(),
            func.date(func.timezone("Asia/Dhaka", price.source_observed_at)) == price.trade_date,
            price.volume > 0, price.data_quality_flag != DataQualityFlag.SUSPICIOUS,
            *(column > 0 for column in (price.open_price, price.high_price, price.low_price, price.close_price)),
            *(column != Decimal("NaN") for column in (price.open_price, price.high_price, price.low_price, price.close_price)),
            price.high_price >= func.greatest(price.open_price, price.low_price, price.close_price),
            price.low_price <= func.least(price.open_price, price.high_price, price.close_price),
        ).distinct().order_by(price.trade_date)
        return list((await self.session.scalars(statement)).all())

    async def list_entry_basis_events(self, *, stock_ids, end_date):
        from app.core.enums import CorporateActionSubtype, DividendStatus
        from app.modules.stock_details.decision.entry_applicability import PriceBasisEvent
        result = {}
        if not stock_ids:
            return result
        actions = (await self.session.scalars(select(CorporateAction).where(
            CorporateAction.stock_id.in_(stock_ids), CorporateAction.effective_date <= end_date,
            CorporateAction.action_subtype.in_([CorporateActionSubtype.SPLIT, CorporateActionSubtype.BONUS,
                CorporateActionSubtype.RIGHTS, CorporateActionSubtype.MERGER]),
        ))).all()
        for action in actions:
            result.setdefault(action.stock_id, []).append(PriceBasisEvent(action.effective_date, action.action_subtype.value))
        dividends = (await self.session.scalars(select(DividendEvent).where(
            DividendEvent.stock_id.in_(stock_ids), DividendEvent.ex_dividend_date <= end_date,
            DividendEvent.status.in_([DividendStatus.APPROVED, DividendStatus.PAID]),
            or_(DividendEvent.stock_dividend_percent > 0, DividendEvent.cash_dividend_percent > 0,
                DividendEvent.cash_amount_per_share > 0),
        ))).all()
        for event in dividends:
            result.setdefault(event.stock_id, []).append(PriceBasisEvent(event.ex_dividend_date, "EX_DIVIDEND"))
        return result

    async def list_entry_path_observations(self, *, stock_ids, start_date, end_date):
        """Bulk path and append-only revisions; no per-symbol request queries."""
        if not stock_ids:
            return [], [], None
        prices = list((await self.session.scalars(select(DailyPrice).where(
            DailyPrice.stock_id.in_(stock_ids), DailyPrice.trade_date > start_date,
            DailyPrice.trade_date <= end_date,
        ))).all())
        revisions = list((await self.session.scalars(select(TradingSourceObservation).where(
            TradingSourceObservation.source_table == "daily_prices",
            TradingSourceObservation.session_date > start_date,
            TradingSourceObservation.session_date <= end_date,
            TradingSourceObservation.payload["stock_id"].astext.in_([str(value) for value in stock_ids]),
        ).order_by(TradingSourceObservation.observed_at))).all())
        journal_started_at = await self.session.scalar(select(func.min(TradingSourceObservation.observed_at)).where(
            TradingSourceObservation.source_table == "daily_prices",
        ))
        return prices, revisions, journal_started_at

    async def list_market_price_windows(
        self,
        *,
        exchange: ExchangeCode | None,
        limit: int,
        offset: int,
        price_window_limit: int,
        end_date: date | None = None,
    ) -> list[tuple[Stock, DailyPrice]]:
        limited_stocks = (
            select(Stock.id)
            .where(Stock.is_active.is_(True))
            .order_by(Stock.exchange, Stock.symbol, Stock.id)
            .limit(limit)
            .offset(offset)
            .subquery()
        )
        if exchange is not None:
            limited_stocks = (
                select(Stock.id)
                .where(Stock.is_active.is_(True), Stock.exchange == exchange)
                .order_by(Stock.exchange, Stock.symbol, Stock.id)
                .limit(limit)
                .offset(offset)
                .subquery()
            )

        ranked_prices_statement = (
            select(
                DailyPrice.id.label("price_id"),
                DailyPrice.stock_id.label("stock_id"),
                func.row_number()
                .over(
                    partition_by=DailyPrice.stock_id,
                    order_by=(DailyPrice.trade_date.desc(), DailyPrice.id.desc()),
                )
                .label("row_number"),
            )
            .join(limited_stocks, limited_stocks.c.id == DailyPrice.stock_id)
        )
        if end_date is not None:
            ranked_prices_statement = ranked_prices_statement.where(
                DailyPrice.trade_date <= end_date
            )
        ranked_prices = ranked_prices_statement.subquery()
        statement = (
            select(Stock, DailyPrice)
            .join(limited_stocks, limited_stocks.c.id == Stock.id)
            .join(ranked_prices, ranked_prices.c.stock_id == Stock.id)
            .join(DailyPrice, DailyPrice.id == ranked_prices.c.price_id)
            .where(ranked_prices.c.row_number <= price_window_limit)
            .order_by(Stock.exchange, Stock.symbol, Stock.id, DailyPrice.trade_date.desc(), DailyPrice.id.desc())
        )

        result = await self.session.execute(statement)
        return [(stock, price) for stock, price in result.all()]

    async def list_recent_exchange_session_dates(
        self,
        *,
        exchange: ExchangeCode,
        limit: int,
        end_date: date | None = None,
    ) -> list[date]:
        # Finalized exchange index observations are the declared session denominator.
        # A missing symbol row cannot remove a session from this calendar.
        statement = select(DailyMarketSummary.trade_date).where(
            DailyMarketSummary.exchange == exchange,
            DailyMarketSummary.index_name == "DSEX",
            DailyMarketSummary.is_finalized.is_(True),
        ).distinct().order_by(DailyMarketSummary.trade_date.desc())
        if end_date is not None:
            statement = statement.where(DailyMarketSummary.trade_date <= end_date)
        return list(reversed((await self.session.scalars(statement.limit(limit))).all()))

    async def list_corporate_action_dates_by_stock(
        self,
        *,
        stock_ids: set[UUID],
    ) -> dict[UUID, set[date]]:
        if not stock_ids:
            return {}
        dates_by_stock: dict[UUID, set[date]] = {}
        dividend_statement = select(
            DividendEvent.stock_id,
            DividendEvent.ex_dividend_date,
        ).where(
            DividendEvent.stock_id.in_(stock_ids),
            DividendEvent.ex_dividend_date.is_not(None),
        )
        for stock_id, event_date in (await self.session.execute(dividend_statement)).all():
            if event_date is not None:
                dates_by_stock.setdefault(stock_id, set()).add(event_date)

        action_statement = select(
            CorporateAction.stock_id,
            CorporateAction.effective_date,
        ).where(CorporateAction.stock_id.in_(stock_ids))
        for stock_id, event_date in (await self.session.execute(action_statement)).all():
            dates_by_stock.setdefault(stock_id, set()).add(event_date)
        return dates_by_stock

    async def list_decision_event_observations(
        self, *, stock_ids: set[UUID]
    ) -> dict[UUID, list[dict]]:
        from app.core.audit_hashing import canonicalize_audit_value

        if not stock_ids:
            return {}
        journal = TradingSourceObservation
        revisions = (
            select(
                journal.source_table,
                journal.source_row_id,
                func.max(journal.observed_at).label("observed_at"),
            )
            .where(
                journal.source_table.in_(("corporate_actions", "dividend_events")),
                journal.payload["stock_id"].astext.in_(str(stock_id) for stock_id in stock_ids),
            )
            .group_by(journal.source_table, journal.source_row_id)
            .subquery()
        )
        result: dict[UUID, list[dict]] = {}
        for model, date_field in (
            (CorporateAction, "effective_date"),
            (DividendEvent, "ex_dividend_date"),
        ):
            statement = (
                select(model, revisions.c.observed_at)
                .outerjoin(
                    revisions,
                    and_(
                        revisions.c.source_table == model.__tablename__,
                        revisions.c.source_row_id == cast(model.id, String),
                    ),
                )
                .where(model.stock_id.in_(stock_ids))
            )
            for row, observed_at in (await self.session.execute(statement)).all():
                event_date = getattr(row, date_field)
                observation = canonicalize_audit_value(
                    {
                        "event_id": row.id,
                        "kind": model.__tablename__,
                        "effective_date": event_date,
                        "known_at": row.created_at,
                        "revision_observed_at": observed_at or row.updated_at,
                        "source": row.source,
                        "values": {
                            column.key: getattr(row, column.key)
                            for column in model.__table__.columns
                            if column.key not in {"metadata", "id", "stock_id"}
                        },
                    }
                )
                result.setdefault(row.stock_id, []).append(observation)
        return {
            key: sorted(value, key=lambda row: str(row["event_id"]))
            for key, value in result.items()
        }

    async def get_latest_decision_publication(self, *, exchange: ExchangeCode):
        publication, _ = await self.get_decision_publication_context(exchange=exchange)
        return publication

    async def get_decision_publication_context(self, *, exchange: ExchangeCode):
        from app.modules.market_data.published_generation import (
            resolve_finalized_decision_generation,
        )
        from app.modules.trading_intelligence.decision_snapshot_repository import (
            DecisionSnapshotRepository,
        )
        context = await resolve_finalized_decision_generation(self, exchange=exchange)
        publication = await DecisionSnapshotRepository(self.session).latest_publication(
            exchange=exchange, generation_id=context.sync_id if context else None, metadata_only=True,
        )
        return publication, context

    async def finalized_input_revision(self, *, exchange: ExchangeCode, end_date: date) -> str:
        """Fingerprint revisions to prices, events, membership and regime."""
        from app.core.audit_hashing import stable_audit_hash
        stamps = []
        for model, predicate in (
            (DailyPrice, DailyPrice.trade_date <= end_date),
            (CorporateAction, CorporateAction.effective_date <= end_date),
            (DividendEvent, DividendEvent.ex_dividend_date <= end_date),
        ):
            statement = select(func.max(model.updated_at), func.count(model.id)).join(
                Stock, Stock.id == model.stock_id,
            ).where(Stock.exchange == exchange, predicate)
            stamps.append(tuple((await self.session.execute(statement)).one()))
        stamps.append(
            tuple(
                (
                    await self.session.execute(
                        select(func.max(Stock.updated_at), func.count(Stock.id)).where(
                            Stock.exchange == exchange,
                        )
                    )
                ).one()
            )
        )
        stamps.append(
            tuple(
                (
                    await self.session.execute(
                        select(
                            func.max(DailyMarketSummary.updated_at),
                            func.count(DailyMarketSummary.id),
                        ).where(
                            DailyMarketSummary.exchange == exchange,
                            DailyMarketSummary.trade_date <= end_date,
                        )
                    )
                ).one()
            )
        )
        # The append-only journal catches changes even when source updated_at is
        # reused or backdated. Exclude provisional future sessions from decision identity.
        journal = TradingSourceObservation
        stock_ids = select(cast(Stock.id, String)).where(Stock.exchange == exchange)
        relevant_source = or_(
            and_(
                journal.source_table.in_(("daily_prices", "corporate_actions", "dividend_events")),
                journal.payload["stock_id"].astext.in_(stock_ids),
                journal.session_date <= end_date,
            ),
            and_(
                journal.source_table == "daily_market_summaries",
                journal.payload["exchange"].astext == exchange.value,
                journal.session_date <= end_date,
            ),
            and_(
                journal.source_table == "stocks",
                journal.payload["exchange"].astext == exchange.value,
            ),
        )
        stamps.append(
            tuple(
                (
                    await self.session.execute(
                        select(func.max(journal.observed_at), func.count(journal.id)).where(
                            relevant_source,
                        )
                    )
                ).one()
            )
        )
        return stable_audit_hash(stamps)

    async def get_daily_price_by_stock_date(
        self,
        *,
        stock_id: UUID,
        trade_date: date,
    ) -> DailyPrice | None:
        statement = select(DailyPrice).where(
            DailyPrice.stock_id == stock_id,
            DailyPrice.trade_date == trade_date,
        )
        return await self.session.scalar(statement)

    async def get_stock_by_id(self, stock_id: UUID) -> Stock | None:
        return await self.session.get(Stock, stock_id)

    async def get_latest_daily_price_before(
        self,
        *,
        stock_id: UUID,
        trade_date: date,
    ) -> DailyPrice | None:
        statement = (
            select(DailyPrice)
            .where(DailyPrice.stock_id == stock_id, DailyPrice.trade_date < trade_date)
            .order_by(DailyPrice.trade_date.desc(), DailyPrice.id.desc())
            .limit(1)
        )
        return await self.session.scalar(statement)

    async def upsert_daily_price(self, values: dict[str, object]) -> DailyPrice:
        statement = insert(DailyPrice).values(**values)
        update_values = {
            column.name: statement.excluded[column.name]
            for column in DailyPrice.__table__.columns
            if column.name not in {"id", "created_at"}
        }
        update_values["updated_at"] = func.now()

        statement = statement.on_conflict_do_update(
            index_elements=[DailyPrice.stock_id, DailyPrice.trade_date],
            set_=update_values,
            where=~(
                (DailyPrice.source == "AMARSTOCK_API")
                & (statement.excluded.source != "AMARSTOCK_API")
            ),
        ).returning(DailyPrice)
        daily_price = await self.session.scalar(statement)
        if daily_price is None:
            daily_price = await self.get_daily_price_by_stock_date(
                stock_id=values["stock_id"],
                trade_date=values["trade_date"],
            )
        if daily_price is None:
            raise RuntimeError("Daily price upsert did not return a row")
        return daily_price

    async def upsert_daily_price_if_changed(self, values: dict[str, object]) -> DailyPrice | None:
        """Insert or update one OHLCV row only when a canonical input changed."""

        statement = insert(DailyPrice).values(**values)
        mutable_columns = [
            column.name
            for column in DailyPrice.__table__.columns
            if column.name in values
            and column.name not in {"id", "stock_id", "trade_date", "created_at", "updated_at", "source_observed_at", "batch_fetched_at"}
        ]
        update_values = {
            column: getattr(statement.excluded, column)
            for column in mutable_columns
        }
        for field in ("source_observed_at", "batch_fetched_at"):
            if field in values:
                update_values[field] = values[field]
        update_values["updated_at"] = func.now()
        ordered = and_(true(), *[
            or_(getattr(DailyPrice, field).is_(None), getattr(DailyPrice, field) <= values[field])
            for field in ("source_observed_at", "batch_fetched_at") if values.get(field) is not None
        ])
        changed = or_(
            *(
                getattr(DailyPrice, column).is_distinct_from(
                    getattr(statement.excluded, column)
                )
                for column in mutable_columns
            )
        )
        statement = statement.on_conflict_do_update(
            index_elements=[DailyPrice.stock_id, DailyPrice.trade_date],
            set_=update_values,
            where=(
                ~(
                    (DailyPrice.source == "AMARSTOCK_API")
                    & (statement.excluded.source != "AMARSTOCK_API")
                )
                & changed & ordered
            ),
        ).returning(DailyPrice)
        changed_row = await self.session.scalar(statement)
        if changed_row is None:
            # Identical quotes can acquire an actual receipt without changing canonical
            # inputs, updated_at, publication identity, or engine recompute counts.
            observation_values = {field: func.greatest(getattr(DailyPrice, field), values[field])
                for field in ("source_observed_at", "batch_fetched_at") if values.get(field) is not None}
            if observation_values:
                await self.session.execute(update(DailyPrice).where(
                    DailyPrice.stock_id == values["stock_id"], DailyPrice.trade_date == values["trade_date"],
                    *[getattr(DailyPrice, column).is_not_distinct_from(values[column]) for column in mutable_columns],
                    ordered,
                ).values(**observation_values, updated_at=DailyPrice.updated_at).execution_options(synchronize_session=False))
        return changed_row

    async def insert_daily_price_if_absent(self, values: dict[str, object]) -> DailyPrice | None:
        statement = insert(DailyPrice).values(**values)
        statement = statement.on_conflict_do_nothing(
            index_elements=[DailyPrice.stock_id, DailyPrice.trade_date],
        ).returning(DailyPrice)
        return await self.session.scalar(statement)

    async def patch_daily_price_trade_stats(
        self,
        *,
        stock_id: UUID,
        trade_date: date,
        trade_count: int | None = None,
        turnover: Decimal | None = None,
        turnover_provenance: TurnoverProvenance | None = None,
        data_quality_flag: DataQualityFlag | None = None,
    ) -> int:
        """Update only turnover/trade_count/optional flag; leaves OHLCV and source unchanged."""
        values: dict[str, object] = {}
        if trade_count is not None:
            values["trade_count"] = trade_count
        if turnover is not None:
            values["turnover"] = turnover
        if turnover_provenance is not None:
            values["turnover_provenance"] = turnover_provenance
        if data_quality_flag is not None:
            values["data_quality_flag"] = data_quality_flag
        if not values:
            return 0
        values["updated_at"] = func.now()
        result = await self.session.execute(
            update(DailyPrice)
            .where(DailyPrice.stock_id == stock_id, DailyPrice.trade_date == trade_date)
            .values(**values)
        )
        await self.session.flush()
        return int(result.rowcount or 0)

    async def get_stocks_by_symbols(
        self,
        *,
        exchange: ExchangeCode,
        symbols: set[str],
    ) -> dict[str, Stock]:
        if not symbols:
            return {}

        statement = select(Stock).where(
            Stock.exchange == exchange,
            func.upper(Stock.symbol).in_({symbol.upper() for symbol in symbols}),
        )
        result = await self.session.scalars(statement)
        return {stock.symbol.upper(): stock for stock in result.all()}

    async def list_active_stock_symbols(self, *, exchange: ExchangeCode) -> set[str]:
        statement = select(func.upper(func.trim(Stock.symbol))).where(
            Stock.exchange == exchange,
            Stock.is_active.is_(True),
        )
        return set((await self.session.scalars(statement)).all())

    async def create_stock(
        self,
        *,
        symbol: str,
        name: str,
        exchange: ExchangeCode,
        is_active: bool = True,
    ) -> Stock:
        """Insert one stock row (seed/ingestion); bulk paths may replace per-row inserts later."""
        return await self.create_model(
            Stock,
            {
                "symbol": symbol,
                "name": name,
                "exchange": exchange,
                "is_active": is_active,
            },
        )

    async def list_daily_market_summaries(
        self,
        *,
        exchange: ExchangeCode | None,
        limit: int,
        offset: int,
        end_date: date | None = None,
    ) -> list[DailyMarketSummary]:
        statement = select(DailyMarketSummary)
        if exchange is not None:
            statement = statement.where(DailyMarketSummary.exchange == exchange)
        if end_date is not None:
            statement = statement.where(DailyMarketSummary.trade_date <= end_date)
        statement = statement.order_by(
            DailyMarketSummary.trade_date.desc(),
            DailyMarketSummary.exchange,
            DailyMarketSummary.index_name,
            DailyMarketSummary.id.desc(),
        )
        result = await self.session.scalars(statement.limit(limit).offset(offset))
        return list(result.all())

    async def get_daily_market_summary(
        self,
        *,
        exchange: ExchangeCode,
        trade_date: date,
        index_name: str,
    ) -> DailyMarketSummary | None:
        statement = select(DailyMarketSummary).where(
            DailyMarketSummary.exchange == exchange,
            DailyMarketSummary.trade_date == trade_date,
            DailyMarketSummary.index_name == index_name,
        )
        return await self.session.scalar(statement)

    async def get_market_price_freshness(
        self,
        *,
        exchange: ExchangeCode,
    ) -> tuple[date | None, datetime | None]:
        latest_trade_date_stmt = (
            select(func.max(DailyPrice.trade_date))
            .select_from(DailyPrice)
            .join(Stock, Stock.id == DailyPrice.stock_id)
            .where(Stock.exchange == exchange, Stock.is_active.is_(True))
        )
        latest_trade_date = await self.session.scalar(latest_trade_date_stmt)
        if latest_trade_date is None:
            return None, None

        last_synced_stmt = (
            select(func.max(DailyPrice.updated_at))
            .select_from(DailyPrice)
            .join(Stock, Stock.id == DailyPrice.stock_id)
            .where(
                Stock.exchange == exchange,
                Stock.is_active.is_(True),
                DailyPrice.trade_date == latest_trade_date,
            )
        )
        last_synced_at = await self.session.scalar(last_synced_stmt)
        return latest_trade_date, last_synced_at

    async def create_market_data_generation(
        self,
        *,
        exchange: ExchangeCode,
        trade_date: date,
        sync_id: str,
        state: MarketDataState,
        source: str,
        source_last_synced_at: datetime,
        fetched_count: int,
        accepted_count: int,
        suspicious_count: int,
        capture_price_versions: bool = False,
        parent_price_generation_id: str | None = None,
    ) -> MarketDataGeneration:
        versions, observed = None, None
        if parent_price_generation_id is not None:
            from app.modules.market_data.price_publication_evidence import PRICE_PUBLICATION_SOURCE, price_capture, publication_evidence
            parent = await self.get_market_data_generation_by_sync_id(exchange=exchange, sync_id=parent_price_generation_id)
            captures = list((await self.session.scalars(select(TradingSourceObservation).where(
                TradingSourceObservation.source_table == PRICE_PUBLICATION_SOURCE,
                TradingSourceObservation.source_row_id == str(parent.id) if parent is not None else False,
            ))).all())
            published = publication_evidence(parent, captures) if parent is not None else None
            original = price_capture(parent, captures) if parent is not None else None
            if (parent is not None and parent.trade_date == trade_date and original is not None
                and (state != MarketDataState.FINALIZED or published.evidence_observed_at is not None)):
                versions = original.payload["price_versions"]
                source_last_synced_at = parent.source_last_synced_at
                observed = await self.session.scalar(select(func.clock_timestamp()))
        elif capture_price_versions:
            from app.core.audit_hashing import canonicalize_audit_value
            from app.modules.stock_details.decision.lineage import daily_price_audit_payload
            await self.session.flush()
            # One MVCC statement sees our transaction's own writes and only
            # committed concurrent versions. This is the published membership.
            prices = list((await self.session.scalars(select(DailyPrice).join(Stock, Stock.id == DailyPrice.stock_id).where(
                Stock.exchange == exchange, Stock.is_active.is_(True), DailyPrice.trade_date == trade_date,
            ).order_by(DailyPrice.stock_id).execution_options(populate_existing=True))).all())
            versions = canonicalize_audit_value([{**daily_price_audit_payload(row), "id": row.id, "stock_id": row.stock_id,
                "updated_at": row.updated_at, "source_observed_at": row.source_observed_at, "batch_fetched_at": row.batch_fetched_at} for row in prices])
            if prices:
                source_last_synced_at = max(row.updated_at for row in prices)
            observed = await self.session.scalar(select(func.clock_timestamp()))
        generation = MarketDataGeneration(
            exchange=exchange,
            trade_date=trade_date,
            sync_id=sync_id,
            state=state,
            source=source,
            source_last_synced_at=source_last_synced_at,
            fetched_count=fetched_count,
            accepted_count=accepted_count,
            suspicious_count=suspicious_count,
            **({"published_at": observed} if observed is not None else {}),
        )
        self.session.add(generation)
        await self.session.flush()
        if versions is not None:
            from app.modules.market_data.price_publication_evidence import PRICE_PUBLICATION_CONTRACT, PRICE_PUBLICATION_SOURCE
            self.session.add(TradingSourceObservation(source_table=PRICE_PUBLICATION_SOURCE, source_row_id=str(generation.id),
                observed_at=observed, operation="PUBLISH", session_date=trade_date, finality=state.value,
                payload={"contract": PRICE_PUBLICATION_CONTRACT, "manifest_id": str(generation.id), "sync_id": sync_id,
                    "exchange": exchange.value, "trade_date": trade_date.isoformat(),
                    "source_last_synced_at": source_last_synced_at.isoformat(), "price_versions": versions}))
            await self.session.flush()
        return generation

    async def get_latest_market_data_generation(
        self,
        *,
        exchange: ExchangeCode,
        state: MarketDataState | None = None,
        trade_date: date | None = None,
    ) -> MarketDataGeneration | None:
        statement = select(MarketDataGeneration).where(MarketDataGeneration.exchange == exchange)
        if state is not None:
            statement = statement.where(MarketDataGeneration.state == state)
        if trade_date is not None:
            statement = statement.where(MarketDataGeneration.trade_date == trade_date)
        statement = statement.order_by(
            MarketDataGeneration.published_at.desc(),
            MarketDataGeneration.id.desc(),
        ).limit(1)
        return await self.session.scalar(statement)

    async def get_market_data_generation_by_sync_id(
        self,
        *,
        exchange: ExchangeCode,
        sync_id: str,
    ) -> MarketDataGeneration | None:
        statement = select(MarketDataGeneration).where(
            MarketDataGeneration.exchange == exchange,
            MarketDataGeneration.sync_id == sync_id,
        )
        return await self.session.scalar(statement)

    async def update_market_data_generation_state(
        self,
        generation: MarketDataGeneration,
        *,
        state: MarketDataState,
    ) -> MarketDataGeneration:
        previous = generation.state
        generation.state = state
        await self.session.flush()
        if previous != MarketDataState.FINALIZED and state == MarketDataState.FINALIZED:
            from app.modules.market_data.price_publication_evidence import PRICE_PUBLICATION_CONTRACT, PRICE_PUBLICATION_SOURCE, price_capture
            captures = list((await self.session.scalars(select(TradingSourceObservation).where(
                TradingSourceObservation.source_table == PRICE_PUBLICATION_SOURCE,
                TradingSourceObservation.source_row_id == str(generation.id), TradingSourceObservation.operation == "PUBLISH",
            ))).all())
            capture = price_capture(generation, captures)
            if capture is not None:
                self.session.add(TradingSourceObservation(source_table=PRICE_PUBLICATION_SOURCE, source_row_id=str(generation.id),
                    observed_at=await self.session.scalar(select(func.clock_timestamp())), operation="FINALIZE", session_date=generation.trade_date,
                    finality=state.value, payload={"contract": PRICE_PUBLICATION_CONTRACT, "manifest_id": str(generation.id),
                        "sync_id": generation.sync_id, "exchange": generation.exchange.value, "trade_date": generation.trade_date.isoformat(),
                        "source_last_synced_at": generation.source_last_synced_at.isoformat(),
                        "capture_id": str(capture.id)}))
                await self.session.flush()
        return generation

    async def get_latest_finalized_session_date(
        self,
        *,
        exchange: ExchangeCode,
    ) -> date | None:
        statement = select(func.max(DailyMarketSummary.trade_date)).where(
            DailyMarketSummary.exchange == exchange,
            DailyMarketSummary.index_name == "DSEX",
            DailyMarketSummary.is_finalized.is_(True),
        )
        return await self.session.scalar(statement)

    async def get_latest_finalized_market_summary(
        self,
        *,
        exchange: ExchangeCode,
    ) -> DailyMarketSummary | None:
        statement = (
            select(DailyMarketSummary)
            .where(
                DailyMarketSummary.exchange == exchange,
                DailyMarketSummary.index_name == "DSEX",
                DailyMarketSummary.is_finalized.is_(True),
            )
            .order_by(
                DailyMarketSummary.trade_date.desc(),
                DailyMarketSummary.updated_at.desc(),
                DailyMarketSummary.id.desc(),
            )
            .limit(1)
        )
        return await self.session.scalar(statement)

    async def list_recent_finalized_session_dates(
        self,
        *,
        exchange: ExchangeCode,
        end_date: date,
        limit: int,
    ) -> list[date]:
        statement = (
            select(DailyMarketSummary.trade_date)
            .where(
                DailyMarketSummary.exchange == exchange,
                DailyMarketSummary.index_name == "DSEX",
                DailyMarketSummary.is_finalized.is_(True),
                DailyMarketSummary.trade_date <= end_date,
            )
            .order_by(DailyMarketSummary.trade_date.desc())
            .limit(limit)
        )
        return list((await self.session.scalars(statement)).all())

    async def get_decision_session_freshness(
        self,
        *,
        exchange: ExchangeCode,
    ) -> tuple[date | None, datetime | None]:
        decision_session_date = await self.get_latest_finalized_session_date(exchange=exchange)
        if decision_session_date is None:
            return None, None

        last_synced_statement = (
            select(func.max(DailyPrice.updated_at))
            .select_from(DailyPrice)
            .join(Stock, Stock.id == DailyPrice.stock_id)
            .where(
                Stock.exchange == exchange,
                Stock.is_active.is_(True),
                DailyPrice.trade_date == decision_session_date,
            )
        )
        return decision_session_date, await self.session.scalar(last_synced_statement)

    async def lock_session_publication(self, *, exchange, trade_date):
        from app.modules.market_data.publication_lock import lock_session_publication
        await lock_session_publication(self.session, exchange=exchange, session_date=trade_date)

    async def is_market_session_finalized(self, *, exchange, trade_date):
        return await self.session.scalar(select(DailyMarketSummary.id).where(
            DailyMarketSummary.exchange == exchange, DailyMarketSummary.trade_date == trade_date,
            DailyMarketSummary.index_name == "DSEX", DailyMarketSummary.is_finalized.is_(True),
        )) is not None

    async def session_symbol_coverage(self, *, exchange, trade_date):
        active = await self.session.scalar(select(func.count(func.distinct(Stock.symbol))).where(
            Stock.exchange == exchange, Stock.is_active.is_(True),
        ))
        accepted = await self.session.scalar(select(func.count(func.distinct(Stock.symbol))).join(
            DailyPrice, DailyPrice.stock_id == Stock.id,
        ).where(Stock.exchange == exchange, Stock.is_active.is_(True), DailyPrice.trade_date == trade_date))
        suspicious = await self.session.scalar(select(func.count(func.distinct(Stock.symbol))).join(
            DailyPrice, DailyPrice.stock_id == Stock.id,
        ).where(Stock.exchange == exchange, Stock.is_active.is_(True), DailyPrice.trade_date == trade_date,
                DailyPrice.data_quality_flag == DataQualityFlag.SUSPICIOUS))
        return int(active or 0), int(accepted or 0), int(suspicious or 0)

    async def finalize_market_session(
        self,
        *,
        exchange: ExchangeCode,
        trade_date: date,
    ) -> bool:
        price_exists = await self.session.scalar(
            select(DailyPrice.id)
            .join(Stock, Stock.id == DailyPrice.stock_id)
            .where(
                Stock.exchange == exchange,
                DailyPrice.trade_date == trade_date,
            )
            .limit(1)
        )
        if price_exists is None:
            return False

        await self.session.execute(
            update(DailyMarketSummary)
            .where(
                DailyMarketSummary.exchange == exchange,
                DailyMarketSummary.trade_date == trade_date,
                DailyMarketSummary.index_name == "DSEX",
            )
            .values(is_finalized=True, updated_at=func.now())
        )
        finalized_summary_id = await self.session.scalar(
            select(DailyMarketSummary.id).where(
                DailyMarketSummary.exchange == exchange,
                DailyMarketSummary.trade_date == trade_date,
                DailyMarketSummary.index_name == "DSEX",
                DailyMarketSummary.is_finalized.is_(True),
            )
        )
        return finalized_summary_id is not None

    async def upsert_daily_market_summary(self, values: dict[str, object]) -> DailyMarketSummary:
        statement = insert(DailyMarketSummary).values(**values)
        update_values = {
            column.name: statement.excluded[column.name]
            for column in DailyMarketSummary.__table__.columns
            if column.name not in {"id", "created_at"}
        }
        update_values["updated_at"] = func.now()

        statement = statement.on_conflict_do_update(
            index_elements=[
                DailyMarketSummary.exchange,
                DailyMarketSummary.trade_date,
                DailyMarketSummary.index_name,
            ],
            set_=update_values,
        ).returning(DailyMarketSummary)
        summary = await self.session.scalar(statement)
        if summary is None:
            raise RuntimeError("Daily market summary upsert did not return a row")
        return summary

def get_market_data_repository(session: AsyncSession = Depends(get_db_session)) -> MarketDataRepository:
    return MarketDataRepository(session)

