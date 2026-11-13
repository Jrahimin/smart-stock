"""Durable paired experiment receipts; optional until the explicit migration is applied."""
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from types import SimpleNamespace

from app.models import TradingShadowOutcome, TradingShadowSelection, DecisionGenerationCapture
from app.core.constants.trading_constants import TRADING_STRATEGY_VERSION
from app.core.audit_hashing import stable_audit_hash


class TradingShadowRepository:
    def __init__(self, session):
        self.session = session

    async def available(self):
        return bool(await self.session.scalar(select(func.to_regclass("trading_shadow_selections"))))

    async def record_selection(self, *, capture, selected_at, next_open_at, experiment_id, payload, record_hash):
        await self.session.execute(insert(TradingShadowSelection).values(
            source_capture_id=capture.id, exchange=capture.exchange, session_date=capture.session_date,
            strategy_version=capture.result_payload["strategy_version"], experiment_id=experiment_id,
            selected_at=selected_at, next_open_at=next_open_at, payload=payload, record_hash=record_hash,
        ).on_conflict_do_nothing(index_elements=["exchange", "session_date", "strategy_version", "experiment_id"]))
        await self.session.commit()
        return await self.session.scalar(select(TradingShadowSelection).where(
            TradingShadowSelection.exchange == capture.exchange, TradingShadowSelection.session_date == capture.session_date,
            TradingShadowSelection.strategy_version == capture.result_payload["strategy_version"],
            TradingShadowSelection.experiment_id == experiment_id,
        ))

    async def record_outcome(self, selection, *, through_date, revision, payload):
        if payload.get("kind") == "MODELED_OUTCOMES":
            # Serialize adoption per selection while keeping all receipts immutable.
            await self.session.execute(select(TradingShadowSelection.id).where(
                TradingShadowSelection.id == selection.id).with_for_update())
            current = (await self.latest_outcomes([selection.id])).get(selection.id)
            payload = {key: value for key, value in payload.items() if key != "supersedes_revision"}
            if current:
                current_content = {key: value for key, value in current.payload.items() if key != "supersedes_revision"}
                if payload == current_content:
                    await self.session.commit()
                    return current
                if through_date >= current.through_date:
                    payload["supersedes_revision"] = current.outcome_revision
            revision = stable_audit_hash(payload)
        await self.session.execute(insert(TradingShadowOutcome).values(
            selection_id=selection.id, through_date=through_date, outcome_revision=revision, payload=payload,
            recorded_at=func.clock_timestamp(),
        ).on_conflict_do_nothing(index_elements=["selection_id", "outcome_revision"]))
        await self.session.commit()
        return await self.session.scalar(select(TradingShadowOutcome).where(
            TradingShadowOutcome.selection_id == selection.id, TradingShadowOutcome.outcome_revision == revision))

    async def selections(self, *, exchange, experiment_id=None, strategy_version=TRADING_STRATEGY_VERSION, valid_only=True, summary_only=False):
        query = select(TradingShadowSelection).join(DecisionGenerationCapture,
            TradingShadowSelection.source_capture_id == DecisionGenerationCapture.id).where(
            TradingShadowSelection.exchange == exchange, TradingShadowSelection.strategy_version == strategy_version)
        if valid_only:
            query = query.where(TradingShadowSelection.invalidated_at.is_(None), DecisionGenerationCapture.invalidated_at.is_(None))
        if experiment_id:
            query = query.where(TradingShadowSelection.experiment_id == experiment_id)
        query = query.order_by(TradingShadowSelection.session_date, TradingShadowSelection.recorded_at)
        if summary_only:
            query = query.with_only_columns(TradingShadowSelection.id, TradingShadowSelection.session_date,
                TradingShadowSelection.recorded_at, TradingShadowSelection.invalidated_at,
                TradingShadowSelection.payload["ranking_arms"].label("ranking_arms"),
                TradingShadowSelection.payload["entry_arms"].label("entry_arms"),
                TradingShadowSelection.payload["empty_session"].label("empty_session"))
            return [SimpleNamespace(id=row.id,session_date=row.session_date,recorded_at=row.recorded_at,
                invalidated_at=row.invalidated_at,payload={"ranking_arms":row.ranking_arms,"entry_arms":row.entry_arms,"empty_session":row.empty_session})
                for row in (await self.session.execute(query)).all()]
        return list((await self.session.scalars(query)).all())

    async def latest_outcomes(self, selection_ids, *, summary_only=False):
        ranked = select(TradingShadowOutcome.id.label("id"), func.row_number().over(
            partition_by=TradingShadowOutcome.selection_id, order_by=(TradingShadowOutcome.through_date.desc(),
                TradingShadowOutcome.recorded_at.desc(), TradingShadowOutcome.id.desc())).label("rank")).where(
            TradingShadowOutcome.selection_id.in_(selection_ids),
            TradingShadowOutcome.payload["kind"].astext.is_distinct_from("FORMAL_ASSESSMENT"),
        ).subquery()
        query = select(TradingShadowOutcome).join(ranked,TradingShadowOutcome.id == ranked.c.id).where(ranked.c.rank == 1)
        if summary_only and selection_ids:
            names = ("prospective_selections_confirmed","availability","ranking_arms","entry_arms")
            query = query.with_only_columns(TradingShadowOutcome.id,TradingShadowOutcome.selection_id,
                TradingShadowOutcome.invalidated_at,*(TradingShadowOutcome.payload[name].label(name) for name in names))
            return {row.selection_id:SimpleNamespace(id=row.id,selection_id=row.selection_id,invalidated_at=row.invalidated_at,
                payload={name:getattr(row,name) for name in names}) for row in (await self.session.execute(query)).all()}
        rows = list((await self.session.scalars(query)).all()) if selection_ids else []
        return {row.selection_id: row for row in rows}

    async def selection_for_session(self, *, exchange, session_date, experiment_id, strategy_version=TRADING_STRATEGY_VERSION):
        return await self.session.scalar(select(TradingShadowSelection.id).where(
            TradingShadowSelection.exchange == exchange, TradingShadowSelection.session_date == session_date,
            TradingShadowSelection.experiment_id == experiment_id, TradingShadowSelection.strategy_version == strategy_version))

    async def assessment(self, *, exchange, experiment_id, strategy_version=TRADING_STRATEGY_VERSION):
        return await self.session.scalar(select(TradingShadowOutcome).join(TradingShadowSelection).where(
            TradingShadowSelection.exchange == exchange, TradingShadowSelection.experiment_id == experiment_id,
            TradingShadowSelection.strategy_version == strategy_version,
            TradingShadowOutcome.payload["kind"].astext == "FORMAL_ASSESSMENT",
        ).order_by(TradingShadowOutcome.recorded_at).limit(1))

    async def outcome_vintages(self, ids):
        return list((await self.session.execute(select(TradingShadowOutcome.id,TradingShadowOutcome.invalidated_at).where(TradingShadowOutcome.id.in_(ids)))).all())
