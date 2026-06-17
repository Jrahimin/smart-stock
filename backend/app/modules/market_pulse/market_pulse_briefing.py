from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from app.core.enums import ExchangeCode, MarketAlertType, PulseFocusLabel, TrendDirection
from app.models import DailyMarketSummary
from app.modules.market_pulse.market_pulse_schemas import (
    FocusStockRead,
    HighPriorityRead,
    LeadershipCardRead,
    MarketAlertRead,
    MarketBriefingRead,
    MarketLeadershipRead,
    MarketStateDimensionRead,
    MarketStateRead,
    MarketStoryMetricRead,
    MarketStoryRead,
    MarketSummaryHighlightRead,
    MarketSummaryRead,
    TradingEnvironmentRead,
    TradingEnvironmentSignalRead,
    MoneyFlowRead,
    MoneyFlowSectorRead,
    OpportunityScoreRead,
    PlaybookItemRead,
    PlaybookRead,
)
from app.modules.market_pulse.pulse_score import get_volume_ratio
from app.modules.stock_details.decision.technical import TechnicalSnapshot


@dataclass(frozen=True)
class PulseBriefingRow:
    """Presentation row for briefing — pre-scored in pulse service, no recompute here."""

    stock: object
    snapshot: TechnicalSnapshot
    decision: object
    score: object


def _sector_name(stock) -> str:
    return (getattr(stock, "sector", None) or getattr(stock, "category", None) or "Unclassified").strip() or "Unclassified"


def _compute_breadth(rows: list[PulseBriefingRow]) -> dict[str, int]:
    advancing = sum(1 for row in rows if (row.snapshot.price_change_percent or 0) > 0.05)
    declining = sum(1 for row in rows if (row.snapshot.price_change_percent or 0) < -0.05)
    unchanged = max(0, len(rows) - advancing - declining)
    total = max(len(rows), 1)
    return {
        "advancing": advancing,
        "declining": declining,
        "unchanged": unchanged,
        "total": total,
    }


def _sector_performance(rows: list[PulseBriefingRow]) -> dict[str, list[float]]:
    buckets: dict[str, list[float]] = defaultdict(list)
    for row in rows:
        change = row.snapshot.price_change_percent or 0
        buckets[_sector_name(row.stock)].append(change)
    return buckets


def _avg(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _format_turnover_compact(value: float) -> str:
    if value >= 1_000_000_000:
        return f"BDT {value / 1_000_000_000:.0f}B"
    if value >= 1_000_000:
        return f"BDT {value / 1_000_000:.0f}M"
    return f"BDT {value:,.0f}"


def _state_tone(value: str) -> str:
    positive = {"Bullish", "Strong", "Broad", "Risk-On"}
    negative = {"Bearish", "Weak", "Narrow", "Defensive"}
    if value in positive:
        return "positive"
    if value in negative:
        return "negative"
    if value in {"Neutral", "Mixed"}:
        return "neutral"
    return "warning"


def _participation_line_from_summaries(summaries: list[DailyMarketSummary]) -> str:
    filtered = [
        summary
        for summary in summaries
        if summary.index_name != "SOURCE_VALIDATION" and summary.total_turnover is not None
    ]
    if len(filtered) < 2:
        return "Participation is being assessed from the latest available session data."

    sorted_summaries = sorted(filtered, key=lambda item: item.trade_date)
    latest_turnover = float(sorted_summaries[-1].total_turnover or 0)
    baseline = sorted_summaries[-21:-1]
    if not baseline:
        return "Participation is being assessed from the latest available session data."

    baseline_total = sum(float(item.total_turnover or 0) for item in baseline) / len(baseline)
    if baseline_total > 0 and latest_turnover < baseline_total * 0.85:
        return "Participation remains weak while turnover stays below normal levels."
    if baseline_total > 0 and latest_turnover > baseline_total * 1.15:
        return "Participation is improving with turnover running above recent averages."
    return "Participation remains mixed while turnover stays near normal levels."


def _rotation_line(top_inflow_names: list[str]) -> str:
    if not top_inflow_names:
        return "Leadership remains concentrated in a narrow set of names."
    names = " & ".join(top_inflow_names[:2])
    return f"Capital continues rotating into {names}."


def _opportunity_history_from_summaries(
    summaries: list[DailyMarketSummary],
    *,
    last_n: int = 5,
) -> list[int]:
    filtered = [
        summary
        for summary in summaries
        if summary.index_name != "SOURCE_VALIDATION" and summary.index_change_percent is not None
    ]
    if not filtered:
        return []

    sorted_summaries = sorted(filtered, key=lambda item: item.trade_date)[-last_n:]
    history: list[int] = []
    for summary in sorted_summaries:
        change = float(summary.index_change_percent or 0)
        score = int(round(50 + change * 8))
        history.append(max(0, min(100, score)))
    return history


def _index_close_sparkline(
    summaries: list[DailyMarketSummary],
    *,
    last_n: int = 8,
) -> list[float]:
    filtered = [
        summary
        for summary in summaries
        if summary.index_name != "SOURCE_VALIDATION" and summary.index_close is not None
    ]
    if not filtered:
        return []

    sorted_summaries = sorted(filtered, key=lambda item: item.trade_date)[-last_n:]
    return [float(summary.index_close) for summary in sorted_summaries]


def _snapshot_sparkline(snapshot: TechnicalSnapshot) -> list[float]:
    if snapshot.sparkline_closes:
        return list(snapshot.sparkline_closes)
    if snapshot.latest_price is not None and snapshot.previous_close is not None:
        return [float(snapshot.previous_close), float(snapshot.latest_price)]
    if snapshot.latest_price is not None:
        return [float(snapshot.latest_price)]
    return []


def build_market_briefing(
    rows: list[PulseBriefingRow],
    focus_reads: list[FocusStockRead],
    monitor_reads: list[FocusStockRead],
    alerts: list[MarketAlertRead],
    *,
    market_summaries: list[DailyMarketSummary] | None = None,
    format_number,
    format_percent,
    price_tone,
    sparkline_points,
) -> MarketBriefingRead | None:
    if not rows:
        return None

    summaries = market_summaries or []
    breadth = _compute_breadth(rows)
    total = breadth["total"]
    adv_pct = breadth["advancing"] / total * 100
    decl_pct = breadth["declining"] / total * 100
    unch_pct = breadth["unchanged"] / total * 100
    adv_decl_ratio = breadth["advancing"] / max(breadth["declining"], 1)

    sector_perf = _sector_performance(rows)
    declining_sectors = sum(1 for values in sector_perf.values() if _avg(values) < -0.15)
    inflow_sectors = sorted(
        ((name, _avg(values)) for name, values in sector_perf.items() if len(values) >= 3),
        key=lambda item: item[1],
        reverse=True,
    )
    outflow_sectors = sorted(
        ((name, _avg(values)) for name, values in sector_perf.items() if len(values) >= 3),
        key=lambda item: item[1],
    )

    top_inflow_names = [name for name, _ in inflow_sectors[:2]]
    briefing_line_one = _participation_line_from_summaries(summaries)
    briefing_line_two = _rotation_line(top_inflow_names)

    if breadth["declining"] > breadth["advancing"] * 1.15:
        headline = f"SELLING PRESSURE BROADENING\nACROSS {max(declining_sectors, 1)} SECTORS"
        story_tone = "negative"
    elif breadth["advancing"] > breadth["declining"] * 1.15:
        expanding_sectors = len([change for _, change in inflow_sectors if change > 0.2])
        headline = f"BUYING INTEREST EXPANDING\nACROSS {max(expanding_sectors, 1)} SECTORS"
        story_tone = "positive"
    else:
        headline = "MIXED MARKET WITH SELECTIVE ROTATION"
        story_tone = "warning"

    explanation = f"{briefing_line_one}\n{briefing_line_two}"

    total_turnover = sum(row.snapshot.turnover or 0 for row in rows)
    story = MarketStoryRead(
        headline=headline,
        explanation=explanation,
        tone=story_tone,
        metrics=[
            MarketStoryMetricRead(
                label="Advancing",
                value=str(breadth["advancing"]),
                sub_value=f"{adv_pct:.1f}%",
                tone="positive",
            ),
            MarketStoryMetricRead(
                label="Declining",
                value=str(breadth["declining"]),
                sub_value=f"{decl_pct:.1f}%",
                tone="negative",
            ),
            MarketStoryMetricRead(
                label="Unchanged",
                value=str(breadth["unchanged"]),
                sub_value=f"{unch_pct:.1f}%",
                tone="neutral",
            ),
            MarketStoryMetricRead(
                label="Adv/Decl Ratio",
                value=f"{adv_decl_ratio:.2f}",
                tone="negative" if adv_decl_ratio < 0.85 else "positive" if adv_decl_ratio > 1.15 else "neutral",
            ),
            MarketStoryMetricRead(
                label="Turnover",
                value=_format_turnover_compact(total_turnover),
                tone="info",
            ),
        ],
    )

    sentiment = "Bearish" if breadth["declining"] > breadth["advancing"] * 1.12 else (
        "Bullish" if breadth["advancing"] > breadth["declining"] * 1.12 else "Neutral"
    )
    avg_volume_ratio = sum(get_volume_ratio(row.snapshot) for row in rows) / total
    participation = "Weak" if avg_volume_ratio < 0.95 else "Strong" if avg_volume_ratio > 1.15 else "Moderate"
    uptrend_count = sum(1 for row in rows if row.snapshot.trend == TrendDirection.UPTREND)
    momentum = "Positive" if uptrend_count / total >= 0.42 else "Negative" if uptrend_count / total <= 0.32 else "Neutral"
    stock_sector_map = {str(getattr(row.stock, "id", "")): _sector_name(row.stock) for row in rows}
    focus_sectors = {stock_sector_map.get(str(stock.stock_id), "Unclassified") for stock in focus_reads}
    leadership = "Narrow" if len(focus_sectors) <= 2 else "Broad"

    if sentiment == "Bearish" and participation == "Weak":
        overall = "Defensive Rotation"
        overall_tone = "warning"
    elif sentiment == "Bullish" and momentum == "Positive":
        overall = "Risk-On Expansion"
        overall_tone = "positive"
    elif sentiment == "Neutral":
        overall = "Selective Opportunity"
        overall_tone = "info"
    else:
        overall = "Cautious Positioning"
        overall_tone = "warning"

    state = MarketStateRead(
        dimensions=[
            MarketStateDimensionRead(key="sentiment", label="Sentiment", value=sentiment, tone=_state_tone(sentiment)),
            MarketStateDimensionRead(
                key="participation",
                label="Participation",
                value=participation,
                tone=_state_tone(participation if participation != "Moderate" else "Neutral"),
            ),
            MarketStateDimensionRead(
                key="momentum",
                label="Momentum",
                value=momentum,
                tone=_state_tone(momentum if momentum != "Neutral" else "Neutral"),
            ),
            MarketStateDimensionRead(key="leadership", label="Leadership", value=leadership, tone=_state_tone(leadership)),
        ],
        overall_label=overall,
        overall_tone=overall_tone,
    )

    max_strength = max((abs(change) for _, change in inflow_sectors), default=1.0) or 1.0

    def to_flow_sector(name: str, change: float, positive: bool) -> MoneyFlowSectorRead:
        sign = "+" if change >= 0 else ""
        return MoneyFlowSectorRead(
            sector=name,
            change_label=f"{sign}{change:.2f}",
            strength=min(100.0, abs(change) / max_strength * 100),
            tone="positive" if positive else "negative",
        )

    money_flow = MoneyFlowRead(
        inflows=[to_flow_sector(name, change, True) for name, change in inflow_sectors[:3] if change > 0],
        outflows=[to_flow_sector(name, change, False) for name, change in reversed(outflow_sectors[:3]) if change < 0],
    )
    if not money_flow.inflows and inflow_sectors:
        name, change = inflow_sectors[0]
        money_flow.inflows = [to_flow_sector(name, max(change, 0.1), True)]
    if not money_flow.outflows and outflow_sectors:
        name, change = outflow_sectors[0]
        money_flow.outflows = [to_flow_sector(name, min(change, -0.1), False)]

    focus_scores = [stock.pulse_score for stock in focus_reads]
    monitor_scores = [stock.pulse_score for stock in monitor_reads]
    pool_scores = focus_scores or monitor_scores or [row.score.total for row in rows[:20]]
    opportunity = int(round(sum(pool_scores) / len(pool_scores))) if pool_scores else 50
    prior_history = _opportunity_history_from_summaries(summaries, last_n=4)
    history = (prior_history + [opportunity])[-5:]
    previous_session = history[-2] if len(history) >= 2 else None
    weekly_average = int(round(sum(history) / len(history))) if history else None
    trend_label: str | None = None
    if previous_session is not None:
        if opportunity > previous_session + 2:
            trend_label = "Improving"
        elif opportunity < previous_session - 2:
            trend_label = "Softening"
        else:
            trend_label = "Stable"

    opportunity_score = OpportunityScoreRead(
        score=opportunity,
        label=(
            "Above Average Opportunity Environment"
            if opportunity >= 68
            else "Selective Opportunity Environment"
            if opportunity >= 55
            else "Limited Opportunity Environment"
        ),
        history=history,
        previous_session=previous_session,
        weekly_average=weekly_average,
        trend_label=trend_label,
    )

    aggressive_count = sum(
        1
        for row in rows
        if row.score.total >= 75
        and getattr(row, "label", None)
        in {PulseFocusLabel.NEW_BUY_SETUP, PulseFocusLabel.VOLUME_BREAKOUT}
    )
    watchlist_count = len(monitor_reads) or len(focus_reads)
    playbook = PlaybookRead(
        question="What should I do next?",
        items=[
            PlaybookItemRead(
                profile="Aggressive",
                summary=f"{aggressive_count} setup{'s' if aggressive_count != 1 else ''} available",
                guidance="Focus on momentum breakouts" if aggressive_count > 0 else "Wait for stronger setups",
                tone="positive",
            ),
            PlaybookItemRead(
                profile="Balanced",
                summary=f"{watchlist_count} candidate{'s' if watchlist_count != 1 else ''}",
                guidance="Wait for confirmation",
                tone="warning",
            ),
            PlaybookItemRead(
                profile="Defensive",
                summary="Remain selective",
                guidance="Sellers still dominate" if sentiment == "Bearish" else "Confirmation still required",
                tone="negative",
            ),
        ],
    )

    high_priority: HighPriorityRead | None = None
    volume_alert = next((alert for alert in alerts if alert.alert_type == MarketAlertType.UNUSUAL_VOLUME), None)
    top_focus = focus_reads[0] if focus_reads else None
    if volume_alert and volume_alert.symbol:
        row = next((r for r in rows if getattr(r.stock, "symbol", None) == volume_alert.symbol), None)
        focus_match = next((stock for stock in focus_reads if stock.symbol == volume_alert.symbol), None)
        if focus_match:
            trigger_level = focus_match.trigger
        elif row is not None:
            from app.modules.market_pulse.pulse_score import build_pulse_trigger

            trigger_level = build_pulse_trigger(row.snapshot, row.decision)
        else:
            trigger_level = volume_alert.latest_price or "N/A"
        high_priority = HighPriorityRead(
            symbol=volume_alert.symbol,
            name=getattr(row.stock, "name", volume_alert.symbol) if row else volume_alert.symbol,
            exchange=volume_alert.exchange or ExchangeCode.DSE,
            reason=volume_alert.why_it_matters,
            trigger_level=trigger_level,
            metric_label=f"{volume_alert.metric_label} vs 30D average volume",
            latest_price=volume_alert.latest_price or "N/A",
            price_change_percent=volume_alert.price_change_percent or "N/A",
            price_tone=volume_alert.price_tone or "neutral",
            sparkline_points=focus_match.sparkline_points if focus_match else [],
        )
    elif top_focus:
        high_priority = HighPriorityRead(
            symbol=top_focus.symbol,
            name=top_focus.name,
            exchange=top_focus.exchange,
            reason=top_focus.why_here[0] if top_focus.why_here else top_focus.focus_label.value,
            trigger_level=top_focus.trigger,
            metric_label=f"Score {top_focus.pulse_score}/100",
            latest_price=top_focus.latest_price,
            price_change_percent=top_focus.price_change_percent,
            price_tone=top_focus.price_tone,
            sparkline_points=top_focus.sparkline_points,
        )

    strongest_sector = inflow_sectors[0][0] if inflow_sectors else "N/A"
    strongest_stock_row = max(rows, key=lambda row: row.snapshot.price_change_percent or 0, default=None)
    accumulation_row = max(rows, key=lambda row: get_volume_ratio(row.snapshot), default=None)
    fresh_signals = [
        stock.symbol
        for stock in focus_reads
        if stock.recommendation == "BUY"
        or stock.focus_label in {PulseFocusLabel.NEW_BUY_SETUP, PulseFocusLabel.SIGNAL_UPGRADE}
    ][:4]
    fresh_new_count = sum(1 for stock in focus_reads if stock.focus_label == PulseFocusLabel.NEW_BUY_SETUP)
    fresh_upgraded_count = sum(1 for stock in focus_reads if stock.focus_label == PulseFocusLabel.SIGNAL_UPGRADE)

    sector_change = inflow_sectors[0][1] if inflow_sectors else None
    advancing_in_sector = sum(
        1
        for row in rows
        if _sector_name(row.stock) == strongest_sector and (row.snapshot.price_change_percent or 0) > 0.05
    )
    leadership_narrative = (
        f"Leadership remains concentrated in {strongest_sector}."
        if strongest_sector != "N/A"
        else "Leadership remains fragmented across sectors."
    )
    accumulation_ratio = get_volume_ratio(accumulation_row.snapshot) if accumulation_row else None

    leadership_block = MarketLeadershipRead(
        narrative=leadership_narrative,
        fresh_new_count=fresh_new_count,
        fresh_upgraded_count=fresh_upgraded_count,
        cards=[
            LeadershipCardRead(
                kind="sector",
                title="Strongest Sector",
                name=strongest_sector,
                detail=format_percent(sector_change) if sector_change is not None else None,
                subtitle=f"Leading sector today · {advancing_in_sector} advancing stocks",
                tone="positive",
                href="/scanner",
                sparkline_points=_index_close_sparkline(summaries),
            ),
            LeadershipCardRead(
                kind="stock",
                title="Strongest Stock",
                name=getattr(strongest_stock_row.stock, "symbol", "N/A") if strongest_stock_row else "N/A",
                detail=(
                    format_percent(strongest_stock_row.snapshot.price_change_percent)
                    if strongest_stock_row
                    else None
                ),
                subtitle="Session price leader",
                tone="positive",
                href=(
                    f"/stocks/{getattr(strongest_stock_row.stock, 'exchange', ExchangeCode.DSE)}/"
                    f"{getattr(strongest_stock_row.stock, 'symbol', '')}"
                    if strongest_stock_row
                    else None
                ),
                sparkline_points=(
                    _snapshot_sparkline(strongest_stock_row.snapshot) if strongest_stock_row else []
                ),
            ),
            LeadershipCardRead(
                kind="accumulation",
                title="Accumulation Leader",
                name=getattr(accumulation_row.stock, "symbol", "N/A") if accumulation_row else "N/A",
                detail=f"{accumulation_ratio:.1f}x accumulation" if accumulation_ratio is not None else None,
                subtitle="vs 30D average volume",
                tone="info",
                href=(
                    f"/stocks/{getattr(accumulation_row.stock, 'exchange', ExchangeCode.DSE)}/"
                    f"{getattr(accumulation_row.stock, 'symbol', '')}"
                    if accumulation_row
                    else None
                ),
                sparkline_points=(
                    _snapshot_sparkline(accumulation_row.snapshot) if accumulation_row else []
                ),
            ),
        ],
        fresh_buy_signals=fresh_signals,
    )

    inflow_text = " & ".join(name for name, _ in inflow_sectors[:2]) if inflow_sectors else "selective groups"
    opportunity_short = (
        "Above Average"
        if opportunity >= 68
        else "Selective"
        if opportunity >= 55
        else "Limited"
    )
    leadership_highlight = "Concentrated" if leadership == "Narrow" else "Broad"
    sector_rotation_active = len(inflow_sectors) >= 2 or advancing_in_sector >= 3
    trading_signals: list[TradingEnvironmentSignalRead] = []
    if opportunity >= 68:
        trading_signals.append(
            TradingEnvironmentSignalRead(text="Opportunity environment above average", tone="positive")
        )
    elif opportunity >= 55:
        trading_signals.append(
            TradingEnvironmentSignalRead(text="Opportunity environment selective", tone="warning")
        )
    else:
        trading_signals.append(
            TradingEnvironmentSignalRead(text="Opportunity environment limited", tone="warning")
        )
    if sector_rotation_active:
        trading_signals.append(
            TradingEnvironmentSignalRead(text="Sector rotation active", tone="positive")
        )
    if breadth["declining"] > breadth["advancing"]:
        trading_signals.append(
            TradingEnvironmentSignalRead(text="Breadth remains weak", tone="warning")
        )
    if leadership == "Narrow":
        trading_signals.append(
            TradingEnvironmentSignalRead(text="Leadership remains concentrated", tone="warning")
        )
    if sentiment == "Bearish" and opportunity >= 68:
        trading_overall = "Selective Risk-On"
        trading_overall_tone = "warning"
    elif overall_tone == "positive":
        trading_overall = "Risk-On"
        trading_overall_tone = "positive"
    elif overall == "Cautious Positioning":
        trading_overall = "Selective Risk-On"
        trading_overall_tone = "warning"
    else:
        trading_overall = overall
        trading_overall_tone = overall_tone

    summary_text = (
        f"Market remains in a {overall.lower()} phase.\n"
        f"Leadership is concentrated in {inflow_text} while participation remains {participation.lower()}. "
        "Focus on liquidity, confirmation, and disciplined position sizing."
    )
    summary = MarketSummaryRead(
        text=summary_text,
        tone=overall_tone,
        highlights=[
            MarketSummaryHighlightRead(label="Sentiment", value=sentiment, tone=_state_tone(sentiment)),
            MarketSummaryHighlightRead(
                label="Opportunity",
                value=opportunity_short,
                tone="positive" if opportunity >= 68 else "warning",
            ),
            MarketSummaryHighlightRead(label="Leadership", value=leadership_highlight, tone=_state_tone(leadership)),
        ],
        trading_environment=TradingEnvironmentRead(
            signals=trading_signals[:4],
            overall_label=trading_overall,
            overall_tone=trading_overall_tone,
        ),
    )

    return MarketBriefingRead(
        story=story,
        state=state,
        money_flow=money_flow,
        opportunity_score=opportunity_score,
        playbook=playbook,
        high_priority=high_priority,
        leadership=leadership_block,
        summary=summary,
    )
