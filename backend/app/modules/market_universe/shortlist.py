"""Versioned long-entry and holder-exit ordering. No attention or legacy evidence bonuses."""

from app.core.constants.trading_constants import SHORTLIST_RANKING_VERSION
from app.modules.market_universe.market_universe_schemas import ScoredUniverseRow, ShortlistRead

RANKING_POLICY_VERSION = SHORTLIST_RANKING_VERSION


def entry_sort_field_names(*, legacy=False, quality_factor=False):
    names = ("eligibility", "readiness", "opportunity_quality", "liquidity_tier", "median_turnover", "symbol", "stock_id")
    if legacy:
        return names
    return ("permission", *names[:3], "score_missing", "opportunity_score", *names[3:]) if quality_factor else ("permission", *names)


def _stable(row):
    return row.stock.symbol.casefold(), str(row.stock.id)


def legacy_entry_sort_key(row: ScoredUniverseRow):
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


def entry_sort_key(row: ScoredUniverseRow, *, quality_factor: bool = False):
    canonical = row.decision.canonical if row.decision else None
    permitted = bool(canonical and canonical.non_holder_action == "BUY"
        and canonical.trade_plan_status == "VALID_ENTRY_PLAN" and canonical.eligibility_status == "ELIGIBLE")
    developing = bool(canonical and canonical.non_holder_action == "WAIT"
        and canonical.eligibility_status == "ELIGIBLE" and canonical.opportunity_quality in {"STRONG", "CONSTRUCTIVE"}
        and not getattr(canonical, "blocker_codes", ())
        and canonical.trade_plan_status in {"VALID_ENTRY_PLAN", "WATCH_ONLY"}
        and getattr(canonical, "primary_reason_code", getattr(canonical, "controlling_reason", None)) in {"no_directional_edge", "constructive_watch"})
    bucket = 0 if permitted else 1 if developing else 2
    old = legacy_entry_sort_key(row)
    if quality_factor:
        score = canonical.opportunity_score if canonical else None
        return (bucket, *old[:3], score is None, -(score if score is not None else 0), *old[3:])
    return (bucket, *old)


def apply_shortlist_ranks(rows: list[ScoredUniverseRow], *, version: str = RANKING_POLICY_VERSION) -> list[ScoredUniverseRow]:
    sort_key = legacy_entry_sort_key if version == "entry-shortlist-v1" else lambda row: entry_sort_key(row, quality_factor=version == "entry-shortlist-v3-shadow-quality")
    entry = {str(row.stock.id): i + 1 for i, row in enumerate(sorted(rows, key=sort_key))}
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
                    *sort_key(row),
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
                    *sort_key(row),
                ),
            )
        )
    }
    return [
        row.model_copy(
            update={
                "shortlist": ShortlistRead(
                    version=version,
                    entry_rank=entry[str(row.stock.id)],
                    holder_exit_rank=holder[str(row.stock.id)],
                    risk_rank=risk[str(row.stock.id)],
                    volume_rank=volume[str(row.stock.id)],
                )
            }
        )
        for row in rows
    ]
