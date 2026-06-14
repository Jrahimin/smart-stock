"""AmarStock bulk LatestPrice JSON feed (`/LatestPrice/{token}`)."""

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
        latest_price_token: str,
        max_retries: int,
        retry_delay_seconds: float,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._token = latest_price_token.strip().strip("/")
        self._client = AmarStockHttpClient(
            max_retries=max_retries,
            retry_delay_seconds=retry_delay_seconds,
        )

    @classmethod
    def from_settings(cls, settings: Settings) -> AmarStockLatestPriceApiSource:
        return cls(
            base_url=settings.amarstock_api_base_url,
            latest_price_token=settings.amarstock_latest_price_token,
            max_retries=settings.amarstock_bulk_api_max_retries,
            retry_delay_seconds=settings.amarstock_bulk_api_retry_delay_seconds,
        )

    def build_url(self) -> str:
        return f"{self._base_url}/LatestPrice/{self._token}"

    async def fetch_all_rows(self) -> list[AmarStockLatestPriceRow]:
        data = await self._client.fetch_json(self.build_url())
        if not isinstance(data, list):
            return []
        return [r for r in (_parse_row(dict(row)) for row in data if isinstance(row, dict)) if r is not None]

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
        free_float=_to_decimal(row.get("FreeFloat")),
        total_securities=_to_int(row.get("TotalSecurities")),
        reserve_surplus=_to_decimal(row.get("ReserveSurplus")),
        business_segment=_clean_text(row.get("BusinessSegment")),
        market_category=_clean_text(row.get("MarketCategory")),
        full_name=_clean_text(row.get("FullName")),
        paid_up_cap=_to_decimal(row.get("PaidUpCap")),
        eps=_to_decimal(row.get("Eps")),
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
