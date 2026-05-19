"""AmarStock public News JSON feed (`/info/News`)."""

from __future__ import annotations

from dataclasses import dataclass
from app.core.core_config import Settings
from app.jobs.ingestion.amarstock_http_client import AmarStockHttpClient


@dataclass(frozen=True)
class AmarStockNewsItem:
    title: str
    scrip: str
    content: str
    is_clickable: bool


class AmarStockNewsApiSource:
    source_name = "AMARSTOCK_NEWS_API"

    def __init__(
        self,
        *,
        base_url: str,
        news_path: str,
        max_retries: int,
        retry_delay_seconds: float,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._news_path = news_path if news_path.startswith("/") else f"/{news_path}"
        self._client = AmarStockHttpClient(
            max_retries=max_retries,
            retry_delay_seconds=retry_delay_seconds,
        )

    @classmethod
    def from_settings(cls, settings: Settings) -> AmarStockNewsApiSource:
        return cls(
            base_url=settings.amarstock_api_base_url,
            news_path=settings.amarstock_news_path,
            max_retries=settings.amarstock_bulk_api_max_retries,
            retry_delay_seconds=settings.amarstock_bulk_api_retry_delay_seconds,
        )

    def build_url(self) -> str:
        return f"{self._base_url}{self._news_path}"

    async def fetch_news(self) -> list[AmarStockNewsItem]:
        data = await self._client.fetch_json(self.build_url())
        if not isinstance(data, list):
            return []
        items: list[AmarStockNewsItem] = []
        for row in data:
            if not isinstance(row, dict):
                continue
            title = str(row.get("Title") or "").strip()
            scrip = str(row.get("Scrip") or "").strip().upper()
            content = str(row.get("Content") or "").strip()
            if not title:
                continue
            clickable = bool(row.get("IsClikable") or row.get("IsClickable"))
            items.append(
                AmarStockNewsItem(
                    title=title[:255],
                    scrip=scrip,
                    content=content,
                    is_clickable=clickable,
                )
            )
        return items
