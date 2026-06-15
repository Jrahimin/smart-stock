import type { BackendMarketPulseDto, BackendFocusStockDto, BackendMarketMoverDto } from "@/lib/api/backend-api-types";
import { getMarketSession } from "@/lib/market/market-session-engine";

import type {
  FocusStockModel,
  MarketAlertModel,
  MarketMoverModel,
  MarketMoversModel,
  MarketPulseModel,
  PulseBriefingChipModel,
  PulseChangeModel,
} from "@/features/market-pulse/types/market-pulse-types";

function mapTone(value: string): "positive" | "warning" | "info" | "negative" {
  if (value === "positive" || value === "warning" || value === "info" || value === "negative") {
    return value;
  }
  return "info";
}

function mapPriceTone(value: string): "positive" | "negative" | "neutral" {
  if (value === "positive" || value === "negative") {
    return value;
  }
  return "neutral";
}

function mapFocusStock(stock: BackendFocusStockDto): FocusStockModel {
  return {
    rank: stock.rank,
    stockId: stock.stock_id,
    symbol: stock.symbol,
    name: stock.name,
    exchange: stock.exchange,
    href: `/stocks/${stock.exchange}/${stock.symbol}`,
    pulseScore: stock.pulse_score,
    scoreBreakdown: {
      trend: stock.score_breakdown.trend,
      momentum: stock.score_breakdown.momentum,
      volume: stock.score_breakdown.volume,
      signalBoost: stock.score_breakdown.signal_boost,
      riskPenalty: stock.score_breakdown.risk_penalty,
      total: stock.score_breakdown.total,
      contributors: stock.score_breakdown.contributors,
      band: stock.score_breakdown.band,
    },
    focusLabel: stock.focus_label,
    labelTone: mapTone(stock.label_tone),
    whyHere: stock.why_here,
    trigger: stock.trigger,
    actionSummary: stock.action_summary,
    latestPrice: stock.latest_price,
    priceChangePercent: stock.price_change_percent,
    priceTone: mapPriceTone(stock.price_tone),
    sparklinePoints: stock.sparkline_points,
  };
}

function mapChange(change: BackendMarketPulseDto["changes"][number]): PulseChangeModel {
  return {
    id: change.id,
    timeLabel: change.time_label,
    type: change.change_type,
    title: change.title,
    description: change.description,
    badge: change.badge,
    badgeTone: mapTone(change.badge_tone),
    href:
      change.symbol && change.exchange ? `/stocks/${change.exchange}/${change.symbol}` : undefined,
  };
}

function mapAlert(alert: BackendMarketPulseDto["alerts"][number]): MarketAlertModel {
  return {
    id: alert.id,
    type: alert.alert_type,
    eventTitle: alert.event_title,
    eventExplanation: alert.event_explanation,
    whyItMatters: alert.why_it_matters,
    metricLabel: alert.metric_label,
    symbol: alert.symbol,
    latestPrice: alert.latest_price,
    priceChangePercent: alert.price_change_percent,
    priceTone: alert.price_tone ? mapPriceTone(alert.price_tone) : null,
    href:
      alert.symbol && alert.exchange ? `/stocks/${alert.exchange}/${alert.symbol}` : alert.alert_type === "sector-rotation" ? "/scanner" : null,
  };
}

function buildBriefingChips(dto: BackendMarketPulseDto): PulseBriefingChipModel[] {
  const chips: PulseBriefingChipModel[] = [];

  if (dto.since_last_visit.new_focus_count > 0) {
    chips.push({
      id: "new-entries",
      label: "New Entries",
      value: String(dto.since_last_visit.new_focus_count),
      tone: "positive",
    });
  }

  if (dto.alerts.length > 0) {
    chips.push({
      id: "active-alerts",
      label: "Active Alerts",
      value: String(dto.alerts.length),
      tone: "warning",
    });
  }

  const sectorAlert = dto.alerts.find((alert) => alert.alert_type === "sector-rotation");
  if (sectorAlert?.symbol) {
    chips.push({
      id: "sector-focus",
      label: "Sector In Focus",
      value: sectorAlert.symbol,
      tone: "info",
    });
  } else if (dto.today_insight?.title.toLowerCase().includes("sector")) {
    const sectorMatch = dto.today_insight.title.match(/in\s+(.+?)(?:\s+sector)?$/i);
    chips.push({
      id: "sector-focus",
      label: "Sector In Focus",
      value: sectorMatch?.[1] ?? "Rotation",
      tone: "info",
    });
  }

  if (dto.changes.length > 0) {
    chips.push({
      id: "changes",
      label: "Fresh Changes",
      value: String(dto.changes.length),
      tone: "primary",
    });
  }

  if (dto.hero.focus_count > 0 && !chips.some((chip) => chip.id === "new-entries")) {
    chips.push({
      id: "in-focus",
      label: "In Focus",
      value: String(dto.hero.focus_count),
      tone: "primary",
    });
  }

  return chips.slice(0, 4);
}

function mapMover(mover: BackendMarketMoverDto): MarketMoverModel {
  return {
    symbol: mover.symbol,
    name: mover.name,
    exchange: mover.exchange,
    latestPrice: mover.latest_price,
    priceChangePercent: mover.price_change_percent,
    priceTone: mapPriceTone(mover.price_tone),
    turnover: mover.turnover,
    href: `/stocks/${mover.exchange}/${mover.symbol}`,
  };
}

function mapMarketMovers(movers: BackendMarketPulseDto["market_movers"] | undefined): MarketMoversModel {
  if (!movers) {
    return { gainers: [], losers: [] };
  }

  return {
    gainers: (movers.gainers ?? []).map(mapMover),
    losers: (movers.losers ?? []).map(mapMover),
  };
}

function parseChangePercent(value: string) {
  return Number.parseFloat(value.replace("%", "").replace("+", "")) || 0;
}

function deriveMoversFromFocusStocks(stocks: FocusStockModel[]): MarketMoversModel {
  const gainers = [...stocks]
    .filter((stock) => parseChangePercent(stock.priceChangePercent) > 0)
    .sort((left, right) => parseChangePercent(right.priceChangePercent) - parseChangePercent(left.priceChangePercent))
    .slice(0, 4)
    .map((stock) => ({
      symbol: stock.symbol,
      name: stock.name,
      exchange: stock.exchange,
      latestPrice: stock.latestPrice,
      priceChangePercent: stock.priceChangePercent,
      priceTone: stock.priceTone,
      turnover: null,
      href: stock.href,
    }));

  const losers = [...stocks]
    .filter((stock) => parseChangePercent(stock.priceChangePercent) < 0)
    .sort((left, right) => parseChangePercent(left.priceChangePercent) - parseChangePercent(right.priceChangePercent))
    .slice(0, 4)
    .map((stock) => ({
      symbol: stock.symbol,
      name: stock.name,
      exchange: stock.exchange,
      latestPrice: stock.latestPrice,
      priceChangePercent: stock.priceChangePercent,
      priceTone: stock.priceTone,
      turnover: null,
      href: stock.href,
    }));

  return { gainers, losers };
}

function resolveMarketMovers(dto: BackendMarketPulseDto, focusStocks: FocusStockModel[]): MarketMoversModel {
  const mapped = mapMarketMovers(dto.market_movers);
  if (mapped.gainers.length > 0 || mapped.losers.length > 0) {
    return mapped;
  }

  const pool = [...focusStocks, ...dto.monitor_candidates.map(mapFocusStock)];
  const unique = Array.from(new Map(pool.map((stock) => [stock.stockId, stock])).values());
  return deriveMoversFromFocusStocks(unique);
}

export function buildMarketPulseViewModel(dto: BackendMarketPulseDto): MarketPulseModel {
  const session = getMarketSession();
  const focusStocks = dto.focus_stocks.map(mapFocusStock);
  const monitorCandidates = dto.monitor_candidates.map(mapFocusStock);

  return {
    hero: {
      greeting: dto.hero.greeting,
      attentionHeadline: dto.hero.attention_headline,
      attentionSubline: dto.hero.attention_subline,
      lastUpdatedLabel: dto.hero.last_updated_label,
      relativeUpdatedLabel: dto.hero.relative_updated_label,
      sessionLabel: dto.hero.session_label,
      focusCount: dto.hero.focus_count,
      recentFocusCount: dto.hero.recent_focus_count,
    },
    sinceLastVisit: {
      visible: dto.since_last_visit.visible,
      newChangesCount: dto.since_last_visit.new_changes_count,
      newFocusCount: dto.since_last_visit.new_focus_count,
      newAlertsCount: dto.since_last_visit.new_alerts_count,
      summaryLabel: dto.since_last_visit.summary_label,
    },
    briefingChips: buildBriefingChips(dto),
    focusStocks,
    monitorCandidates,
    todayInsight: dto.today_insight
      ? {
          title: dto.today_insight.title,
          explanation: dto.today_insight.explanation,
          whyItMatters: dto.today_insight.supporting_fact,
          tone: mapTone(dto.today_insight.tone),
        }
      : null,
    changes: dto.changes.map(mapChange),
    alerts: dto.alerts.map(mapAlert),
    marketMovers: resolveMarketMovers(dto, focusStocks),
    emptyState: dto.empty_state as MarketPulseModel["emptyState"],
    emptyMessage: dto.empty_message,
    dataQualityNote: dto.data_quality_note,
    sessionDisablesRefresh: session.disablesFreshDataActions,
    sessionDescription: session.description,
  };
}

export function buildMarketPulseSnapshotFromDto(dto: BackendMarketPulseDto) {
  const scores: Record<string, number> = {};
  const recommendations: Record<string, string> = {};
  const trackedStocks = [...dto.focus_stocks, ...dto.monitor_candidates];

  for (const stock of trackedStocks) {
    scores[stock.stock_id] = stock.pulse_score;
    recommendations[stock.stock_id] = stock.recommendation;
  }

  return {
    lastSyncedAt: null,
    focusStockIds: dto.focus_stocks.map((stock) => stock.stock_id),
    scores,
    recommendations,
    alertIds: dto.alerts.map((alert) => alert.id),
  };
}
