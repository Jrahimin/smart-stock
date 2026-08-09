from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.core.core_config import Settings
from app.core.enums import ExchangeCode, StockDetailsSyncScope
from app.core.security_config import ANONYMOUS_USER_CONTEXT
from app.modules.stock_details.stock_details_schemas import StockDetailsSyncRequest
from app.modules.stock_details.stock_details_service import _FetchedDetails, StockDetailsService


@pytest.mark.asyncio
async def test_detail_events_do_not_publish_a_market_decision_revision(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    stock = SimpleNamespace(id=uuid4(), symbol="CENTRALINS", exchange=ExchangeCode.DSE)
    job = SimpleNamespace(metadata_json={})
    payload = SimpleNamespace(data_quality_flag=None)
    repository = MagicMock(session=MagicMock())
    repository.commit = AsyncMock()
    service = StockDetailsService(
        repository,
        ANONYMOUS_USER_CONTEXT,
        Settings(amarstock_latest_price_stock_details_enabled=False),
    )
    service._select_stocks = AsyncMock(return_value=([stock], 0))  # type: ignore[method-assign]
    service._create_jobs = AsyncMock(return_value=[job])  # type: ignore[method-assign]
    service._fetch_batch = AsyncMock(return_value=[_FetchedDetails(stock, job, payload, 1)])  # type: ignore[method-assign]
    service._persist_payload = AsyncMock(  # type: ignore[method-assign]
        return_value={
            "stock_profile_count": 0,
            "daily_price_count": 0,
            "daily_price_skipped_count": 0,
            "metric_count": 0,
            "valuation_count": 0,
            "shareholding_count": 0,
            "event_count": 1,
            "decision_input_changed": 0,
            "latest_price_profile_fill": 0,
            "latest_price_shareholding": 0,
            "latest_price_valuation": 0,
        }
    )
    service._finish_job = AsyncMock()  # type: ignore[method-assign]
    service._job_metadata = MagicMock(return_value={})  # type: ignore[method-assign]
    publish = AsyncMock()
    rebuild = MagicMock()
    monkeypatch.setattr(
        "app.modules.stock_details.stock_details_service.MarketDataService.publish_decision_input_revision",
        publish,
    )
    monkeypatch.setattr(
        "app.modules.stock_details.stock_details_service.spawn_rebuild_market_read_cache",
        rebuild,
    )

    result = await service.sync_stock_details(
        StockDetailsSyncRequest(
            exchange=ExchangeCode.DSE,
            symbols=["CENTRALINS"],
            scope=StockDetailsSyncScope.FULL,
        ),
        source=MagicMock(source_name="TEST"),
    )

    assert result.event_count == 1
    publish.assert_not_awaited()
    rebuild.assert_not_called()
    repository.commit.assert_awaited()
