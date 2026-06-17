from __future__ import annotations

from app.core.enums import ExchangeCode


def stock_workspace_cache_key(
    section: str,
    exchange: ExchangeCode,
    symbol: str,
    latest_trade_date: str,
) -> str:
    return f"stock-workspace:{section}:{exchange.value}:{symbol.upper()}:{latest_trade_date}"
