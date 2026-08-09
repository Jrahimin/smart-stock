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
        self._coordination_failed = False
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

    @property
    def coordination_failed(self) -> bool:
        return self._coordination_failed

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

    async def set_json(self, key: str, value: dict[str, Any], *, ttl_seconds: int) -> bool:
        if not self.is_available:
            return False

        try:
            await self._redis.set(key, json.dumps(value, default=str), ex=ttl_seconds)
            return True
        except Exception:
            logger.warning("Redis SET failed for key %s", key, exc_info=True)
            return False

    async def get_ttl_seconds(self, key: str) -> int | None:
        if not self.is_available:
            return None

        try:
            return int(await self._redis.ttl(key))
        except Exception:
            logger.warning("Redis TTL failed for key %s", key, exc_info=True)
            return None

    async def delete(self, key: str) -> None:
        if not self.is_available:
            return

        try:
            await self._redis.delete(key)
        except Exception:
            logger.warning("Redis DELETE failed for key %s", key, exc_info=True)

    async def delete_if_value(self, key: str, expected_value: str) -> bool:
        """Release an owned lock without deleting a replacement owner's lock."""
        if not self.is_available:
            return True

        script = """
        if redis.call('get', KEYS[1]) == ARGV[1] then
          return redis.call('del', KEYS[1])
        end
        return 0
        """
        try:
            return bool(await self._redis.eval(script, 1, key, expected_value))
        except Exception:
            logger.warning("Redis compare-and-delete failed for key %s", key, exc_info=True)
            return False

    async def extend_if_value(self, key: str, expected_value: str, *, ttl_seconds: int) -> bool:
        """Renew an owned lock without extending a replacement owner's lease."""
        if not self.is_available:
            return False

        script = """
        if redis.call('get', KEYS[1]) == ARGV[1] then
          return redis.call('expire', KEYS[1], ARGV[2])
        end
        return 0
        """
        try:
            return bool(await self._redis.eval(script, 1, key, expected_value, ttl_seconds))
        except Exception:
            logger.warning("Redis lease renewal failed for key %s", key, exc_info=True)
            return False

    async def has_key_matching(self, pattern: str) -> bool:
        if not self.is_available:
            return False
        try:
            async for _ in self._redis.scan_iter(match=pattern, count=1):
                return True
        except Exception:
            logger.warning("Redis SCAN failed for pattern %s", pattern, exc_info=True)
        return False

    async def set_if_not_exists(self, key: str, value: str, *, ttl_seconds: int) -> bool:
        """Return True when the key was set (lock acquired). False when already held."""
        if not self.is_available:
            return True

        try:
            acquired = bool(await self._redis.set(key, value, nx=True, ex=ttl_seconds))
            self._coordination_failed = False
            return acquired
        except Exception:
            self._coordination_failed = True
            logger.warning("Redis SET NX failed for key %s", key, exc_info=True)
            # A configured-but-unreachable coordinator must fail closed.  In
            # particular, HTTP cache misses must not authorize every worker to
            # run an expensive full-universe calculation independently.
            return False

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
