from datetime import date
from decimal import Decimal

from app.jobs.ingestion.amarstock_api_stock_details_source import AmarStockApiStockDetailsSource


def _source() -> AmarStockApiStockDetailsSource:
    return AmarStockApiStockDetailsSource(
        base_url="https://www.amarstock.com",
        snapshot_token="snapshot",
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
