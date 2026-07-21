from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Annotated

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database_session import get_db_session
from app.core.enums import ExchangeCode
from app.models import MarketPulseSessionSnapshot


@dataclass(frozen=True)
class PulseSnapshotIdentity:
    exchange: ExchangeCode
    pulse_score_version: str
    strategy_version: str
    threshold_version: str
    input_schema_version: str
    decision_taxonomy_version: str


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

    async def persist_if_absent(self, values: PulseSnapshotValues) -> bool:
        statement = (
            insert(MarketPulseSessionSnapshot)
            .values(**values.model_values())
            .on_conflict_do_nothing(constraint="uq_market_pulse_session_snapshot_identity")
            .returning(MarketPulseSessionSnapshot.id)
        )
        created = await self.session.scalar(statement)
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


def get_market_pulse_snapshot_repository(
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> MarketPulseSnapshotRepository:
    return MarketPulseSnapshotRepository(session)
