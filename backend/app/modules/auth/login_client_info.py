from dataclasses import dataclass


@dataclass(frozen=True)
class LoginClientInfo:
    ip_address: str | None
    user_agent: str | None
    device_type: str
    browser: str
    operating_system: str
