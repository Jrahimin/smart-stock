from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.core.constants.trading_constants import (
    TRADING_ACTION_TAXONOMY,
    TRADING_STRATEGY_VERSION,
    TRADING_THRESHOLD_VERSION,
)
from app.core.enums import SignalType, TraderRecommendation
from app.modules.signals.signals_schemas import TradingSignalCreate


def _base_values() -> dict[str, object]:
    return {
        "stock_id": uuid4(),
        "trade_date": date(2026, 7, 13),
        "signal_type": SignalType.BUY,
        "confidence": Decimal("0.72"),
        "reason": "Canonical prior-session snapshot.",
        "strategy_name": "canonical_trader",
    }


def test_legacy_signal_remains_readable_but_unversioned() -> None:
    signal = TradingSignalCreate(**_base_values())
    assert signal.strategy_version is None
    assert signal.canonical_recommendation is None
    assert signal.signal_as_of is None


def test_versioned_signal_requires_complete_comparable_identity() -> None:
    values = _base_values()
    values.update(
        {
            "strategy_version": TRADING_STRATEGY_VERSION,
            "threshold_version": TRADING_THRESHOLD_VERSION,
            "action_taxonomy": TRADING_ACTION_TAXONOMY,
            "canonical_recommendation": TraderRecommendation.BUY,
            "signal_as_of": date(2026, 7, 13),
            "calculated_at": datetime(2026, 7, 13, 10, tzinfo=UTC),
            "shared_decision_id": str(uuid4()),
        }
    )
    signal = TradingSignalCreate(**values)
    assert signal.canonical_recommendation == TraderRecommendation.BUY

    values["shared_decision_id"] = None
    with pytest.raises(ValidationError):
        TradingSignalCreate(**values)
