from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock

import pytest

from app.jobs.ingestion.amarstock_api_stock_details_source import AmarStockApiStockDetailsSource
from app.jobs.ingestion.amarstock_http_client import AmarStockHttpClient


def _source() -> AmarStockApiStockDetailsSource:
    return AmarStockApiStockDetailsSource(
        base_url="https://www.amarstock.com",
        historical_token="historical",
        company_token="company",
        historical_window_days=90,
        max_retries=1,
        retry_delay_seconds=0,
    )


def test_snapshot_maps_base_stock_profile_fields() -> None:
    snapshot = {
        "FullName": "Eastern Bank PLC.",
        "MarketCategory": "A",
        "PaidUpCap": 15958.13,
        "MarketCap": 25143.544,
        "ListingYear": 1993,
        "PresentOs": "Active",
    }

    profile = _source()._map_stock_profile(snapshot)

    assert profile is not None
    assert profile.name == "Eastern Bank PLC."
    assert profile.category == "A"
    assert profile.paid_up_capital == Decimal("15958.13")
    assert profile.market_cap == Decimal("25143.544")
    assert profile.listing_date == date(1993, 1, 1)
    assert profile.is_active is True
    assert profile.metadata["source_fields"]["category"] == "MarketCategory"


@pytest.mark.asyncio
async def test_stock_details_sources_use_shared_structured_transport() -> None:
    source = _source()
    fetch_structured = AsyncMock(return_value=[])
    source.historical_source.client.fetch_structured = fetch_structured

    historical = await source.historical_source.fetch("EBL", start_date=date(2026, 1, 1))

    assert isinstance(source.historical_source.client, AmarStockHttpClient)
    assert historical == []
    fetch_structured.assert_awaited_once()
    assert fetch_structured.await_args.kwargs["source_name"] == "AMARSTOCK_API"


@pytest.mark.asyncio
async def test_current_market_snapshot_row_replaces_stale_per_symbol_snapshot() -> None:
    source = _source()
    source.historical_source.fetch = AsyncMock(return_value=[])
    source.company_source.fetch = AsyncMock(return_value=[])

    payload = await source.fetch_stock_details(
        "SONALILIFE",
        snapshot_override={
            "FullName": "Sonali Life Insurance PLC",
            "MarketCategory": "A",
            "PaidUpCap": 1000,
            "MarketCap": 5000,
            "ClosePrice": 12.7,
            "AuditedPE": 10.5,
            "NavPrice": 14.5,
        },
        snapshot_url_override="https://www.amarstock.com/823af3f1ebdd",
    )

    assert payload.snapshot_url == "https://www.amarstock.com/823af3f1ebdd"
    assert payload.stock_profile is not None
    assert payload.stock_profile.name == "Sonali Life Insurance PLC"
    assert payload.valuation is not None
    assert payload.valuation.close_price == Decimal("12.7")
    assert payload.metadata["diagnostics"]["snapshot_source"] == "current_market_snapshot"


@pytest.mark.asyncio
async def test_missing_bulk_snapshot_symbol_skips_retired_endpoint_and_keeps_other_sections() -> (
    None
):
    source = _source()
    source.historical_source.fetch = AsyncMock(
        return_value=[
            {
                "DateEpoch": 1767225600000,
                "Open": 10,
                "High": 12,
                "Low": 9,
                "Close": 11,
                "Volume": 1000,
            }
        ]
    )
    source.company_source.fetch = AsyncMock(
        return_value=[{"k": "Revenue", "l": 500, "y": 2025, "r": "income"}]
    )

    payload = await source.fetch_stock_details(
        "MISSING",
        snapshot_override=None,
        skip_snapshot_fetch=True,
    )

    source.historical_source.fetch.assert_awaited_once()
    source.company_source.fetch.assert_awaited_once()
    assert payload.snapshot_url == "unavailable"
    assert payload.metadata["diagnostics"]["snapshot_source"] == "unavailable"
    assert len(payload.daily_prices) == 1
    assert [metric.metric_code for metric in payload.financial_metrics] == ["REVENUE"]


@pytest.mark.asyncio
async def test_bulk_snapshot_fetch_failure_still_allows_historical_and_company_sections() -> None:
    source = _source()
    source.historical_source.fetch = AsyncMock(return_value=[])
    source.company_source.fetch = AsyncMock(
        return_value=[{"k": "EPS", "l": 2.5, "y": 2025, "r": "income"}]
    )

    payload = await source.fetch_stock_details(
        "SONALILIFE",
        skip_snapshot_fetch=True,
    )

    source.historical_source.fetch.assert_awaited_once()
    source.company_source.fetch.assert_awaited_once()
    assert payload.metadata["diagnostics"]["snapshot_source"] == "unavailable"
    assert [metric.metric_code for metric in payload.financial_metrics] == ["EPS"]


@pytest.mark.asyncio
async def test_retired_per_symbol_snapshot_cannot_be_requested() -> None:
    source = _source()
    source.historical_source.fetch = AsyncMock()
    source.company_source.fetch = AsyncMock()

    with pytest.raises(ValueError, match="retired"):
        await source.fetch_stock_details("SONALILIFE", skip_snapshot_fetch=False)

    source.historical_source.fetch.assert_not_awaited()
    source.company_source.fetch.assert_not_awaited()


def test_snapshot_maps_expanded_shareholding_fields() -> None:
    snapshot = {
        "SponsorDirector": 31.44,
        "Govt": 0,
        "Institute": 40.84,
        "Foreign": 0.67,
        "Public": 27.05,
        "TotalSecurities": 1595813388,
        "freefloat": 68.56,
    }

    shareholding = _source()._map_shareholding(snapshot, date(2026, 5, 4))

    assert shareholding is not None
    assert shareholding.government_percent == Decimal("0")
    assert shareholding.total_shares == 1595813388
    assert shareholding.free_float_percent == Decimal("68.56")
    assert shareholding.circulating_shares == 1094089658


def test_snapshot_maps_expanded_metrics_and_valuation() -> None:
    source = _source()
    snapshot = {
        "Q4Eps": 0,
        "AuthorizedCap": 25000,
        "ReserveSurplus": 26999.9,
        "LongLoan": 77697.71,
        "freefloat": 68.56,
        "stockBeta": "0.93",
        "NavPrice": 1.16,
    }

    metrics = source._map_snapshot_metrics(snapshot, date(2026, 5, 4))
    metric_values = {metric.metric_code: metric.value for metric in metrics}
    valuation = source._map_valuation(snapshot, date(2026, 5, 4))

    assert metric_values["Q4_EPS"] == Decimal("0")
    assert metric_values["AUTHORIZED_CAPITAL"] == Decimal("25000")
    assert metric_values["RESERVE_SURPLUS"] == Decimal("26999.9")
    assert metric_values["LONG_TERM_LOAN"] == Decimal("77697.71")
    assert metric_values["FREE_FLOAT_PERCENT"] == Decimal("68.56")
    assert metric_values["BETA"] == Decimal("0.93")
    assert valuation is not None
    assert valuation.pb_ratio == Decimal("1.16")
