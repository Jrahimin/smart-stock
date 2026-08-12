"""AmarStock bulk current-market feed used for stock-details enrichment.

The browser's current Latest Share Price bundle resolves ``LatestPrice`` through
the full-market structured snapshot.  It is a columnar mapping, not the former
``/LatestPrice/{token}`` JSON list.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from zoneinfo import ZoneInfo

from app.core.core_config import Settings
from app.core.enums import DataQualityFlag
from app.jobs.ingestion.amarstock_http_client import AmarStockHttpClient
from app.jobs.ingestion.amarstock_turnover import normalize_amarstock_turnover_text
from app.jobs.ingestion.ingestion_source_base import IngestedDailyPrice

DHAKA_TZ = ZoneInfo("Asia/Dhaka")

# Current column names observed in AmarStock's latest-share-price bundle and
# confirmed against the 2026-08-12 HAR.  Keep this mapping local to the optional
# stock-details enrichment path; primary market-snapshot validation owns the
# required OHLCV contract separately.
_COLUMNAR_FIELD_NAMES = {
    "aa": "Scrip",
    "ab": "FullName",
    "ad": "Volume",
    "aj": "YCP",
    "ak": "MarketCap",
    "an": "Change",
    "ap": "AuthorizedCap",
    "aq": "PaidUpCap",
    "ar": "TotalSecurities",
    "at": "ReserveSurplus",
    "av": "MarketCategory",
    "ay": "SponsorDirector",
    "az": "Govt",
    "ba": "Institute",
    "bb": "Foreign",
    "bc": "Public",
    "bz": "ChangePer",
    "cb": "EPS",
    "cc": "AuditedPE",
    "cd": "UnAuditedPE",
    "ce": "Q1Eps",
    "cf": "Q2Eps",
    "cg": "Q3Eps",
    "ch": "Q4Eps",
    "ci": "NAV",
    "cj": "NavPrice",
    "ck": "freefloat",
    "cm": "DividentYield",
    "dp": "BusinessSegment",
    "ea": "LTP",
    "eb": "Open",
    "ec": "High",
    "ed": "Low",
    "ee": "Close",
    "eh": "Trade",
    "ei": "Value",
    "ej": "PE",
    "ek": "FreeFloat",
    "en": "Eps",
    "ff": "OpenChangePer",
    "fg": "VolChangePer",
}


@dataclass(frozen=True)
class AmarStockLatestPriceRow:
    raw: dict[str, Any]
    scrip: str
    created_on_ms: int | None
    ltp: Decimal | None
    close: Decimal | None
    open_price: Decimal | None
    high_price: Decimal | None
    low_price: Decimal | None
    ycp: Decimal | None
    volume: int | None
    trade: int | None
    value_turnover_millions_raw: str | None
    pe: Decimal | None
    market_cap: Decimal | None
    nav: Decimal | None
    sponsor_director: Decimal | None
    government: Decimal | None
    institute: Decimal | None
    foreign: Decimal | None
    public_pct: Decimal | None
    free_float: Decimal | None
    total_securities: int | None
    reserve_surplus: Decimal | None
    business_segment: str | None
    market_category: str | None
    full_name: str | None
    paid_up_cap: Decimal | None
    eps: Decimal | None
    q1_eps: Decimal | None
    q2_eps: Decimal | None
    q3_eps: Decimal | None
    q4_eps: Decimal | None
    vol_change_per: Decimal | None
    open_change_per: Decimal | None
    change_per: Decimal | None


class AmarStockLatestPriceApiSource:
    source_name = "AMARSTOCK_LATEST_PRICE_API"

    def __init__(
        self,
        *,
        base_url: str,
        market_snapshot_path: str,
        max_retries: int,
        retry_delay_seconds: float,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._market_snapshot_path = "/" + market_snapshot_path.strip().strip("/")
        self._client = AmarStockHttpClient(
            max_retries=max_retries,
            retry_delay_seconds=retry_delay_seconds,
        )

    @classmethod
    def from_settings(cls, settings: Settings) -> AmarStockLatestPriceApiSource:
        return cls(
            base_url=settings.amarstock_api_base_url,
            market_snapshot_path=settings.amarstock_market_snapshot_path,
            max_retries=settings.amarstock_bulk_api_max_retries,
            retry_delay_seconds=settings.amarstock_bulk_api_retry_delay_seconds,
        )

    def build_url(self) -> str:
        return f"{self._base_url}{self._market_snapshot_path}"

    async def fetch_all_rows(self) -> list[AmarStockLatestPriceRow]:
        data = await self._client.fetch_structured(self.build_url(), source_name=self.source_name)
        rows = _decode_columnar_rows(data)
        parsed_rows = (_parse_row(row) for row in rows)
        return [row for row in parsed_rows if row is not None]

    async def fetch_by_scrip(self) -> dict[str, AmarStockLatestPriceRow]:
        rows = await self.fetch_all_rows()
        return {row.scrip.upper(): row for row in rows}


def _parse_row(row: dict[str, Any]) -> AmarStockLatestPriceRow | None:
    scrip = str(row.get("Scrip") or "").strip().upper()
    if not scrip:
        return None
    value_raw = row.get("Value")
    value_str = None if value_raw is None else str(value_raw).strip()
    return AmarStockLatestPriceRow(
        raw=row,
        scrip=scrip,
        created_on_ms=_aspnet_ms(row.get("CreatedOn")),
        ltp=_to_decimal(row.get("LTP")),
        close=_to_decimal(row.get("Close")),
        open_price=_to_decimal(row.get("Open")),
        high_price=_to_decimal(row.get("High")),
        low_price=_to_decimal(row.get("Low")),
        ycp=_to_decimal(row.get("YCP")),
        volume=_to_int(row.get("Volume")),
        trade=_to_int(row.get("Trade")),
        value_turnover_millions_raw=value_str,
        pe=_to_decimal(row.get("PE")),
        market_cap=_to_decimal(row.get("MarketCap")),
        nav=_to_decimal(row.get("NAV")),
        sponsor_director=_to_decimal(row.get("SponsorDirector")),
        government=_to_decimal(row.get("Govt")),
        institute=_to_decimal(row.get("Institute")),
        foreign=_to_decimal(row.get("Foreign")),
        public_pct=_to_decimal(row.get("Public")),
        free_float=_first_decimal(row, "FreeFloat", "freefloat"),
        total_securities=_to_int(row.get("TotalSecurities")),
        reserve_surplus=_to_decimal(row.get("ReserveSurplus")),
        business_segment=_clean_text(row.get("BusinessSegment")),
        market_category=_clean_text(row.get("MarketCategory")),
        full_name=_clean_text(row.get("FullName")),
        paid_up_cap=_to_decimal(row.get("PaidUpCap")),
        eps=_first_decimal(row, "Eps", "EPS"),
        q1_eps=_to_decimal(row.get("Q1Eps")),
        q2_eps=_to_decimal(row.get("Q2Eps")),
        q3_eps=_to_decimal(row.get("Q3Eps")),
        q4_eps=_to_decimal(row.get("Q4Eps")),
        vol_change_per=_to_decimal(row.get("VolChangePer")),
        open_change_per=_to_decimal(row.get("OpenChangePer")),
        change_per=_to_decimal(row.get("ChangePer")),
    )


def latest_price_snapshot_date(row: AmarStockLatestPriceRow, *, fallback: date) -> date:
    if row.created_on_ms is not None:
        try:
            return datetime.fromtimestamp(row.created_on_ms / 1000, tz=DHAKA_TZ).date()
        except (OSError, ValueError, OverflowError):
            pass
    return fallback


def _decode_columnar_rows(data: Any) -> list[dict[str, Any]]:
    if not isinstance(data, dict):
        raise ValueError("AmarStock current-market payload must be a columnar mapping")

    symbols = data.get("aa")
    if not isinstance(symbols, list) or not symbols:
        raise ValueError("AmarStock current-market payload is missing non-empty symbol column 'aa'")

    row_count = len(symbols)
    columns: dict[str, list[Any]] = {}
    for source_key, target_key in _COLUMNAR_FIELD_NAMES.items():
        values = data.get(source_key)
        if values is None:
            continue
        if not isinstance(values, list):
            raise ValueError(f"AmarStock current-market field {source_key!r} must be an array")
        if len(values) != row_count:
            raise ValueError(
                "AmarStock current-market arrays have unequal lengths: "
                f"aa={row_count} {source_key}={len(values)}"
            )
        columns[target_key] = values

    rows: list[dict[str, Any]] = []
    for index in range(row_count):
        row = {target_key: values[index] for target_key, values in columns.items()}
        _add_snapshot_compatibility_aliases(row)
        rows.append(row)
    return rows


def _add_snapshot_compatibility_aliases(row: dict[str, Any]) -> None:
    """Expose current full-market fields under the old detail-snapshot names."""
    for target_key, source_key in (
        ("ClosePrice", "Close"),
        ("AuditedPE", "PE"),
        ("NavPrice", "NAV"),
        ("EPS", "Eps"),
        ("freefloat", "FreeFloat"),
    ):
        if row.get(target_key) is None and row.get(source_key) is not None:
            row[target_key] = row[source_key]


def row_to_ingested_daily_price(
    row: AmarStockLatestPriceRow,
    *,
    trade_date: date,
    source_name: str = AmarStockLatestPriceApiSource.source_name,
) -> IngestedDailyPrice | None:
    close_price = row.close if row.close is not None else row.ltp
    if close_price is None or close_price <= 0:
        return None

    source_open = row.open_price
    previous_close_price = row.ycp
    high_price = row.high_price
    low_price = row.low_price
    volume = row.volume
    trade_count = row.trade
    turnover = turnover_decimal_from_latest_price_row(row)

    is_partial = any(
        value is None
        for value in (
            source_open,
            high_price,
            low_price,
            previous_close_price,
            volume,
            trade_count,
            turnover,
        )
    )
    high_price = high_price or close_price
    low_price = low_price or close_price
    open_price = source_open or previous_close_price or close_price

    return IngestedDailyPrice(
        symbol=row.scrip,
        trade_date=trade_date,
        open_price=open_price,
        high_price=high_price,
        low_price=low_price,
        close_price=close_price,
        adjusted_close_price=None,
        previous_close_price=previous_close_price,
        volume=volume or 0,
        trade_count=trade_count,
        turnover=turnover,
        source=source_name,
        data_quality_flag=DataQualityFlag.PARTIAL if is_partial else DataQualityFlag.OK,
    )


def turnover_decimal_from_latest_price_row(row: AmarStockLatestPriceRow) -> Decimal | None:
    if not row.value_turnover_millions_raw:
        return None
    return normalize_amarstock_turnover_text(row.value_turnover_millions_raw)


def _aspnet_ms(value: Any) -> int | None:
    if value is None:
        return None
    match = re.search(r"/Date\((\d+)\)/", str(value))
    if match is None:
        return None
    try:
        return int(match.group(1))
    except ValueError:
        return None


def _to_decimal(value: Any) -> Decimal | None:
    if value is None:
        return None
    try:
        text = str(value).replace(",", "").strip()
        if text in {"", "-", "--", "N/A"}:
            return None
        return Decimal(text)
    except Exception:
        return None


def _first_decimal(row: dict[str, Any], *keys: str) -> Decimal | None:
    for key in keys:
        value = _to_decimal(row.get(key))
        if value is not None:
            return value
    return None


def _to_int(value: Any) -> int | None:
    d = _to_decimal(value)
    if d is None:
        return None
    try:
        return int(d)
    except Exception:
        return None


def _clean_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None
