from dataclasses import dataclass


@dataclass(frozen=True)
class ParsedUserAgent:
    device_type: str
    browser: str
    operating_system: str


def parse_user_agent(user_agent: str | None) -> ParsedUserAgent:
    if not user_agent:
        return ParsedUserAgent(device_type="unknown", browser="unknown", operating_system="unknown")

    lowered = user_agent.lower()
    device_type = _detect_device_type(lowered)
    browser = _detect_browser(lowered, user_agent)
    operating_system = _detect_operating_system(lowered)
    return ParsedUserAgent(device_type=device_type, browser=browser, operating_system=operating_system)


def _detect_device_type(lowered: str) -> str:
    if "mobile" in lowered or "iphone" in lowered or "android" in lowered:
        return "mobile"
    if "tablet" in lowered or "ipad" in lowered:
        return "tablet"
    return "desktop"


def _detect_browser(lowered: str, original: str) -> str:
    if "edg/" in lowered or "edge/" in lowered:
        return "Edge"
    if "chrome/" in lowered and "chromium" not in lowered:
        return "Chrome"
    if "firefox/" in lowered:
        return "Firefox"
    if "safari/" in lowered and "chrome" not in lowered:
        return "Safari"
    if "opr/" in lowered or "opera" in lowered:
        return "Opera"
    return original.split(" ", 1)[0][:40] if original else "unknown"


def _detect_operating_system(lowered: str) -> str:
    if "windows" in lowered:
        return "Windows"
    if "mac os" in lowered or "macintosh" in lowered:
        return "macOS"
    if "android" in lowered:
        return "Android"
    if "iphone" in lowered or "ipad" in lowered or "ios" in lowered:
        return "iOS"
    if "linux" in lowered:
        return "Linux"
    return "unknown"
