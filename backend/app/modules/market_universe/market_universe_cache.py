from __future__ import annotations

from app.core.constants.trading_constants import TRADING_STRATEGY_VERSION

UNIVERSE_CACHE_KEY_NAMES: tuple[str, ...] = ("scored",)


def universe_cache_key(
    section: str,
    exchange,
    strategy_version: str = TRADING_STRATEGY_VERSION,
) -> str:
    from app.core.enums import ExchangeCode

    if isinstance(exchange, ExchangeCode):
        exchange_value = exchange.value
    else:
        exchange_value = str(exchange)
    return f"universe:{section}:{exchange_value}:{strategy_version}"


def universe_prev_cache_key(
    exchange,
    strategy_version: str = TRADING_STRATEGY_VERSION,
) -> str:
    return universe_cache_key("scored:prev", exchange, strategy_version)


def legacy_universe_cache_key(section: str, exchange) -> str:
    from app.core.enums import ExchangeCode

    exchange_value = exchange.value if isinstance(exchange, ExchangeCode) else str(exchange)
    return f"universe:{section}:{exchange_value}"
