from unittest.mock import AsyncMock

import pytest

from app.core.enums import ExchangeCode
from app.core.security_config import ANONYMOUS_USER_CONTEXT
from app.modules.stocks.stocks_service import StocksService


@pytest.mark.asyncio
async def test_list_active_symbols_maps_repository_rows() -> None:
    repository = AsyncMock()
    repository.list_active_symbols.return_value = [
        (ExchangeCode.DSE, "GP"),
        (ExchangeCode.DSE, "BATBC"),
    ]
    service = StocksService(repository, ANONYMOUS_USER_CONTEXT)

    symbols = await service.list_active_symbols()

    assert len(symbols) == 2
    assert symbols[0].exchange == ExchangeCode.DSE
    assert symbols[0].symbol == "GP"
    assert symbols[1].symbol == "BATBC"
    repository.list_active_symbols.assert_awaited_once_with(exchange=None)
