from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Annotated

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database_session import get_db_session
from app.core.enums import ExchangeCode, MarketDataState
from app.core.constants.trading_constants import PULSE_SCORE_VERSION
from app.models import DecisionGenerationCapture, MarketDataGeneration, MarketPulseSessionSnapshot
from app.modules.market_data.publication_lock import lock_session_publication


@dataclass(frozen=True)
class PulseSnapshotIdentity:
    exchange: ExchangeCode
    pulse_score_version: str
    strategy_version: str
    threshold_version: str
    input_schema_version: str
    decision_taxonomy_version: str

    @classmethod
    def from_publication(cls, exchange: ExchangeCode, publication) -> PulseSnapshotIdentity:
        return cls(exchange, PULSE_SCORE_VERSION, publication.strategy_version,
                   publication.threshold_version, publication.input_schema_version,
                   publication.decision_taxonomy_version)


@dataclass(frozen=True)
class PulseSnapshotValues:
    identity: PulseSnapshotIdentity
    session_date: date
    opportunity_score: int
    universe_candidate_count: int
    eligible_candidate_count: int
    excluded_candidate_count: int
    eligible_population_fingerprint: str
    source_last_synced_at: datetime
    universe_payload_revision: str

    def model_values(self) -> dict[str, object]:
        return {
            "exchange": self.identity.exchange,
            "session_date": self.session_date,
            "pulse_score_version": self.identity.pulse_score_version,
            "strategy_version": self.identity.strategy_version,
            "threshold_version": self.identity.threshold_version,
            "input_schema_version": self.identity.input_schema_version,
            "decision_taxonomy_version": self.identity.decision_taxonomy_version,
            "opportunity_score": self.opportunity_score,
            "universe_candidate_count": self.universe_candidate_count,
            "eligible_candidate_count": self.eligible_candidate_count,
            "excluded_candidate_count": self.excluded_candidate_count,
            "eligible_population_fingerprint": self.eligible_population_fingerprint,
            "source_last_synced_at": self.source_last_synced_at,
            "universe_payload_revision": self.universe_payload_revision,
        }


class MarketPulseSnapshotRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def lock_publication(self, exchange: ExchangeCode, session_date: date) -> None:
        await lock_session_publication(self.session, exchange=exchange, session_date=session_date)

    async def persist_if_absent(self, values: PulseSnapshotValues, *, replace_revision: str | None = None) -> bool:
        fields = values.model_values()
        statement = insert(MarketPulseSessionSnapshot).values(**fields)
        constraint = "uq_market_pulse_session_snapshot_identity"
        if replace_revision is None:
            statement = statement.on_conflict_do_nothing(constraint=constraint)
        else:
            statement = statement.on_conflict_do_update(constraint=constraint, set_=fields,
                where=MarketPulseSessionSnapshot.universe_payload_revision == replace_revision)
        created = await self.session.scalar(statement.returning(MarketPulseSessionSnapshot.id))
        if created is not None:
            await self.session.commit()
            return True
        await self.session.rollback()
        return False

    async def list_for_sessions(
        self,
        *,
        identity: PulseSnapshotIdentity,
        session_dates: list[date],
    ) -> list[MarketPulseSessionSnapshot]:
        if not session_dates:
            return []
        statement = (
            select(MarketPulseSessionSnapshot)
            .where(
                MarketPulseSessionSnapshot.exchange == identity.exchange,
                MarketPulseSessionSnapshot.pulse_score_version == identity.pulse_score_version,
                MarketPulseSessionSnapshot.strategy_version == identity.strategy_version,
                MarketPulseSessionSnapshot.threshold_version == identity.threshold_version,
                MarketPulseSessionSnapshot.input_schema_version == identity.input_schema_version,
                MarketPulseSessionSnapshot.decision_taxonomy_version
                == identity.decision_taxonomy_version,
                MarketPulseSessionSnapshot.session_date.in_(session_dates),
            )
            .order_by(MarketPulseSessionSnapshot.session_date.desc())
        )
        return list((await self.session.scalars(statement)).all())

    async def current_publication_revisions(self, exchange: ExchangeCode, session_dates: list[date]) -> dict[date, str]:
        """Select each finalized price head before joining its exact nonwithdrawn decision."""
        heads = select(MarketDataGeneration.trade_date, MarketDataGeneration.sync_id, MarketDataGeneration.accepted_count).where(
            MarketDataGeneration.exchange == exchange,
            MarketDataGeneration.trade_date.in_(session_dates),
            MarketDataGeneration.state == MarketDataState.FINALIZED,
        ).distinct(MarketDataGeneration.trade_date).order_by(
            MarketDataGeneration.trade_date, MarketDataGeneration.published_at.desc(), MarketDataGeneration.id.desc(),
        ).subquery()
        revision = DecisionGenerationCapture.result_payload["payload_revision"].astext
        statement = select(heads.c.trade_date, revision).join(DecisionGenerationCapture,
            (DecisionGenerationCapture.exchange == exchange)
            & (DecisionGenerationCapture.generation_id == heads.c.sync_id)
            & (DecisionGenerationCapture.session_date == heads.c.trade_date),
        ).where(heads.c.accepted_count > 0, DecisionGenerationCapture.invalidated_at.is_(None), revision.is_not(None))
        return {day: value for day, value in (await self.session.execute(statement)).all()}


def get_market_pulse_snapshot_repository(
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> MarketPulseSnapshotRepository:
    return MarketPulseSnapshotRepository(session)
