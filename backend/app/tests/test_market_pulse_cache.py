from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.core_config import Settings
from app.core.enums import ExchangeCode
from app.modules.market_pulse.market_pulse_cache import (
    PULSE_EMPTY_CACHE_TTL_SECONDS,
    pulse_cache_key,
)
from app.modules.market_pulse.market_pulse_schemas import (
    MarketPulseHeroRead,
    MarketPulsePreviousSnapshot,
    MarketPulseRead,
    MarketPulseSummaryRead,
    PulseCoverageRead,
    SinceLastVisitRead,
)
from app.modules.market_pulse.market_pulse_service import (
    MarketPulseService,
    normalize_pulse_display_name,
    uses_shared_pulse_cache,
)

DECISION_DATE = date(2026, 7, 9)
SUMMARY_CACHE_KEY = pulse_cache_key("summary", ExchangeCode.DSE, DECISION_DATE)
RESPONSE_CACHE_KEY = pulse_cache_key("response", ExchangeCode.DSE, DECISION_DATE)


def _hero(greeting: str) -> MarketPulseHeroRead:
    return MarketPulseHeroRead(
        greeting=greeting,
        attention_headline="Story of the day",
        attention_subline="Subline",
        last_updated_label="10:00 AM",
        relative_updated_label="5m ago",
        session_label="OPEN",
        focus_count=0,
        recent_focus_count=0,
    )


def _pulse(greeting: str, *, empty_state: str = "none") -> MarketPulseRead:
    return MarketPulseRead(
        hero=_hero(greeting),
        since_last_visit=SinceLastVisitRead(
            visible=False,
            new_changes_count=0,
            new_focus_count=0,
            new_alerts_count=0,
            summary_label="",
        ),
        briefing=None,
        focus_stocks=[],
        monitor_candidates=[],
        today_insight=None,
        changes=[],
        alerts=[],
        market_movers={"gainers": [], "losers": []},
        empty_state=empty_state,
        empty_message=None,
        data_quality_note=None,
        coverage=PulseCoverageRead(
            decision_session_date=DECISION_DATE,
            trade_date=DECISION_DATE,
            session_trade_date=DECISION_DATE,
        ),
    )


def _summary(
    greeting: str,
    last_synced_at: datetime | None,
    *,
    decision_session_date: date | None = DECISION_DATE,
) -> MarketPulseSummaryRead:
    pulse = _pulse(greeting)
    return MarketPulseSummaryRead(
        hero=pulse.hero,
        since_last_visit=pulse.since_last_visit,
        focus_stocks=pulse.focus_stocks,
        monitor_candidates=pulse.monitor_candidates,
        alerts=pulse.alerts,
        empty_state=pulse.empty_state,
        empty_message=pulse.empty_message,
        data_quality_note=pulse.data_quality_note,
        coverage=PulseCoverageRead(
            decision_session_date=decision_session_date,
            trade_date=decision_session_date,
            session_trade_date=decision_session_date,
        ),
        last_synced_at=last_synced_at,
    )


@dataclass
class FakePulseRedis:
    store: dict[str, dict] = field(default_factory=dict)
    ttls: dict[str, int] = field(default_factory=dict)

    async def get_json(self, key: str) -> dict | None:
        return self.store.get(key)

    async def set_json(self, key: str, payload: dict, ttl_seconds: int) -> None:
        self.store[key] = payload
        self.ttls[key] = ttl_seconds

    async def delete(self, key: str) -> None:
        self.store.pop(key, None)
        self.ttls.pop(key, None)


def _service_with_redis(store: dict[str, dict]) -> MarketPulseService:
    redis = FakePulseRedis(store=store)
    market_data_service = MagicMock()
    market_data_service.get_market_freshness = AsyncMock(
        return_value=MagicMock(
            last_synced_at=datetime(2026, 7, 9, 10, 0, tzinfo=timezone.utc),
            trade_date=DECISION_DATE,
            decision_session_date=DECISION_DATE,
        ),
    )
    return MarketPulseService(
        market_data_service=market_data_service,
        universe_service=MagicMock(),
        redis=redis,  # type: ignore[arg-type]
        settings=Settings(),
    )


def test_uses_shared_pulse_cache_only_for_anonymous_requests() -> None:
    previous = MarketPulsePreviousSnapshot(last_synced_at=datetime(2026, 7, 8, 10, 0, tzinfo=timezone.utc))

    assert uses_shared_pulse_cache(None, None) is True
    assert uses_shared_pulse_cache(None, "Alex") is False
    assert uses_shared_pulse_cache(None, "  ") is True
    assert uses_shared_pulse_cache(previous, None) is False
    assert uses_shared_pulse_cache(previous, "Alex") is False
    assert normalize_pulse_display_name(" Alex ") == "Alex"


@pytest.mark.asyncio
async def test_anonymous_summary_reads_and_writes_shared_cache() -> None:
    store: dict[str, dict] = {}
    service = _service_with_redis(store)
    service._compute_market_pulse = AsyncMock(return_value=_pulse("Good morning"))  # type: ignore[method-assign]

    summary = await service.get_market_pulse_summary(exchange=ExchangeCode.DSE, previous=None)

    assert summary.hero.greeting == "Good morning"
    assert summary.last_synced_at == datetime(2026, 7, 9, 10, 0, tzinfo=timezone.utc)
    assert SUMMARY_CACHE_KEY in store
    service.market_data_service.get_market_freshness.assert_awaited_once_with(exchange=ExchangeCode.DSE)

    service._compute_market_pulse.reset_mock()
    cached = await service.get_market_pulse_summary(exchange=ExchangeCode.DSE, previous=None)
    service._compute_market_pulse.assert_not_called()
    assert cached.hero.greeting == "Good morning"
    assert service.market_data_service.get_market_freshness.await_count == 2


@pytest.mark.asyncio
async def test_display_name_bypasses_shared_cache_reads_and_writes() -> None:
    store: dict[str, dict] = {}
    service = _service_with_redis(store)
    alex_pulse = _pulse("Good morning, Alex")
    bob_pulse = _pulse("Good morning, Bob")

    service._compute_market_pulse = AsyncMock(side_effect=[alex_pulse, bob_pulse])  # type: ignore[method-assign]
    await service.get_market_pulse_summary(exchange=ExchangeCode.DSE, previous=None, display_name="Alex")

    service._compute_market_pulse = AsyncMock(return_value=bob_pulse)  # type: ignore[method-assign]
    bob_summary = await service.get_market_pulse_summary(exchange=ExchangeCode.DSE, previous=None, display_name="Bob")

    assert bob_summary.hero.greeting == "Good morning, Bob"
    assert SUMMARY_CACHE_KEY not in store


@pytest.mark.asyncio
async def test_different_display_names_do_not_share_cached_personalized_output() -> None:
    store: dict[str, dict] = {}
    service = _service_with_redis(store)
    store[RESPONSE_CACHE_KEY] = _pulse("Good morning, Alex").model_dump(mode="json")

    service._compute_market_pulse = AsyncMock(return_value=_pulse("Good morning, Bob"))  # type: ignore[method-assign]
    bob = await service.get_market_pulse(exchange=ExchangeCode.DSE, previous=None, display_name="Bob")

    assert bob.hero.greeting == "Good morning, Bob"
    service._compute_market_pulse.assert_awaited_once()


@pytest.mark.asyncio
async def test_legacy_cached_summary_without_generation_is_treated_as_miss() -> None:
    store: dict[str, dict] = {}
    service = _service_with_redis(store)
    store[SUMMARY_CACHE_KEY] = _summary(
        "Good morning",
        None,
    ).model_dump(mode="json")

    service._compute_market_pulse = AsyncMock(return_value=_pulse("Good morning, fresh"))  # type: ignore[method-assign]
    summary = await service.get_market_pulse_summary(exchange=ExchangeCode.DSE, previous=None)

    assert summary.hero.greeting == "Good morning, fresh"
    assert summary.last_synced_at == datetime(2026, 7, 9, 10, 0, tzinfo=timezone.utc)
    service._compute_market_pulse.assert_awaited_once()
    assert SUMMARY_CACHE_KEY in store
    assert store[SUMMARY_CACHE_KEY]["last_synced_at"] is not None


@pytest.mark.asyncio
async def test_stale_cached_summary_generation_is_treated_as_miss() -> None:
    store: dict[str, dict] = {}
    service = _service_with_redis(store)
    store[SUMMARY_CACHE_KEY] = _summary(
        "Good morning",
        datetime(2026, 7, 8, 10, 0, tzinfo=timezone.utc),
    ).model_dump(mode="json")

    service._compute_market_pulse = AsyncMock(return_value=_pulse("Good morning, fresh"))  # type: ignore[method-assign]
    summary = await service.get_market_pulse_summary(exchange=ExchangeCode.DSE, previous=None)

    assert summary.hero.greeting == "Good morning, fresh"
    service._compute_market_pulse.assert_awaited_once()


@pytest.mark.asyncio
async def test_stale_pulse_response_cache_is_not_reused_when_rebuilding_summary() -> None:
    store: dict[str, dict] = {}
    service = _service_with_redis(store)
    store[RESPONSE_CACHE_KEY] = _pulse("Good morning, stale").model_copy(
        update={
            "last_synced_at": datetime(2026, 7, 8, 10, 0, tzinfo=timezone.utc),
            "coverage": PulseCoverageRead(
                decision_session_date=DECISION_DATE,
                trade_date=DECISION_DATE,
                session_trade_date=DECISION_DATE,
            ),
        },
    ).model_dump(mode="json")

    service._compute_market_pulse = AsyncMock(return_value=_pulse("Good morning, fresh"))  # type: ignore[method-assign]
    summary = await service.get_market_pulse_summary(exchange=ExchangeCode.DSE, previous=None)

    assert summary.hero.greeting == "Good morning, fresh"
    service._compute_market_pulse.assert_awaited_once()
    assert summary.last_synced_at == datetime(2026, 7, 9, 10, 0, tzinfo=timezone.utc)


@pytest.mark.asyncio
async def test_malformed_cached_summary_is_deleted_and_recomputed() -> None:
    store: dict[str, dict] = {}
    service = _service_with_redis(store)
    store[SUMMARY_CACHE_KEY] = {"hero": "not-a-valid-summary"}

    service._compute_market_pulse = AsyncMock(return_value=_pulse("Good morning, fresh"))  # type: ignore[method-assign]
    summary = await service.get_market_pulse_summary(exchange=ExchangeCode.DSE, previous=None)

    assert summary.hero.greeting == "Good morning, fresh"
    service._compute_market_pulse.assert_awaited_once()
    assert SUMMARY_CACHE_KEY in store
    assert store[SUMMARY_CACHE_KEY]["last_synced_at"] is not None


@pytest.mark.asyncio
async def test_previous_snapshot_bypasses_shared_cache() -> None:
    store: dict[str, dict] = {}
    service = _service_with_redis(store)
    store[SUMMARY_CACHE_KEY] = _summary(
        "Good morning",
        datetime(2026, 7, 8, 10, 0, tzinfo=timezone.utc),
    ).model_dump(mode="json")

    previous = MarketPulsePreviousSnapshot(last_synced_at=datetime(2026, 7, 8, 9, 0, tzinfo=timezone.utc))
    service._compute_market_pulse = AsyncMock(return_value=_pulse("Good morning, visitor"))  # type: ignore[method-assign]

    summary = await service.get_market_pulse_summary(
        exchange=ExchangeCode.DSE,
        previous=previous,
    )

    assert summary.hero.greeting == "Good morning, visitor"
    service._compute_market_pulse.assert_awaited_once()


@pytest.mark.asyncio
async def test_cached_summary_with_mismatched_decision_date_is_treated_as_miss() -> None:
    store: dict[str, dict] = {}
    service = _service_with_redis(store)
    store[SUMMARY_CACHE_KEY] = _summary(
        "Good morning",
        datetime(2026, 7, 9, 10, 0, tzinfo=timezone.utc),
        decision_session_date=date(2026, 7, 8),
    ).model_dump(mode="json")

    service._compute_market_pulse = AsyncMock(return_value=_pulse("Good morning, fresh"))  # type: ignore[method-assign]
    summary = await service.get_market_pulse_summary(exchange=ExchangeCode.DSE, previous=None)

    assert summary.hero.greeting == "Good morning, fresh"
    service._compute_market_pulse.assert_awaited_once()


@pytest.mark.asyncio
async def test_degraded_empty_summary_uses_shorter_cache_ttl() -> None:
    store: dict[str, dict] = {}
    redis = FakePulseRedis(store=store)
    service = MarketPulseService(
        market_data_service=_service_with_redis({}).market_data_service,
        universe_service=MagicMock(),
        redis=redis,  # type: ignore[arg-type]
        settings=Settings(),
    )
    degraded_pulse = _pulse("Good morning", empty_state="insufficient-history")
    service._compute_market_pulse = AsyncMock(return_value=degraded_pulse)  # type: ignore[method-assign]

    await service.get_market_pulse_summary(exchange=ExchangeCode.DSE, previous=None)

    assert redis.ttls[SUMMARY_CACHE_KEY] == PULSE_EMPTY_CACHE_TTL_SECONDS
