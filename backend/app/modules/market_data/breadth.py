"""Explicit populations and missing-data denominators for session breadth."""
from datetime import date
from math import isfinite

from pydantic import BaseModel


class BreadthRead(BaseModel):
    cohort: str
    neutral_band_percent: float
    source: str
    as_of_date: date | None = None
    advancing: int
    declining: int
    unchanged: int
    known_count: int
    unknown_count: int
    cohort_count: int
    denominator: int


def breadth_facts(changes, *, cohort, band=0.0, source="daily_prices", as_of_date=None):
    values = list(changes)
    known = [float(value) for value in values if value is not None and isfinite(float(value))]
    up = sum(value > band for value in known)
    down = sum(value < -band for value in known)
    return BreadthRead(cohort=cohort, neutral_band_percent=band, source=source, as_of_date=as_of_date,
        advancing=up, declining=down, unchanged=len(known)-up-down,
        known_count=len(known), unknown_count=len(values)-len(known),
        cohort_count=len(values), denominator=len(known))
