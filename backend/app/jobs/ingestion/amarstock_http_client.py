"""HTTP transport for AmarStock public endpoints with contract-aware retries."""

from __future__ import annotations

import asyncio
import gzip
import json
import logging
import random
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from io import BytesIO
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import msgpack  # type: ignore[import-not-found, import-untyped]

logger = logging.getLogger(__name__)

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)
NON_RETRYABLE_HTTP_STATUSES = {400, 401, 403, 404}


@dataclass(frozen=True)
class AmarStockHttpResponse:
    body: bytes
    status: int
    content_type: str
    headers: Mapping[str, str]


class AmarStockHttpError(RuntimeError):
    def __init__(self, message: str, *, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


class AmarStockContractError(AmarStockHttpError):
    """The endpoint responded, but not with the requested source contract."""


class AmarStockJsonDecodeError(AmarStockContractError):
    """The response body is not valid UTF-8 JSON."""


class AmarStockMessagePackDecodeError(AmarStockContractError):
    """The response body is not valid MessagePack."""


class AmarStockUnsupportedPayloadError(AmarStockContractError):
    """Neither supported AmarStock structured-response decoder accepted the body."""

    def __init__(
        self,
        message: str,
        *,
        json_error: AmarStockJsonDecodeError,
        msgpack_error: AmarStockMessagePackDecodeError,
    ) -> None:
        super().__init__(message)
        self.json_error = json_error
        self.msgpack_error = msgpack_error


@dataclass(frozen=True)
class AmarStockDecodedPayload:
    payload: Any
    decoder: str


class AmarStockHttpClient:
    def __init__(self, *, max_retries: int, retry_delay_seconds: float) -> None:
        self.max_retries = max_retries
        self.retry_delay_seconds = retry_delay_seconds

    async def fetch_structured(
        self,
        url: str,
        *,
        source_name: str = "AMARSTOCK_STRUCTURED_API",
    ) -> Any:
        """Fetch once and decode JSON first, with MessagePack as transport fallback."""
        endpoint_path = _endpoint_path(url)
        response = await self.fetch_bytes(
            url,
            accept="application/json, application/x-msgpack;q=0.9, */*;q=0.5",
            expected_content_type=None,
            max_response_bytes=10_000_000,
            source_name=source_name,
            endpoint_path=endpoint_path,
        )
        try:
            decoded = decode_structured_payload(response.body, response.content_type)
        except AmarStockUnsupportedPayloadError:
            logger.warning(
                "AmarStock structured payload decode failed: source=%s endpoint=%s "
                "status=%s content_type=%s",
                source_name,
                endpoint_path,
                response.status,
                response.content_type or "missing",
            )
            raise
        _log_successful_decoder(
            decoded,
            source_name=source_name,
            endpoint_path=endpoint_path,
            response=response,
        )
        return decoded.payload

    async def fetch_json(
        self,
        url: str,
        *,
        source_name: str = "AMARSTOCK_STRUCTURED_API",
    ) -> Any:
        """Compatibility wrapper for callers written before MessagePack fallback."""
        return await self.fetch_structured(url, source_name=source_name)

    async def fetch_bytes(
        self,
        url: str,
        *,
        accept: str,
        expected_content_type: str | None,
        max_response_bytes: int,
        source_name: str,
        endpoint_path: str,
        referer: str | None = None,
        allow_json_content_type_variants: bool = False,
    ) -> AmarStockHttpResponse:
        last_error: BaseException | None = None
        last_status: int | None = None
        for attempt in range(1, self.max_retries + 1):
            try:
                return await asyncio.to_thread(
                    self._fetch_bytes,
                    url,
                    accept=accept,
                    referer=referer,
                    expected_content_type=expected_content_type,
                    max_response_bytes=max_response_bytes,
                    allow_json_content_type_variants=allow_json_content_type_variants,
                )
            except HTTPError as exc:
                last_error = exc
                status = exc.code
                last_status = status
                retryable = status == 429 or status == 408 or 500 <= status <= 599
                logger.warning(
                    "AmarStock fetch failed: source=%s endpoint_path=%s status=%s attempt=%s/%s",
                    source_name,
                    endpoint_path,
                    status,
                    attempt,
                    self.max_retries,
                )
                if status in NON_RETRYABLE_HTTP_STATUSES or not retryable:
                    raise AmarStockHttpError(
                        f"AmarStock upstream HTTP {status}: source={source_name} "
                        f"endpoint_path={endpoint_path}",
                        status=status,
                    ) from exc
                if attempt < self.max_retries:
                    await asyncio.sleep(self._retry_delay(attempt, exc))
            except AmarStockContractError as exc:
                logger.warning(
                    "AmarStock contract validation failed: source=%s endpoint_path=%s "
                    "status=%s error=%s",
                    source_name,
                    endpoint_path,
                    exc.status,
                    exc,
                )
                raise
            except (TimeoutError, ConnectionResetError, URLError, OSError) as exc:
                last_error = exc
                last_status = None
                logger.warning(
                    "AmarStock transient fetch failure: source=%s endpoint_path=%s "
                    "status=unavailable attempt=%s/%s error_type=%s",
                    source_name,
                    endpoint_path,
                    attempt,
                    self.max_retries,
                    type(exc).__name__,
                )
                if attempt < self.max_retries:
                    await asyncio.sleep(self._retry_delay(attempt, None))

        raise AmarStockHttpError(
            "AmarStock fetch failed after retries: "
            f"source={source_name} endpoint_path={endpoint_path} status={last_status}",
            status=last_status,
        ) from last_error

    def _fetch_bytes(
        self,
        url: str,
        *,
        accept: str,
        referer: str | None,
        expected_content_type: str | None,
        max_response_bytes: int,
        allow_json_content_type_variants: bool,
    ) -> AmarStockHttpResponse:
        headers = {"User-Agent": USER_AGENT, "Accept": accept, "Accept-Encoding": "gzip"}
        if referer:
            headers["Referer"] = referer
        request = Request(url, headers=headers)
        with urlopen(request, timeout=25) as response:
            raw_content_type = (response.headers.get("Content-Type") or "").strip()
            content_type = _normalized_content_type(raw_content_type)
            if expected_content_type is not None and not _content_type_matches(
                content_type,
                expected_content_type,
                allow_json_variants=allow_json_content_type_variants,
            ):
                raise AmarStockContractError(
                    f"Unexpected AmarStock content type {content_type!r}; "
                    f"expected {expected_content_type!r}",
                    status=response.status,
                )
            body = response.read(max_response_bytes + 1)
            if len(body) > max_response_bytes:
                raise AmarStockContractError(
                    f"AmarStock response exceeded {max_response_bytes} bytes",
                    status=response.status,
                )
            if response.headers.get("Content-Encoding", "").lower() == "gzip":
                try:
                    with gzip.GzipFile(fileobj=BytesIO(body)) as compressed:
                        body = compressed.read(max_response_bytes + 1)
                except (gzip.BadGzipFile, EOFError, OSError) as exc:
                    raise AmarStockContractError("Invalid gzip response from AmarStock") from exc
                if len(body) > max_response_bytes:
                    raise AmarStockContractError(
                        f"Decompressed AmarStock response exceeded {max_response_bytes} bytes",
                        status=response.status,
                    )
            return AmarStockHttpResponse(
                body=body,
                status=response.status,
                content_type=raw_content_type,
                headers={key.lower(): value for key, value in response.headers.items()},
            )

    def _retry_delay(self, attempt: int, error: HTTPError | None) -> float:
        if error is not None and error.code == 429:
            retry_after = _parse_retry_after(error.headers.get("Retry-After"))
            if retry_after is not None:
                return retry_after
        return self.retry_delay_seconds * (2 ** (attempt - 1)) + random.random()


def _content_type_matches(actual: str, expected: str, *, allow_json_variants: bool) -> bool:
    if actual == expected:
        return True
    return allow_json_variants and expected == "application/json" and actual.endswith("+json")


def decode_json(body: bytes) -> Any:
    try:
        return json.loads(body.decode("utf-8", errors="strict"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise AmarStockJsonDecodeError("AmarStock JSON response could not be decoded") from exc


def decode_msgpack(body: bytes) -> Any:
    try:
        return msgpack.unpackb(body, raw=False, strict_map_key=False)
    except (msgpack.ExtraData, msgpack.FormatError, msgpack.StackError, ValueError) as exc:
        raise AmarStockMessagePackDecodeError(
            "AmarStock MessagePack response could not be decoded"
        ) from exc


def decode_structured_payload(
    body: bytes,
    content_type: str | None = None,
) -> AmarStockDecodedPayload:
    """Decode one AmarStock response body, preferring JSON regardless of Content-Type."""
    del content_type  # Advisory only; callers retain and log it.
    try:
        return AmarStockDecodedPayload(payload=decode_json(body), decoder="json")
    except AmarStockJsonDecodeError as json_error:
        try:
            return AmarStockDecodedPayload(payload=decode_msgpack(body), decoder="msgpack")
        except AmarStockMessagePackDecodeError as msgpack_error:
            raise AmarStockUnsupportedPayloadError(
                "AmarStock response is neither valid JSON nor valid MessagePack",
                json_error=json_error,
                msgpack_error=msgpack_error,
            ) from msgpack_error


def log_structured_decoder(
    decoded: AmarStockDecodedPayload,
    *,
    source_name: str,
    endpoint_path: str,
    response: AmarStockHttpResponse,
) -> None:
    _log_successful_decoder(
        decoded,
        source_name=source_name,
        endpoint_path=endpoint_path,
        response=response,
    )


def _log_successful_decoder(
    decoded: AmarStockDecodedPayload,
    *,
    source_name: str,
    endpoint_path: str,
    response: AmarStockHttpResponse,
) -> None:
    metadata = (
        source_name,
        endpoint_path,
        response.status,
        response.content_type or "missing",
        decoded.decoder,
    )
    if decoded.decoder == "msgpack":
        logger.info(
            "AmarStock JSON decode failed; MessagePack fallback succeeded: "
            "source=%s endpoint=%s status=%s content_type=%s decoder=%s",
            *metadata,
        )
        return
    logger.info(
        "AmarStock structured payload decoded: source=%s endpoint=%s status=%s "
        "content_type=%s decoder=%s",
        *metadata,
    )


def _normalized_content_type(value: str | None) -> str:
    if not value:
        return ""
    return value.split(";", 1)[0].strip().lower()


def _parse_retry_after(value: str | None) -> float | None:
    if not value:
        return None
    try:
        return max(0.0, float(value))
    except ValueError:
        try:
            retry_at = parsedate_to_datetime(value)
        except (TypeError, ValueError, OverflowError):
            return None
        if retry_at.tzinfo is None:
            retry_at = retry_at.replace(tzinfo=UTC)
        return max(0.0, (retry_at - datetime.now(UTC)).total_seconds())


def _endpoint_path(url: str) -> str:
    marker = "://"
    remainder = url.split(marker, 1)[-1]
    slash = remainder.find("/")
    return remainder[slash:] if slash >= 0 else "/"
