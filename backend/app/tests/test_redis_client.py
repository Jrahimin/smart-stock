from app.core.redis_client import OptionalRedisClient


def test_redis_client_configures_bounded_network_timeouts(monkeypatch) -> None:
    import redis.asyncio as redis

    captured: dict[str, object] = {}

    def fake_from_url(url: str, **kwargs: object) -> object:
        captured["url"] = url
        captured.update(kwargs)
        return object()

    monkeypatch.setattr(redis, "from_url", fake_from_url)

    client = OptionalRedisClient(
        "redis://cache:6379/0",
        socket_connect_timeout_seconds=0.5,
        socket_timeout_seconds=1.5,
    )

    assert client.is_available is True
    assert captured == {
        "url": "redis://cache:6379/0",
        "decode_responses": True,
        "socket_connect_timeout": 0.5,
        "socket_timeout": 1.5,
        "health_check_interval": 30,
    }
