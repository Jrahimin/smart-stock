import asyncio
import json
import logging
import random
import re
from collections.abc import Mapping
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from app.core.enums import DataQualityFlag, MarketEventType, ReportPeriodType, ReportStatus
from app.jobs.ingestion.stock_details_api_source_base import (
    ApiDailyPrice,
    ApiFinancialMetric,
    ApiMarketEvent,
    ApiShareholdingSnapshot,
    ApiStockDetailsPayload,
    ApiStockProfile,
    ApiValuationSnapshot,
)

logger = logging.getLogger(__name__)

AMARSTOCK_SOURCE = "AMARSTOCK_API"

SNAPSHOT_VALUATION_FIELDS = {
    "ClosePrice": "close_price",
    "MarketCap": "market_cap",
    "AuditedPE": "pe_ratio",
    "NavPrice": "pb_ratio",
    "DividentYield": "dividend_yield",
}

SNAPSHOT_METRIC_FIELDS = {
    "EPS": "EPS",
    "NAV": "NAV_PER_SHARE",
    "Q1Eps": "Q1_EPS",
    "Q2Eps": "Q2_EPS",
    "Q3Eps": "Q3_EPS",
    "Q4Eps": "Q4_EPS",
    "AuthorizedCap": "AUTHORIZED_CAPITAL",
    "PaidUpCap": "PAID_UP_CAPITAL",
    "TotalSecurities": "TOTAL_SHARES",
    "ReserveSurplus": "RESERVE_SURPLUS",
    "ShortLoan": "SHORT_TERM_LOAN",
    "LongLoan": "LONG_TERM_LOAN",
    "freefloat": "FREE_FLOAT_PERCENT",
    "stockBeta": "BETA",
}

SHAREHOLDING_FIELDS = {
    "SponsorDirector": "sponsor_director_percent",
    "Govt": "government_percent",
    "Institute": "institution_percent",
    "Foreign": "foreign_percent",
    "Public": "public_percent",
    "freefloat": "free_float_percent",
}

STOCK_PROFILE_TEXT_FIELDS = {
    "FullName": "name",
    "Sector": "sector",
    "SectorName": "sector",
    "MarketCategory": "category",
}

COMPANY_METRIC_MAP = {
    "total assets": "TOTAL_ASSETS",
    "total liabilities": "TOTAL_LIABILITIES",
    "total liability": "TOTAL_LIABILITIES",
    "nav": "NAV_PER_SHARE",
    "net asset value": "NAV_PER_SHARE",
    "net profit after tax for the year": "NET_PROFIT_AFTER_TAX",
    "net profit after tax": "NET_PROFIT_AFTER_TAX",
    "profit after tax": "NET_PROFIT_AFTER_TAX",
    "eps": "EPS",
    "earnings per share": "EPS",
    "net cash flow from operating activities (a)": "NET_OPERATING_CASH_FLOW",
    "net cash flow from operating activities": "NET_OPERATING_CASH_FLOW",
    "operating cash flow": "NET_OPERATING_CASH_FLOW",
    "revenue": "REVENUE",
    "turnover": "REVENUE",
    "operating profit": "OPERATING_PROFIT",
    "paid up capital": "PAID_UP_CAPITAL",
    "total shares": "TOTAL_SHARES",
}


class AmarStockApiClient:
    def __init__(self, *, max_retries: int, retry_delay_seconds: float) -> None:
        self.max_retries = max_retries
        self.retry_delay_seconds = retry_delay_seconds

    async def fetch_json(self, url: str) -> Any:
        last_error: Exception | None = None
        for attempt in range(1, self.max_retries + 1):
            try:
                return await asyncio.to_thread(self._fetch_json, url)
            except (TimeoutError, HTTPError, URLError, OSError, json.JSONDecodeError) as exc:
                last_error = exc
                logger.warning(
                    "AmarStock API fetch attempt %s/%s failed: url=%s error=%s",
                    attempt,
                    self.max_retries,
                    url,
                    exc,
                )
                if attempt < self.max_retries:
                    await asyncio.sleep(self.retry_delay_seconds * (2 ** (attempt - 1)) + random.random())
        raise RuntimeError("AmarStock API fetch failed") from last_error

    def _fetch_json(self, url: str) -> Any:
        request = Request(
            url,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
                ),
                "Accept": "application/json,text/plain,*/*",
            },
        )
        with urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode("utf-8", errors="replace"))


class AmarStockSnapshotSource:
    def __init__(self, *, base_url: str, token: str, client: AmarStockApiClient) -> None:
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.client = client

    def build_url(self, symbol: str) -> str:
        return f"{self.base_url}/data/{self.token}/{symbol.strip().upper()}"

    async def fetch(self, symbol: str) -> dict[str, Any]:
        data = await self.client.fetch_json(self.build_url(symbol))
        return dict(data) if isinstance(data, Mapping) else {}


class AmarStockHistoricalSource:
    def __init__(self, *, base_url: str, token: str, client: AmarStockApiClient) -> None:
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.client = client

    def build_url(self, symbol: str, *, start_date: date) -> str:
        query = urlencode({"scrip": symbol.strip().upper(), "cycle": "Day1", "dtFrom": start_date.isoformat()})
        return f"{self.base_url}/data/{self.token}/?{query}"

    async def fetch(self, symbol: str, *, start_date: date) -> list[dict[str, Any]]:
        data = await self.client.fetch_json(self.build_url(symbol, start_date=start_date))
        if isinstance(data, list):
            return [dict(row) for row in data if isinstance(row, Mapping)]
        return []


class AmarStockCompanySource:
    def __init__(self, *, base_url: str, token: str, client: AmarStockApiClient) -> None:
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.client = client

    def build_url(self, symbol: str) -> str:
        return f"{self.base_url}/company/{self.token}/?{urlencode({'symbol': symbol.strip().upper()})}"

    async def fetch(self, symbol: str) -> list[dict[str, Any]]:
        data = await self.client.fetch_json(self.build_url(symbol))
        if isinstance(data, list):
            return [dict(row) for row in data if isinstance(row, Mapping)]
        return []


class AmarStockApiStockDetailsSource:
    source_name = AMARSTOCK_SOURCE

    def __init__(
        self,
        *,
        base_url: str,
        snapshot_token: str,
        historical_token: str,
        company_token: str,
        historical_window_days: int,
        max_retries: int,
        retry_delay_seconds: float,
    ) -> None:
        client = AmarStockApiClient(max_retries=max_retries, retry_delay_seconds=retry_delay_seconds)
        self.snapshot_source = AmarStockSnapshotSource(base_url=base_url, token=snapshot_token, client=client)
        self.historical_source = AmarStockHistoricalSource(base_url=base_url, token=historical_token, client=client)
        self.company_source = AmarStockCompanySource(base_url=base_url, token=company_token, client=client)
        self.historical_window_days = historical_window_days

    def source_url(self, symbol: str) -> str:
        return self.snapshot_source.build_url(symbol)

    async def fetch_stock_details(
        self,
        symbol: str,
        *,
        scrape_date: date | None = None,
        historical_window_days: int | None = None,
    ) -> ApiStockDetailsPayload:
        normalized_symbol = symbol.strip().upper()
        resolved_scrape_date = scrape_date or datetime.now(UTC).date()
        window_days = historical_window_days or self.historical_window_days
        start_date = resolved_scrape_date - timedelta(days=window_days)

        snapshot_result, historical_result, company_result = await asyncio.gather(
            self.snapshot_source.fetch(normalized_symbol),
            self.historical_source.fetch(normalized_symbol, start_date=start_date),
            self.company_source.fetch(normalized_symbol),
            return_exceptions=True,
        )
        snapshot = self._mapping_or_empty(snapshot_result, "snapshot", normalized_symbol)
        historical_rows = self._rows_or_empty(historical_result, "historical", normalized_symbol)
        company_rows = self._rows_or_empty(company_result, "company", normalized_symbol)

        unknown_company_rows: list[dict[str, Any]] = []
        financial_metrics = self._map_company_metrics(company_rows, unknown_company_rows)
        financial_metrics.extend(self._map_snapshot_metrics(snapshot, resolved_scrape_date))

        payload = ApiStockDetailsPayload(
            symbol=normalized_symbol,
            source=self.source_name,
            snapshot_url=self.snapshot_source.build_url(normalized_symbol),
            historical_url=self.historical_source.build_url(normalized_symbol, start_date=start_date),
            company_url=self.company_source.build_url(normalized_symbol),
            scrape_date=resolved_scrape_date,
            stock_profile=self._map_stock_profile(snapshot),
            daily_prices=self._map_historical_prices(historical_rows),
            financial_metrics=financial_metrics,
            valuation=self._map_valuation(snapshot, resolved_scrape_date),
            shareholding=self._map_shareholding(snapshot, resolved_scrape_date),
            market_events=self._map_news(snapshot, resolved_scrape_date),
            metadata={
                "diagnostics": {
                    "snapshot_keys": sorted(snapshot.keys()),
                    "historical_rows": len(historical_rows),
                    "historical_window_days": window_days,
                    "company_rows": len(company_rows),
                    "mapped_financial_metrics": len(financial_metrics),
                    "unmapped_company_rows": len(unknown_company_rows),
                    "unmapped_company_sample": unknown_company_rows[:20],
                }
            },
            data_quality_flag=DataQualityFlag.PARTIAL if unknown_company_rows else DataQualityFlag.OK,
        )
        logger.info(
            "Parsed AmarStock API stock details: symbol=%s prices=%s metrics=%s valuation=%s "
            "profile=%s shareholding=%s events=%s unmapped_company_rows=%s",
            payload.symbol,
            len(payload.daily_prices),
            len(payload.financial_metrics),
            payload.valuation is not None,
            payload.stock_profile is not None,
            payload.shareholding is not None,
            len(payload.market_events),
            len(unknown_company_rows),
        )
        return payload

    def _map_historical_prices(self, rows: list[dict[str, Any]]) -> list[ApiDailyPrice]:
        prices: list[ApiDailyPrice] = []
        for row in rows:
            trade_date = self._date_from_epoch(row.get("DateEpoch"))
            open_price = self._to_decimal(row.get("Open"))
            high_price = self._to_decimal(row.get("High"))
            low_price = self._to_decimal(row.get("Low"))
            close_price = self._to_decimal(row.get("Close"))
            if None in (trade_date, open_price, high_price, low_price, close_price):
                continue
            prices.append(
                ApiDailyPrice(
                    trade_date=trade_date,
                    open_price=open_price,
                    high_price=high_price,
                    low_price=low_price,
                    close_price=close_price,
                    volume=self._to_int(row.get("Volume")) or 0,
                    trade_count=self._to_int(row.get("Trade")),
                    source_value=row,
                )
            )
        return prices

    def _map_valuation(self, snapshot: dict[str, Any], scrape_date: date) -> ApiValuationSnapshot | None:
        values: dict[str, Decimal] = {}
        source_fields: dict[str, str] = {}
        for source_field, target_field in SNAPSHOT_VALUATION_FIELDS.items():
            value = self._to_decimal(snapshot.get(source_field))
            if value is not None:
                values[target_field] = value
                source_fields[target_field] = source_field
        if not values:
            return None
        return ApiValuationSnapshot(valuation_date=scrape_date, metadata={"source_fields": source_fields}, **values)

    def _map_stock_profile(self, snapshot: dict[str, Any]) -> ApiStockProfile | None:
        values: dict[str, Any] = {}
        source_fields: dict[str, str] = {}
        for source_field, target_field in STOCK_PROFILE_TEXT_FIELDS.items():
            value = self._clean_text(snapshot.get(source_field))
            if value is not None:
                values[target_field] = value
                source_fields[target_field] = source_field

        paid_up_capital = self._to_decimal(snapshot.get("PaidUpCap"))
        if paid_up_capital is not None:
            values["paid_up_capital"] = paid_up_capital
            source_fields["paid_up_capital"] = "PaidUpCap"

        market_cap = self._to_decimal(snapshot.get("MarketCap"))
        if market_cap is not None:
            values["market_cap"] = market_cap
            source_fields["market_cap"] = "MarketCap"

        listing_year = self._to_int(snapshot.get("ListingYear"))
        listing_date = date(listing_year, 1, 1) if listing_year is not None and listing_year >= 1900 else None
        if listing_date is not None:
            values["listing_date"] = listing_date
            source_fields["listing_date"] = "ListingYear"

        is_active = self._is_active_from_listing_status(snapshot.get("PresentOs"))
        if is_active is not None:
            values["is_active"] = is_active
            source_fields["is_active"] = "PresentOs"

        metadata = self._stock_profile_metadata(snapshot, source_fields)
        if not values and not metadata:
            return None
        return ApiStockProfile(metadata=metadata, **values)

    def _map_snapshot_metrics(self, snapshot: dict[str, Any], scrape_date: date) -> list[ApiFinancialMetric]:
        metrics: list[ApiFinancialMetric] = []
        for source_field, metric_code in SNAPSHOT_METRIC_FIELDS.items():
            value = self._to_decimal(snapshot.get(source_field))
            if value is None:
                continue
            is_quarterly_eps = metric_code in {"Q1_EPS", "Q2_EPS", "Q3_EPS", "Q4_EPS"}
            metrics.append(
                ApiFinancialMetric(
                    fiscal_year=scrape_date.year,
                    statement_section="snapshot",
                    metric_code=metric_code,
                    value=value,
                    as_of_date=scrape_date,
                    source_label=source_field,
                    source_value=str(snapshot.get(source_field)),
                    period_type=ReportPeriodType.QUARTERLY if is_quarterly_eps else ReportPeriodType.ANNUAL,
                    report_status=ReportStatus.UNAUDITED if is_quarterly_eps else ReportStatus.AUDITED,
                    metadata={"source": "snapshot_api"},
                )
            )
        return metrics

    def _map_shareholding(self, snapshot: dict[str, Any], scrape_date: date) -> ApiShareholdingSnapshot | None:
        values: dict[str, Any] = {}
        for source_field, target_field in SHAREHOLDING_FIELDS.items():
            value = self._to_decimal(snapshot.get(source_field))
            if value is not None:
                values[target_field] = value
        total_shares = self._to_int(snapshot.get("TotalSecurities"))
        if total_shares is not None:
            values["total_shares"] = total_shares
        free_float_percent = values.get("free_float_percent")
        if total_shares is not None and isinstance(free_float_percent, Decimal):
            values["circulating_shares"] = int(Decimal(total_shares) * free_float_percent / Decimal("100"))
        history = self._indexed_shareholding(snapshot)
        metadata = {
            "indexed_history": history,
            "source_fields": {
                target_field: source_field for source_field, target_field in SHAREHOLDING_FIELDS.items()
            },
        }
        if total_shares is not None:
            metadata["source_fields"]["total_shares"] = "TotalSecurities"
        if not values and not history:
            return None
        return ApiShareholdingSnapshot(snapshot_date=scrape_date, metadata=metadata, **values)

    def _indexed_shareholding(self, snapshot: dict[str, Any]) -> list[dict[str, Any]]:
        grouped: dict[str, dict[str, Any]] = {}
        for source_field in SHAREHOLDING_FIELDS:
            pattern = re.compile(rf"^{re.escape(source_field)}(\d+)$")
            for key, value in snapshot.items():
                match = pattern.match(key)
                if match is None:
                    continue
                grouped.setdefault(match.group(1), {})[source_field] = value

        date_pattern = re.compile(r"^ShareHoldingPercentage(\d+)$", re.IGNORECASE)
        for key, value in snapshot.items():
            match = date_pattern.match(key)
            if match is None:
                continue
            label = self._clean_text(value)
            if label:
                grouped.setdefault(match.group(1), {})["snapshot_label"] = label

        return [grouped[index] for index in sorted(grouped, key=int)]

    def _map_news(self, snapshot: dict[str, Any], scrape_date: date) -> list[ApiMarketEvent]:
        events: list[ApiMarketEvent] = []
        indexes = sorted(
            {
                match.group(1)
                for key in snapshot
                if (match := re.match(r"^news(\d+)sttitle$", key, flags=re.IGNORECASE))
            },
            key=int,
        )
        for index in indexes:
            title = str(snapshot.get(f"news{index}sttitle") or "").strip()
            if not title:
                continue
            events.append(
                ApiMarketEvent(
                    event_type=MarketEventType.NEWS,
                    event_date=self._date_from_aspnet(snapshot.get(f"news{index}stdate")) or scrape_date,
                    title=title[:255],
                    summary=str(snapshot.get(f"news{index}stbody") or "").strip() or None,
                    metadata={"news_index": index},
                )
            )
        return events

    def _map_company_metrics(
        self,
        rows: list[dict[str, Any]],
        unknown_rows: list[dict[str, Any]],
    ) -> list[ApiFinancialMetric]:
        metrics: list[ApiFinancialMetric] = []
        for row in rows:
            raw_label = str(row.get("k") or "").strip()
            metric_code = COMPANY_METRIC_MAP.get(self._normalize_label(raw_label))
            value = self._to_decimal(row.get("l"))
            fiscal_year = self._to_int(row.get("y"))
            section = str(row.get("r") or "company-financials").strip()
            if metric_code is None or value is None or fiscal_year is None:
                unknown_rows.append(row)
                continue
            metrics.append(
                ApiFinancialMetric(
                    fiscal_year=fiscal_year,
                    statement_section=section,
                    metric_code=metric_code,
                    value=value,
                    as_of_date=date(fiscal_year, 12, 31),
                    source_label=raw_label,
                    source_value=str(row.get("l")),
                    metadata={"report_type": section, "summary_flag": row.get("s")},
                )
            )
        return metrics

    def _mapping_or_empty(self, result: Any, source_name: str, symbol: str) -> dict[str, Any]:
        if isinstance(result, Exception):
            logger.warning("AmarStock %s API failed for symbol=%s: %s", source_name, symbol, result)
            return {}
        return dict(result) if isinstance(result, Mapping) else {}

    def _rows_or_empty(self, result: Any, source_name: str, symbol: str) -> list[dict[str, Any]]:
        if isinstance(result, Exception):
            logger.warning("AmarStock %s API failed for symbol=%s: %s", source_name, symbol, result)
            return []
        return [dict(row) for row in result] if isinstance(result, list) else []

    def _date_from_epoch(self, value: Any) -> date | None:
        try:
            return datetime.fromtimestamp(int(value) / 1000, UTC).date()
        except (TypeError, ValueError, OSError):
            return None

    def _date_from_aspnet(self, value: Any) -> date | None:
        if value is None:
            return None
        match = re.search(r"/Date\((\d+)\)/", str(value))
        if match is None:
            return None
        return self._date_from_epoch(match.group(1))

    def _to_decimal(self, value: Any) -> Decimal | None:
        if value is None:
            return None
        normalized = str(value).replace(",", "").replace("%", "").strip()
        if normalized in {"", "-", "--", "N/A", "NA", "None", "null"}:
            return None
        try:
            return Decimal(normalized)
        except InvalidOperation:
            return None

    def _to_int(self, value: Any) -> int | None:
        try:
            return int(Decimal(str(value).replace(",", "").strip()))
        except (InvalidOperation, TypeError, ValueError):
            return None

    def _normalize_label(self, value: str) -> str:
        return " ".join(re.sub(r"[^a-zA-Z0-9() ]+", " ", value).lower().split())

    def _clean_text(self, value: Any) -> str | None:
        if value is None:
            return None
        normalized = str(value).strip()
        if not normalized or normalized in {"-", "--", "N/A", "NA", "None", "null"}:
            return None
        return normalized

    def _is_active_from_listing_status(self, value: Any) -> bool | None:
        normalized = (self._clean_text(value) or "").lower()
        if normalized in {"active", "a"}:
            return True
        if normalized in {"inactive", "suspended", "delisted"}:
            return False
        return None

    def _stock_profile_metadata(
        self,
        snapshot: dict[str, Any],
        source_fields: dict[str, str],
    ) -> dict[str, Any]:
        metadata: dict[str, Any] = {"source_fields": source_fields} if source_fields else {}
        passthrough_fields = {
            "AuthorizedCap",
            "TotalSecurities",
            "PresentOs",
            "PresentLs",
            "LastAGMHeld",
            "Address",
            "Contact",
            "Email",
            "Web",
            "YE",
            "Electronic",
        }
        extras = {
            field: snapshot[field]
            for field in sorted(passthrough_fields)
            if self._clean_text(snapshot.get(field)) is not None
        }
        if extras:
            metadata["amarstock_profile"] = extras
        return metadata
