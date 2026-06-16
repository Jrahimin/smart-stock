from starlette.requests import Request


def get_client_ip(request: Request) -> str | None:
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip() or None
    if request.client is not None:
        return request.client.host
    return None


def get_user_agent(request: Request) -> str | None:
    user_agent = request.headers.get("User-Agent")
    if user_agent is None:
        return None
    stripped = user_agent.strip()
    return stripped or None
