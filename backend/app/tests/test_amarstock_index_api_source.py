from decimal import Decimal

import pytest

from app.jobs.ingestion.amarstock_index_api_source import AmarStockIndexApiSource


@pytest.mark.asyncio
async def test_fetch_dsex_snapshot_parses_info_and_summery(monkeypatch: pytest.MonkeyPatch) -> None:
    source = AmarStockIndexApiSource(
        base_url="https://www.amarstock.com",
        max_retries=1,
        retry_delay_seconds=0.1,
        historical_token="5ee4d332a90e",
    )

    async def fake_fetch_payloads() -> tuple[dict[str, object], dict[str, object]]:
        return (
            {
                "IndexValue": 5516.82363,
                "Change": -2.6643,
                "ChangePct": -0.04827,
                "TotalTrade": 288152,
                "TotalVolume": 390658769,
                "TotalValue": 12100.551,
                "Advance": 157,
                "Decline": 184,
                "Unchange": 65,
                "MarketStatus": "Closed",
            },
            {
                "Quote": {
                    "DateEpoch": 1781049600000,
                    "Open": 5519.48793,
                    "High": 5556.84985,
                    "Low": 5506.09387,
                    "Close": 5516.82363,
                },
                "Returns": {
                    "6Month": 11.430334720886325,
                    "1Year": 16.782832148772087,
                },
                "Range52Week": {
                    "high": 5636.15369,
                    "low": 4677.60479,
                    "current": 5516.82363,
                },
            },
        )

    monkeypatch.setattr(source, "_fetch_payloads", fake_fetch_payloads)

    snapshot = await source.fetch_dsex_snapshot()

    assert snapshot.index_close == Decimal("5516.82363")
    assert snapshot.index_change == Decimal("-2.6643")
    assert snapshot.index_change_percent == Decimal("-0.04827")
    assert snapshot.day_open == Decimal("5519.48793")
    assert snapshot.return_6m_percent == Decimal("11.430334720886325")
    assert snapshot.advancing_issues == 157
    assert snapshot.total_turnover == Decimal("12100551000")


@pytest.mark.asyncio
async def test_fetch_dsex_performance_metrics_parses_returns_and_range(monkeypatch: pytest.MonkeyPatch) -> None:
    source = AmarStockIndexApiSource(
        base_url="https://www.amarstock.com",
        max_retries=1,
        retry_delay_seconds=0.1,
        historical_token="5ee4d332a90e",
    )

    async def fake_fetch_json(url: str) -> dict[str, object]:
        assert url.endswith("/data/index/summery")
        return {
            "Returns": {
                "6Month": 11.430334720886325,
                "1Year": 16.782832148772087,
            },
            "Range52Week": {
                "high": 5636.15369,
                "low": 4677.60479,
            },
        }

    monkeypatch.setattr(source._client, "fetch_json", fake_fetch_json)

    async def fake_return_1m() -> Decimal:
        return Decimal("2.5")

    monkeypatch.setattr(source, "_fetch_return_1m_from_index_history", fake_return_1m)

    metrics = await source.fetch_dsex_performance_metrics()

    assert metrics.return_1m_percent == Decimal("2.5")

    assert metrics.return_6m_percent == Decimal("11.430334720886325")
    assert metrics.return_1y_percent == Decimal("16.782832148772087")
    assert metrics.range_52w_low == Decimal("4677.60479")
    assert metrics.range_52w_high == Decimal("5636.15369")
