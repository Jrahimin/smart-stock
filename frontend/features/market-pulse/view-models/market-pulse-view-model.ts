import type { BackendMarketPulseDto, BackendFocusStockDto, BackendMarketMoverDto, BackendMarketBriefingDto } from "@/lib/api/backend-api-types";
import { getMarketSession } from "@/lib/market/market-session-engine";
import { buildStockDetailPath } from "@/lib/seo/stock-page-seo";
import type { AppLocale } from "@/lib/locale/app-locale";
import {
  getMarketPulseLanguage,
  type MarketPulseLeadershipCardKind,
} from "@/features/market-pulse/market-pulse-language";

import type {
  FocusStockModel,
  MarketAlertModel,
  MarketBriefingModel,
  MarketMoverModel,
  MarketMoversModel,
  MarketPulseModel,
  PulseBriefingChipModel,
  PulseChangeModel,
} from "@/features/market-pulse/types/market-pulse-types";

function mapBriefingTone(value: string): "positive" | "warning" | "info" | "negative" | "neutral" {
  if (value === "positive" || value === "warning" || value === "info" || value === "negative" || value === "neutral") {
    return value;
  }
  return "info";
}

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
    href: buildStockDetailPath(stock.exchange, stock.symbol),
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
      change.symbol && change.exchange ? buildStockDetailPath(change.exchange, change.symbol) : undefined,
  };
}

function mapAlertSignificance(value: string): "HIGH" | "MEDIUM" | "WATCH" {
  if (value === "HIGH" || value === "MEDIUM" || value === "WATCH") {
    return value;
  }
  return "WATCH";
}

function mapAlert(alert: BackendMarketPulseDto["alerts"][number]): MarketAlertModel {
  return {
    id: alert.id,
    type: alert.alert_type,
    eventTitle: alert.event_title,
    eventExplanation: alert.event_explanation,
    whyItMatters: alert.why_it_matters,
    metricLabel: alert.metric_label,
    significance: mapAlertSignificance(alert.significance),
    timeLabel: alert.time_label,
    symbol: alert.symbol,
    latestPrice: alert.latest_price,
    priceChangePercent: alert.price_change_percent,
    priceTone: alert.price_tone ? mapPriceTone(alert.price_tone) : null,
    href:
      alert.symbol && alert.exchange ? buildStockDetailPath(alert.exchange, alert.symbol) : alert.alert_type === "sector-rotation" ? "/scanner" : null,
  };
}

function buildBriefingChips(dto: BackendMarketPulseDto): PulseBriefingChipModel[] {
  const chips: PulseBriefingChipModel[] = [];

  if (dto.hero.session_label) {
    chips.push({
      id: "session",
      label: "Market",
      value: dto.hero.session_label.toUpperCase(),
      tone: "info",
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
  } else if (dto.briefing?.money_flow.inflows[0]) {
    chips.push({
      id: "sector-focus",
      label: "Sector In Focus",
      value: dto.briefing.money_flow.inflows[0].sector,
      tone: "info",
    });
  }

  if (dto.hero.focus_count > 0) {
    chips.push({
      id: "in-focus",
      label: "In Focus",
      value: String(dto.hero.focus_count),
      tone: "primary",
    });
  }

  return chips.slice(0, 4);
}

function mapBriefing(briefing: BackendMarketBriefingDto): MarketBriefingModel {
  return {
    story: {
      headline: briefing.story.headline,
      explanation: briefing.story.explanation,
      tone: mapBriefingTone(briefing.story.tone),
      metrics: briefing.story.metrics.map((metric) => ({
        label: metric.label,
        value: metric.value,
        subValue: metric.sub_value,
        tone: mapBriefingTone(metric.tone),
      })),
    },
    state: {
      dimensions: briefing.state.dimensions.map((dimension) => ({
        key: dimension.key,
        label: dimension.label,
        value: dimension.value,
        tone: mapBriefingTone(dimension.tone),
      })),
      overallLabel: briefing.state.overall_label,
      overallTone: mapBriefingTone(briefing.state.overall_tone),
    },
    moneyFlow: {
      inflows: briefing.money_flow.inflows.map((sector) => ({
        sector: sector.sector,
        changeLabel: sector.change_label,
        strength: sector.strength,
        tone: sector.tone === "negative" ? "negative" : "positive",
      })),
      outflows: briefing.money_flow.outflows.map((sector) => ({
        sector: sector.sector,
        changeLabel: sector.change_label,
        strength: sector.strength,
        tone: sector.tone === "negative" ? "negative" : "positive",
      })),
    },
    opportunityScore: {
      score: briefing.opportunity_score.score,
      label: briefing.opportunity_score.label,
      history: briefing.opportunity_score.history,
      previousSession:
        briefing.opportunity_score.previous_session ??
        (briefing.opportunity_score.history.length >= 2
          ? briefing.opportunity_score.history[briefing.opportunity_score.history.length - 2]
          : null),
      weeklyAverage:
        briefing.opportunity_score.weekly_average ??
        (briefing.opportunity_score.history.length > 0
          ? Math.round(
              briefing.opportunity_score.history.reduce((sum, value) => sum + value, 0) /
                briefing.opportunity_score.history.length,
            )
          : null),
      trendLabel: briefing.opportunity_score.trend_label ?? null,
    },
    playbook: {
      question: briefing.playbook.question,
      items: briefing.playbook.items.map((item) => ({
        profile: item.profile,
        summary: item.summary,
        guidance: item.guidance ?? "",
        tone: mapBriefingTone(item.tone),
      })),
    },
    highPriority: briefing.high_priority
      ? {
          symbol: briefing.high_priority.symbol,
          name: briefing.high_priority.name,
          exchange: briefing.high_priority.exchange,
          href: buildStockDetailPath(briefing.high_priority.exchange, briefing.high_priority.symbol),
          reason: briefing.high_priority.reason,
          triggerLevel: briefing.high_priority.trigger_level,
          metricLabel: briefing.high_priority.metric_label,
          latestPrice: briefing.high_priority.latest_price,
          priceChangePercent: briefing.high_priority.price_change_percent,
          priceTone: mapPriceTone(briefing.high_priority.price_tone),
          sparklinePoints: briefing.high_priority.sparkline_points,
        }
      : null,
    leadership: {
      cards: briefing.leadership.cards.map((card) => ({
        kind: card.kind,
        title: card.title,
        name: card.name,
        detail: card.detail,
        subtitle: card.subtitle,
        tone: mapBriefingTone(card.tone),
        href: card.href,
        sparklinePoints: card.sparkline_points,
      })),
      freshBuySignals: briefing.leadership.fresh_buy_signals,
      narrative: briefing.leadership.narrative ?? "",
      freshNewCount: briefing.leadership.fresh_new_count ?? 0,
      freshUpgradedCount: briefing.leadership.fresh_upgraded_count ?? 0,
    },
    summary: {
      text: briefing.summary.text,
      tone: mapBriefingTone(briefing.summary.tone),
      highlights: (briefing.summary.highlights ?? []).map((item) => ({
        label: item.label,
        value: item.value,
        tone: mapBriefingTone(item.tone),
      })),
      tradingEnvironment: briefing.summary.trading_environment
        ? {
            signals: briefing.summary.trading_environment.signals.map((signal) => ({
              text: signal.text,
              tone: mapBriefingTone(signal.tone),
            })),
            overallLabel: briefing.summary.trading_environment.overall_label,
            overallTone: mapBriefingTone(briefing.summary.trading_environment.overall_tone),
          }
        : null,
    },
  };
}

function mapLeadershipCardKind(kind: string): MarketPulseLeadershipCardKind | null {
  if (kind === "sector" || kind === "accumulation") {
    return kind;
  }
  if (kind === "stock") {
    return kind;
  }
  return null;
}

function extractStorySectorCount(headline: string): number {
  const match = headline.match(/ACROSS (\d+) SECTORS/i);
  return match ? Number(match[1]) : 1;
}

function localizeEmptyMessage(model: MarketPulseModel, locale: AppLocale) {
  if (locale === "en" || !model.emptyMessage) {
    return model.emptyMessage;
  }

  const language = getMarketPulseLanguage(locale);
  if (model.emptyState === "waiting-snapshot") return language.states.emptyWaitingSnapshot;
  if (model.emptyState === "insufficient-history") return language.states.emptyInsufficientHistory;
  if (model.emptyState === "no-attention") return language.states.emptyNoAttention;
  return model.emptyMessage;
}

export function applyMarketPulseLocalization(model: MarketPulseModel, locale: AppLocale): MarketPulseModel {
  if (locale === "en") {
    return model;
  }

  const language = getMarketPulseLanguage(locale);
  const briefing = model.briefing;
  const sectorCard = briefing?.leadership.cards.find((card) => card.kind === "sector");
  const sectors = sectorCard?.name ? [sectorCard.name] : [];
  const localizedBriefing = briefing
    ? {
        ...briefing,
        story: {
          ...briefing.story,
          headline: language.briefing.storyHeadline(
            briefing.story.tone,
            extractStorySectorCount(briefing.story.headline),
          ),
          explanation: language.briefing
            .storyExplanation(
              briefing.story.tone,
              briefing.moneyFlow.inflows[0]?.sector ?? null,
              briefing.moneyFlow.outflows[0]?.sector ?? null,
            )
            .join("\n"),
          metrics: briefing.story.metrics.map((metric) => ({
            ...metric,
            label: language.briefing.storyMetricLabel(metric.label),
          })),
        },
        state: {
          ...briefing.state,
          dimensions: briefing.state.dimensions.map((dimension) => ({
            ...dimension,
            label: language.briefing.stateDimensionLabel(dimension.key, dimension.label),
            value: language.briefing.stateDimensionValue(dimension.value),
          })),
          overallLabel: language.briefing.overallStateLabel(briefing.state.overallLabel),
        },
        opportunityScore: {
          ...briefing.opportunityScore,
          label: language.briefing.opportunityLabel(briefing.opportunityScore.score),
          trendLabel: briefing.opportunityScore.trendLabel
            ? language.briefing.opportunityTrendLabel(briefing.opportunityScore.trendLabel)
            : null,
        },
        leadership: {
          ...briefing.leadership,
          narrative: sectorCard
            ? language.leadership.narrative(sectorCard.name)
            : briefing.leadership.narrative,
          cards: briefing.leadership.cards.map((card) => ({
            ...card,
            subtitle: language.leadership.cardSubtitle(mapLeadershipCardKind(card.kind), card.subtitle),
          })),
        },
        summary: {
          ...briefing.summary,
          text: language.summary
            .narrative(
              briefing.summary.tone,
              briefing.summary.tradingEnvironment?.overallLabel ?? "Selective Opportunity",
              sectors,
            )
            .join("\n"),
          tradingEnvironment: briefing.summary.tradingEnvironment
            ? {
                ...briefing.summary.tradingEnvironment,
                signals: briefing.summary.tradingEnvironment.signals.map((signal) => ({
                  ...signal,
                  text: language.summary.signal(signal.text),
                })),
              }
            : null,
        },
      }
    : null;

  const localizeFocusStock = (stock: FocusStockModel): FocusStockModel => ({
    ...stock,
    whyHere: stock.whyHere.map((reason) => language.focus.reason(reason, stock.focusLabel)),
    trigger: language.focus.trigger(stock.trigger),
    actionSummary: language.focus.actionSummary(stock.actionSummary),
  });

  const qualityCount = model.dataQualityNote?.match(/^(\d+)/)?.[1];

  return {
    ...model,
    hero: {
      ...model.hero,
      attentionSubline: language.hero.subline,
    },
    sinceLastVisit: {
      ...model.sinceLastVisit,
      summaryLabel: language.sinceLastVisit.summary(
        model.sinceLastVisit.newChangesCount,
        model.sinceLastVisit.newFocusCount,
        model.sinceLastVisit.newAlertsCount,
      ),
    },
    briefing: localizedBriefing,
    focusStocks: model.focusStocks.map(localizeFocusStock),
    monitorCandidates: model.monitorCandidates.map(localizeFocusStock),
    alerts: model.alerts.map((alert) => ({
      ...alert,
      eventExplanation: language.alerts.eventExplanation(alert.type, alert.metricLabel, alert.symbol),
      whyItMatters: language.alerts.whyItMatters(alert.type),
    })),
    emptyMessage: localizeEmptyMessage(model, locale),
    dataQualityNote: qualityCount ? language.states.dataQualityNote(Number(qualityCount)) : model.dataQualityNote,
  };
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
    href: buildStockDetailPath(mover.exchange, mover.symbol),
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

export function buildMarketPulseViewModel(dto: BackendMarketPulseDto, locale: AppLocale = "en"): MarketPulseModel {
  const session = getMarketSession();
  const focusStocks = dto.focus_stocks.map(mapFocusStock);
  const monitorCandidates = dto.monitor_candidates.map(mapFocusStock);

  const model: MarketPulseModel = {
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
    briefing: dto.briefing ? mapBriefing(dto.briefing) : null,
    focusStocks,
    monitorCandidates,
    todayInsight: null,
    changes: [],
    alerts: dto.alerts.map(mapAlert),
    marketMovers: { gainers: [], losers: [] },
    emptyState: dto.empty_state as MarketPulseModel["emptyState"],
    emptyMessage: dto.empty_message,
    dataQualityNote: dto.data_quality_note,
    sessionDisablesRefresh: session.disablesFreshDataActions,
    sessionDescription: session.description,
  };

  return applyMarketPulseLocalization(model, locale);
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
    scoreVersion:
      dto.coverage?.score_version ??
      trackedStocks[0]?.score_breakdown.score_version ??
      null,
    focusStockIds: dto.focus_stocks.map((stock) => stock.stock_id),
    scores,
    recommendations,
    alertIds: dto.alerts.map((alert) => alert.id),
  };
}
