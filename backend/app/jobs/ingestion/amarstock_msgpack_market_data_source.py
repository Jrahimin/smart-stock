"""Full-market AmarStock snapshot source with transport-neutral validation."""

from __future__ import annotations

import logging
from collections import Counter
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from email.utils import parsedate_to_datetime
from typing import Any

from app.core.core_config import Settings
from app.core.enums import DataQualityFlag
from app.jobs.ingestion.amarstock_http_client import (
    AmarStockHttpClient,
    AmarStockHttpResponse,
    decode_structured_payload,
    log_structured_decoder,
)
from app.jobs.ingestion.ingestion_source_base import IngestedDailyPrice, MarketDataSource

logger = logging.getLogger(__name__)

REQUIRED_FIELDS = ("aa", "ea", "eb", "ec", "ed", "ee", "aj", "an", "bz", "ad", "eh", "ei")
TURNOVER_MILLIONS_TO_BDT = Decimal("1000000")


class MarketSnapshotValidationError(RuntimeError):
    """The decoded snapshot is structurally or numerically unsafe to publish."""


@dataclass(frozen=True)
class AmarStockMarketSnapshotRow:
    raw_symbol: str
    symbol: str
    ltp: Decimal
    source_close: Decimal
    open_price: Decimal
    high_price: Decimal
    low_price: Decimal
    previous_close_price: Decimal
    change: Decimal
    change_percent: Decimal
    volume: int
    trade_count: int
    turnover_millions: Decimal

    def to_ingested_price(self, *, trade_date: date, source_name: str) -> IngestedDailyPrice:
        close_price = self.ltp if self.ltp > 0 else self.source_close
        quality = (
            DataQualityFlag.PARTIAL
            if self.ltp <= 0
            or min(self.open_price, self.high_price, self.low_price, close_price) <= 0
            else DataQualityFlag.OK
        )
        return IngestedDailyPrice(
            symbol=self.symbol,
            trade_date=trade_date,
            open_price=self.open_price,
            high_price=self.high_price,
            low_price=self.low_price,
            close_price=close_price,
            adjusted_close_price=None,
            previous_close_price=self.previous_close_price,
            volume=self.volume,
            trade_count=self.trade_count,
            turnover=self.turnover_millions * TURNOVER_MILLIONS_TO_BDT,
            source=source_name,
            data_quality_flag=quality,
        )


@dataclass(frozen=True)
class AmarStockMarketSnapshot:
    rows: tuple[AmarStockMarketSnapshotRow, ...]
    raw_symbols: tuple[str, ...]
    normalized_symbols: frozenset[str]


class AmarStockMarketSnapshotSource(MarketDataSource):
    # Stable persisted provenance value; the transport can be JSON or MessagePack.
    source_name = "AMARSTOCK_MARKET_MSGPACK"

    def __init__(
        self,
        *,
        base_url: str,
        snapshot_path: str,
        max_retries: int,
        retry_delay_seconds: float,
        max_response_bytes: int,
        max_last_modified_age_days: int,
        client: AmarStockHttpClient | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._snapshot_path = f"/{snapshot_path.strip().strip('/')}"
        self._max_response_bytes = max_response_bytes
        self._max_last_modified_age_days = max_last_modified_age_days
        self._client = client or AmarStockHttpClient(
            max_retries=max_retries,
            retry_delay_seconds=retry_delay_seconds,
        )
        self.last_snapshot: AmarStockMarketSnapshot | None = None

    @classmethod
    def from_settings(cls, settings: Settings) -> AmarStockMarketSnapshotSource:
        return cls(
            base_url=settings.amarstock_api_base_url,
            snapshot_path=settings.amarstock_market_snapshot_path,
            max_retries=settings.amarstock_bulk_api_max_retries,
            retry_delay_seconds=settings.amarstock_bulk_api_retry_delay_seconds,
            max_response_bytes=settings.amarstock_market_snapshot_max_response_bytes,
            max_last_modified_age_days=(
                settings.amarstock_market_snapshot_max_last_modified_age_days
            ),
        )

    def build_url(self) -> str:
        return f"{self._base_url}{self._snapshot_path}"

    async def fetch_daily_prices(self, trade_date: date) -> list[IngestedDailyPrice]:
        response = await self._client.fetch_bytes(
            self.build_url(),
            accept="application/json, application/x-msgpack;q=0.9, */*;q=0.5",
            expected_content_type=None,
            max_response_bytes=self._max_response_bytes,
            source_name=self.source_name,
            endpoint_path=self._snapshot_path,
            referer=f"{self._base_url}/latest-share-price",
        )
        self._validate_advisory_freshness(response, trade_date=trade_date)
        decoded = decode_structured_payload(response.body, response.content_type)
        log_structured_decoder(
            decoded,
            source_name=self.source_name,
            endpoint_path=self._snapshot_path,
            response=response,
        )
        try:
            snapshot = decode_amarstock_market_snapshot(decoded.payload)
        except MarketSnapshotValidationError:
            logger.exception(
                "AmarStock market snapshot validation failed: source=%s endpoint_path=%s "
                "decoder=%s content_type=%s",
                self.source_name,
                self._snapshot_path,
                decoded.decoder,
                response.content_type or "missing",
            )
            raise
        self.last_snapshot = snapshot
        prices = [
            row.to_ingested_price(trade_date=trade_date, source_name=self.source_name)
            for row in snapshot.rows
        ]
        ltp_fallback_rows = sum(
            1 for row in snapshot.rows if row.ltp <= 0 < row.source_close
        )
        no_trade_rows = sum(
            1
            for row in snapshot.rows
            if max(row.ltp, row.source_close) <= 0
        )
        ltp_close_difference_rows = sum(
            1
            for row in snapshot.rows
            if row.ltp > 0 and row.source_close > 0 and row.ltp != row.source_close
        )
        logger.info(
            "AmarStock market snapshot accepted: source=%s endpoint_path=%s decoder=%s "
            "content_type=%s status=%s "
            "source_symbols=%s accepted_rows=%s rejected_rows=0 no_trade_rows=%s "
            "ltp_fallback_rows=%s ltp_close_difference_rows=%s",
            self.source_name,
            self._snapshot_path,
            decoded.decoder,
            response.content_type or "missing",
            response.status,
            len(snapshot.normalized_symbols),
            len(prices),
            no_trade_rows,
            ltp_fallback_rows,
            ltp_close_difference_rows,
        )
        return prices

    def coverage_symbols(self, prices: list[IngestedDailyPrice]) -> set[str]:
        if self.last_snapshot is not None:
            return set(self.last_snapshot.normalized_symbols)
        return super().coverage_symbols(prices)

    def _validate_advisory_freshness(
        self,
        response: AmarStockHttpResponse,
        *,
        trade_date: date,
    ) -> None:
        response_date = _parse_http_date(response.headers.get("date"))
        last_modified = _parse_http_date(response.headers.get("last-modified"))
        if last_modified is not None:
            oldest_allowed = trade_date - timedelta(days=self._max_last_modified_age_days)
            if last_modified.date() < oldest_allowed:
                raise MarketSnapshotValidationError(
                    "AmarStock market snapshot Last-Modified is too old: "
                    f"source={self.source_name} endpoint_path={self._snapshot_path} "
                    f"last_modified={last_modified.isoformat()} trade_date={trade_date.isoformat()}"
                )
            if last_modified.date() != trade_date:
                logger.warning(
                    "Advisory AmarStock Last-Modified differs from authoritative session date: "
                    "source=%s endpoint_path=%s header_date=%s session_date=%s",
                    self.source_name,
                    self._snapshot_path,
                    last_modified.date(),
                    trade_date,
                )
        if response_date is not None and response_date.date() != trade_date:
            logger.warning(
                "Advisory AmarStock HTTP Date differs from authoritative session date: "
                "source=%s endpoint_path=%s header_date=%s session_date=%s",
                self.source_name,
                self._snapshot_path,
                response_date.date(),
                trade_date,
            )


def decode_amarstock_market_snapshot(payload: object) -> AmarStockMarketSnapshot:
    if not isinstance(payload, Mapping):
        raise MarketSnapshotValidationError("AmarStock market snapshot must be a mapping")

    missing = [field for field in REQUIRED_FIELDS if field not in payload]
    if missing:
        raise MarketSnapshotValidationError(
            f"AmarStock market snapshot is missing required fields: {', '.join(missing)}"
        )

    columns: dict[str, Sequence[Any]] = {}
    for field in REQUIRED_FIELDS:
        value = payload[field]
        if not isinstance(value, (list, tuple)):
            raise MarketSnapshotValidationError(
                f"AmarStock market snapshot field {field!r} must be an array"
            )
        columns[field] = value

    lengths = {field: len(values) for field, values in columns.items()}
    if len(set(lengths.values())) != 1:
        raise MarketSnapshotValidationError(
            f"AmarStock market snapshot required arrays have unequal lengths: {lengths}"
        )
    row_count = next(iter(lengths.values()))
    if row_count == 0:
        raise MarketSnapshotValidationError("AmarStock market snapshot contains no instruments")

    raw_symbols: list[str] = []
    normalized_symbols: list[str] = []
    for index, value in enumerate(columns["aa"]):
        if not isinstance(value, str):
            raise MarketSnapshotValidationError(f"Invalid symbol type at row {index}")
        raw_symbol = value
        symbol = value.strip().upper()
        if not symbol:
            raise MarketSnapshotValidationError(f"Empty symbol at row {index}")
        raw_symbols.append(raw_symbol)
        normalized_symbols.append(symbol)
    duplicates = sorted(
        symbol for symbol, count in Counter(normalized_symbols).items() if count > 1
    )
    if duplicates:
        raise MarketSnapshotValidationError(
            f"Duplicate normalized AmarStock symbols: {', '.join(duplicates[:10])}"
        )

    rows: list[AmarStockMarketSnapshotRow] = []
    rejected: list[str] = []
    for index, symbol in enumerate(normalized_symbols):
        try:
            row = _decode_row(columns, index=index, raw_symbol=raw_symbols[index], symbol=symbol)
            _validate_normalized_row(row)
            rows.append(row)
        except ValueError as exc:
            rejected.append(f"row={index} symbol={symbol} reason={exc}")
    if rejected:
        reason_counts: dict[str, int] = {}
        for rejection in rejected:
            reason = rejection.rsplit("reason=", 1)[-1]
            reason_counts[reason] = reason_counts.get(reason, 0) + 1
        logger.error(
            "AmarStock market snapshot rows rejected; refusing partial snapshot: "
            "rejected_count=%s reasons=%s examples=%s",
            len(rejected),
            reason_counts,
            rejected[:5],
        )
        raise MarketSnapshotValidationError(
            f"AmarStock market snapshot contains {len(rejected)} invalid rows; "
            "partial publication refused"
        )

    return AmarStockMarketSnapshot(
        rows=tuple(rows),
        raw_symbols=tuple(raw_symbols),
        normalized_symbols=frozenset(normalized_symbols),
    )


def _decode_row(
    columns: Mapping[str, Sequence[Any]],
    *,
    index: int,
    raw_symbol: str,
    symbol: str,
) -> AmarStockMarketSnapshotRow:
    return AmarStockMarketSnapshotRow(
        raw_symbol=raw_symbol,
        symbol=symbol,
        ltp=_decimal(columns["ea"][index], field="ea"),
        open_price=_decimal(columns["eb"][index], field="eb"),
        high_price=_decimal(columns["ec"][index], field="ec"),
        low_price=_decimal(columns["ed"][index], field="ed"),
        source_close=_decimal(columns["ee"][index], field="ee"),
        previous_close_price=_decimal(columns["aj"][index], field="aj"),
        change=_decimal(columns["an"][index], field="an"),
        change_percent=_decimal(columns["bz"][index], field="bz"),
        volume=_integer(columns["ad"][index], field="ad"),
        trade_count=_integer(columns["eh"][index], field="eh"),
        turnover_millions=_decimal(columns["ei"][index], field="ei"),
    )


def _validate_normalized_row(row: AmarStockMarketSnapshotRow) -> None:
    non_negative = {
        "ea": row.ltp,
        "eb": row.open_price,
        "ec": row.high_price,
        "ed": row.low_price,
        "ee": row.source_close,
        "aj": row.previous_close_price,
        "ad": Decimal(row.volume),
        "eh": Decimal(row.trade_count),
        "ei": row.turnover_millions,
    }
    for field, value in non_negative.items():
        if value < 0:
            raise ValueError(f"{field} must not be negative")
    if row.high_price > 0 and row.low_price > 0 and row.high_price < row.low_price:
        raise ValueError("high is below low")


def _decimal(value: Any, *, field: str) -> Decimal:
    if isinstance(value, bool) or value is None:
        raise ValueError(f"{field} must be numeric")
    try:
        parsed = Decimal(str(value).replace(",", "").strip())
    except (InvalidOperation, ValueError, AttributeError) as exc:
        raise ValueError(f"{field} must be numeric") from exc
    if not parsed.is_finite():
        raise ValueError(f"{field} must be finite")
    return parsed


def _integer(value: Any, *, field: str) -> int:
    parsed = _decimal(value, field=field)
    if parsed != parsed.to_integral_value():
        raise ValueError(f"{field} must be an integer")
    return int(parsed)


def _parse_http_date(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = parsedate_to_datetime(value)
    except (TypeError, ValueError, OverflowError):
        logger.warning("Ignoring invalid AmarStock advisory HTTP date header")
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed
