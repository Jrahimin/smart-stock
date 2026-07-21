from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date

from app.core.constants.trading_constants import (
    DECISION_TAXONOMY_VERSION,
    PULSE_SCORE_VERSION,
    TRADING_INPUT_SCHEMA_VERSION,
    TRADING_STRATEGY_VERSION,
    TRADING_THRESHOLD_VERSION,
)
from app.core.enums import ExchangeCode
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
from app.modules.market_universe.market_universe_compute import technical_snapshot_from_read
from app.modules.market_universe.market_universe_lineage import compute_universe_payload_revision
from app.modules.market_universe.market_universe_service import MarketUniverseService
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
    """Persist a session aggregate from a fresh, DB-computed canonical universe."""

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
        session_date: date,
    ) -> PulseSnapshotCaptureResult:
        before_date, before_generation = (
            await self.universe_service.market_repository.get_decision_session_freshness(
                exchange=exchange
            )
        )
        if before_date != session_date or before_generation is None:
            return PulseSnapshotCaptureResult("not-finalized")

        universe_rows = await self.universe_service.recompute_scored_universe(
            exchange,
            decision_session_date=session_date,
        )
        after_date, after_generation = (
            await self.universe_service.market_repository.get_decision_session_freshness(
                exchange=exchange
            )
        )
        if after_date != session_date or after_generation != before_generation:
            logger.warning(
                "Skipping Pulse snapshot for %s %s: source generation changed during capture",
                exchange.value,
                session_date,
            )
            return PulseSnapshotCaptureResult("source-generation-changed")

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
        if eligible_count < PULSE_HISTORY_MIN_ELIGIBLE_CANDIDATES:
            logger.info(
                "Skipping Pulse snapshot for %s %s: only %s eligible candidates",
                exchange.value,
                session_date,
                eligible_count,
            )
            return PulseSnapshotCaptureResult("insufficient-candidates", eligible_count)

        aggregate = compute_pulse_opportunity_aggregate(scored_rows)
        identity = PulseSnapshotIdentity(
            exchange=exchange,
            pulse_score_version=PULSE_SCORE_VERSION,
            strategy_version=TRADING_STRATEGY_VERSION,
            threshold_version=TRADING_THRESHOLD_VERSION,
            input_schema_version=TRADING_INPUT_SCHEMA_VERSION,
            decision_taxonomy_version=DECISION_TAXONOMY_VERSION,
        )
        created = await self.snapshot_repository.persist_if_absent(
            PulseSnapshotValues(
                identity=identity,
                session_date=session_date,
                opportunity_score=aggregate.score,
                universe_candidate_count=len(universe_rows),
                eligible_candidate_count=eligible_count,
                excluded_candidate_count=max(0, len(universe_rows) - eligible_count),
                eligible_population_fingerprint=aggregate.eligible_population_fingerprint,
                source_last_synced_at=before_generation,
                universe_payload_revision=compute_universe_payload_revision(universe_rows),
            )
        )
        if created:
            await invalidate_pulse_cache(self.redis, exchange)
            return PulseSnapshotCaptureResult("created", eligible_count)
        return PulseSnapshotCaptureResult("duplicate", eligible_count)
