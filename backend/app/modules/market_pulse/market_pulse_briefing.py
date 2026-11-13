from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from fractions import Fraction

from app.core.enums import ExchangeCode, MarketAlertType, PulseFocusLabel, TrendDirection
from app.models import DailyMarketSummary
from app.modules.market_data.session_leadership import (
    eligible_sector_returns,
    measured_price_change,
    measured_price_leader,
)
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
    MoneyFlowRead,
    MoneyFlowSectorRead,
    OpportunityScoreRead,
    PlaybookItemRead,
    PlaybookRead,
    TradingEnvironmentRead,
    TradingEnvironmentSignalRead,
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
    measured_change_percent: Fraction | None = None
    change_basis_available: bool = True



def _row_change(row: PulseBriefingRow) -> Fraction | None:
    if not row.change_basis_available:
        return None
    return row.measured_change_percent if row.measured_change_percent is not None else measured_price_change(row.snapshot)



def _sector_name(stock) -> str:
    return (getattr(stock, "sector", None) or getattr(stock, "category", None) or "Unclassified").strip() or "Unclassified"


def _compute_breadth(rows: list[PulseBriefingRow]) -> dict[str, int]:
    from app.modules.market_data.breadth import breadth_facts
    facts = breadth_facts([_row_change(row) if row.change_basis_available else measured_price_change(row.snapshot) for row in rows], cohort="CANONICAL_ELIGIBLE_SAME_SESSION", band=0.05)
    return {"advancing": facts.advancing, "declining": facts.declining,
            "unchanged": facts.unchanged, "total": facts.denominator}


def _sector_performance(rows: list[PulseBriefingRow]) -> dict[str, list[Fraction]]:
    buckets: dict[str, list[Fraction]] = defaultdict(list)
    for row in rows:
        change = _row_change(row)
        if change is not None:
            buckets[_sector_name(row.stock)].append(change)
    return buckets


def _avg(values: list[Fraction]) -> Fraction:
    return sum(values, Fraction()) / len(values) if values else Fraction()


def _format_sector_percent(change: Fraction) -> str:
    sign = "+" if change > 0 else "-" if change < 0 else ""
    if 0 < abs(change) < Fraction(1, 100):
        return f"{sign}<0.01%"
    return f"{'+' if change > 0 else ''}{float(change):.2f}%"


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


def _sector_leadership_line(top_inflow_names: list[str], *, broad: bool = False) -> str:
    if not top_inflow_names:
        return "No positive sector side is present in the eligible set."
    names = " & ".join(top_inflow_names[:2])
    return f"Sector price leadership is broad, led by {names}." if broad else f"Sector price leadership is concentrated in {names}."


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
    opportunity_score: OpportunityScoreRead | None = None,
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
    adv_pct = breadth["advancing"] / total * 100 if total else 0
    decl_pct = breadth["declining"] / total * 100 if total else 0
    unch_pct = breadth["unchanged"] / total * 100 if total else 0
    adv_decl_ratio = breadth["advancing"] / breadth["declining"] if breadth["declining"] else None

    measured_sectors, excluded_sector_count = eligible_sector_returns((row.stock, _row_change(row)) for row in rows)
    sector_changes = [(name, change) for name, change, _ in measured_sectors]
    declining_sectors = sum(1 for _, change in sector_changes if change < Fraction(-3, 20))
    inflow_sectors = sorted(
        ((name, change) for name, change in sector_changes if change > 0),
        key=lambda item: (-item[1], item[0]),
    )
    outflow_sectors = sorted(
        ((name, change) for name, change in sector_changes if change < 0),
        key=lambda item: (item[1], item[0]),
    )

    top_inflow_names = [name for name, _ in inflow_sectors[:2]]
    leadership = ("Unavailable" if not sector_changes else "None" if not inflow_sectors
        else "Broad" if len(inflow_sectors) >= 3 and breadth["advancing"] > breadth["declining"] else "Narrow")
    briefing_line_one = _participation_line_from_summaries(summaries)
    briefing_line_two = _sector_leadership_line(top_inflow_names, broad=leadership == "Broad") if sector_changes else "Sector leadership data is unavailable."

    headline_sector_count = None
    if breadth["declining"] > breadth["advancing"] * 1.15:
        headline_code = "WEAKNESS_SECTORS" if declining_sectors else "WEAKNESS_STOCKS"
        headline_sector_count = declining_sectors or None
        headline = (
            f"PRICE WEAKNESS BROADENING\nACROSS {declining_sectors} {'SECTOR' if declining_sectors == 1 else 'SECTORS'}"
            if declining_sectors > 0
            else "PRICE WEAKNESS BROADENING\nACROSS ELIGIBLE STOCKS"
        )
        story_tone = "negative"
    elif breadth["advancing"] > breadth["declining"] * 1.15:
        expanding_sectors = len([change for _, change in inflow_sectors if change > Fraction(1, 5)])
        headline_code = "STRENGTH_SECTORS" if expanding_sectors else "STRENGTH_STOCKS"
        headline_sector_count = expanding_sectors or None
        headline = (
            f"PRICE STRENGTH EXPANDING\nACROSS {expanding_sectors} {'SECTOR' if expanding_sectors == 1 else 'SECTORS'}"
            if expanding_sectors > 0
            else "PRICE STRENGTH EXPANDING\nACROSS ELIGIBLE STOCKS"
        )
        story_tone = "positive"
    else:
        headline_code = "MIXED_SECTORS" if inflow_sectors else "NO_POSITIVE_SECTOR" if sector_changes else "SECTOR_UNAVAILABLE"
        headline = "MIXED MARKET WITH SELECTIVE LEADERSHIP" if inflow_sectors else "NO POSITIVE SECTOR LEADER" if sector_changes else "SECTOR LEADERSHIP UNAVAILABLE"
        story_tone = "warning"

    if not total:
        headline_code = "BREADTH_UNAVAILABLE"
        headline_sector_count = None
        headline = "BREADTH UNAVAILABLE"
        story_tone = "info"
    explanation = f"{briefing_line_one}\n{briefing_line_two}" if total else "Price-change coverage is unavailable for the eligible cohort."

    total_turnover = sum(row.snapshot.turnover or 0 for row in rows)
    story = MarketStoryRead(
        headline_code=headline_code,
        sector_count=headline_sector_count,
        headline=headline,
        explanation=explanation,
        tone=story_tone,
        metrics=[
            MarketStoryMetricRead(
                label="Advancing",
                value=str(breadth["advancing"]),
                sub_value=f"{adv_pct:.1f}%" if total else None,
                tone="positive",
            ),
            MarketStoryMetricRead(
                label="Declining",
                value=str(breadth["declining"]),
                sub_value=f"{decl_pct:.1f}%" if total else None,
                tone="negative",
            ),
            MarketStoryMetricRead(
                label="Unchanged",
                value=str(breadth["unchanged"]),
                sub_value=f"{unch_pct:.1f}%" if total else None,
                tone="neutral",
            ),
            MarketStoryMetricRead(
                label="Adv/Decl Ratio",
                value=f"{adv_decl_ratio:.2f}" if adv_decl_ratio is not None else "N/A",
                tone="neutral" if adv_decl_ratio is None else "negative" if adv_decl_ratio < 0.85 else "positive" if adv_decl_ratio > 1.15 else "neutral",
            ),
            MarketStoryMetricRead(
                label="Turnover",
                value=_format_turnover_compact(total_turnover),
                tone="info",
            ),
        ],
    )

    sentiment = "Unknown" if not total else "Bearish" if breadth["declining"] > breadth["advancing"] * 1.12 else (
        "Bullish" if breadth["advancing"] > breadth["declining"] * 1.12 else "Neutral"
    )
    known_volume_ratios = [
        ratio
        for row in rows
        if (ratio := get_volume_ratio(row.snapshot)) is not None
    ]
    avg_volume_ratio = (
        sum(known_volume_ratios) / len(known_volume_ratios)
        if known_volume_ratios
        else None
    )
    participation = (
        "Unknown"
        if avg_volume_ratio is None
        else "Weak"
        if avg_volume_ratio < 0.95
        else "Strong"
        if avg_volume_ratio > 1.15
        else "Moderate"
    )
    uptrend_count = sum(1 for row in rows if row.snapshot.trend == TrendDirection.UPTREND)
    momentum = "Positive" if uptrend_count / len(rows) >= 0.42 else "Negative" if uptrend_count / len(rows) <= 0.32 else "Neutral"
    # Measure leadership from all eligible constituents before diversifying the focus list.

    if sentiment == "Bearish" and participation == "Weak":
        overall = "Defensive Rotation"
        overall_tone = "warning"
    elif sentiment == "Bullish" and momentum == "Positive":
        overall = "Risk-On Expansion"
        overall_tone = "positive"
    elif sentiment == "Bullish" and momentum == "Negative":
        overall = "Broad bounce with limited trend confirmation"
        overall_tone = "neutral"
    elif sentiment == "Neutral":
        overall = "Selective Attention"
        overall_tone = "info"
    else:
        overall = "Mixed market conditions"
        overall_tone = "neutral"

    state = MarketStateRead(
        excluded_sector_count=excluded_sector_count,
        dimensions=[
            MarketStateDimensionRead(key="sentiment", label="Sentiment", value=sentiment, tone=_state_tone(sentiment)),
            MarketStateDimensionRead(
                key="participation",
                label="Eligible-stock participation",
                value=participation,
                tone=_state_tone(participation if participation != "Moderate" else "Neutral"),
            ),
            MarketStateDimensionRead(
                key="momentum",
                label="Stocks in uptrend",
                value=f"{uptrend_count}/{len(rows)}",
                numerator=uptrend_count, denominator=len(rows),
                tone=_state_tone(momentum if momentum != "Neutral" else "Neutral"),
            ),
            MarketStateDimensionRead(key="leadership", label="Leadership", value="No positive leader" if leadership == "None" else leadership, tone="neutral" if leadership in {"None", "Unavailable"} else _state_tone(leadership)),
        ],
        overall_label=overall,
        overall_tone=overall_tone,
    )

    max_strength = max(
        (abs(change) for _, change in [*inflow_sectors, *outflow_sectors]),
        default=1.0,
    ) or 1.0

    def to_flow_sector(name: str, change: Fraction, positive: bool) -> MoneyFlowSectorRead:
        return MoneyFlowSectorRead(
            sector=name,
            change_label=_format_sector_percent(change),
            strength=float(min(100, abs(change) / max_strength * 100)),
            tone="positive" if positive else "negative",
        )

    money_flow = MoneyFlowRead(
        inflows=[to_flow_sector(name, change, True) for name, change in inflow_sectors[:3] if change > 0],
        outflows=[to_flow_sector(name, change, False) for name, change in outflow_sectors[:3]],
    )

    if opportunity_score is None:
        pool_scores = [row.score.total for row in rows]
        opportunity = int(round(sum(pool_scores) / len(pool_scores))) if pool_scores else 50
        opportunity_score = OpportunityScoreRead(
            score=opportunity,
            label=(
                "Broad Attention Environment"
                if opportunity >= 68
                else "Selective Attention Environment"
                if opportunity >= 55
                else "Limited Attention Environment"
            ),
        )
    opportunity = opportunity_score.score

    aggressive_count = sum(
        1
        for row in rows
        if row.score.total >= 75
        and getattr(row, "label", None)
        in {PulseFocusLabel.POTENTIAL_BUY_SETUP, PulseFocusLabel.VOLUME_BREAKOUT}
    )
    watchlist_count = len(monitor_reads) or len(focus_reads)
    playbook = PlaybookRead(
        question="What deserves review next?",
        items=[
            PlaybookItemRead(
                profile="Aggressive",
                summary=f"{aggressive_count} setup{'s' if aggressive_count != 1 else ''} available",
                guidance="Review confirmed price-volume breaks" if aggressive_count > 0 else "Wait for stronger evidence",
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
            metric_label=f"{volume_alert.metric_label} vs prior 20-session median volume",
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
    strongest_stock_row = measured_price_leader((row, _row_change(row)) for row in rows)
    relative_volume_rows = [row for row in rows if get_volume_ratio(row.snapshot) is not None]
    accumulation_row = max(
        relative_volume_rows,
        key=lambda row: get_volume_ratio(row.snapshot) or 0,
        default=None,
    )
    fresh_signals = [
        stock.symbol
        for stock in focus_reads
        if stock.recommendation == "POTENTIAL_BUY"
        or stock.focus_label
        in {PulseFocusLabel.POTENTIAL_BUY_SETUP, PulseFocusLabel.SIGNAL_UPGRADE}
    ][:4]
    fresh_new_count = sum(
        1
        for stock in focus_reads
        if stock.focus_label == PulseFocusLabel.POTENTIAL_BUY_SETUP
    )
    fresh_upgraded_count = sum(1 for stock in focus_reads if stock.focus_label == PulseFocusLabel.SIGNAL_UPGRADE)

    sector_change = inflow_sectors[0][1] if inflow_sectors else None
    advancing_in_sector = sum(
        1
        for row in rows
        if _sector_name(row.stock) == strongest_sector and (_row_change(row) or 0) > Fraction(1, 20)
    )
    leadership_narrative = (
        (f"Leadership is broad, led by {strongest_sector}." if leadership == "Broad" else f"Leadership remains concentrated in {strongest_sector}.")
        if strongest_sector != "N/A"
        else "No positive sector leader is present in the eligible set." if sector_changes else "Sector leadership data is unavailable."
    )
    accumulation_ratio = get_volume_ratio(accumulation_row.snapshot) if accumulation_row else None

    leadership_block = MarketLeadershipRead(
        narrative=leadership_narrative,
        fresh_new_count=fresh_new_count,
        fresh_upgraded_count=fresh_upgraded_count,
        cards=[
            LeadershipCardRead(
                kind="sector",
                title="Leading Sector",
                name=strongest_sector,
                detail=_format_sector_percent(sector_change) if sector_change is not None else None,
                subtitle=(
                    f"Session-leading sector · {advancing_in_sector} advancing stocks"
                    if sector_change is not None
                    else "No positive sector side in the eligible set" if sector_changes
                    else "Sector leadership data is unavailable"
                ),
                tone="positive" if sector_change is not None else "neutral",
                href="/scanner",
                sparkline_points=_index_close_sparkline(summaries),
            ),
            LeadershipCardRead(
                kind="stock",
                title="Price-change Leader",
                name=getattr(strongest_stock_row.stock, "symbol", "N/A") if strongest_stock_row else "N/A",
                detail=(
                    format_percent(strongest_stock_row.snapshot.price_change_percent)
                    if strongest_stock_row
                    else None
                ),
                subtitle="Session price leader",
                tone=(
                    price_tone(strongest_stock_row.snapshot.price_change_percent)
                    if strongest_stock_row
                    else "neutral"
                ),
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
                title="Relative-volume Leader",
                name=getattr(accumulation_row.stock, "symbol", "N/A") if accumulation_row else "N/A",
                detail=f"{accumulation_ratio:.1f}x median volume" if accumulation_ratio is not None else None,
                subtitle="vs prior 20-session median volume",
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

    if strongest_stock_row is None:
        leadership_block.cards = [card for card in leadership_block.cards if card.kind != "stock"]

    inflow_text = " & ".join(name for name, _ in inflow_sectors[:2]) if inflow_sectors else None
    opportunity_short = (
        "Above Average"
        if opportunity >= 68
        else "Selective"
        if opportunity >= 55
        else "Limited"
    )
    leadership_highlight = {"Narrow": "Concentrated", "Broad": "Broad", "None": "No positive leader", "Unavailable": "Unavailable"}[leadership]
    broad_sector_leadership = leadership == "Broad"
    trading_signals: list[TradingEnvironmentSignalRead] = []
    if opportunity >= 68:
        trading_signals.append(
            TradingEnvironmentSignalRead(text="Eligible attention breadth is broad", tone="positive")
        )
    elif opportunity >= 55:
        trading_signals.append(
            TradingEnvironmentSignalRead(text="Eligible attention breadth is selective", tone="warning")
        )
    else:
        trading_signals.append(
            TradingEnvironmentSignalRead(text="Eligible attention breadth is limited", tone="warning")
        )
    if broad_sector_leadership:
        trading_signals.append(
            TradingEnvironmentSignalRead(text="Sector price leadership is broad", tone="positive")
        )
    if breadth["declining"] > breadth["advancing"]:
        trading_signals.append(
            TradingEnvironmentSignalRead(text="Breadth remains weak", tone="warning")
        )
    if leadership == "Narrow":
        trading_signals.append(
            TradingEnvironmentSignalRead(text="Leadership remains concentrated", tone="warning")
        )
    elif leadership in {"None", "Unavailable"}:
        trading_signals.append(TradingEnvironmentSignalRead(
            text="No positive sector leader" if leadership == "None" else "Sector leadership unavailable", tone="neutral"))
    if sentiment == "Bearish" and opportunity >= 68:
        trading_overall = overall
        trading_overall_tone = "warning"
    elif overall_tone == "positive":
        trading_overall = "Risk-On"
        trading_overall_tone = "positive"
    elif overall == "Cautious Positioning":
        trading_overall = overall
        trading_overall_tone = "warning"
    else:
        trading_overall = overall
        trading_overall_tone = overall_tone

    leadership_summary = (
        (f"Positive sector leadership is broad, led by {inflow_text}" if leadership == "Broad" else f"Positive sector leadership is concentrated in {inflow_text}")
        if inflow_text
        else "No positive sector side is present" if sector_changes else "Sector leadership data is unavailable"
    )
    summary_text = (
        f"Market remains in a {overall.lower()} phase.\n"
        f"{leadership_summary} while participation remains {participation.lower()}. "
        "Focus on liquidity, confirmation, and disciplined position sizing."
    )
    summary = MarketSummaryRead(
        text=summary_text,
        tone=overall_tone,
        highlights=[
            MarketSummaryHighlightRead(label="Sentiment", value=sentiment, tone=_state_tone(sentiment)),
            MarketSummaryHighlightRead(
                label="Attention",
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
