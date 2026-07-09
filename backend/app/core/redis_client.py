from __future__ import annotations

import json
import logging
from functools import lru_cache
from typing import Any

from app.core.core_config import Settings, get_settings

logger = logging.getLogger(__name__)


class OptionalRedisClient:
    def __init__(self, redis_url: str | None) -> None:
        self._redis = None
        self._available = False
        if not redis_url:
            return

        try:
            import redis.asyncio as redis

            self._redis = redis.from_url(redis_url, decode_responses=True)
            self._available = True
        except Exception:
            logger.warning("Redis client could not be initialized", exc_info=True)

    @property
    def is_available(self) -> bool:
        return self._available and self._redis is not None

    async def get_json(self, key: str) -> dict[str, Any] | None:
        if not self.is_available:
            return None

        try:
            raw = await self._redis.get(key)
            if raw is None:
                return None
            payload = json.loads(raw)
            if isinstance(payload, dict):
                return payload
            logger.warning("Redis key %s did not contain a JSON object", key)
            return None
        except Exception:
            logger.warning("Redis GET failed for key %s", key, exc_info=True)
            return None

    async def set_json(self, key: str, value: dict[str, Any], *, ttl_seconds: int) -> None:
        if not self.is_available:
            return

        try:
            await self._redis.set(key, json.dumps(value, default=str), ex=ttl_seconds)
        except Exception:
            logger.warning("Redis SET failed for key %s", key, exc_info=True)

    async def delete(self, key: str) -> None:
        if not self.is_available:
            return

        try:
            await self._redis.delete(key)
        except Exception:
            logger.warning("Redis DELETE failed for key %s", key, exc_info=True)

    async def delete_by_pattern(self, pattern: str) -> int:
        if not self.is_available:
            return 0

        deleted = 0
        try:
            async for key in self._redis.scan_iter(match=pattern):
                await self._redis.delete(key)
                deleted += 1
        except Exception:
            logger.warning("Redis SCAN/DELETE failed for pattern %s", pattern, exc_info=True)
        return deleted


@lru_cache
def get_redis_client() -> OptionalRedisClient:
    settings = get_settings()
    return OptionalRedisClient(settings.redis_url)


def build_redis_client(settings: Settings) -> OptionalRedisClient:
    return OptionalRedisClient(settings.redis_url)
