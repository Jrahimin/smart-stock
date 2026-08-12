"""AmarStock DSEX index feeds (`/Info/DSE` + `/data/index/summery`)."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from zoneinfo import ZoneInfo

from app.core.core_config import Settings
from app.jobs.ingestion.amarstock_http_client import AmarStockHttpClient

DHAKA_TZ = ZoneInfo("Asia/Dhaka")
DSEX_SYMBOL = "00DSEX"
TRADING_DAYS_1M = 21
HISTORICAL_LOOKBACK_CALENDAR_DAYS = 45
INFO_PATH = "/Info/DSE"
SUMMARY_PATH = "/data/index/summery"
_ASPNET_EPOCH_PATTERN = re.compile(r"^/Date\((-?\d+)(?:[+-]\d{4})?\)/$")


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


@dataclass(frozen=True)
class AmarStockDsexPerformanceMetrics:
    return_1m_percent: Decimal | None
    return_6m_percent: Decimal | None
    return_1y_percent: Decimal | None
    range_52w_low: Decimal | None
    range_52w_high: Decimal | None


@dataclass(frozen=True)
class AmarStockMarketSession:
    """Authoritative lightweight session state from `/Info/DSE` only."""

    trade_date: date
    market_status: str
    is_trade_day: bool


class AmarStockIndexApiSource:
    source_name = "AMARSTOCK_INDEX_API"

    def __init__(
        self,
        *,
        base_url: str,
        max_retries: int,
        retry_delay_seconds: float,
        historical_token: str,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._historical_token = historical_token
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
            historical_token=settings.amarstock_historical_token,
        )

    async def fetch_dsex_performance_metrics(self) -> AmarStockDsexPerformanceMetrics:
        """Lightweight read for multi-horizon returns and 52-week range (summery endpoint only)."""
        summery = await self._client.fetch_structured(
            f"{self._base_url}{SUMMARY_PATH}",
            source_name=self.source_name,
        )
        if not isinstance(summery, dict):
            raise RuntimeError("AmarStock DSEX performance metrics returned unexpected payload")

        returns = _as_dict(summery.get("Returns"))
        range_52w = _as_dict(summery.get("Range52Week"))

        return AmarStockDsexPerformanceMetrics(
            return_1m_percent=await self._fetch_return_1m_from_index_history(),
            return_6m_percent=_decimal(returns.get("6Month")),
            return_1y_percent=_decimal(returns.get("1Year")),
            range_52w_low=_decimal(range_52w.get("low")),
            range_52w_high=_decimal(range_52w.get("high")),
        )

    async def fetch_market_session(self) -> AmarStockMarketSession:
        """Fetch only the current session contract; no rich summary dependency."""
        info = await self._client.fetch_structured(
            f"{self._base_url}{INFO_PATH}",
            source_name=self.source_name,
        )
        if not isinstance(info, dict):
            raise RuntimeError("AmarStock market session returned unexpected payload")

        trade_date = _parse_info_trade_date(info.get("DseTime"))
        if trade_date is None:
            raise RuntimeError("AmarStock market session missing authoritative DseTime")
        is_trade_day = _bool(info.get("IsTradeDay"))
        if is_trade_day is None:
            raise RuntimeError("AmarStock market session missing IsTradeDay")

        return AmarStockMarketSession(
            trade_date=trade_date,
            market_status=str(info.get("MarketStatus") or "Unknown"),
            is_trade_day=is_trade_day,
        )

    async def _fetch_return_1m_from_index_history(self) -> Decimal | None:
        from datetime import timedelta

        from app.jobs.ingestion.amarstock_api_stock_details_source import AmarStockHistoricalSource

        start_date = datetime.now(tz=DHAKA_TZ).date() - timedelta(
            days=HISTORICAL_LOOKBACK_CALENDAR_DAYS
        )
        historical = AmarStockHistoricalSource(
            base_url=self._base_url,
            token=self._historical_token,
            client=self._client,
        )
        rows = await historical.fetch(DSEX_SYMBOL, start_date=start_date)
        if len(rows) <= TRADING_DAYS_1M:
            return None

        latest_close = _decimal(rows[-1].get("Close"))
        past_close = _decimal(rows[-1 - TRADING_DAYS_1M].get("Close"))
        if latest_close is None or past_close is None or past_close == 0:
            return None

        return (latest_close - past_close) / past_close * Decimal("100")

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
        info = await self._client.fetch_structured(
            f"{self._base_url}{INFO_PATH}",
            source_name=self.source_name,
        )
        summery = await self._client.fetch_structured(
            f"{self._base_url}{SUMMARY_PATH}",
            source_name=self.source_name,
        )
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
    if isinstance(value, bool) or not isinstance(value, (str, bytes, bytearray, int, float)):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _parse_trade_date(epoch_ms: object, date_string: object) -> date:
    if isinstance(epoch_ms, (str, bytes, bytearray, int, float)) and not isinstance(epoch_ms, bool):
        try:
            return datetime.fromtimestamp(int(epoch_ms) / 1000, tz=DHAKA_TZ).date()
        except (OverflowError, TypeError, ValueError, OSError):
            pass

    if isinstance(date_string, str):
        for fmt in ("%d/%m/%Y %H:%M:%S", "%d/%m/%Y"):
            try:
                return datetime.strptime(date_string, fmt).date()
            except ValueError:
                continue

    return datetime.now(tz=DHAKA_TZ).date()


def _parse_info_trade_date(value: object) -> date | None:
    epoch_ms: int | None = None
    if isinstance(value, int) and not isinstance(value, bool):
        epoch_ms = value
    elif isinstance(value, str):
        match = _ASPNET_EPOCH_PATTERN.fullmatch(value.strip())
        if match is not None:
            try:
                epoch_ms = int(match.group(1))
            except ValueError:
                return None
    if epoch_ms is None:
        return None
    try:
        return datetime.fromtimestamp(epoch_ms / 1000, tz=DHAKA_TZ).date()
    except (OverflowError, OSError, ValueError):
        return None


def _bool(value: object) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, int) and value in (0, 1):
        return bool(value)
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1"}:
            return True
        if normalized in {"false", "0"}:
            return False
    return None
