from __future__ import annotations

from dataclasses import dataclass
from statistics import median

RelativeValuationLabel = str  # Discount to Sector | Near Sector Average | Premium to Sector


@dataclass(frozen=True)
class ValuationMetricContextResult:
    metric_key: str
    stock_value: float | None
    sector_median: float | None
    relative_label: RelativeValuationLabel | None
    peer_count: int
    has_sufficient_peers: bool


@dataclass(frozen=True)
class ValuationContextResult:
    pe: ValuationMetricContextResult | None
    pb: ValuationMetricContextResult | None


def _relative_label(stock_value: float, sector_median: float) -> RelativeValuationLabel:
    if sector_median <= 0:
        return "Near Sector Average"
    ratio = stock_value / sector_median
    if ratio <= 0.85:
        return "Discount to Sector"
    if ratio >= 1.15:
        return "Premium to Sector"
    return "Near Sector Average"


def _build_metric_context(
    *,
    metric_key: str,
    stock_value: float | None,
    peer_values: list[float],
    min_peers: int = 3,
) -> ValuationMetricContextResult:
    valid_peer_values = [value for value in peer_values if value is not None and value > 0]
    peer_count = len(valid_peer_values)
    has_sufficient_peers = peer_count >= min_peers
    sector_median_value = float(median(valid_peer_values)) if has_sufficient_peers else None
    relative: RelativeValuationLabel | None = None
    if (
        has_sufficient_peers
        and stock_value is not None
        and stock_value > 0
        and sector_median_value is not None
    ):
        relative = _relative_label(stock_value, sector_median_value)

    return ValuationMetricContextResult(
        metric_key=metric_key,
        stock_value=stock_value,
        sector_median=sector_median_value,
        relative_label=relative,
        peer_count=peer_count,
        has_sufficient_peers=has_sufficient_peers,
    )


def build_valuation_context(
    *,
    stock_pe: float | None,
    stock_pb: float | None,
    peer_pe_values: list[float],
    peer_pb_values: list[float],
) -> ValuationContextResult:
    return ValuationContextResult(
        pe=_build_metric_context(metric_key="pe", stock_value=stock_pe, peer_values=peer_pe_values),
        pb=_build_metric_context(metric_key="pb", stock_value=stock_pb, peer_values=peer_pb_values),
    )
