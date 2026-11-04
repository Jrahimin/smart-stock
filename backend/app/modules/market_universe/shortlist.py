"""Versioned long-entry and holder-exit ordering. No attention or legacy evidence bonuses."""

from app.core.constants.trading_constants import SHORTLIST_RANKING_VERSION
from app.modules.market_universe.market_universe_schemas import ScoredUniverseRow, ShortlistRead

RANKING_POLICY_VERSION = SHORTLIST_RANKING_VERSION


def _stable(row):
    return row.stock.symbol.casefold(), str(row.stock.id)


def entry_sort_key(row: ScoredUniverseRow):
    canonical = row.decision.canonical if row.decision else None
    liquidity = row.analysis.liquidity if row.analysis else None
    return (
        0 if canonical and canonical.eligibility_status == "ELIGIBLE" else 1,
        {"READY": 0, "CONDITIONAL": 1, "NOT_READY": 2}.get(
            canonical.entry_readiness if canonical else None, 3
        ),
        {"STRONG": 0, "CONSTRUCTIVE": 1, "WEAK": 2}.get(
            canonical.opportunity_quality if canonical else None, 3
        ),
        {"STRONG": 0, "NORMAL": 1, "THIN": 2, "ILLIQUID": 3}.get(
            liquidity.label if liquidity else None, 4
        ),
        -(liquidity.median_turnover or 0) if liquidity else 0,
        *_stable(row),
    )


def apply_shortlist_ranks(rows: list[ScoredUniverseRow]) -> list[ScoredUniverseRow]:
    entry = {str(row.stock.id): i + 1 for i, row in enumerate(sorted(rows, key=entry_sort_key))}
    holder = {
        str(row.stock.id): i + 1
        for i, row in enumerate(
            sorted(
                rows,
                key=lambda row: (
                    {"SELL": 0, "REDUCE": 1, "REVIEW": 2, "HOLD": 3}.get(
                        row.decision.holder_action if row.decision else None, 4
                    ),
                    *_stable(row),
                ),
            )
        )
    }
    risk = {
        str(row.stock.id): i + 1
        for i, row in enumerate(
            sorted(
                rows,
                key=lambda row: (
                    row.analysis.trading_risk.score if row.analysis else 101,
                    *entry_sort_key(row),
                ),
            )
        )
    }
    volume = {
        str(row.stock.id): i + 1
        for i, row in enumerate(
            sorted(
                rows,
                key=lambda row: (
                    -(row.analysis.liquidity.latest_volume_ratio or 0) if row.analysis else 0,
                    *entry_sort_key(row),
                ),
            )
        )
    }
    return [
        row.model_copy(
            update={
                "shortlist": ShortlistRead(
                    version=RANKING_POLICY_VERSION,
                    entry_rank=entry[str(row.stock.id)],
                    holder_exit_rank=holder[str(row.stock.id)],
                    risk_rank=risk[str(row.stock.id)],
                    volume_rank=volume[str(row.stock.id)],
                )
            }
        )
        for row in rows
    ]
