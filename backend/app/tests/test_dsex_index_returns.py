from decimal import Decimal
from unittest.mock import MagicMock

from app.core.security_config import UserContext
from app.modules.market_data.market_data_service import MarketDataService


class _SummaryRow:
    def __init__(self, index_close: Decimal) -> None:
        self.index_close = index_close


def _service() -> MarketDataService:
    return MarketDataService(
        MagicMock(),
        UserContext(user_id="test", display_name="Test", is_authenticated=True, roles=[]),
    )


def test_compute_index_return_percent_returns_none_when_history_is_too_short() -> None:
    service = _service()
    history = [_SummaryRow(Decimal("5600")) for _ in range(5)]

    assert (
        service._compute_index_return_percent(
            Decimal("5621.63"),
            history,
            trading_days_back=21,
        )
        is None
    )


def test_compute_index_return_percent_uses_distinct_lookback_points() -> None:
    service = _service()
    history = [_SummaryRow(Decimal("5000") + Decimal(index)) for index in range(30)]

    one_month = service._compute_index_return_percent(
        history[-1].index_close,
        history,
        trading_days_back=21,
    )
    six_month = service._compute_index_return_percent(
        history[-1].index_close,
        history,
        trading_days_back=126,
    )

    assert one_month is not None
    assert six_month is None
    assert one_month != six_month or six_month is None
