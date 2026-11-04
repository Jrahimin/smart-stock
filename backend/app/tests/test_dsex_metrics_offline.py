import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from app.core.core_config import Settings
from app.core.enums import ExchangeCode
from app.modules.market_data.dsex_metrics import _fetch_amarstock_metrics


class DsexMetricsOfflineTests(unittest.IsolatedAsyncioTestCase):
    async def test_disabled_provider_never_constructs_network_or_cache_clients(self):
        settings = Settings(_env_file=None, amarstock_index_summary_enabled=False)
        with patch("app.modules.market_data.dsex_metrics.build_redis_client") as cache, patch(
            "app.modules.market_data.dsex_metrics.AmarStockIndexApiSource.from_settings"
        ) as source:
            result = await _fetch_amarstock_metrics(exchange=ExchangeCode.DSE, settings=settings)
        self.assertIsNone(result)
        cache.assert_not_called()
        source.assert_not_called()

    async def test_enabled_provider_retains_the_existing_fetch_path(self):
        settings = Settings(_env_file=None, amarstock_index_summary_enabled=True)
        cache = MagicMock()
        cache.is_available = False
        source = MagicMock()
        expected = object()
        source.fetch_dsex_performance_metrics = AsyncMock(return_value=expected)
        with patch(
            "app.modules.market_data.dsex_metrics.AmarStockIndexApiSource.from_settings",
            return_value=source,
        ) as factory:
            result = await _fetch_amarstock_metrics(
                exchange=ExchangeCode.DSE, settings=settings, redis=cache
            )
        self.assertIs(result, expected)
        factory.assert_called_once_with(settings)
        source.fetch_dsex_performance_metrics.assert_awaited_once()
