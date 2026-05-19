"""Turnover normalization aligned with AmarStock HTML VALUE handling."""

from __future__ import annotations

from decimal import Decimal


def normalize_amarstock_turnover_text(value: str | None) -> Decimal | None:
    """Parse AmarStock numeric VALUE; treat unsuffixed numbers as millions (BDT)."""
    if value is None:
        return None
    normalized_value = value.replace(",", "").strip().upper()
    if normalized_value in {"", "-", "--", "N/A"}:
        return None

    multiplier = Decimal("1")
    if normalized_value.endswith("K"):
        multiplier = Decimal("1000")
        normalized_value = normalized_value[:-1]
    elif normalized_value.endswith("M"):
        multiplier = Decimal("1000000")
        normalized_value = normalized_value[:-1]

    parsed = Decimal(normalized_value.strip()) * multiplier
    if value.strip().upper().endswith(("K", "M")):
        return parsed
    return parsed * Decimal("1000000")
