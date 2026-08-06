"""Helpers for stock autocomplete search ranking and LIKE safety."""


def escape_ilike_pattern(value: str) -> str:
    """Escape LIKE wildcards so user input is matched literally."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
