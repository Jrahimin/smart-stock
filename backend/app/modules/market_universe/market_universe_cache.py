from __future__ import annotations

from app.core.constants.trading_constants import (
    TRADING_INPUT_SCHEMA_VERSION,
    TRADING_STRATEGY_VERSION,
    TRADING_THRESHOLD_VERSION,
)

UNIVERSE_CACHE_KEY_NAMES: tuple[str, ...] = ("scored",)


def universe_cache_key(
    section: str,
    exchange,
    strategy_version: str = TRADING_STRATEGY_VERSION,
    threshold_version: str = TRADING_THRESHOLD_VERSION,
    input_schema_version: str = TRADING_INPUT_SCHEMA_VERSION,
) -> str:
    from app.core.enums import ExchangeCode

    if isinstance(exchange, ExchangeCode):
        exchange_value = exchange.value
    else:
        exchange_value = str(exchange)
    return (
        f"universe:{section}:{exchange_value}:{strategy_version}:"
        f"{threshold_version}:{input_schema_version}"
    )


def universe_prev_cache_key(
    exchange,
    strategy_version: str = TRADING_STRATEGY_VERSION,
    threshold_version: str = TRADING_THRESHOLD_VERSION,
    input_schema_version: str = TRADING_INPUT_SCHEMA_VERSION,
) -> str:
    return universe_cache_key(
        "scored:prev",
        exchange,
        strategy_version,
        threshold_version,
        input_schema_version,
    )


def legacy_universe_cache_key(section: str, exchange) -> str:
    from app.core.enums import ExchangeCode

    exchange_value = exchange.value if isinstance(exchange, ExchangeCode) else str(exchange)
    return f"universe:{section}:{exchange_value}"


def strategy_only_universe_cache_key(
    section: str,
    exchange,
    strategy_version: str = TRADING_STRATEGY_VERSION,
) -> str:
    """Phase 4 cache identity retained only for deployment-time cleanup."""

    from app.core.enums import ExchangeCode

    exchange_value = exchange.value if isinstance(exchange, ExchangeCode) else str(exchange)
    return f"universe:{section}:{exchange_value}:{strategy_version}"
