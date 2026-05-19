"""Minimal HTTP JSON client for AmarStock public endpoints (retries, shared User-Agent)."""

from __future__ import annotations

import asyncio
import json
import logging
import random
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

logger = logging.getLogger(__name__)


class AmarStockHttpClient:
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
                    "AmarStock HTTP fetch attempt %s/%s failed: url=%s error=%s",
                    attempt,
                    self.max_retries,
                    url,
                    exc,
                )
                if attempt < self.max_retries:
                    await asyncio.sleep(
                        self.retry_delay_seconds * (2 ** (attempt - 1)) + random.random()
                    )
        raise RuntimeError("AmarStock HTTP fetch failed") from last_error

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
        with urlopen(request, timeout=25) as response:
            return json.loads(response.read().decode("utf-8", errors="replace"))
