from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from app.core.constants.trading_constants import (
    DASHBOARD_SECTOR_MIN_STOCKS,
    DASHBOARD_SIGNAL_FEED_LIMIT,
)
from app.core.enums import DataQualityFlag, ExchangeCode, TraderRecommendation, TrendDirection
from app.models import DailyMarketSummary, DailyPrice, Stock
from app.modules.market_data.market_mover_rules import is_eligible_session_mover
from app.modules.stock_details.decision.summary import compute_trader_decision_summary_for_stock
from app.modules.stock_details.decision.technical import TechnicalSnapshot, build_technical_snapshot
from app.modules.stock_details.stock_details_schemas import TraderDecisionSummaryRead


@dataclass(frozen=True)
class ScoredDashboardRow:
    stock: Stock
    prices: list[DailyPrice]
    snapshot: TechnicalSnapshot
    decision: TraderDecisionSummaryRead | None


def group_price_window_rows(
    rows: list[tuple[Stock, DailyPrice]],
) -> dict[str, dict[str, object]]:
    grouped: dict[str, dict[str, object]] = {}
    for stock, price in rows:
        stock_id = str(stock.id)
        if stock_id not in grouped:
            grouped[stock_id] = {"stock": stock, "prices": []}
        grouped[stock_id]["prices"].append(price)
    return grouped


def build_scored_rows(grouped: dict[str, dict[str, object]]) -> list[ScoredDashboardRow]:
    scored: list[ScoredDashboardRow] = []
    for entry in grouped.values():
        stock = entry["stock"]
        prices = entry["prices"]
        if not isinstance(stock, Stock) or not isinstance(prices, list):
            continue
        snapshot = build_technical_snapshot(prices)
        if snapshot is None:
            continue
        decision = compute_trader_decision_summary_for_stock(stock, prices)
        scored.append(ScoredDashboardRow(stock=stock, prices=prices, snapshot=snapshot, decision=decision))
    return scored


def _average(values: list[float]) -> float | None:
    if not values:
        return None
    return sum(values) / len(values)


def derive_market_breadth(rows: list[ScoredDashboardRow]) -> tuple[int, int, int, int]:
    advancing = sum(1 for row in rows if (row.snapshot.price_change_percent or 0) > 0)
    declining = sum(1 for row in rows if (row.snapshot.price_change_percent or 0) < 0)
    unchanged = sum(1 for row in rows if (row.snapshot.price_change_percent or 0) == 0)
    return advancing, declining, unchanged, len(rows)


def derive_market_mood(rows: list[ScoredDashboardRow], *, advancing: int, declining: int) -> str:
    if not rows:
        return "Unknown"

    average_move = _average([row.snapshot.price_change_percent or 0 for row in rows]) or 0
    average_volatility = _average([row.snapshot.volatility or 0 for row in rows]) or 0
    volume_expansion = sum(
        1
        for row in rows
        if row.snapshot.average_volume
        and row.snapshot.average_volume > 0
        and row.snapshot.volume > row.snapshot.average_volume * 1.5
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


def _is_actionable(recommendation: TraderRecommendation) -> bool:
    return recommendation in {TraderRecommendation.BUY, TraderRecommendation.SELL}


def _supporting_context(row: ScoredDashboardRow) -> list[str]:
    context: list[str] = []
    if row.snapshot.rsi is not None:
        context.append(f"RSI {row.snapshot.rsi:.1f}")
    if row.snapshot.average_volume and row.snapshot.average_volume > 0:
        ratio = row.snapshot.volume / row.snapshot.average_volume
        context.append(f"Volume {ratio:.1f}x avg")
    context.append(f"Trend {row.snapshot.trend.value.replace('_', ' ').lower()}")
    if row.decision is not None:
        context.append(f"Opportunity {row.decision.opportunity_score}")
    return context


def build_signal_feed(rows: list[ScoredDashboardRow], *, limit: int = DASHBOARD_SIGNAL_FEED_LIMIT) -> list[dict[str, object]]:
    ranked = [
        row
        for row in rows
        if row.decision is not None
        and (_is_actionable(row.decision.recommendation) or row.decision.confidence >= 55)
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
                "signal": decision.recommendation,
                "confidence": decision.confidence,
                "reason": decision.reason,
                "risk": decision.risk_label.value,
                "priority": _decision_priority(decision.confidence),
                "supporting_context": _supporting_context(row),
                "generated_at": row.snapshot.latest_trade_date or "Awaiting price data",
            }
        )
    return feed


def build_market_alerts(
    rows: list[ScoredDashboardRow],
    *,
    latest_summary: DailyMarketSummary | None,
    session_trade_date: date | None,
) -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    suspicious_count = sum(1 for row in rows if row.snapshot.data_quality == DataQualityFlag.SUSPICIOUS)

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
                "time": top.snapshot.latest_trade_date or "Latest",
                "title": f"{top.stock.symbol} {decision.recommendation.value}",
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
    rows: list[ScoredDashboardRow],
    *,
    session_trade_date: date | None,
) -> tuple[list[dict[str, object]], dict[str, object] | None]:
    eligible = [row for row in rows if is_eligible_session_mover(row.snapshot, session_trade_date)]
    sector_buckets: dict[str, list[float]] = {}
    for row in eligible:
        sector = (row.stock.sector or row.stock.category or "Unclassified").strip() or "Unclassified"
        sector_buckets.setdefault(sector, []).append(row.snapshot.price_change_percent or 0)

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
        leader = max(eligible, key=lambda row: row.snapshot.price_change_percent or 0)
        change = leader.snapshot.price_change_percent or 0
        top_gainer = {
            "symbol": leader.stock.symbol,
            "name": leader.stock.name,
            "change_percent": Decimal(str(change)),
        }

    return sectors, top_gainer


def build_heatmap_tiles(rows: list[tuple[Stock, TechnicalSnapshot]]) -> list[dict[str, object]]:
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
        change = snapshot.price_change_percent or 0
        size_source = float(stock.market_cap or snapshot.turnover or 1)
        weight = max(1.0, min(8.0, math.log10(size_source + 10) / 1.8))
        turnover_value = snapshot.turnover or 0
        sector = (stock.sector or stock.category or "Unclassified").strip() or "Unclassified"
        tone = "positive" if change > 0 else "negative" if change < 0 else "neutral"
        tiles.append(
            {
                "stock_id": stock.id,
                "symbol": stock.symbol,
                "sector": sector,
                "change_percent": Decimal(str(change)),
                "weight": Decimal(str(round(weight, 4))),
                "tone": tone,
                "latest_price": Decimal(str(snapshot.latest_price or 0)),
                "turnover": Decimal(str(turnover_value)),
                "turnover_value": Decimal(str(turnover_value)),
                "liquidity_score": int(round((turnover_value / max_turnover) * 100)),
            }
        )
    return tiles


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
                "description": f"{signal_count} highlighted signals can be explained with structured confidence and risk metadata.",
                "tone": "info",
                "category": "opportunity",
                "source": "DETERMINISTIC",
            }
        )

    insights.append(
        {
            "id": "turnover-context",
            "title": "Turnover context",
            "description": f"Latest turnover is {turnover_label}. Treat missing values as a data availability issue, not a zero-activity market.",
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
