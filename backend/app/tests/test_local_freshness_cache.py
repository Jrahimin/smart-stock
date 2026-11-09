import asyncio
from unittest.mock import AsyncMock

import pytest

from local_freshness_cache import LocalFreshnessCache


@pytest.mark.asyncio
async def test_concurrent_requests_share_load_and_cache():
    loader = AsyncMock(return_value='published')
    cache = LocalFreshnessCache(loader)
    assert await asyncio.gather(cache.get('DSE'), cache.get('DSE')) == ['published'] * 2
    assert await cache.get('DSE') == 'published'
    loader.assert_awaited_once()


@pytest.mark.asyncio
async def test_failed_refresh_does_not_extend_expiry():
    now = [0]
    loader = AsyncMock(return_value='old')
    cache = LocalFreshnessCache(loader, clock=lambda: now[0])
    assert await cache.get('DSE') == 'old'
    now[0] = 6
    loader.side_effect = RuntimeError('unavailable')
    assert await cache.get('DSE') == 'old'
    with pytest.raises(RuntimeError):
        await cache.tasks['DSE']
    now[0] = 31
    with pytest.raises(RuntimeError):
        await cache.get('DSE')


@pytest.mark.asyncio
async def test_refresh_replaces_generation_without_changing_values():
    now = [0]
    loader = AsyncMock(side_effect=['generation-a', 'generation-b'])
    cache = LocalFreshnessCache(loader, clock=lambda: now[0])
    assert await cache.get('DSE') == 'generation-a'
    now[0] = 6
    assert await cache.get('DSE') == 'generation-a'
    await cache.tasks['DSE']
    assert await cache.get('DSE') == 'generation-b'
