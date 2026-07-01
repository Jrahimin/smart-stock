from __future__ import annotations

UNIVERSE_CACHE_KEY_NAMES: tuple[str, ...] = ("scored",)


def universe_cache_key(section: str, exchange) -> str:
    from app.core.enums import ExchangeCode

    if isinstance(exchange, ExchangeCode):
        exchange_value = exchange.value
    else:
        exchange_value = str(exchange)
    return f"universe:{section}:{exchange_value}"


def universe_prev_cache_key(exchange) -> str:
    return universe_cache_key("scored:prev", exchange)
