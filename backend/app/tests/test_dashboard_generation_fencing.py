from __future__ import annotations

from datetime import UTC, date, datetime
from types import SimpleNamespace

import pytest

from app.core.core_config import Settings
from app.core.enums import ExchangeCode
from app.modules.market_dashboard.market_dashboard_cache import dashboard_cache_key
from app.modules.market_dashboard.market_dashboard_schemas import DashboardMoversRead
from app.modules.market_dashboard.market_dashboard_service import MarketDashboardService


class _Redis:
    def __init__(self) -> None:
        self.values: dict[str, dict] = {}

    async def get_json(self, key: str) -> dict | None:
        return self.values.get(key)

    async def set_json(self, key: str, payload: dict, *, ttl_seconds: int) -> None:
        self.values[key] = payload


def _freshness(sync_id: str) -> SimpleNamespace:
    return SimpleNamespace(
        market_sync_id=sync_id,
        last_synced_at=datetime(2026, 8, 9, 6, 30, tzinfo=UTC),
        trade_date=date(2026, 8, 9),
    )


@pytest.mark.asyncio
async def test_dashboard_cache_miss_retries_on_one_resolved_generation() -> None:
    redis = _Redis()
    market_data = SimpleNamespace()
    # First response calculation starts on G123, then G124 publishes.  The
    # retry resolves G124 once and only that generation may be cached.
    values = iter([_freshness("G123"), _freshness("G124"), _freshness("G124"), _freshness("G124")])

    async def get_market_freshness(*, exchange: ExchangeCode):
        return next(values)

    market_data.get_market_freshness = get_market_freshness
    service = MarketDashboardService(
        market_repository=object(),
        market_data_service=market_data,  # type: ignore[arg-type]
        stocks_repository=object(),
        redis=redis,  # type: ignore[arg-type]
        settings=Settings(),
    )
    computed_for: list[str] = []

    async def compute(_perf, freshness) -> DashboardMoversRead:
        computed_for.append(freshness.market_sync_id)
        return DashboardMoversRead(
            session_trade_date=freshness.trade_date,
            gainers=[],
            losers=[],
            turnover_leaders=[],
            volume_leaders=[],
        )

    response = await service._get_cached(
        "movers",
        ExchangeCode.DSE,
        DashboardMoversRead,
        compute,
    )

    assert computed_for == ["G123", "G124"]
    assert response.session_trade_date == date(2026, 8, 9)
    assert dashboard_cache_key("movers", ExchangeCode.DSE, "G123") not in redis.values
    assert dashboard_cache_key("movers", ExchangeCode.DSE, "G124") in redis.values
