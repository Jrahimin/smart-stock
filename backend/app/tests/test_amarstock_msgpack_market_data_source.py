from __future__ import annotations

import json
import logging
from datetime import UTC, date, datetime
from decimal import Decimal
from unittest.mock import AsyncMock

import msgpack
import pytest

from app.core.enums import DataQualityFlag
from app.jobs.ingestion.amarstock_http_client import (
    AmarStockHttpResponse,
    decode_structured_payload,
)
from app.jobs.ingestion.amarstock_msgpack_market_data_source import (
    AmarStockMarketSnapshotSource,
    MarketSnapshotValidationError,
    decode_amarstock_market_snapshot,
)


def _payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "aa": [" ACI ", "BEXIMCO"],
        "ea": [120.5, 0],
        "eb": [118, 91],
        "ec": [122, 94],
        "ed": [117, 90],
        "ee": [119, 92],
        "aj": [118.5, 91.5],
        "an": [2, 0.5],
        "bz": [1.69, 0.55],
        "ad": [1000, 2000],
        "eh": [50, 75],
        "ei": [1.25, 2],
    }
    payload.update(overrides)
    return payload


def _pack(**overrides: object) -> bytes:
    return msgpack.packb(_payload(**overrides), use_bin_type=True)


def _json(**overrides: object) -> bytes:
    return json.dumps(_payload(**overrides)).encode()


def test_decode_maps_columns_turnover_and_ltp_close_semantics() -> None:
    snapshot = decode_amarstock_market_snapshot(_payload())

    first, second = snapshot.rows
    first_price = first.to_ingested_price(
        trade_date=date(2026, 8, 6),
        source_name="AMARSTOCK_MARKET_MSGPACK",
    )
    second_price = second.to_ingested_price(
        trade_date=date(2026, 8, 6),
        source_name="AMARSTOCK_MARKET_MSGPACK",
    )

    assert first.raw_symbol == " ACI "
    assert first.source_close == Decimal("119")
    assert first.change == Decimal("2")
    assert first.change_percent == Decimal("1.69")
    assert first_price.symbol == "ACI"
    assert first_price.close_price == Decimal("120.5")
    assert first_price.turnover == Decimal("1250000.00")
    assert second_price.close_price == Decimal("92")
    assert second_price.turnover == Decimal("2000000")
    assert second_price.data_quality_flag == DataQualityFlag.PARTIAL


def test_zero_no_trade_row_is_preserved_for_coverage() -> None:
    zeroes = [0]
    snapshot = decode_amarstock_market_snapshot(
        _payload(
            aa=["SUSPENDED"],
            ea=zeroes,
            eb=zeroes,
            ec=zeroes,
            ed=zeroes,
            ee=zeroes,
            aj=zeroes,
            an=zeroes,
            bz=zeroes,
            ad=zeroes,
            eh=zeroes,
            ei=zeroes,
        )
    )
    price = snapshot.rows[0].to_ingested_price(
        trade_date=date(2026, 8, 6),
        source_name="AMARSTOCK_MARKET_MSGPACK",
    )

    assert snapshot.normalized_symbols == frozenset({"SUSPENDED"})
    assert price.close_price == 0
    assert price.data_quality_flag == DataQualityFlag.PARTIAL


def test_high_below_low_is_rejected_only_when_both_are_positive() -> None:
    zero_low_snapshot = decode_amarstock_market_snapshot(
        _payload(ec=[1, 94], ed=[0, 90])
    )
    assert zero_low_snapshot.rows[0].high_price == 1
    zero_high_snapshot = decode_amarstock_market_snapshot(
        _payload(ec=[0, 94], ed=[1, 90])
    )
    assert zero_high_snapshot.rows[0].low_price == 1

    with pytest.raises(MarketSnapshotValidationError, match="partial publication refused"):
        decode_amarstock_market_snapshot(_payload(ec=[1, 94], ed=[2, 90]))


@pytest.mark.parametrize(
    "payload, message",
    [
        ({key: value for key, value in _payload().items() if key != "ei"}, "missing required"),
        (_payload(ei=[1]), "unequal lengths"),
        (_payload(aa=["ACI", "aci"]), "Duplicate normalized"),
        (_payload(ea=[{"bad": 1}, 1]), "invalid rows"),
        (_payload(ea=[float("nan"), 1]), "invalid rows"),
    ],
)
def test_invalid_payload_contracts_are_rejected(payload: dict[str, object], message: str) -> None:
    with pytest.raises(MarketSnapshotValidationError, match=message):
        decode_amarstock_market_snapshot(payload)


@pytest.mark.parametrize("serialization", ["json", "msgpack"])
def test_same_structural_validation_after_either_decoder(serialization: str) -> None:
    body = (
        json.dumps(_payload(ei=[1])).encode()
        if serialization == "json"
        else msgpack.packb(_payload(ei=[1]), use_bin_type=True)
    )
    decoded = decode_structured_payload(body, "application/octet-stream")

    with pytest.raises(MarketSnapshotValidationError, match="unequal lengths"):
        decode_amarstock_market_snapshot(decoded.payload)


@pytest.mark.parametrize(
    ("body", "content_type", "expected_decoder"),
    [
        pytest.param(_json(), "application/json", "json", id="json-correct-content-type"),
        pytest.param(
            _pack(),
            "application/x-msgpack",
            "msgpack",
            id="msgpack-correct-content-type-fallback",
        ),
        pytest.param(
            _json(),
            "application/x-msgpack",
            "json",
            id="json-incorrect-content-type",
        ),
        pytest.param(
            _pack(),
            "application/json",
            "msgpack",
            id="msgpack-incorrect-content-type",
        ),
        pytest.param(_json(), "", "json", id="json-missing-content-type"),
        pytest.param(_pack(), "", "msgpack", id="msgpack-missing-content-type"),
    ],
)
@pytest.mark.asyncio
async def test_source_decodes_transport_independently_of_content_type(
    body: bytes,
    content_type: str,
    expected_decoder: str,
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.INFO)
    client = AsyncMock()
    client.fetch_bytes.return_value = AmarStockHttpResponse(
        body=body,
        status=200,
        content_type=content_type,
        headers={},
    )
    source = AmarStockMarketSnapshotSource(
        base_url="https://www.amarstock.com",
        snapshot_path="/opaque-hash",
        max_retries=1,
        retry_delay_seconds=0,
        max_response_bytes=1_000_000,
        max_last_modified_age_days=7,
        client=client,
    )

    prices = await source.fetch_daily_prices(date(2026, 8, 6))

    assert len(prices) == 2
    assert source.coverage_symbols(prices) == {"ACI", "BEXIMCO"}
    assert f"decoder={expected_decoder}" in caplog.text
    kwargs = client.fetch_bytes.await_args.kwargs
    assert kwargs["expected_content_type"] is None
    assert kwargs["accept"].startswith("application/json")
    assert kwargs["endpoint_path"] == "/opaque-hash"
    assert kwargs["referer"] == "https://www.amarstock.com/latest-share-price"


@pytest.mark.asyncio
async def test_very_old_last_modified_is_rejected() -> None:
    client = AsyncMock()
    client.fetch_bytes.return_value = AmarStockHttpResponse(
        body=_pack(),
        status=200,
        content_type="application/x-msgpack",
        headers={"last-modified": "Thu, 01 Jan 2026 00:00:00 GMT"},
    )
    source = AmarStockMarketSnapshotSource(
        base_url="https://www.amarstock.com",
        snapshot_path="/opaque-hash",
        max_retries=1,
        retry_delay_seconds=0,
        max_response_bytes=1_000_000,
        max_last_modified_age_days=7,
        client=client,
    )

    with pytest.raises(MarketSnapshotValidationError, match="predates the requested session"):
        await source.fetch_daily_prices(date(2026, 8, 6))


@pytest.mark.parametrize("headers, rejected", [
    ({"last-modified": "Wed, 11 Nov 2026 10:00:00 GMT"}, True),
    ({"date": "Wed, 11 Nov 2026 12:00:00 GMT", "age": "61200"}, True),
    ({"date": "Wed, 11 Nov 2026 12:00:00 GMT", "last-modified": "Thu, 12 Nov 2026 04:00:00 GMT"}, True),
    ({"last-modified": "Thu, 12 Nov 2026 05:01:00 GMT"}, True),
    ({"date": "Thu, 12 Nov 2026 05:01:00 GMT"}, True),
    # UTC yesterday is already the requested session in Dhaka.
    ({"last-modified": "Wed, 11 Nov 2026 18:01:00 GMT", "age": "3600"}, False),
    ({"date": "Wed, 11 Nov 2026 18:01:00 GMT", "age": "3600"}, False),
    ({"date": "Thu, 12 Nov 2026 05:00:00 GMT"}, False),
    ({}, False),
])
@pytest.mark.asyncio
async def test_primary_snapshot_dates_and_receipt_never_supply_a_quote_clock(headers, rejected):
    receipt = datetime(2026, 11, 12, 5, tzinfo=UTC)
    client = AsyncMock()
    client.fetch_bytes.return_value = AmarStockHttpResponse(body=_pack(), status=200,
        content_type="application/x-msgpack", headers=headers, received_at=receipt)
    source = AmarStockMarketSnapshotSource(base_url="https://example.test", snapshot_path="/fixture",
        max_retries=1, retry_delay_seconds=0, max_response_bytes=1_000_000,
        max_last_modified_age_days=7, client=client)
    if rejected:
        with pytest.raises(MarketSnapshotValidationError):
            await source.fetch_daily_prices(date(2026, 11, 12))
        assert source.last_snapshot is None
    else:
        prices = await source.fetch_daily_prices(date(2026, 11, 12))
        assert all(row.trade_date == date(2026, 11, 12) for row in prices)
        assert all(row.batch_fetched_at == receipt and row.source_observed_at is None for row in prices)


@pytest.mark.parametrize("headers", [{"last-modified": "Thu, 12 Nov 2026 18:10:00 GMT"},
    {"date": "Thu, 12 Nov 2026 18:10:00 GMT"},
    {"date": "Thu, 12 Nov 2026 18:10:00 GMT", "last-modified": "Thu, 12 Nov 2026 18:10:00 GMT"}])
@pytest.mark.asyncio
async def test_after_midnight_capture_preserves_requested_historical_session(headers):
    client = AsyncMock()
    receipt = datetime(2026, 11, 12, 18, 30, tzinfo=UTC)  # Nov13 00:30 Dhaka
    client.fetch_bytes.return_value = AmarStockHttpResponse(body=_pack(), status=200,
        content_type="application/x-msgpack", received_at=receipt,
        headers=headers)
    source = AmarStockMarketSnapshotSource(base_url="https://example.test", snapshot_path="/fixture",
        max_retries=1, retry_delay_seconds=0, max_response_bytes=1_000_000,
        max_last_modified_age_days=7, client=client)
    rows = await source.fetch_daily_prices(date(2026, 11, 12))
    assert rows[0].trade_date == date(2026, 11, 12)
    assert rows[0].source_observed_at is None
    assert rows[0].batch_fetched_at == receipt
