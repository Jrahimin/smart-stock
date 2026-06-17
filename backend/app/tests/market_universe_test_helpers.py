from __future__ import annotations

FORBIDDEN_UNIVERSE_FIELD_NAMES = frozenset(
    {
        "prices",
        "ohlcv",
        "candles",
        "volume_bars",
        "chart",
        "patterns",
        "swing_points",
        "events",
        "briefing",
        "ownership",
        "valuation",
        "focus_stocks",
        "alerts",
        "market_movers",
    }
)


def assert_no_forbidden_universe_fields(payload: object) -> None:
    if isinstance(payload, dict):
        for key, value in payload.items():
            assert key not in FORBIDDEN_UNIVERSE_FIELD_NAMES, f"Forbidden key found: {key}"
            assert_no_forbidden_universe_fields(value)
    elif isinstance(payload, list):
        for item in payload:
            assert_no_forbidden_universe_fields(item)
