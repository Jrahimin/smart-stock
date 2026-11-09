"""Local live-data viewer: PostgreSQL read-only, local Redis, no schedulers."""
import os
import asyncio
os.environ["RUN_SCHEDULER"] = "false"
os.environ["REDIS_URL"] = "redis://127.0.0.1:6379/0"
from sqlalchemy import event
from app.core.database_session import async_engine, AsyncSessionLocal
@event.listens_for(async_engine.sync_engine, "connect")
def readonly_connection(connection, record):
    connection.run_async(lambda raw: raw.execute("SET default_transaction_read_only = on"))
import app.jobs.market_cache_spawn as cache_spawn
from app.modules.market_data.market_data_service import MarketDataService
from app.jobs.market_cache_rebuild import _build_dashboard_service
from app.core.core_config import get_settings
from app.core.redis_client import build_redis_client
from local_freshness_cache import LocalFreshnessCache

original_freshness = MarketDataService.get_market_freshness

async def load_freshness(exchange):
    # Own the session so cancellation of a browser request cannot interrupt or
    # concurrently reuse another request's AsyncSession.
    settings = get_settings()
    async with AsyncSessionLocal() as session:
        service = _build_dashboard_service(session, settings, build_redis_client(settings))
        return await original_freshness(service.market_data_service, exchange=exchange)

freshness_cache = LocalFreshnessCache(load_freshness)

async def cached_freshness(self, *, exchange):
    return await freshness_cache.get(exchange)

MarketDataService.get_market_freshness = cached_freshness
poll_task = None

async def poll_freshness():
    while True:
        await asyncio.sleep(5)
        try:
            await freshness_cache.refresh(cache_spawn.ExchangeCode.DSE)
        except Exception:
            # Never extend the age of an old value on failure.
            import logging
            logging.getLogger(__name__).exception('Local freshness refresh failed')

async def warm_dashboard_only(*args, **kwargs):
    global poll_task
    await freshness_cache.get(cache_spawn.ExchangeCode.DSE)
    poll_task = asyncio.create_task(poll_freshness())
    cache_spawn.spawn_rebuild_market_read_cache(settings=kwargs.get("settings"), exchange=cache_spawn.ExchangeCode.DSE, include_universe=False)
cache_spawn.warm_market_read_cache_if_cold = warm_dashboard_only
cache_spawn.spawn_rebuild_universe_read_cache = lambda *args, **kwargs: False
import uvicorn
if __name__ == "__main__":
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000)
