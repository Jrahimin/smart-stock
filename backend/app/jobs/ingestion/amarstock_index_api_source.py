"""AmarStock DSEX index feeds (`/info/DSE` + `/data/index/summery`)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from zoneinfo import ZoneInfo

from app.core.core_config import Settings
from app.jobs.ingestion.amarstock_http_client import AmarStockHttpClient

DHAKA_TZ = ZoneInfo("Asia/Dhaka")


@dataclass(frozen=True)
class AmarStockDsexSnapshot:
    trade_date: date
    index_close: Decimal
    index_change: Decimal
    index_change_percent: Decimal
    day_open: Decimal
    day_high: Decimal
    day_low: Decimal
    range_52w_low: Decimal
    range_52w_high: Decimal
    return_6m_percent: Decimal | None
    return_1y_percent: Decimal | None
    market_status: str
    total_volume: int | None
    total_turnover: Decimal | None
    total_trades: int | None
    advancing_issues: int
    declining_issues: int
    unchanged_issues: int


class AmarStockIndexApiSource:
    source_name = "AMARSTOCK_INDEX_API"

    def __init__(
        self,
        *,
        base_url: str,
        max_retries: int,
        retry_delay_seconds: float,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._client = AmarStockHttpClient(
            max_retries=max_retries,
            retry_delay_seconds=retry_delay_seconds,
        )

    @classmethod
    def from_settings(cls, settings: Settings) -> AmarStockIndexApiSource:
        return cls(
            base_url=settings.amarstock_api_base_url,
            max_retries=settings.amarstock_bulk_api_max_retries,
            retry_delay_seconds=settings.amarstock_bulk_api_retry_delay_seconds,
        )

    async def fetch_dsex_snapshot(self) -> AmarStockDsexSnapshot:
        info, summery = await self._fetch_payloads()
        quote = _as_dict(summery.get("Quote"))
        returns = _as_dict(summery.get("Returns"))
        range_52w = _as_dict(summery.get("Range52Week"))

        index_close = _decimal(info.get("IndexValue")) or _decimal(quote.get("Close"))
        if index_close is None:
            raise RuntimeError("AmarStock DSEX snapshot missing index close")

        index_change = _decimal(info.get("Change"))
        if index_change is None:
            index_change = Decimal("0")

        index_change_percent = _decimal(info.get("ChangePct"))
        if index_change_percent is None:
            index_change_percent = Decimal("0")

        day_open = _decimal(quote.get("Open")) or index_close
        day_high = _decimal(quote.get("High")) or index_close
        day_low = _decimal(quote.get("Low")) or index_close
        range_low = _decimal(range_52w.get("low")) or day_low
        range_high = _decimal(range_52w.get("high")) or day_high

        total_value = _decimal(info.get("TotalValue"))
        total_turnover = total_value * Decimal("1000000") if total_value is not None else None

        return AmarStockDsexSnapshot(
            trade_date=_parse_trade_date(quote.get("DateEpoch"), quote.get("DateString")),
            index_close=index_close,
            index_change=index_change,
            index_change_percent=index_change_percent,
            day_open=day_open,
            day_high=day_high,
            day_low=day_low,
            range_52w_low=range_low,
            range_52w_high=range_high,
            return_6m_percent=_decimal(returns.get("6Month")),
            return_1y_percent=_decimal(returns.get("1Year")),
            market_status=str(info.get("MarketStatus") or "Unknown"),
            total_volume=_int(info.get("TotalVolume")),
            total_turnover=total_turnover,
            total_trades=_int(info.get("TotalTrade")),
            advancing_issues=_int(info.get("Advance")) or 0,
            declining_issues=_int(info.get("Decline")) or 0,
            unchanged_issues=_int(info.get("Unchange")) or 0,
        )

    async def _fetch_payloads(self) -> tuple[dict[str, Any], dict[str, Any]]:
        info = await self._client.fetch_json(f"{self._base_url}/info/DSE")
        summery = await self._client.fetch_json(f"{self._base_url}/data/index/summery")
        if not isinstance(info, dict) or not isinstance(summery, dict):
            raise RuntimeError("AmarStock DSEX snapshot returned unexpected payload")
        return info, summery


def _as_dict(value: object) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _decimal(value: object) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except Exception:
        return None


def _int(value: object) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _parse_trade_date(epoch_ms: object, date_string: object) -> date:
    if epoch_ms is not None:
        try:
            return datetime.fromtimestamp(int(epoch_ms) / 1000, tz=DHAKA_TZ).date()
        except (TypeError, ValueError, OSError):
            pass

    if isinstance(date_string, str):
        for fmt in ("%d/%m/%Y %H:%M:%S", "%d/%m/%Y"):
            try:
                return datetime.strptime(date_string, fmt).date()
            except ValueError:
                continue

    return datetime.now(tz=DHAKA_TZ).date()
