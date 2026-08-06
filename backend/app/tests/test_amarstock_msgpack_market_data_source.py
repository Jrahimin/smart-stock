from __future__ import annotations

from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock

import msgpack
import pytest

from app.core.enums import DataQualityFlag
from app.jobs.ingestion.amarstock_http_client import AmarStockHttpResponse
from app.jobs.ingestion.amarstock_msgpack_market_data_source import (
    AmarStockMsgpackMarketDataSource,
    MarketSnapshotValidationError,
    decode_amarstock_msgpack_snapshot,
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


def test_decode_maps_columns_turnover_and_ltp_close_semantics() -> None:
    snapshot = decode_amarstock_msgpack_snapshot(_pack())

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
    snapshot = decode_amarstock_msgpack_snapshot(
        _pack(
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
    zero_low_snapshot = decode_amarstock_msgpack_snapshot(
        _pack(ec=[1, 94], ed=[0, 90])
    )
    assert zero_low_snapshot.rows[0].high_price == 1
    zero_high_snapshot = decode_amarstock_msgpack_snapshot(
        _pack(ec=[0, 94], ed=[1, 90])
    )
    assert zero_high_snapshot.rows[0].low_price == 1

    with pytest.raises(MarketSnapshotValidationError, match="partial publication refused"):
        decode_amarstock_msgpack_snapshot(_pack(ec=[1, 94], ed=[2, 90]))


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
    packed = msgpack.packb(payload, use_bin_type=True)
    with pytest.raises(MarketSnapshotValidationError, match=message):
        decode_amarstock_msgpack_snapshot(packed)


def test_corrupt_messagepack_is_rejected() -> None:
    with pytest.raises(MarketSnapshotValidationError, match="Corrupt"):
        decode_amarstock_msgpack_snapshot(b"\xc1")


@pytest.mark.asyncio
async def test_source_sends_contract_headers_and_exposes_raw_coverage_symbols() -> None:
    client = AsyncMock()
    client.fetch_bytes.return_value = AmarStockHttpResponse(
        body=_pack(),
        status=200,
        content_type="application/x-msgpack",
        headers={},
    )
    source = AmarStockMsgpackMarketDataSource(
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
    kwargs = client.fetch_bytes.await_args.kwargs
    assert kwargs["expected_content_type"] == "application/x-msgpack"
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
    source = AmarStockMsgpackMarketDataSource(
        base_url="https://www.amarstock.com",
        snapshot_path="/opaque-hash",
        max_retries=1,
        retry_delay_seconds=0,
        max_response_bytes=1_000_000,
        max_last_modified_age_days=7,
        client=client,
    )

    with pytest.raises(MarketSnapshotValidationError, match="too old"):
        await source.fetch_daily_prices(date(2026, 8, 6))
