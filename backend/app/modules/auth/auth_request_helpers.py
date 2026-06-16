from starlette.requests import Request

from app.core.client_request import get_client_ip, get_user_agent
from app.core.user_agent_parser import parse_user_agent
from app.modules.auth.login_client_info import LoginClientInfo


def build_login_client_info(request: Request) -> LoginClientInfo:
    user_agent = get_user_agent(request)
    parsed = parse_user_agent(user_agent)
    return LoginClientInfo(
        ip_address=get_client_ip(request),
        user_agent=user_agent,
        device_type=parsed.device_type,
        browser=parsed.browser,
        operating_system=parsed.operating_system,
    )
