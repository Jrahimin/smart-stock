from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from typing import Annotated
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import Depends

from app.core.constants.trading_constants import (
    PULSE_FOCUS_STOCK_LIMIT,
    PULSE_MARKET_MOVERS_LIMIT,
    PULSE_PRICE_WINDOW_LIMIT,
    PULSE_SCORE_JUMP_THRESHOLD,
    PULSE_UNIVERSE_LIMIT,
    VOLUME_EXPANSION_RATIO,
)
from app.core.enums import DataQualityFlag, ExchangeCode, MarketAlertType, PulseFocusLabel, TraderRecommendation, TrendDirection
from app.models import DailyPrice, Stock
from app.modules.market_data.market_data_repository import MarketDataRepository, get_market_data_repository
from app.modules.market_data.market_data_service import MarketDataService, get_market_data_service
from app.modules.market_pulse.market_pulse_schemas import (
    FocusStockRead,
    MarketAlertRead,
    MarketMoverRead,
    MarketMoversRead,
    MarketPulseHeroRead,
    MarketPulsePreviousSnapshot,
    MarketPulseRead,
    PulseChangeRead,
    PulseScoreBreakdownRead,
    SinceLastVisitRead,
    TodayInsightRead,
)
from app.modules.market_pulse.pulse_score import (
    build_action_summary,
    build_pulse_trigger,
    build_why_here,
    compute_pulse_score,
    derive_pulse_focus_label,
    get_volume_ratio,
    meets_focus_threshold,
)
from app.modules.stock_details.decision.summary import compute_trader_decision_summary_for_stock
from app.modules.stock_details.decision.technical import TechnicalSnapshot, build_technical_snapshot


DHAKA = ZoneInfo("Asia/Dhaka")


@dataclass(frozen=True)
class ScoredUniverseRow:
    stock: Stock
    prices: list[DailyPrice]
    snapshot: TechnicalSnapshot
    decision: object
    score: object
    label: PulseFocusLabel


def _label_tone(label: PulseFocusLabel) -> str:
    if label in {PulseFocusLabel.NEW_BUY_SETUP, PulseFocusLabel.SIGNAL_UPGRADE}:
        return "positive"
    if label == PulseFocusLabel.VOLUME_BREAKOUT:
        return "negative"
    if label == PulseFocusLabel.MOMENTUM_BUILDING:
        return "info"
    return "warning"


def _price_tone(change: float | None) -> str:
    if change is None or change == 0:
        return "neutral"
    return "positive" if change > 0 else "negative"


def _format_number(value: float | None) -> str:
    if value is None:
        return "N/A"
    return f"{value:,.2f}"


def _format_percent(value: float | None) -> str:
    if value is None:
        return "N/A"
    sign = "+" if value > 0 else ""
    return f"{sign}{value:.2f}%"


def _greeting(now: datetime | None = None) -> str:
    current = now or datetime.now(DHAKA)
    hour = current.hour
    if hour < 12:
        return "Good morning"
    if hour < 17:
        return "Good afternoon"
    return "Good evening"


def _format_time_label(iso: datetime | None) -> str | None:
    if iso is None:
        return None
    localized = iso.astimezone(DHAKA) if iso.tzinfo else iso.replace(tzinfo=DHAKA)
    return localized.strftime("%I:%M %p").lstrip("0")


def _format_relative_updated(iso: datetime | None) -> str | None:
    if iso is None:
        return None
    localized = iso.astimezone(DHAKA) if iso.tzinfo else iso.replace(tzinfo=DHAKA)
    diff_minutes = max(0, int((datetime.now(DHAKA) - localized).total_seconds() // 60))
    if diff_minutes < 1:
        return "Updated just now"
    if diff_minutes < 60:
        suffix = "" if diff_minutes == 1 else "s"
        return f"Updated {diff_minutes} minute{suffix} ago"
    hours = round(diff_minutes / 60)
    suffix = "" if hours == 1 else "s"
    return f"Updated {hours} hour{suffix} ago"


def _sparkline_points(prices: list[DailyPrice]) -> list[float]:
    sorted_prices = sorted(prices, key=lambda row: row.trade_date)
    closes = [float(row.close_price) for row in sorted_prices[-12:]]
    return closes


def _diversify_focus_list(rows: list[ScoredUniverseRow], limit: int = PULSE_FOCUS_STOCK_LIMIT) -> list[ScoredUniverseRow]:
    sorted_rows = sorted(rows, key=lambda row: row.score.total, reverse=True)
    selected: list[ScoredUniverseRow] = []
    sector_counts: dict[str, int] = {}

    for row in sorted_rows:
        if len(selected) >= limit:
            break
        sector = (row.stock.sector or row.stock.category or "Unclassified").strip() or "Unclassified"
        if sector_counts.get(sector, 0) >= 2 and len(selected) < limit - 1:
            continue
        selected.append(row)
        sector_counts[sector] = sector_counts.get(sector, 0) + 1

    if len(selected) < limit:
        selected_ids = {str(row.stock.id) for row in selected}
        for row in sorted_rows:
            if str(row.stock.id) in selected_ids:
                continue
            selected.append(row)
            if len(selected) >= limit:
                break

    return selected


def _to_focus_stock_read(row: ScoredUniverseRow, rank: int) -> FocusStockRead:
    change = row.snapshot.price_change_percent
    breakdown = row.score
    return FocusStockRead(
        rank=rank,
        stock_id=row.stock.id,
        symbol=row.stock.symbol,
        name=row.stock.name,
        exchange=row.stock.exchange,
        pulse_score=breakdown.total,
        score_breakdown=PulseScoreBreakdownRead(
            trend=breakdown.trend,
            momentum=breakdown.momentum,
            volume=breakdown.volume,
            signal_boost=breakdown.signal_boost,
            risk_penalty=breakdown.risk_penalty,
            total=breakdown.total,
            contributors=breakdown.contributors,
            band=breakdown.band,
        ),
        focus_label=row.label,
        label_tone=_label_tone(row.label),
        why_here=build_why_here(row.snapshot, row.decision, breakdown, row.label),
        trigger=build_pulse_trigger(row.snapshot, row.decision),
        action_summary=build_action_summary(row.label),
        latest_price=_format_number(row.snapshot.latest_price),
        price_change_percent=_format_percent(change),
        price_tone=_price_tone(change),
        sparkline_points=_sparkline_points(row.prices),
        recommendation=row.decision.recommendation.value,
    )


def _to_market_mover_read(row: ScoredUniverseRow) -> MarketMoverRead:
    change = row.snapshot.price_change_percent
    turnover = row.snapshot.turnover
    return MarketMoverRead(
        symbol=row.stock.symbol,
        name=row.stock.name,
        exchange=row.stock.exchange,
        latest_price=_format_number(row.snapshot.latest_price),
        price_change_percent=_format_percent(change),
        price_tone=_price_tone(change),
        turnover=_format_number(turnover) if turnover else None,
    )


def _build_market_movers(rows: list[ScoredUniverseRow]) -> MarketMoversRead:
    ranked = [row for row in rows if row.snapshot.price_change_percent is not None]
    gainers = sorted(
        [row for row in ranked if (row.snapshot.price_change_percent or 0) > 0],
        key=lambda row: row.snapshot.price_change_percent or 0,
        reverse=True,
    )[:PULSE_MARKET_MOVERS_LIMIT]
    losers = sorted(
        [row for row in ranked if (row.snapshot.price_change_percent or 0) < 0],
        key=lambda row: row.snapshot.price_change_percent or 0,
    )[:PULSE_MARKET_MOVERS_LIMIT]
    return MarketMoversRead(
        gainers=[_to_market_mover_read(row) for row in gainers],
        losers=[_to_market_mover_read(row) for row in losers],
    )


class MarketPulseService:
    def __init__(
        self,
        market_repository: MarketDataRepository,
        market_data_service: MarketDataService,
    ) -> None:
        self.market_repository = market_repository
        self.market_data_service = market_data_service

    async def get_market_pulse(
        self,
        *,
        exchange: ExchangeCode,
        previous: MarketPulsePreviousSnapshot | None,
        display_name: str | None = None,
    ) -> MarketPulseRead:
        freshness = await self.market_data_service.get_market_freshness(exchange=exchange)
        rows = await self.market_repository.list_market_price_windows(
            exchange=exchange,
            limit=PULSE_UNIVERSE_LIMIT,
            offset=0,
            price_window_limit=PULSE_PRICE_WINDOW_LIMIT,
        )

        grouped: dict[str, dict[str, object]] = {}
        for stock, price in rows:
            stock_id = str(stock.id)
            if stock_id not in grouped:
                grouped[stock_id] = {"stock": stock, "prices": []}
            grouped[stock_id]["prices"].append(price)

        scored_rows: list[ScoredUniverseRow] = []
        previous_recommendations = previous.recommendations if previous else {}

        for entry in grouped.values():
            stock = entry["stock"]
            prices = sorted(entry["prices"], key=lambda row: row.trade_date)
            snapshot = build_technical_snapshot(prices)
            decision = compute_trader_decision_summary_for_stock(stock, prices)
            if snapshot is None or decision is None:
                continue

            score = compute_pulse_score(snapshot, decision)
            prev_rec = previous_recommendations.get(str(stock.id))
            previous_enum: TraderRecommendation | None = None
            if prev_rec:
                try:
                    previous_enum = TraderRecommendation(prev_rec)
                except ValueError:
                    previous_enum = None

            label = derive_pulse_focus_label(
                snapshot,
                decision,
                score,
                previous_recommendation=previous_enum,
            )
            scored_rows.append(
                ScoredUniverseRow(
                    stock=stock,
                    prices=prices,
                    snapshot=snapshot,
                    decision=decision,
                    score=score,
                    label=label,
                )
            )

        focus_candidates = [row for row in scored_rows if meets_focus_threshold(row.score.total)]
        selected = _diversify_focus_list(focus_candidates, PULSE_FOCUS_STOCK_LIMIT)
        focus_reads = [_to_focus_stock_read(row, index + 1) for index, row in enumerate(selected)]

        monitor_rows = sorted(
            [row for row in scored_rows if row.score.total >= 55],
            key=lambda row: row.score.total,
            reverse=True,
        )[:3]
        monitor_reads = [_to_focus_stock_read(row, index + 1) for index, row in enumerate(monitor_rows)]

        last_synced = freshness.last_synced_at
        changes, new_focus_count = self._build_changes(scored_rows, focus_reads, previous, last_synced)
        alerts = self._build_alerts(scored_rows, previous)
        new_alerts_count = len([alert for alert in alerts if previous and alert.id not in previous.alert_ids])

        hero_stocks = focus_reads if focus_reads else monitor_reads
        greeting_name = f", {display_name.strip()}" if display_name and display_name.strip() else ""
        focus_count = len(hero_stocks)

        hero = MarketPulseHeroRead(
            greeting=f"{_greeting()}{greeting_name}",
            attention_headline=(
                "1 stock deserves attention today."
                if focus_count == 1
                else f"{focus_count} stocks deserve attention today."
            ),
            attention_subline=(
                f"{new_focus_count} entered focus recently."
                if new_focus_count > 0
                else "Your curated attention list is ready."
            ),
            last_updated_label=_format_time_label(last_synced),
            relative_updated_label=_format_relative_updated(last_synced),
            session_label=freshness.market_status.replace("_", " ") if freshness.market_status else None,
            focus_count=focus_count,
            recent_focus_count=new_focus_count,
        )

        since_last_visit = self._build_since_last_visit(previous, changes, new_focus_count, new_alerts_count)
        today_insight = self._build_today_insight(scored_rows, focus_reads)
        market_movers = _build_market_movers(scored_rows)

        suspicious_count = sum(1 for row in scored_rows if row.snapshot.data_quality == DataQualityFlag.SUSPICIOUS)
        empty_state = "none"
        empty_message: str | None = None

        if last_synced is None and not scored_rows:
            empty_state = "waiting-snapshot"
            empty_message = "Market Pulse is waiting for the next DSE snapshot."
        elif len(scored_rows) < 20:
            empty_state = "insufficient-history"
            empty_message = "Not enough recent price history to rank attention reliably."
        elif not focus_reads:
            empty_state = "no-attention"
            empty_message = "No stocks crossed the attention threshold yet."

        return MarketPulseRead(
            hero=hero,
            since_last_visit=since_last_visit,
            focus_stocks=focus_reads,
            monitor_candidates=monitor_reads,
            today_insight=today_insight,
            changes=changes,
            alerts=alerts,
            market_movers=market_movers,
            empty_state=empty_state,
            empty_message=empty_message,
            data_quality_note=(
                f"{suspicious_count} instruments flagged for data quality review."
                if suspicious_count > 0
                else None
            ),
        )

    def _build_since_last_visit(
        self,
        previous: MarketPulsePreviousSnapshot | None,
        changes: list[PulseChangeRead],
        new_focus_count: int,
        new_alerts_count: int,
    ) -> SinceLastVisitRead:
        if previous is None or previous.last_synced_at is None:
            return SinceLastVisitRead(
                visible=False,
                new_changes_count=0,
                new_focus_count=0,
                new_alerts_count=0,
                summary_label="",
            )

        parts: list[str] = []
        if changes:
            suffix = "" if len(changes) == 1 else "s"
            parts.append(f"{len(changes)} new change{suffix}")
        if new_focus_count > 0:
            suffix = "" if new_focus_count == 1 else "s"
            parts.append(f"{new_focus_count} new focus stock{suffix}")
        if new_alerts_count > 0:
            suffix = "" if new_alerts_count == 1 else "s"
            parts.append(f"{new_alerts_count} new market alert{suffix}")

        return SinceLastVisitRead(
            visible=True,
            new_changes_count=len(changes),
            new_focus_count=new_focus_count,
            new_alerts_count=new_alerts_count,
            summary_label=parts and " · ".join(parts) or "No new changes since your last visit",
        )

    def _build_today_insight(
        self,
        rows: list[ScoredUniverseRow],
        focus_reads: list[FocusStockRead],
    ) -> TodayInsightRead | None:
        sector_volume: dict[str, int] = {}
        for row in rows:
            ratio = get_volume_ratio(row.snapshot)
            if ratio >= VOLUME_EXPANSION_RATIO:
                sector = (row.stock.sector or row.stock.category or "Unclassified").strip() or "Unclassified"
                sector_volume[sector] = sector_volume.get(sector, 0) + 1

        hot_sector = max(sector_volume.items(), key=lambda item: item[1], default=None)
        if hot_sector and hot_sector[1] >= 3:
            name, count = hot_sector
            return TodayInsightRead(
                title=f"{name} sector attracting unusual volume",
                explanation=f"Multiple {name} names are trading with expanded participation today, making the group worth a closer read.",
                supporting_fact=f"{count} stocks in this sector are above {VOLUME_EXPANSION_RATIO}x average volume.",
                tone="info",
            )

        focus_sectors: dict[str, int] = {}
        focus_stock_ids = {str(stock.stock_id) for stock in focus_reads}
        for row in rows:
            if str(row.stock.id) not in focus_stock_ids:
                continue
            sector = (row.stock.sector or row.stock.category or "Unclassified").strip() or "Unclassified"
            focus_sectors[sector] = focus_sectors.get(sector, 0) + 1

        concentrated = next(((name, count) for name, count in focus_sectors.items() if count >= 3), None)
        if concentrated:
            name, count = concentrated
            return TodayInsightRead(
                title=f"Multiple focus candidates emerging in {name}",
                explanation=f"Several {name} stocks crossed the attention threshold together, suggesting a sector-level shift rather than an isolated move.",
                supporting_fact=f"{count} stocks from this sector are in focus today.",
                tone="positive",
            )

        improving = [
            row
            for row in rows
            if row.snapshot.trend == TrendDirection.UPTREND and (row.snapshot.price_change_percent or 0) > 0.5
        ]
        if rows and len(improving) / len(rows) >= 0.45 and len(improving) >= 12:
            return TodayInsightRead(
                title="Broad momentum improvement across the market",
                explanation="Participation is improving beyond a handful of leaders, which often precedes broader follow-through if volume holds.",
                supporting_fact=f"{len(improving)} stocks are in uptrends with positive moves today.",
                tone="positive",
            )

        return None

    def _build_changes(
        self,
        rows: list[ScoredUniverseRow],
        focus_reads: list[FocusStockRead],
        previous: MarketPulsePreviousSnapshot | None,
        last_synced: datetime | None,
    ) -> tuple[list[PulseChangeRead], int]:
        if previous is None:
            return [], 0

        time_label = _format_time_label(last_synced) or "Latest"
        current_focus_ids = {str(stock.stock_id) for stock in focus_reads}
        previous_focus_ids = {str(stock_id) for stock_id in previous.focus_stock_ids}
        changes: list[PulseChangeRead] = []
        new_focus_count = 0

        for stock in focus_reads:
            stock_id = str(stock.stock_id)
            if stock_id not in previous_focus_ids:
                new_focus_count += 1
                changes.append(
                    PulseChangeRead(
                        id=f"entered-{stock_id}",
                        time_label=time_label,
                        change_type="entered-focus",
                        title=f"{stock.symbol} entered Focus List",
                        description=f"Pulse Score reached {stock.pulse_score} with {stock.focus_label.value}.",
                        badge="New Focus",
                        badge_tone="positive",
                        symbol=stock.symbol,
                        exchange=stock.exchange,
                    )
                )

        for previous_id in previous_focus_ids:
            if previous_id not in current_focus_ids:
                row = next((item for item in rows if str(item.stock.id) == previous_id), None)
                if row is None:
                    continue
                changes.append(
                    PulseChangeRead(
                        id=f"exited-{previous_id}",
                        time_label=time_label,
                        change_type="exited-focus",
                        title=f"{row.stock.symbol} exited Focus List",
                        description="Attention score fell below today's threshold.",
                        badge="Exited",
                        badge_tone="warning",
                        symbol=row.stock.symbol,
                        exchange=row.stock.exchange,
                    )
                )

        for row in rows:
            stock_id = str(row.stock.id)
            previous_score = previous.scores.get(stock_id)
            if previous_score is None:
                continue

            delta = row.score.total - previous_score
            if delta >= PULSE_SCORE_JUMP_THRESHOLD:
                changes.append(
                    PulseChangeRead(
                        id=f"score-{stock_id}",
                        time_label=time_label,
                        change_type="score-jump",
                        title=f"{row.stock.symbol} Pulse Score +{delta}",
                        description=", ".join(row.score.contributors) or "Attention score improved materially.",
                        badge=f"+{delta} points",
                        badge_tone="positive",
                        symbol=row.stock.symbol,
                        exchange=row.stock.exchange,
                    )
                )

            previous_rec = previous.recommendations.get(stock_id)
            current_rec = row.decision.recommendation.value
            if previous_rec and previous_rec != current_rec:
                changes.append(
                    PulseChangeRead(
                        id=f"rec-{stock_id}",
                        time_label=time_label,
                        change_type="recommendation-shift",
                        title=f"{row.stock.symbol} {previous_rec} → {current_rec}",
                        description=row.decision.reason,
                        badge="Signal Upgrade" if current_rec == "BUY" else "New Signal",
                        badge_tone="positive" if current_rec == "BUY" else "info",
                        symbol=row.stock.symbol,
                        exchange=row.stock.exchange,
                    )
                )

        return changes[:5], new_focus_count

    def _build_alerts(
        self,
        rows: list[ScoredUniverseRow],
        previous: MarketPulsePreviousSnapshot | None,
    ) -> list[MarketAlertRead]:
        alerts: list[MarketAlertRead] = []

        unusual_volume = max(
            (row for row in rows if get_volume_ratio(row.snapshot) >= VOLUME_EXPANSION_RATIO),
            key=lambda row: get_volume_ratio(row.snapshot),
            default=None,
        )
        if unusual_volume is not None:
            ratio = get_volume_ratio(unusual_volume.snapshot)
            change = unusual_volume.snapshot.price_change_percent
            alerts.append(
                MarketAlertRead(
                    id=f"alert-volume-{unusual_volume.stock.id}",
                    alert_type=MarketAlertType.UNUSUAL_VOLUME,
                    event_title="Unusual Volume Detected",
                    event_explanation="Participation is well above normal across the session.",
                    why_it_matters=f"{unusual_volume.stock.symbol} is trading at {ratio:.1f}x average volume.",
                    metric_label=f"{ratio:.1f}x normal",
                    symbol=unusual_volume.stock.symbol,
                    exchange=unusual_volume.stock.exchange,
                    latest_price=_format_number(unusual_volume.snapshot.latest_price),
                    price_change_percent=_format_percent(change),
                    price_tone=_price_tone(change),
                )
            )

        momentum_reversal = next(
            (
                row
                for row in rows
                if row.snapshot.trend != TrendDirection.UPTREND
                and (row.snapshot.price_change_percent or 0) > 1.2
                and row.snapshot.rsi is not None
                and row.snapshot.rsi >= 48
            ),
            None,
        )
        if momentum_reversal is not None:
            change = momentum_reversal.snapshot.price_change_percent
            alerts.append(
                MarketAlertRead(
                    id=f"alert-reversal-{momentum_reversal.stock.id}",
                    alert_type=MarketAlertType.MOMENTUM_REVERSAL,
                    event_title="Momentum Reversal Forming",
                    event_explanation="Price is recovering against a weaker prior trend.",
                    why_it_matters=f"{momentum_reversal.stock.symbol} may be shifting from distribution to recovery.",
                    metric_label=_format_percent(change),
                    symbol=momentum_reversal.stock.symbol,
                    exchange=momentum_reversal.stock.exchange,
                    latest_price=_format_number(momentum_reversal.snapshot.latest_price),
                    price_change_percent=_format_percent(change),
                    price_tone=_price_tone(change),
                )
            )

        liquidity_surge = max(rows, key=lambda row: row.snapshot.turnover or 0, default=None)
        if liquidity_surge is not None and (liquidity_surge.snapshot.turnover or 0) > 0:
            change = liquidity_surge.snapshot.price_change_percent
            alerts.append(
                MarketAlertRead(
                    id=f"alert-liquidity-{liquidity_surge.stock.id}",
                    alert_type=MarketAlertType.LIQUIDITY_SURGE,
                    event_title="Liquidity Surge",
                    event_explanation="Turnover is leading participation in the loaded universe.",
                    why_it_matters=f"{liquidity_surge.stock.symbol} is absorbing the most turnover right now.",
                    metric_label=_format_number(liquidity_surge.snapshot.turnover),
                    symbol=liquidity_surge.stock.symbol,
                    exchange=liquidity_surge.stock.exchange,
                    latest_price=_format_number(liquidity_surge.snapshot.latest_price),
                    price_change_percent=_format_percent(change),
                    price_tone=_price_tone(change),
                )
            )

        sector_buckets: dict[str, list[float]] = {}
        for row in rows:
            sector = (row.stock.sector or row.stock.category or "Unclassified").strip() or "Unclassified"
            change = row.snapshot.price_change_percent or 0
            if change > 0.4:
                sector_buckets.setdefault(sector, []).append(change)

        rotation_sector = max(
            ((name, values) for name, values in sector_buckets.items() if len(values) >= 4),
            key=lambda item: sum(item[1]) / len(item[1]),
            default=None,
        )
        if rotation_sector is not None:
            name, values = rotation_sector
            avg_change = sum(values) / len(values)
            alerts.append(
                MarketAlertRead(
                    id=f"alert-sector-{name}",
                    alert_type=MarketAlertType.SECTOR_ROTATION,
                    event_title="Sector Rotation Signal",
                    event_explanation=f"Multiple {name} stocks are improving together.",
                    why_it_matters="Broad sector participation can signal rotation rather than a single-name move.",
                    metric_label=f"{len(values)} movers",
                    symbol=name,
                    exchange=None,
                    latest_price=_format_percent(avg_change),
                    price_change_percent=_format_percent(avg_change),
                    price_tone=_price_tone(avg_change),
                )
            )

        if previous is not None:
            score_jump = max(
                (
                    (row, row.score.total - previous.scores.get(str(row.stock.id), row.score.total))
                    for row in rows
                ),
                key=lambda item: item[1],
                default=(None, 0),
            )
            row, delta = score_jump
            if row is not None and delta >= 12:
                change = row.snapshot.price_change_percent
                alerts.append(
                    MarketAlertRead(
                        id=f"alert-score-{row.stock.id}",
                        alert_type=MarketAlertType.PULSE_SCORE_JUMP,
                        event_title="Pulse Score Jump",
                        event_explanation="Attention score moved sharply since the last refresh.",
                        why_it_matters=f"{row.stock.symbol} deserves a fresh review after a +{delta} point move.",
                        metric_label=f"+{delta} points",
                        symbol=row.stock.symbol,
                        exchange=row.stock.exchange,
                        latest_price=_format_number(row.snapshot.latest_price),
                        price_change_percent=_format_percent(change),
                        price_tone=_price_tone(change),
                    )
                )

        return alerts[:5]


def get_market_pulse_service(
    market_repository: Annotated[MarketDataRepository, Depends(get_market_data_repository)],
    market_data_service: Annotated[MarketDataService, Depends(get_market_data_service)],
) -> MarketPulseService:
    return MarketPulseService(market_repository, market_data_service)


def parse_previous_snapshot(raw: str | None) -> MarketPulsePreviousSnapshot | None:
    if not raw:
        return None
    try:
        payload = json.loads(raw)
        return MarketPulsePreviousSnapshot.model_validate(payload)
    except (json.JSONDecodeError, ValueError):
        return None
