from __future__ import annotations

import math
from datetime import date
from decimal import Decimal

from app.core.constants.trading_constants import (
    DASHBOARD_SECTOR_MIN_STOCKS,
    DASHBOARD_SIGNAL_FEED_LIMIT,
)
from app.core.enums import DataQualityFlag, DecisionDisplayAction, TrendDirection
from app.models import DailyMarketSummary, Stock
from app.modules.market_data.market_mover_rules import is_eligible_session_mover
from app.modules.market_universe.market_universe_compute import technical_snapshot_from_read
from app.modules.market_dashboard.market_snapshot import DashboardSnapshotRow, dated_breadth_changes
from app.modules.market_universe.market_universe_schemas import ScoredUniverseRow
from app.modules.stock_details.decision.technical import TechnicalSnapshot, build_technical_snapshot


def _snapshot_for_row(row: ScoredUniverseRow) -> TechnicalSnapshot:
    return technical_snapshot_from_read(row.technical_snapshot)


def _average(values: list[float]) -> float | None:
    if not values:
        return None
    return sum(values) / len(values)


def derive_market_breadth_from_snapshot(rows: list[DashboardSnapshotRow], session_trade_date=None) -> tuple[int, int, int, int]:
    from app.modules.market_data.breadth import breadth_facts
    changes = dated_breadth_changes(rows, session_trade_date) if session_trade_date else [row.technical.price_change_percent for row in rows]
    facts = breadth_facts(changes, cohort="ACTIVE_VALID_OHLC", as_of_date=session_trade_date)
    return facts.advancing, facts.declining, facts.unchanged, facts.denominator


def derive_market_mood_from_snapshot(
    rows: list[DashboardSnapshotRow],
    *,
    advancing: int,
    declining: int,
) -> str:
    if not rows or not any(row.technical.ohlcv_row_count > 1 for row in rows):
        # The lightweight HTTP snapshot is one bar; it cannot establish history-dependent mood.
        return "Unknown"

    average_move = _average([row.technical.price_change_percent for row in rows if row.technical.price_change_percent is not None]) or 0
    average_volatility = _average([row.technical.volatility or 0 for row in rows]) or 0
    volume_expansion = sum(
        1
        for row in rows
        if row.technical.average_volume
        and row.technical.average_volume > 0
        and row.technical.volume > row.technical.average_volume * 1.5
    )

    if average_volatility >= 3.2:
        return "High volatility"
    if advancing > declining * 1.3 and average_move > 0.5 and volume_expansion > len(rows) * 0.15:
        return "Accumulation"
    if advancing > declining * 1.2 and average_move > 0:
        return "Bullish"
    if declining > advancing * 1.25 and average_move < -0.35:
        return "Bearish"
    if average_move > 0 and declining >= advancing:
        return "Weak recovery"
    return "Cautious"


def build_market_alerts_from_snapshot(
    rows: list[DashboardSnapshotRow],
    *,
    latest_summary: DailyMarketSummary | None,
    session_trade_date: date | None,
) -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    suspicious_count = sum(
        1 for row in rows if row.technical.data_quality == DataQualityFlag.SUSPICIOUS
    )

    if latest_summary is not None and (
        latest_summary.has_suspicious_prices or suspicious_count > 0
    ):
        items.append(
            {
                "time": "Data quality",
                "title": "Suspicious activity flagged",
                "description": f"{suspicious_count or 'Some'} instruments need source validation before acting on signals.",
            }
        )

    eligible = [
        row
        for row in rows
        if is_eligible_session_mover(row.technical, session_trade_date)
    ]
    if eligible:
        leader = max(eligible, key=lambda row: row.technical.price_change_percent or 0)
        change = leader.technical.price_change_percent or 0
        items.append(
            {
                "time": leader.technical.latest_trade_date or "Latest",
                "title": f"{leader.stock.symbol} {change:+.2f}%",
                "description": f"Top session mover in the latest snapshot ({leader.stock.name}).",
            }
        )

    trade_date_label = (
        latest_summary.trade_date.isoformat()
        if latest_summary is not None
        else session_trade_date.isoformat()
        if session_trade_date is not None
        else "Latest"
    )
    items.append(
        {
            "time": trade_date_label,
            "title": "Market snapshot ready",
            "description": f"{len(rows)} active instruments in the latest price snapshot.",
        }
    )
    return items


def build_sector_snapshots_from_snapshot(
    rows: list[DashboardSnapshotRow],
    *,
    session_trade_date: date | None,
) -> tuple[list[dict[str, object]], dict[str, object] | None]:
    eligible = [
        row
        for row in rows
        if is_eligible_session_mover(row.technical, session_trade_date)
    ]
    sector_buckets: dict[str, list[float]] = {}
    for row in eligible:
        sector = (row.stock.sector or row.stock.category or "Unclassified").strip() or "Unclassified"
        sector_buckets.setdefault(sector, []).append(row.technical.price_change_percent or 0)

    sectors = [
        {
            "name": name,
            "change_percent": Decimal(str(sum(changes) / len(changes))),
            "stock_count": len(changes),
        }
        for name, changes in sector_buckets.items()
        if len(changes) >= DASHBOARD_SECTOR_MIN_STOCKS
    ]
    sectors.sort(key=lambda item: float(item["change_percent"]), reverse=True)

    top_gainer = None
    if eligible:
        leader = max(eligible, key=lambda row: row.technical.price_change_percent or 0)
        change = leader.technical.price_change_percent or 0
        top_gainer = {
            "symbol": leader.stock.symbol,
            "name": leader.stock.name,
            "change_percent": Decimal(str(change)),
        }

    return sectors, top_gainer


def derive_market_breadth(rows: list[ScoredUniverseRow]) -> tuple[int, int, int, int]:
    advancing = sum(1 for row in rows if (row.technical_snapshot.price_change_percent or 0) > 0)
    declining = sum(1 for row in rows if (row.technical_snapshot.price_change_percent or 0) < 0)
    unchanged = sum(1 for row in rows if (row.technical_snapshot.price_change_percent or 0) == 0)
    return advancing, declining, unchanged, len(rows)


def derive_market_mood(rows: list[ScoredUniverseRow], *, advancing: int, declining: int) -> str:
    if not rows:
        return "Unknown"

    average_move = _average([row.technical_snapshot.price_change_percent or 0 for row in rows]) or 0
    average_volatility = _average([row.technical_snapshot.volatility or 0 for row in rows]) or 0
    volume_expansion = sum(
        1
        for row in rows
        if row.technical_snapshot.average_volume
        and row.technical_snapshot.average_volume > 0
        and row.technical_snapshot.volume > row.technical_snapshot.average_volume * 1.5
    )

    if average_volatility >= 3.2:
        return "High volatility"
    if advancing > declining * 1.3 and average_move > 0.5 and volume_expansion > len(rows) * 0.15:
        return "Accumulation"
    if advancing > declining * 1.2 and average_move > 0:
        return "Bullish"
    if declining > advancing * 1.25 and average_move < -0.35:
        return "Bearish"
    if average_move > 0 and declining >= advancing:
        return "Weak recovery"
    return "Cautious"


def _decision_priority(confidence: int) -> str:
    if confidence >= 70:
        return "high"
    if confidence >= 58:
        return "medium"
    return "low"


def _is_actionable(action: DecisionDisplayAction) -> bool:
    return action in {
        DecisionDisplayAction.POTENTIAL_BUY,
        DecisionDisplayAction.SELL,
    }


def count_actionable_decisions(rows: list[ScoredUniverseRow]) -> int:
    return sum(
        1
        for row in rows
        if row.decision is not None and _is_actionable(row.decision.display_action)
    )


def _format_generated_at(latest_trade_date: date | str | None) -> str:
    if latest_trade_date is None:
        return "Awaiting price data"
    if isinstance(latest_trade_date, str):
        return latest_trade_date
    return latest_trade_date.isoformat()


def _supporting_context(row: ScoredUniverseRow) -> list[str]:
    snapshot = row.technical_snapshot
    context: list[str] = []
    if snapshot.rsi is not None:
        context.append(f"RSI {snapshot.rsi:.1f}")
    if snapshot.average_volume and snapshot.average_volume > 0:
        ratio = snapshot.volume / snapshot.average_volume
        context.append(f"Volume {ratio:.1f}x avg")
    context.append(f"Trend {snapshot.trend.value.replace('_', ' ').lower()}")
    if row.decision is not None:
        context.append(f"Opportunity {row.decision.opportunity_score}")
    return context


def build_signal_feed(rows: list[ScoredUniverseRow], *, limit: int = DASHBOARD_SIGNAL_FEED_LIMIT) -> list[dict[str, object]]:
    ranked = [
        row
        for row in rows
        if row.decision is not None
        and (_is_actionable(row.decision.display_action) or row.decision.confidence >= 55)
    ]
    ranked.sort(key=lambda row: row.decision.confidence if row.decision else 0, reverse=True)

    feed: list[dict[str, object]] = []
    for row in ranked[:limit]:
        decision = row.decision
        if decision is None:
            continue
        feed.append(
            {
                "symbol": row.stock.symbol,
                "exchange": row.stock.exchange,
                "signal": decision.display_action,
                "confidence": decision.confidence,
                "reason": decision.reason,
                "primary_reason_code": decision.primary_reason_code,
                "entry_condition": decision.entry_condition,
                "risk": decision.risk_label.value,
                "priority": _decision_priority(decision.confidence),
                "supporting_context": _supporting_context(row),
                "generated_at": _format_generated_at(row.technical_snapshot.latest_trade_date),
            }
        )
    return feed


def build_market_alerts(
    rows: list[ScoredUniverseRow],
    *,
    latest_summary: DailyMarketSummary | None,
    session_trade_date: date | None,
) -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    suspicious_count = sum(
        1 for row in rows if row.technical_snapshot.data_quality == DataQualityFlag.SUSPICIOUS
    )

    if latest_summary is not None and (
        latest_summary.has_suspicious_prices or suspicious_count > 0
    ):
        items.append(
            {
                "time": "Data quality",
                "title": "Suspicious activity flagged",
                "description": f"{suspicious_count or 'Some'} instruments need source validation before acting on signals.",
            }
        )

    ranked = [row for row in rows if row.decision is not None]
    ranked.sort(key=lambda row: row.decision.confidence if row.decision else 0, reverse=True)
    if ranked and ranked[0].decision is not None:
        top = ranked[0]
        decision = top.decision
        items.append(
            {
                "time": top.technical_snapshot.latest_trade_date or "Latest",
                "title": (
                    f"{top.stock.symbol} "
                    f"{decision.display_action.value.replace('_', ' ').title()}"
                ),
                "description": decision.reason,
            }
        )

    trade_date_label = (
        latest_summary.trade_date.isoformat()
        if latest_summary is not None
        else session_trade_date.isoformat()
        if session_trade_date is not None
        else "Latest"
    )
    items.append(
        {
            "time": trade_date_label,
            "title": "Market scan complete",
            "description": f"{len(rows)} active instruments were evaluated with the shared trader decision engine.",
        }
    )
    return items


def build_sector_snapshots(
    rows: list[ScoredUniverseRow],
    *,
    session_trade_date: date | None,
) -> tuple[list[dict[str, object]], dict[str, object] | None]:
    eligible = [
        row
        for row in rows
        if is_eligible_session_mover(_snapshot_for_row(row), session_trade_date)
    ]
    sector_buckets: dict[str, list[float]] = {}
    for row in eligible:
        sector = (row.stock.sector or row.stock.category or "Unclassified").strip() or "Unclassified"
        sector_buckets.setdefault(sector, []).append(row.technical_snapshot.price_change_percent or 0)

    sectors = [
        {
            "name": name,
            "change_percent": Decimal(str(sum(changes) / len(changes))),
            "stock_count": len(changes),
        }
        for name, changes in sector_buckets.items()
        if len(changes) >= DASHBOARD_SECTOR_MIN_STOCKS
    ]
    sectors.sort(key=lambda item: float(item["change_percent"]), reverse=True)

    top_gainer = None
    if eligible:
        leader = max(eligible, key=lambda row: row.technical_snapshot.price_change_percent or 0)
        change = leader.technical_snapshot.price_change_percent or 0
        top_gainer = {
            "symbol": leader.stock.symbol,
            "name": leader.stock.name,
            "change_percent": Decimal(str(change)),
        }

    return sectors, top_gainer


def build_heatmap_tiles(rows: list[tuple[Stock, TechnicalSnapshot]], *, session_trade_date: date | None = None) -> list[dict[str, object]]:
    if not rows:
        return []

    max_turnover = max((snapshot.turnover or 0) for _, snapshot in rows) or 1
    sorted_rows = sorted(
        rows,
        key=lambda item: float(item[0].market_cap or item[1].turnover or 0),
        reverse=True,
    )

    tiles: list[dict[str, object]] = []
    for stock, snapshot in sorted_rows:
        measured = (session_trade_date is not None
            and snapshot.latest_trade_date == session_trade_date.isoformat()
            and snapshot.data_quality != DataQualityFlag.SUSPICIOUS)
        change = snapshot.price_change_percent if measured else None
        size_source = float(stock.market_cap or snapshot.turnover or 1)
        weight = max(1.0, min(8.0, math.log10(size_source + 10) / 1.8))
        turnover_value = snapshot.turnover or 0
        sector = (stock.sector or stock.category or "Unclassified").strip() or "Unclassified"
        tone = "positive" if change is not None and change > 0 else "negative" if change is not None and change < 0 else "neutral"
        tiles.append(
            {
                "stock_id": stock.id,
                "symbol": stock.symbol,
                "sector": sector,
                "trade_date": snapshot.latest_trade_date,
                "change_percent": Decimal(str(change)) if change is not None else None,
                "weight": Decimal(str(round(weight, 4))),
                "tone": tone,
                "latest_price": Decimal(str(snapshot.latest_price)) if snapshot.latest_price is not None else None,
                "turnover": Decimal(str(snapshot.turnover)) if snapshot.turnover is not None else None,
                "turnover_value": Decimal(str(turnover_value)),
                "liquidity_score": int(round((turnover_value / max_turnover) * 100)),
            }
        )
    return tiles


def build_heatmap_sectors(tiles: list[dict[str, object]]) -> list[dict[str, object]]:
    groups: dict[str, list[dict[str, object]]] = {}
    for tile in tiles:
        groups.setdefault(tile["sector"], []).append(tile)
    sectors = []
    for name, members in groups.items():
        measured = [tile for tile in members if tile["change_percent"] is not None]
        weighted = bool(measured) and all(tile["turnover_value"] > 0 for tile in measured)
        weights = [tile["turnover_value"] if weighted else Decimal(1) for tile in measured]
        change = (sum(tile["change_percent"] * weight for tile, weight in zip(measured, weights))
            / sum(weights)) if measured else None
        sectors.append({"name": name, "change_percent": change, "measured_count": len(measured),
            "total_count": len(members), "weighting": "TURNOVER" if weighted else "EQUAL" if measured else "UNAVAILABLE"})
    return sectors


def build_market_insights(
    *,
    market_mood: str,
    has_partial_data: bool,
    signal_count: int,
    turnover_label: str,
) -> list[dict[str, object]]:
    insights: list[dict[str, object]] = []

    if market_mood != "Unknown":
        description = {
            "Accumulation": "Positive breadth is pairing with stronger participation; prioritize liquid continuation setups.",
            "Bullish": "Breadth and price action lean constructive for the latest available session.",
            "Bearish": "Decliners are leading, so opportunity cards should be checked against risk first.",
            "High volatility": "Volatility is elevated; position sizing and data quality checks matter more than headline direction.",
            "Weak recovery": "The market is attempting to recover, but breadth confirmation is still weak.",
        }.get(market_mood, "Market direction is mixed; confirmation matters more than headline movement.")
        tone = (
            "positive"
            if market_mood in {"Bullish", "Accumulation"}
            else "negative"
            if market_mood in {"Bearish", "High volatility"}
            else "warning"
            if market_mood in {"Weak recovery", "Cautious"}
            else "neutral"
        )
        category = {
            "Accumulation": "accumulation",
            "High volatility": "volatility",
            "Bullish": "opportunity",
            "Bearish": "risk",
        }.get(market_mood, "momentum")
        insights.append(
            {
                "id": "market-mood",
                "title": f"{market_mood} market tone",
                "description": description,
                "tone": tone,
                "category": category,
                "source": "DETERMINISTIC",
            }
        )

    if signal_count > 0:
        insights.append(
            {
                "id": "signal-coverage",
                "title": "Signal layer ready",
                "description": f"{signal_count} highlighted signals include heuristic evidence and risk metadata.",
                "tone": "info",
                "category": "opportunity",
                "source": "DETERMINISTIC",
            }
        )

    insights.append(
        {
            "id": "turnover-context",
            "title": "Turnover context",
            "description": (
                "Turnover data is unavailable. Do not treat this as zero market activity—it may be a data sync or availability issue."
                if turnover_label == "N/A"
                else f"Latest turnover is {turnover_label}."
            ),
            "tone": "warning" if turnover_label == "N/A" else "neutral",
            "category": "quality" if turnover_label == "N/A" else "valuation",
            "source": "DETERMINISTIC",
        }
    )

    if has_partial_data:
        insights.append(
            {
                "id": "partial-data",
                "title": "Data quality caution",
                "description": "Some market fields are partial or validation-only, so the UI should avoid false precision.",
                "tone": "warning",
                "category": "quality",
                "source": "DETERMINISTIC",
            }
        )

    return insights


def measured_market_interpretation(*, breadth, index, summaries, session_date):
    """Describe same-session signs and measured participation, without a mood/history claim."""
    from app.modules.market_dashboard.market_dashboard_schemas import MarketInterpretationRead
    move = index.index_change_percent if index and index.index_close is not None and index.index_close > 0 and index.trade_date == session_date else None
    known = breadth.known_count > 0
    net = breadth.advancing - breadth.declining
    if move is None:
        code = "BREADTH_ONLY" if known else "UNAVAILABLE"
    elif not known:
        code = "INDEX_ONLY"
    elif move > 0 and net > 0:
        code = "ALIGNED_UP"
    elif move < 0 and net < 0:
        code = "ALIGNED_DOWN"
    elif move * net < 0:
        code = "DIVERGENT"
    else:
        code = "MIXED"
    index_name = index.index_name if index else "DSEX"
    previous = {row.trade_date: row.total_volume for row in summaries
        if session_date and row.trade_date < session_date and row.index_name == index_name
        and row.total_volume is not None and row.total_volume >= 0 and row.data_quality_flag != DataQualityFlag.SUSPICIOUS}
    values = [Decimal(str(previous[day])) for day in sorted(previous, reverse=True)[:30]]
    average = sum(values) / len(values) if values else None
    current = index.total_volume if index and index.trade_date == session_date else None
    if current is None:
        current = next((row.total_volume for row in summaries
            if row.trade_date == session_date and row.index_name == index_name
            and row.total_volume is not None and row.total_volume >= 0
            and row.data_quality_flag != DataQualityFlag.SUSPICIOUS), None)
    ratio = Decimal(str(current)) / average if current is not None and current >= 0 and average is not None and average > 0 else None
    return MarketInterpretationRead(code=code, as_of_date=session_date, index_change_percent=move,
        breadth=breadth, volume_vs_average=ratio, volume_average_sessions=len(values))
