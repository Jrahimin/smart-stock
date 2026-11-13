"""Scheduled, shared daily entry observations; HTTP reads never emit counts.

Freeze the first successful cache rebuild during OPEN and the first successful
rebuild after that session's final publication. Redis stores both observations
across workers/restarts and reserves one combined daily log emission.
"""
import logging
from collections import Counter
from datetime import datetime
from uuid import uuid4

from app.core.enums import MarketDataState, MarketSessionStatus
from app.jobs.market_session_schedule import DHAKA_TZ, entry_quote_session, resolve_market_status

logger = logging.getLogger(__name__)
_BASES = ("CURRENT", "SNAPSHOT", "LAST_CLOSE", "UNVERIFIED", "NON_COMPARISON")
_COMPARED = {"APPLICABLE", "OUTSIDE_ZONE", "AWAITING_CONFIRMATION"}
_RETENTION = 7 * 86400


def observation_key(exchange, session_date, phase):
    return f"entry-observation:v4:{exchange.value}:{session_date}:{phase}"


def entry_population_snapshot(rows, *, assessed_at, generation_id, quote_generation_id):
    # One defined observation: each instrument belongs to one bucket, even if
    # previous scheduled reads saw a different status or quote basis.
    population = {}
    for row in rows:
        assessment = row.entry_applicability
        basis = assessment.price_basis if assessment else None
        if assessment is None or assessment.status not in _COMPARED | {"UNVERIFIED"}:
            basis = "NON_COMPARISON"
        elif assessment.status == "UNVERIFIED" or basis not in _BASES:
            basis = "UNVERIFIED"
        population[str(row.stock.id)] = (basis, assessment.reason_code if assessment else "NOT_ASSESSED")
    counts = Counter(basis for basis, _ in population.values())
    reasons = Counter(reason for basis, reason in population.values() if basis == "UNVERIFIED")
    return {"assessed_at": assessed_at.isoformat(), "decision_generation_id": generation_id,
        "quote_generation_id": quote_generation_id, "population": len(population),
        "comparison_population": sum(counts[basis] for basis in ("CURRENT", "SNAPSHOT", "LAST_CLOSE")),
        "counts": {basis: counts[basis] for basis in _BASES},
        "non_comparison_reasons": Counter(reason for basis, reason in population.values() if basis == "NON_COMPARISON").most_common(5),
        "unavailable_reasons": reasons.most_common(5)}


async def observe_scheduled_entries(service, *, exchange, now=None):
    redis = service.redis
    if not redis.is_available:
        logger.warning("entry_applicability_observation_unavailable exchange=%s reason=SHARED_COORDINATOR_UNAVAILABLE", exchange.value)
        return
    now = now or datetime.now(DHAKA_TZ)
    status = resolve_market_status(now, service.settings)
    context = await service.resolve_quote_context(exchange=exchange)
    if status == MarketSessionStatus.OPEN:
        phase, session_date = "OPEN", now.date()
    else:
        expected = entry_quote_session(now, service.settings)[1].date()
        if context is None or context.data_state != MarketDataState.FINALIZED or context.trade_date != expected:
            gap = observation_key(exchange, expected, "FINAL_PUBLICATION_GAP")
            if await redis.set_if_not_exists(gap, "reported", ttl_seconds=_RETENTION):
                logger.warning("entry_applicability_observation_unavailable exchange=%s session=%s reason=FINAL_PUBLICATION_PENDING", exchange.value, expected)
            return
        phase, session_date = "POST_FINALIZATION", context.trade_date
    key = observation_key(exchange, session_date, phase)
    observation = await redis.get_json(key)
    if observation is None:
        owner = uuid4().hex
        if not await redis.set_if_not_exists(key + ":lock", owner, ttl_seconds=60):
            return
        try:
            observation = await redis.get_json(key)
            if observation is None:
                snapshot = await service.get_canonical_universe(exchange=exchange, allow_rebuild=False)
                projected = await service.project_current_entries(snapshot, exchange=exchange, price_basis_v2=True)
                quote_context = projected.quote_generation
                if (context.sync_id if context else None) != (quote_context.sync_id if quote_context else None):
                    return
                observation = entry_population_snapshot(projected.rows, assessed_at=now,
                    generation_id=projected.generation.sync_id,
                    quote_generation_id=quote_context.sync_id if quote_context else None)
                if not await redis.set_json(key, observation, ttl_seconds=_RETENTION):
                    return
        finally:
            await redis.delete_if_value(key + ":lock", owner)
    if phase != "POST_FINALIZATION":
        return
    opening = await redis.get_json(observation_key(exchange, session_date, "OPEN"))
    emitted = observation_key(exchange, session_date, "DAILY_EMITTED")
    if await redis.set_if_not_exists(emitted, "emitted", ttl_seconds=_RETENTION):
        logger.info("entry_applicability_daily exchange=%s session=%s open_observed=%s open=%s post_finalization=%s scope=scheduled_exchange_population",
            exchange.value, session_date, opening is not None, opening, observation)
