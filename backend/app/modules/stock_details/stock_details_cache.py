from __future__ import annotations

from app.core.constants.trading_constants import (
    TRADING_INPUT_SCHEMA_VERSION,
    TRADING_STRATEGY_VERSION,
    TRADING_THRESHOLD_VERSION,
)
from app.core.enums import ExchangeCode


def stock_workspace_cache_key(
    section: str,
    exchange: ExchangeCode,
    symbol: str,
    latest_trade_date: str,
    strategy_version: str = TRADING_STRATEGY_VERSION,
    threshold_version: str = TRADING_THRESHOLD_VERSION,
    input_schema_version: str = TRADING_INPUT_SCHEMA_VERSION,
) -> str:
    return (
        f"stock-workspace:{section}:{exchange.value}:{symbol.upper()}:"
        f"{latest_trade_date}:{strategy_version}:{threshold_version}:{input_schema_version}"
    )


def stock_sector_context_cache_key(
    exchange: ExchangeCode,
    symbol: str,
    latest_trade_date: str,
) -> str:
    return f"stock-sector-context:{exchange.value}:{symbol.upper()}:{latest_trade_date}"


def stock_sector_context_cache_pattern(exchange: ExchangeCode) -> str:
    return f"stock-sector-context:{exchange.value}:*"


def stock_workspace_cache_pattern(exchange: ExchangeCode) -> str:
    return f"stock-workspace:*:{exchange.value}:*"
