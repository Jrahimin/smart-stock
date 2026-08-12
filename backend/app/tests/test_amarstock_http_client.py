from __future__ import annotations

import gzip
import json
import logging
from email.message import Message
from urllib.error import HTTPError

import msgpack
import pytest

from app.jobs.ingestion.amarstock_http_client import (
    AmarStockHttpClient,
    AmarStockHttpError,
    AmarStockHttpResponse,
    AmarStockUnsupportedPayloadError,
    decode_structured_payload,
)


class _FakeResponse:
    def __init__(
        self,
        body: bytes,
        *,
        content_type: str | None = "application/x-msgpack",
        content_encoding: str | None = "gzip",
    ) -> None:
        self.status = 200
        self.headers = Message()
        if content_type is not None:
            self.headers["Content-Type"] = content_type
        if content_encoding is not None:
            self.headers["Content-Encoding"] = content_encoding
        self._body = body

    def __enter__(self) -> _FakeResponse:
        return self

    def __exit__(self, *args: object) -> None:
        return None

    def read(self, _limit: int) -> bytes:
        return self._body


def test_fetch_bytes_decompresses_gzip_and_requires_msgpack(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = AmarStockHttpClient(max_retries=1, retry_delay_seconds=0)
    compressed = gzip.compress(b"messagepack-body")
    monkeypatch.setattr(
        "app.jobs.ingestion.amarstock_http_client.urlopen",
        lambda *_args, **_kwargs: _FakeResponse(compressed),
    )

    response = client._fetch_bytes(
        "https://example.test/hash",
        accept="application/x-msgpack",
        referer="https://example.test/latest-share-price",
        expected_content_type="application/x-msgpack",
        max_response_bytes=1000,
        allow_json_content_type_variants=False,
    )

    assert response.body == b"messagepack-body"


@pytest.mark.parametrize(
    ("body", "content_type", "expected", "expected_decoder"),
    [
        pytest.param(
            json.dumps({"format": "json"}).encode(),
            "application/json; charset=utf-8",
            {"format": "json"},
            "json",
            id="gzip-json",
        ),
        pytest.param(
            msgpack.packb({"format": "msgpack"}, use_bin_type=True),
            "application/x-msgpack",
            {"format": "msgpack"},
            "msgpack",
            id="gzip-msgpack-single-request-fallback",
        ),
    ],
)
@pytest.mark.asyncio
async def test_fetch_json_decodes_gzip_structured_payload_with_one_request(
    body: bytes,
    content_type: str,
    expected: dict[str, str],
    expected_decoder: str,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.INFO)
    client = AmarStockHttpClient(max_retries=1, retry_delay_seconds=0)
    requests = 0

    def fake_urlopen(*_args: object, **_kwargs: object) -> _FakeResponse:
        nonlocal requests
        requests += 1
        return _FakeResponse(gzip.compress(body), content_type=content_type)

    monkeypatch.setattr("app.jobs.ingestion.amarstock_http_client.urlopen", fake_urlopen)

    payload = await client.fetch_json("https://example.test/Info/DSE")

    assert payload == expected
    assert requests == 1
    assert f"decoder={expected_decoder}" in caplog.text


def test_corrupt_payload_reports_both_decoder_failures() -> None:
    with pytest.raises(AmarStockUnsupportedPayloadError) as exc_info:
        decode_structured_payload(b"\xc1", "application/octet-stream")

    assert exc_info.value.json_error.__cause__ is not None
    assert exc_info.value.msgpack_error.__cause__ is not None


def test_retry_after_is_respected_for_429() -> None:
    client = AmarStockHttpClient(max_retries=3, retry_delay_seconds=1)
    headers = Message()
    headers["Retry-After"] = "12"
    error = HTTPError("https://example.test/hash", 429, "Limited", headers, None)

    assert client._retry_delay(1, error) == 12


@pytest.mark.asyncio
async def test_http_404_is_attempted_once(monkeypatch: pytest.MonkeyPatch) -> None:
    client = AmarStockHttpClient(max_retries=3, retry_delay_seconds=0)
    attempts = 0

    def fail(*args: object, **kwargs: object) -> AmarStockHttpResponse:
        nonlocal attempts
        attempts += 1
        raise HTTPError("https://example.test/hash", 404, "Not Found", Message(), None)

    monkeypatch.setattr(client, "_fetch_bytes", fail)

    with pytest.raises(AmarStockHttpError) as exc_info:
        await client.fetch_bytes(
            "https://example.test/hash",
            accept="application/x-msgpack",
            expected_content_type="application/x-msgpack",
            max_response_bytes=1000,
            source_name="AMARSTOCK_MARKET_MSGPACK",
            endpoint_path="/hash",
        )

    assert exc_info.value.status == 404
    assert attempts == 1


@pytest.mark.asyncio
async def test_transient_5xx_is_retried(monkeypatch: pytest.MonkeyPatch) -> None:
    client = AmarStockHttpClient(max_retries=3, retry_delay_seconds=0)
    attempts = 0
    expected = AmarStockHttpResponse(
        body=b"ok",
        status=200,
        content_type="application/x-msgpack",
        headers={},
    )

    def eventually_succeed(*args: object, **kwargs: object) -> AmarStockHttpResponse:
        nonlocal attempts
        attempts += 1
        if attempts < 3:
            raise HTTPError("https://example.test/hash", 503, "Unavailable", Message(), None)
        return expected

    async def no_sleep(_seconds: float) -> None:
        return None

    monkeypatch.setattr(client, "_fetch_bytes", eventually_succeed)
    monkeypatch.setattr("app.jobs.ingestion.amarstock_http_client.asyncio.sleep", no_sleep)

    response = await client.fetch_bytes(
        "https://example.test/hash",
        accept="application/x-msgpack",
        expected_content_type="application/x-msgpack",
        max_response_bytes=1000,
        source_name="AMARSTOCK_MARKET_MSGPACK",
        endpoint_path="/hash",
    )

    assert response is expected
    assert attempts == 3


@pytest.mark.asyncio
async def test_exhausted_5xx_preserves_last_upstream_status(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = AmarStockHttpClient(max_retries=2, retry_delay_seconds=0)

    def fail(*args: object, **kwargs: object) -> AmarStockHttpResponse:
        raise HTTPError("https://example.test/hash", 503, "Unavailable", Message(), None)

    async def no_sleep(_seconds: float) -> None:
        return None

    monkeypatch.setattr(client, "_fetch_bytes", fail)
    monkeypatch.setattr("app.jobs.ingestion.amarstock_http_client.asyncio.sleep", no_sleep)

    with pytest.raises(AmarStockHttpError) as exc_info:
        await client.fetch_bytes(
            "https://example.test/hash",
            accept="application/x-msgpack",
            expected_content_type="application/x-msgpack",
            max_response_bytes=1000,
            source_name="AMARSTOCK_MARKET_MSGPACK",
            endpoint_path="/hash",
        )

    assert exc_info.value.status == 503
    assert "status=503" in str(exc_info.value)
