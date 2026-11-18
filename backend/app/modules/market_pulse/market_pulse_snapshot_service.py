from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date

from app.core.enums import ExchangeCode, MarketDataState
from app.core.redis_client import OptionalRedisClient
from app.modules.market_pulse.market_pulse_cache import invalidate_pulse_cache
from app.modules.market_pulse.market_pulse_history import (
    PULSE_HISTORY_MIN_ELIGIBLE_CANDIDATES,
    compute_pulse_opportunity_aggregate,
)
from app.modules.market_pulse.market_pulse_snapshot_repository import (
    MarketPulseSnapshotRepository,
    PulseSnapshotIdentity,
    PulseSnapshotValues,
)
from app.modules.market_data.published_generation import PublishedMarketGeneration
from app.modules.market_universe.market_universe_compute import technical_snapshot_from_read
from app.modules.market_universe.market_universe_lineage import compute_universe_payload_revision
from app.modules.market_universe.market_universe_service import MarketUniverseService, UniverseCacheUnavailableError
from app.modules.stock_details.decision.technical import TechnicalSnapshot

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PulseSnapshotCaptureResult:
    status: str
    eligible_candidate_count: int = 0


@dataclass(frozen=True)
class _CaptureRow:
    stock: object
    snapshot: TechnicalSnapshot
    decision: object
    score: object


class MarketPulseSnapshotService:
    """Persist a session aggregate from the reusable canonical universe."""

    def __init__(
        self,
        *,
        universe_service: MarketUniverseService,
        snapshot_repository: MarketPulseSnapshotRepository,
        redis: OptionalRedisClient,
    ) -> None:
        self.universe_service = universe_service
        self.snapshot_repository = snapshot_repository
        self.redis = redis

    async def capture_finalized_session(
        self,
        *,
        exchange: ExchangeCode,
        session_date: date | None = None,
        generation: PublishedMarketGeneration | None = None,
    ) -> PulseSnapshotCaptureResult:
        generation = generation or await self.universe_service.resolve_generation_context(exchange=exchange)
        if generation is None or (session_date is not None and generation.trade_date != session_date):
            return PulseSnapshotCaptureResult("not-finalized")
        await self.snapshot_repository.lock_publication(exchange, generation.trade_date)
        try:
            canonical_snapshot = await self.universe_service.get_canonical_universe(exchange=exchange, generation=generation, allow_rebuild=False)
        except UniverseCacheUnavailableError:
            return PulseSnapshotCaptureResult("not-finalized")
        if canonical_snapshot.generation.sync_id != generation.sync_id:
            return PulseSnapshotCaptureResult("source-generation-changed")
        payload = canonical_snapshot.payload
        if (canonical_snapshot.updating or canonical_snapshot.withdrawn
            or generation.data_state != MarketDataState.FINALIZED or payload.decision_status != "CURRENT"
            or (session_date is not None and generation.trade_date != session_date)):
            return PulseSnapshotCaptureResult("not-finalized")
        session_date = generation.trade_date
        repository = self.universe_service.decision_snapshot_repository
        publication = await repository.latest_publication(exchange=exchange, generation_id=generation.sync_id, metadata_only=True) if repository is not None else None
        if (publication is None or publication.invalidated_at is not None
            or publication.generation_id != generation.sync_id or publication.session_date != session_date):
            return PulseSnapshotCaptureResult("not-finalized")

        universe_rows = canonical_snapshot.rows
        if not await self.universe_service.is_input_generation_current(generation, exchange=exchange):
            logger.warning(
                "Skipping Pulse snapshot for %s %s: source generation changed during capture",
                exchange.value,
                session_date,
            )
            return PulseSnapshotCaptureResult("source-generation-changed")
        identity = PulseSnapshotIdentity.from_publication(exchange, payload)
        revision = payload.payload_revision or compute_universe_payload_revision(universe_rows)
        existing = await self.snapshot_repository.list_for_sessions(identity=identity, session_dates=[session_date])
        replace_revision = None
        if existing:
            if existing[0].universe_payload_revision == revision:
                return PulseSnapshotCaptureResult("duplicate", existing[0].eligible_candidate_count)
            logger.info("Replacing Pulse snapshot with the corrected finalized publication for %s %s", exchange.value, session_date)
            replace_revision = existing[0].universe_payload_revision

        # Avoid a module-level circular import: request-service eligibility remains
        # the single candidate-gate implementation.
        from app.modules.market_pulse.market_pulse_service import is_eligible_pulse_candidate
        from app.modules.market_pulse.pulse_score import compute_pulse_score

        scored_rows: list[_CaptureRow] = []
        for row in universe_rows:
            if not is_eligible_pulse_candidate(row, session_date):
                continue
            snapshot = technical_snapshot_from_read(row.technical_snapshot)
            if row.decision is None:
                continue
            scored_rows.append(
                _CaptureRow(
                    stock=row.stock,
                    snapshot=snapshot,
                    decision=row.decision,
                    score=compute_pulse_score(snapshot, row.decision),
                )
            )

        eligible_count = len(scored_rows)
        if eligible_count < PULSE_HISTORY_MIN_ELIGIBLE_CANDIDATES and replace_revision is None:
            logger.info(
                "Skipping Pulse snapshot for %s %s: only %s eligible candidates",
                exchange.value,
                session_date,
                eligible_count,
            )
            return PulseSnapshotCaptureResult("insufficient-candidates", eligible_count)

        aggregate = compute_pulse_opportunity_aggregate(scored_rows)
        if not await self.universe_service.is_input_generation_current(generation, exchange=exchange):
            return PulseSnapshotCaptureResult("source-generation-changed")
        created = await self.snapshot_repository.persist_if_absent(
            PulseSnapshotValues(
                identity=identity,
                session_date=session_date,
                opportunity_score=aggregate.score,
                universe_candidate_count=len(universe_rows),
                eligible_candidate_count=eligible_count,
                excluded_candidate_count=max(0, len(universe_rows) - eligible_count),
                eligible_population_fingerprint=aggregate.eligible_population_fingerprint,
                source_last_synced_at=generation.source_last_synced_at,
                universe_payload_revision=revision,
            ),
            replace_revision=replace_revision,
        )
        if created:
            await invalidate_pulse_cache(self.redis, exchange)
            return PulseSnapshotCaptureResult("corrected" if replace_revision else "created", eligible_count)
        persisted = await self.snapshot_repository.list_for_sessions(identity=identity, session_dates=[session_date])
        return PulseSnapshotCaptureResult("duplicate" if persisted and persisted[0].universe_payload_revision == revision else "revision-conflict", eligible_count)
