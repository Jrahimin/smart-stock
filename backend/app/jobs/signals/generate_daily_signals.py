from datetime import date
from typing import Any

STRATEGY_NAME = "deterministic_trader_v1"


def map_trader_recommendation_to_signal_type(recommendation: str) -> str:
    if recommendation == "SELL":
        return "SELL"
    if recommendation == "BUY":
        return "BUY"
    return "HOLD"


async def generate_daily_signals(trade_date: date) -> dict[str, Any]:
    """Persist daily strategy rows from the shared trader decision engine.

    Runtime UI surfaces (explorer, scanner, signal center, stock workspace) should
    consume live decisions from ``compute_trader_decision_from_prices`` via
    ``GET /market/price-windows`` or ``GET /signals/decisions/latest`` rather
    than waiting for this batch job.
    """
    _ = trade_date
    return {
        "trade_date": trade_date.isoformat(),
        "signals_generated": 0,
        "strategy_name": STRATEGY_NAME,
        "note": "Batch persistence hook reserved; live decisions use the shared decision engine.",
    }
