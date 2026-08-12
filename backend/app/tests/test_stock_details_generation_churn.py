from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.core.core_config import Settings
from app.core.enums import DataQualityFlag, ExchangeCode, StockDetailsSyncScope
from app.core.security_config import ANONYMOUS_USER_CONTEXT
from app.modules.stock_details.stock_details_schemas import StockDetailsSyncRequest
from app.modules.stock_details.stock_details_service import StockDetailsService, _FetchedDetails


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "bulk_result",
    [RuntimeError("current-market unavailable"), {}],
    ids=["bulk-fetch-failure", "symbol-missing-from-bulk"],
)
async def test_unavailable_bulk_snapshot_explicitly_skips_retired_per_symbol_fetch(
    monkeypatch: pytest.MonkeyPatch,
    bulk_result: object,
) -> None:
    stock = SimpleNamespace(symbol="SONALILIFE")
    job = SimpleNamespace(metadata_json={}, attempt_count=0)
    repository = MagicMock(session=MagicMock())
    repository.commit = AsyncMock()
    repository.update_sync_job = AsyncMock()
    service = StockDetailsService(
        repository,
        ANONYMOUS_USER_CONTEXT,
        Settings(
            amarstock_latest_price_stock_details_enabled=True,
            stock_details_sync_request_delay_min_seconds=0,
            stock_details_sync_request_delay_max_seconds=0,
        ),
    )
    service._select_stocks = AsyncMock(return_value=([stock], 0))  # type: ignore[method-assign]
    service._create_jobs = AsyncMock(return_value=[(stock, job)])  # type: ignore[method-assign]
    service._persist_payload = AsyncMock(  # type: ignore[method-assign]
        return_value={
            "stock_profile_count": 0,
            "daily_price_count": 1,
            "daily_price_skipped_count": 0,
            "metric_count": 0,
            "valuation_count": 0,
            "shareholding_count": 0,
            "event_count": 0,
            "decision_input_changed": 0,
            "latest_price_profile_fill": 0,
            "latest_price_shareholding": 0,
            "latest_price_valuation": 0,
        }
    )
    service._finish_job = AsyncMock()  # type: ignore[method-assign]
    service._job_metadata = MagicMock(return_value={})  # type: ignore[method-assign]

    bulk_source = MagicMock()
    if isinstance(bulk_result, Exception):
        bulk_source.fetch_by_scrip = AsyncMock(side_effect=bulk_result)
    else:
        bulk_source.fetch_by_scrip = AsyncMock(return_value=bulk_result)
    monkeypatch.setattr(
        "app.modules.stock_details.stock_details_service.AmarStockLatestPriceApiSource.from_settings",
        lambda _settings: bulk_source,
    )

    payload = SimpleNamespace(data_quality_flag=DataQualityFlag.OK)
    details_source = MagicMock(source_name="TEST")
    details_source.fetch_stock_details = AsyncMock(return_value=payload)

    result = await service.sync_stock_details(
        StockDetailsSyncRequest(
            exchange=ExchangeCode.DSE,
            symbols=["SONALILIFE"],
            scope=StockDetailsSyncScope.FULL,
        ),
        source=details_source,
    )

    assert result.failed_count == 0
    assert result.synced_count == 1
    details_source.fetch_stock_details.assert_awaited_once()
    assert details_source.fetch_stock_details.await_args.kwargs == {
        "historical_window_days": None,
        "snapshot_override": None,
        "snapshot_url_override": None,
        "skip_snapshot_fetch": True,
    }


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
