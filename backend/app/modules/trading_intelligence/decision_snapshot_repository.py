from __future__ import annotations

import logging
from datetime import UTC, date, datetime
from typing import Annotated

from fastapi import Depends
from sqlalchemy import case, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import defer

from app.core.database_session import get_db_session
from app.core.enums import ExchangeCode
from app.models import CanonicalDecisionSnapshot, DecisionGenerationCapture
from app.modules.market_universe.market_universe_schemas import ScoredUniverseRow


def decision_snapshot_values(row: ScoredUniverseRow) -> dict[str, object] | None:
    canonical = row.decision.canonical if row.decision is not None else None
    if canonical is None or not all(
        (
            canonical.input_schema_version,
            canonical.input_hash,
            canonical.data_revision,
            canonical.event_revision,
        )
    ):
        return None
    return {
        "stock_id": canonical.stock_id,
        "exchange": canonical.exchange,
        "as_of_date": canonical.as_of_date,
        "calculated_at": canonical.calculated_at,
        "strategy_version": canonical.strategy_version,
        "threshold_version": canonical.threshold_version,
        "input_schema_version": canonical.input_schema_version,
        "action_taxonomy": canonical.action_taxonomy,
        "shared_decision_id": canonical.shared_decision_id,
        "input_hash": canonical.input_hash,
        "data_revision": canonical.data_revision,
        "event_revision": canonical.event_revision,
        "replay_status": canonical.replay_status,
        "replay_limitations": list(canonical.replay_limitations),
        "recommendation": canonical.recommendation.value,
        "eligibility_status": canonical.eligibility_status.value,
        "evidence_strength": canonical.evidence_strength,
        "opportunity_score": canonical.opportunity_score,
        "primary_reason_code": canonical.primary_reason_code,
        "result_payload": canonical.model_dump(mode="json"),
    }


logger = logging.getLogger(__name__)


class DecisionSnapshotRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def publish_generation(
        self, *, exchange, generation_id, session_date, inputs, payload
    ) -> DecisionGenerationCapture:
        """Commit atomically and return the durable winner, including on duplicate retries."""
        from app.modules.market_data.publication_lock import lock_session_publication
        await lock_session_publication(self.session, exchange=exchange, session_date=session_date)
        statement = insert(DecisionGenerationCapture).values(
            exchange=exchange, generation_id=generation_id, session_date=session_date,
            observed_at=datetime.now(UTC), input_payload=inputs, result_payload=payload,
        ).on_conflict_do_nothing(index_elements=["exchange", "generation_id"])
        await self.session.execute(statement)
        winner = await self.session.scalar(select(DecisionGenerationCapture).where(
            DecisionGenerationCapture.exchange == exchange,
            DecisionGenerationCapture.generation_id == generation_id,
        ).execution_options(populate_existing=True))
        if winner is None or winner.invalidated_at is not None:
            await self.session.rollback()
            raise RuntimeError("Published generation winner is missing or withdrawn")
        await self.session.commit()
        logger.info("decision_generation_publication strategy=%s generation=%s observed_at=%s session=%s",
            winner.result_payload.get("strategy_version"), winner.generation_id, winner.observed_at, winner.session_date)
        return winner

    async def list_captures(self, *, exchange, start_date=None, end_date=None):
        statement = select(DecisionGenerationCapture).where(DecisionGenerationCapture.exchange == exchange)
        if start_date is not None:
            statement = statement.where(DecisionGenerationCapture.session_date >= start_date)
        if end_date is not None:
            statement = statement.where(DecisionGenerationCapture.session_date <= end_date)
        return list((await self.session.scalars(statement.order_by(
            DecisionGenerationCapture.session_date, DecisionGenerationCapture.observed_at,
        ))).all())

    async def get_publication(self, *, exchange, generation_id):
        return await self.session.scalar(select(DecisionGenerationCapture).where(
            DecisionGenerationCapture.exchange == exchange,
            DecisionGenerationCapture.generation_id == generation_id,
        ).options(defer(DecisionGenerationCapture.input_payload, raiseload=True)))

    async def get_replay_publication(self, *, exchange, generation_id):
        """Explicit background replay read; request readers keep their narrow projection."""
        return await self.session.scalar(select(DecisionGenerationCapture).where(
            DecisionGenerationCapture.exchange == exchange, DecisionGenerationCapture.generation_id == generation_id,
        ).execution_options(populate_existing=True))

    async def publication_coverage(self, *, exchange, generation_id):
        # Return only the small coverage manifest, never replay inputs/results.
        where = (DecisionGenerationCapture.exchange == exchange, DecisionGenerationCapture.generation_id == generation_id)
        value = await self.session.execute(select(
            DecisionGenerationCapture.input_payload["universe_membership"],
            DecisionGenerationCapture.input_payload["membership_provenance"],
            DecisionGenerationCapture.input_payload["excluded_members"],
        ).where(*where))
        manifest = value.one_or_none()
        if manifest is None:
            return {}
        keys = list((await self.session.scalars(select(func.jsonb_object_keys(
            DecisionGenerationCapture.input_payload["inputs"],
        )).where(*where))).all())
        membership, provenance, exclusions = manifest
        return {"universe_membership": membership, "membership_provenance": provenance,
                "excluded_members": exclusions, "input_keys": keys}

    async def latest_publication(self, *, exchange, before_date=None, generation_id=None, metadata_only=False):
        statement = select(DecisionGenerationCapture).where(
            DecisionGenerationCapture.exchange == exchange,
        )
        # Read consumers never need the captured replay inputs. Freshness checks
        # need only identity/status, not the potentially large universe result.
        statement = statement.options(defer(DecisionGenerationCapture.input_payload, raiseload=True))
        if metadata_only:
            statement = statement.options(defer(DecisionGenerationCapture.result_payload, raiseload=True))
        if before_date is not None:
            statement = statement.where(DecisionGenerationCapture.session_date < before_date)
        if generation_id is not None:
            statement = statement.order_by(
                case((DecisionGenerationCapture.generation_id == generation_id, 0), else_=1)
            )
        # Do not skip an invalidated head and silently resurrect an older actionable result.
        statement = statement.order_by(
            DecisionGenerationCapture.session_date.desc(),
            DecisionGenerationCapture.observed_at.desc(),
        ).limit(1)
        return await self.session.scalar(statement)

    async def persist_missing(self, rows: list[ScoredUniverseRow]) -> int:
        values = [item for row in rows if (item := decision_snapshot_values(row)) is not None]
        if not values:
            return 0
        statement = (
            insert(CanonicalDecisionSnapshot)
            .values(values)
            .on_conflict_do_nothing(index_elements=["shared_decision_id"])
            .returning(CanonicalDecisionSnapshot.shared_decision_id)
        )
        inserted = (await self.session.scalars(statement)).all()
        await self.session.commit()
        return len(inserted)

    async def list_for_session(
        self,
        *,
        exchange: ExchangeCode,
        as_of_date: date,
        strategy_version: str,
    ) -> list[CanonicalDecisionSnapshot]:
        statement = (
            select(CanonicalDecisionSnapshot)
            .where(
                CanonicalDecisionSnapshot.exchange == exchange,
                CanonicalDecisionSnapshot.as_of_date == as_of_date,
                CanonicalDecisionSnapshot.strategy_version == strategy_version,
            )
            .order_by(
                CanonicalDecisionSnapshot.stock_id,
                CanonicalDecisionSnapshot.shared_decision_id,
            )
        )
        result = await self.session.scalars(statement)
        return list(result.all())


def get_decision_snapshot_repository(
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> DecisionSnapshotRepository:
    return DecisionSnapshotRepository(session)
