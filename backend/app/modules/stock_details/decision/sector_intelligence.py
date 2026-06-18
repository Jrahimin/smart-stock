from __future__ import annotations

from dataclasses import dataclass
from statistics import median
from uuid import UUID


@dataclass(frozen=True)
class SectorPerformerResult:
    symbol: str
    change_percent: float


@dataclass(frozen=True)
class SectorRankResult:
    key: str
    label: str
    rank: int
    total: int


@dataclass(frozen=True)
class ComparativeMetricResult:
    key: str
    label: str
    stock_value: float | None
    sector_median: float | None
    market_median: float | None


@dataclass(frozen=True)
class SectorContextResult:
    sector_name: str
    stock_count: int
    median_pe: float | None
    median_pb: float | None
    sector_trend_percent: float | None
    sector_trend_window: str | None
    top_performer: SectorPerformerResult | None
    worst_performer: SectorPerformerResult | None
    ranks: list[SectorRankResult]
    comparative_snapshot: list[ComparativeMetricResult]


def _positive_median(values: list[float | None]) -> float | None:
    valid = [value for value in values if value is not None and value > 0]
    if not valid:
        return None
    return float(median(valid))


def _any_median(values: list[float | None]) -> float | None:
    valid = [value for value in values if value is not None]
    if not valid:
        return None
    return float(median(valid))


def _rank_from_sorted_ids(
    *,
    stock_id: UUID,
    sorted_ids: list[UUID],
    key: str,
    label: str,
    min_total: int = 3,
) -> SectorRankResult | None:
    if len(sorted_ids) < min_total or stock_id not in sorted_ids:
        return None
    return SectorRankResult(
        key=key,
        label=label,
        rank=sorted_ids.index(stock_id) + 1,
        total=len(sorted_ids),
    )


def build_sector_ranks(
    *,
    stock_id: UUID,
    sector_stock_ids: list[UUID],
    market_caps: dict[UUID, float | None],
    dividend_yields: dict[UUID, float | None],
    pe_ratios: dict[UUID, float | None],
) -> list[SectorRankResult]:
    ranks: list[SectorRankResult] = []

    cap_rank_ids = sorted(
        [sid for sid in sector_stock_ids if market_caps.get(sid) is not None and market_caps[sid] > 0],
        key=lambda sid: market_caps[sid] or 0,
        reverse=True,
    )
    cap_rank = _rank_from_sorted_ids(
        stock_id=stock_id,
        sorted_ids=cap_rank_ids,
        key="market_cap",
        label="Market Cap",
    )
    if cap_rank:
        ranks.append(cap_rank)

    yield_rank_ids = sorted(
        [
            sid
            for sid in sector_stock_ids
            if dividend_yields.get(sid) is not None and dividend_yields[sid] >= 0
        ],
        key=lambda sid: dividend_yields[sid] or 0,
        reverse=True,
    )
    yield_rank = _rank_from_sorted_ids(
        stock_id=stock_id,
        sorted_ids=yield_rank_ids,
        key="dividend_yield",
        label="Dividend Yield",
    )
    if yield_rank:
        ranks.append(yield_rank)

    valuation_rank_ids = sorted(
        [sid for sid in sector_stock_ids if pe_ratios.get(sid) is not None and pe_ratios[sid] > 0],
        key=lambda sid: pe_ratios[sid] or 0,
    )
    valuation_rank = _rank_from_sorted_ids(
        stock_id=stock_id,
        sorted_ids=valuation_rank_ids,
        key="valuation",
        label="Valuation",
    )
    if valuation_rank:
        ranks.append(valuation_rank)

    return ranks[:3]


def build_comparative_snapshot(
    *,
    stock_pe: float | None,
    stock_pb: float | None,
    stock_dividend_yield: float | None,
    stock_eps_growth: float | None,
    sector_pe_values: list[float | None],
    sector_pb_values: list[float | None],
    sector_yield_values: list[float | None],
    sector_eps_growth_values: list[float | None],
    market_pe_values: list[float | None],
    market_pb_values: list[float | None],
    market_yield_values: list[float | None],
    market_eps_growth_values: list[float | None],
) -> list[ComparativeMetricResult]:
    return [
        ComparativeMetricResult(
            key="pe",
            label="P/E",
            stock_value=stock_pe,
            sector_median=_positive_median(sector_pe_values),
            market_median=_positive_median(market_pe_values),
        ),
        ComparativeMetricResult(
            key="pb",
            label="P/B",
            stock_value=stock_pb,
            sector_median=_positive_median(sector_pb_values),
            market_median=_positive_median(market_pb_values),
        ),
        ComparativeMetricResult(
            key="dividend_yield",
            label="Dividend Yield",
            stock_value=stock_dividend_yield,
            sector_median=_any_median(sector_yield_values),
            market_median=_any_median(market_yield_values),
        ),
        ComparativeMetricResult(
            key="eps_growth",
            label="EPS Growth",
            stock_value=stock_eps_growth,
            sector_median=_any_median(sector_eps_growth_values),
            market_median=_any_median(market_eps_growth_values),
        ),
    ]


def resolve_sector_trend_window(
  sector_stock_ids: list[UUID],
  changes_5d: dict[UUID, float | None],
  changes_20d: dict[UUID, float | None],
) -> tuple[str, dict[UUID, float | None]]:
    if not sector_stock_ids:
        return "5d", changes_5d

    valid_5d = sum(1 for stock_id in sector_stock_ids if changes_5d.get(stock_id) is not None)
    if valid_5d / len(sector_stock_ids) >= 0.5:
        return "5d", changes_5d

    return "20d", changes_20d


def build_sector_performers(
    *,
    symbols_by_id: dict[UUID, str],
    changes: dict[UUID, float | None],
) -> tuple[SectorPerformerResult | None, SectorPerformerResult | None]:
    performers: list[SectorPerformerResult] = []
    for stock_id, change in changes.items():
        if change is None:
            continue
        symbol = symbols_by_id.get(stock_id)
        if not symbol:
            continue
        performers.append(SectorPerformerResult(symbol=symbol, change_percent=change))

    if not performers:
        return None, None

    performers.sort(key=lambda item: item.change_percent, reverse=True)
    return performers[0], performers[-1]


def average_change(changes: dict[UUID, float | None], stock_ids: list[UUID]) -> float | None:
    values = [changes[sid] for sid in stock_ids if changes.get(sid) is not None]
    if not values:
        return None
    return float(sum(values) / len(values))


def compute_eps_yoy_growth(latest_eps: float | None, previous_eps: float | None) -> float | None:
    if latest_eps is None or previous_eps is None or previous_eps == 0:
        return None
    return ((latest_eps - previous_eps) / abs(previous_eps)) * 100
