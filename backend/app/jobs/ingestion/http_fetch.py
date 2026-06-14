"""Shared HTTP fetch helpers for ingestion jobs (SSL CA bundle on Windows)."""

from __future__ import annotations

import logging
import ssl
from typing import Mapping
from urllib.request import Request, urlopen

try:
    import certifi
except ImportError:  # pragma: no cover - certifi is a declared dependency
    certifi = None  # type: ignore[assignment]

logger = logging.getLogger(__name__)

DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)


def build_ssl_context(*, verify: bool = True) -> ssl.SSLContext:
    if not verify:
        context = ssl.create_default_context()
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        return context
    if certifi is not None:
        return ssl.create_default_context(cafile=certifi.where())
    return ssl.create_default_context()


def fetch_text(
    url: str,
    *,
    timeout: float = 20,
    headers: Mapping[str, str] | None = None,
    verify_ssl: bool = True,
) -> str:
    if not verify_ssl:
        logger.warning("Fetching %s with TLS certificate verification disabled", url)

    merged_headers = {
        "User-Agent": DEFAULT_USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }
    if headers:
        merged_headers.update(headers)
    request = Request(url, headers=merged_headers)
    with urlopen(request, timeout=timeout, context=build_ssl_context(verify=verify_ssl)) as response:
        return response.read().decode("utf-8", errors="replace")
