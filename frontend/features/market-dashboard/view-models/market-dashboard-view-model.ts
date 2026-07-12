import type {
  BackendDailyMarketSummaryDto,
  BackendDsexIndexSnapshotDto,
  BackendMarketFreshnessDto,
  DataQualityFlag,
} from "@/lib/api/backend-api-types";
import { formatCompactNumber, formatNumber, toNumber } from "@/lib/formatters/financial-formatters";
import type { InsightBlockModel } from "@/lib/insights/insight-types";
import { deriveMarketCondition } from "@/lib/market/market-intelligence";
import { buildDashboardMovers } from "@/lib/market/market-movers";
import {
  buildBreadthPulseContext,
  buildLeadersPulseContext,
  buildTurnoverPulseContext,
  buildVolumePulseContext,
  type LeadersPulseContext,
} from "@/lib/market/market-pulse-metrics";
import { buildMarketIndexContext } from "@/lib/market/market-index-context";
import { getMarketSession } from "@/lib/market/market-session-engine";
import { buildLocalizedSignalReason, resolveTraderDecisionReason } from "@/lib/market/trader-decision-reason";
import type {
  BreadthModel,
  ExchangeMetricSource,
  HeatmapTileModel,
  MarketDashboardModel,
  MarketDirection,
  MarketMood,
  MarketPulseModel,
  MarketTimelineItemModel,
  SignalFeedItemModel,
  TradeDateStatus,
} from "@/features/market-dashboard/types/market-dashboard-types";
import {
  getDashboardLanguage,
  type MarketNarrativeKey,
} from "@/features/market-dashboard/dashboard-language";
import {
  buildTurnoverInsightContext,
  localizeDashboardInsights,
  resolveTurnoverLiquidityInsightKey,
} from "@/features/market-dashboard/view-models/dashboard-insights-localization";
import type { AppLocale } from "@/lib/locale/app-locale";
import { DEFAULT_LOCALE } from "@/lib/locale/app-locale";
import type { LeaderRowKind } from "@/lib/market/market-pulse-metrics";

function getLatestSummary(summaries: BackendDailyMarketSummaryDto[]) {
  const sorted = [...summaries].sort((a, b) => b.trade_date.localeCompare(a.trade_date));
  return sorted.find((summary) => summary.index_name !== "SOURCE_VALIDATION") ?? sorted[0] ?? null;
}

function getSummaryBreadthTotal(summary: BackendDailyMarketSummaryDto | null): number | null {
  if (
    summary?.advancing_issues === null ||
    summary?.advancing_issues === undefined ||
    summary.declining_issues === null ||
    summary.declining_issues === undefined ||
    summary.unchanged_issues === null ||
    summary.unchanged_issues === undefined
  ) {
    return null;
  }

  return summary.advancing_issues + summary.declining_issues + summary.unchanged_issues;
}

function getMoodTone(mood: MarketMood) {
  if (mood === "Bullish" || mood === "Accumulation") {
    return "positive" as const;
  }

  if (mood === "Bearish" || mood === "High volatility") {
    return "negative" as const;
  }

  if (mood === "Unknown" || mood === "Cautious" || mood === "Weak recovery") {
    return "warning" as const;
  }

  return "neutral" as const;
}

function toBreadthModel(summary: BackendDailyMarketSummaryDto | null, listedStockCount: number): BreadthModel {
  const summaryTotal = getSummaryBreadthTotal(summary);

  if (
    summary &&
    summary.index_name !== "SOURCE_VALIDATION" &&
    summaryTotal !== null &&
    listedStockCount > 0 &&
    summaryTotal >= listedStockCount * 0.75
  ) {
    return {
      advancing: summary.advancing_issues!,
      declining: summary.declining_issues!,
      unchanged: summary.unchanged_issues!,
      total: summaryTotal,
    };
  }

  return { advancing: 0, declining: 0, unchanged: 0, total: 0 };
}

function deriveMarketDirection(
  breadth: BreadthModel,
  indexChangePercent: number | null,
): { direction: MarketDirection; label: string } {
  const indexMove = indexChangePercent ?? 0;
  const buyersAhead = breadth.advancing > breadth.declining * 1.12;
  const sellersAhead = breadth.declining > breadth.advancing * 1.12;

  if ((buyersAhead && indexMove >= 0) || (breadth.advancing > breadth.declining && indexMove > 0.2)) {
    return { direction: "buyers", label: "Buyers In Control" };
  }

  if ((sellersAhead && indexMove <= 0) || (breadth.declining > breadth.advancing && indexMove < -0.2)) {
    return { direction: "sellers", label: "Sellers In Control" };
  }

  return { direction: "mixed", label: "Mixed Session" };
}

export function resolveMarketNarrativeKey(input: {
  direction: MarketDirection;
  indexChangePercent: number | null;
  advancing: number;
  declining: number;
}): MarketNarrativeKey {
  const indexMove = input.indexChangePercent ?? 0;
  const indexStable = Math.abs(indexMove) < 0.3;

  if (indexStable && input.declining > input.advancing * 1.1) {
    return "index_stable_breadth_weak";
  }

  if (input.direction === "sellers") {
    return "sellers_dominant";
  }

  if (input.direction === "buyers") {
    if (indexMove > 0.2 && input.advancing > input.declining) {
      return "early_recovery";
    }

    return "buyers_active";
  }

  return "sideways_waiting";
}

function resolveLiquidityNarrativeKey(ratio: number | null): MarketNarrativeKey {
  if (ratio === null) {
    return "average_liquidity";
  }

  if (ratio >= 1.08) {
    return "strong_liquidity";
  }

  if (ratio <= 0.92) {
    return "weak_liquidity";
  }

  return "average_liquidity";
}

function resolveParticipationNarrativeKey(ratio: number | null): MarketNarrativeKey {
  if (ratio === null) {
    return "participation_near";
  }

  if (ratio >= 1.08) {
    return "participation_above";
  }

  if (ratio <= 0.92) {
    return "participation_below";
  }

  return "participation_near";
}

function localizeLeaderRowLabel(kind: LeaderRowKind, language: ReturnType<typeof getDashboardLanguage>) {
  switch (kind) {
    case "top_sector":
      return language.hero.topSector;
    case "runner_up":
      return language.hero.runnerUp;
    case "top_stock":
      return language.hero.topStock;
    case "coverage":
      return language.hero.coverage;
  }
}

function localizeHeroMetric(
  metric: MarketDashboardModel["heroMetrics"][number],
  language: ReturnType<typeof getDashboardLanguage>,
  context: { breadth: BreadthModel; priceBackedCount: number },
) {
  const localized = { ...metric };

  switch (metric.kind) {
    case "market_mood":
      localized.label = language.states.marketMood;
      localized.helper =
        metric.helperKind === "breadth_summary"
          ? language.states.advancingDeclining(context.breadth.advancing, context.breadth.declining)
          : language.states.awaitingCoverage;
      break;
    case "index":
      if (metric.indexValueStatus === "pending") {
        localized.value = language.states.indexPending;
      }
      localized.helper =
        metric.helperKind === "index_unavailable"
          ? language.states.indexUnavailable
          : localized.helper;
      break;
    case "turnover":
      localized.label = language.states.turnover;
      localized.helper =
        metric.helperKind === "latest_turnover"
          ? language.states.latestTurnover
          : language.pulse.exchangeTurnoverSnapshot;
      break;
    case "listed_stocks":
      localized.label = language.states.listedStocks;
      localized.helper = language.states.priceBackedHelper(context.priceBackedCount);
      break;
  }

  return localized;
}

function resolveVolumeNarrativeKey(pricesRising: boolean, ratio: number | null): MarketNarrativeKey {
  if (pricesRising && ratio !== null && ratio < 1.08) {
    return "volume_not_confirming";
  }

  if (pricesRising && ratio !== null && ratio >= 1.08) {
    return "volume_confirms_move";
  }

  return resolveParticipationNarrativeKey(ratio);
}

function parseRatioFromLabel(label: string): number | null {
  if (label === "N/A") {
    return null;
  }

  const numeric = Number.parseFloat(label.replace("x", ""));
  return Number.isNaN(numeric) ? null : numeric;
}

function applyDashboardLocalization(
  model: MarketDashboardModel,
  locale: AppLocale,
  context: {
    breadth: BreadthModel;
    indexChangePercent: number | null;
    turnoverRatio: number | null;
    volumeRatio: number | null;
    priceBackedCount: number;
  },
): MarketDashboardModel {
  const language = getDashboardLanguage(locale);
  const { pulse } = model;
  const localizedInsights = localizeDashboardInsights(
    model.insights,
    language.insights,
    language.narratives,
    {
      marketMood: model.marketMood,
      signalCount: model.signals.length,
      turnover: buildTurnoverInsightContext(
        pulse,
        resolveTurnoverLiquidityInsightKey(context.turnoverRatio),
      ),
    },
  );

  if (locale === "en") {
    return {
      ...model,
      insights: localizedInsights,
    };
  }

  const directionLabel =
    pulse.marketDirection === "buyers"
      ? language.direction.buyers
      : pulse.marketDirection === "sellers"
        ? language.direction.sellers
        : language.direction.mixed;
  const breadthNarrativeKey = resolveMarketNarrativeKey({
    direction: pulse.marketDirection,
    indexChangePercent: context.indexChangePercent,
    advancing: context.breadth.advancing,
    declining: context.breadth.declining,
  });

  const localizedPulse: MarketPulseModel = {
    ...pulse,
    marketDirectionLabel: directionLabel,
    turnoverHelper:
      pulse.turnoverSource === "snapshot"
        ? language.pulse.exchangeTurnoverSnapshot
        : language.pulse.exchangeTurnover,
    volumeHelper:
      pulse.volumeSource === "snapshot"
        ? language.pulse.exchangeVolumeSnapshot
        : language.pulse.exchangeVolume,
    turnoverContext: {
      ...pulse.turnoverContext,
      insight: language.narratives[resolveLiquidityNarrativeKey(context.turnoverRatio)],
    },
    volumeContext: {
      ...pulse.volumeContext,
      insight: language.narratives[
        resolveVolumeNarrativeKey((context.indexChangePercent ?? 0) > 0, context.volumeRatio)
      ],
    },
    breadthContext: {
      ...pulse.breadthContext,
      insight: language.narratives[breadthNarrativeKey],
      footer: language.breadthSummary(
        context.breadth.advancing,
        context.breadth.declining,
        context.breadth.unchanged,
      ),
    },
    leadersContext: {
      ...pulse.leadersContext,
      rows: pulse.leadersContext.rows.map((row) => ({
        ...row,
        label: localizeLeaderRowLabel(row.kind, language),
        name: row.nameKey === "leadership_pending" ? language.hero.leadershipPending : row.name,
      })),
      footer: language.hero.leadersFooter,
    },
    latestTradeDate:
      pulse.tradeDateStatus === "awaiting"
        ? language.states.awaitingMarketSummary
        : pulse.latestTradeDate,
  };

  return {
    ...model,
    latestTradeDate:
      model.latestTradeDate === "Awaiting market summary" || pulse.tradeDateStatus === "awaiting"
        ? language.states.awaitingMarketSummary
        : model.latestTradeDate,
    pulse: localizedPulse,
    heroMetrics: model.heroMetrics.map((metric) =>
      localizeHeroMetric(metric, language, {
        breadth: context.breadth,
        priceBackedCount: context.priceBackedCount,
      }),
    ),
    signals: model.signals.map((signal) => {
      const resolvedReason = resolveTraderDecisionReason(signal.reasonSummary);
      const localizedReason = buildLocalizedSignalReason(
        signal.technicalContext,
        resolvedReason,
        language.signals,
      );
      const localizedPrimaryContext =
        signal.technicalContext.rsi !== undefined
          ? language.signals.contextRsi(signal.technicalContext.rsi.toFixed(1))
          : signal.technicalContext.volumeRatio !== undefined
            ? language.signals.contextVolume(signal.technicalContext.volumeRatio.toFixed(1))
            : signal.supportingContext[0];

      return {
        ...signal,
        reason: localizedReason,
        supportingContext: localizedPrimaryContext
          ? [localizedPrimaryContext, ...signal.supportingContext.slice(1)]
          : signal.supportingContext,
      };
    }),
    insights: localizedInsights,
  };
}

function toBreadthFromSnapshot(snapshot: BackendDsexIndexSnapshotDto): BreadthModel {
  return {
    advancing: snapshot.advancing_issues,
    declining: snapshot.declining_issues,
    unchanged: snapshot.unchanged_issues,
    total: snapshot.advancing_issues + snapshot.declining_issues + snapshot.unchanged_issues,
  };
}

function buildMarketPulseModel(input: {
  summaries: BackendDailyMarketSummaryDto[];
  latestSummary: BackendDailyMarketSummaryDto | null;
  breadth: BreadthModel;
  marketMood: MarketMood;
  dsexSnapshot: BackendDsexIndexSnapshotDto | null;
  sessionTradeDate: string | null | undefined;
  leadersContext?: LeadersPulseContext;
}): MarketPulseModel {
  const { summaries, latestSummary, breadth, marketMood, dsexSnapshot, sessionTradeDate, leadersContext } = input;
  const indexContext = buildMarketIndexContext(summaries, latestSummary, dsexSnapshot);
  const turnoverValue = toNumber(dsexSnapshot?.total_turnover) ?? toNumber(latestSummary?.total_turnover);
  const volumeValue = dsexSnapshot?.total_volume ?? latestSummary?.total_volume ?? null;
  const { direction, label } = deriveMarketDirection(breadth, indexContext.indexChangePercent);
  const turnoverLabel = turnoverValue !== null ? `BDT ${formatCompactNumber(turnoverValue)}` : "N/A";
  const volumeLabel = volumeValue !== null ? `${formatCompactNumber(volumeValue)} Shares` : "N/A";
  const leaders = leadersContext ?? buildLeadersPulseContext([], sessionTradeDate);
  const leadingSector = leaders.primary;
  const hasExchangeTurnover = Boolean(dsexSnapshot?.total_turnover ?? latestSummary?.total_turnover);
  const hasExchangeVolume = Boolean(dsexSnapshot?.total_volume ?? latestSummary?.total_volume);
  const turnoverSource: ExchangeMetricSource = hasExchangeTurnover ? "exchange" : "snapshot";
  const volumeSource: ExchangeMetricSource = hasExchangeVolume ? "exchange" : "snapshot";
  const resolvedTradeDate = dsexSnapshot?.trade_date ?? latestSummary?.trade_date;
  const tradeDateStatus: TradeDateStatus = resolvedTradeDate ? "available" : "awaiting";

  return {
    indexName: indexContext.indexName,
    indexAvailable: indexContext.indexAvailable,
    indexValue: indexContext.indexValue,
    indexChangePercent: indexContext.indexChangePercent,
    indexChangeLabel: indexContext.indexChangeLabel,
    indexTone: indexContext.indexTone,
    indexDayStats: indexContext.dayStats,
    indexRange: indexContext.range
      ? {
          lowLabel: indexContext.range.lowLabel,
          highLabel: indexContext.range.highLabel,
          positionPercent: indexContext.range.positionPercent,
        }
      : null,
    indexPerformance: indexContext.performance,
    marketStatus: indexContext.marketStatus,
    turnoverLabel,
    turnoverHelper: hasExchangeTurnover ? "Exchange turnover" : "Exchange turnover snapshot",
    turnoverSource,
    volumeLabel,
    volumeHelper: hasExchangeVolume ? "Exchange volume" : "Exchange volume snapshot",
    volumeSource,
    breadthLabel: `${breadth.advancing} / ${breadth.declining}`,
    breadthAdvancing: breadth.advancing,
    breadthDeclining: breadth.declining,
    leadingSector,
    marketDirection: direction,
    marketDirectionLabel: label,
    marketMood,
    latestTradeDate: resolvedTradeDate ?? "Awaiting market summary",
    tradeDateStatus,
    turnoverContext: buildTurnoverPulseContext(summaries, turnoverValue, turnoverLabel),
    volumeContext: buildVolumePulseContext(summaries, volumeValue, volumeLabel),
    breadthContext: buildBreadthPulseContext(breadth, direction),
    leadersContext: leaders,
  };
}

export function buildMarketDashboardModel(
  summaries: BackendDailyMarketSummaryDto[],
  dsexSnapshot: BackendDsexIndexSnapshotDto | null = null,
  freshness: BackendMarketFreshnessDto | null = null,
  options?: {
    listedStockCount?: number;
    movers?: MarketDashboardModel["movers"];
    heatmapTiles?: HeatmapTileModel[];
    signals?: SignalFeedItemModel[];
    timeline?: MarketTimelineItemModel[];
    insights?: InsightBlockModel[];
    leadersContext?: LeadersPulseContext;
    marketMood?: MarketMood;
    priceBackedCount?: number;
    turnoverLabel?: string;
    locale?: AppLocale;
  },
): MarketDashboardModel {
  const latestSummary = getLatestSummary(summaries);
  const listedStockCount = options?.listedStockCount ?? 0;
  const priceBackedCount = options?.priceBackedCount ?? 0;
  const breadth = dsexSnapshot
    ? toBreadthFromSnapshot(dsexSnapshot)
    : toBreadthModel(latestSummary, listedStockCount);
  const fallbackBreadth = { advancing: breadth.advancing, declining: breadth.declining, unchanged: breadth.unchanged, total: breadth.total };
  const marketMood = options?.marketMood ?? deriveMarketCondition([], fallbackBreadth);
  const dataQuality: DataQualityFlag | "UNKNOWN" = latestSummary?.data_quality_flag ?? "UNKNOWN";
  const session = getMarketSession({
    latestTradeDate: latestSummary?.trade_date ?? freshness?.trade_date,
    dataQualityFlag: latestSummary?.data_quality_flag,
    freshness,
  });
  const turnoverLabel = options?.turnoverLabel ?? formatCompactNumber(latestSummary?.total_turnover ?? null);
  const sessionTradeDate = dsexSnapshot?.trade_date ?? latestSummary?.trade_date ?? freshness?.trade_date;
  const pulse = buildMarketPulseModel({
    summaries,
    latestSummary,
    breadth,
    marketMood,
    dsexSnapshot,
    sessionTradeDate,
    leadersContext: options?.leadersContext,
  });

  const baseModel: MarketDashboardModel = {
    exchange: latestSummary?.exchange ?? "DSE",
    marketMood,
    latestTradeDate: latestSummary?.trade_date ?? "Awaiting market summary",
    dataQuality,
    session,
    pulse,
    heroMetrics: [
      {
        kind: "market_mood",
        helperKind: priceBackedCount ? "breadth_summary" : "awaiting_coverage",
        label: "Market Mood",
        value: marketMood,
        helper: priceBackedCount ? `${breadth.advancing} advancing, ${breadth.declining} declining` : "Awaiting latest price coverage",
        tone: getMoodTone(marketMood),
      },
      {
        kind: "index",
        helperKind: pulse.indexAvailable ? "index_change" : "index_unavailable",
        indexValueStatus: pulse.indexAvailable ? "available" : "pending",
        label: pulse.indexName,
        value: pulse.indexAvailable ? pulse.indexValue : "Index pending",
        helper: pulse.indexAvailable ? pulse.indexChangeLabel : "Synced DSEX data unavailable",
        tone: pulse.indexTone === "warning" ? "neutral" : pulse.indexTone,
      },
      {
        kind: "turnover",
        helperKind: latestSummary?.total_turnover ? "latest_turnover" : "turnover_snapshot",
        label: "Turnover",
        value: turnoverLabel,
        helper: latestSummary?.total_turnover ? "Latest exchange turnover" : "Exchange turnover snapshot",
        tone: turnoverLabel !== "N/A" ? "info" : "warning",
      },
      {
        kind: "listed_stocks",
        helperKind: "price_backed_count",
        label: "Listed Stocks",
        value: formatNumber(listedStockCount || 0, { maximumFractionDigits: 0 }),
        helper: `${priceBackedCount} price-backed names evaluated for analytics`,
        tone: "neutral",
      },
    ],
    breadth,
    heatmapTiles: options?.heatmapTiles ?? [],
    signals: options?.signals ?? [],
    timeline: options?.timeline ?? [],
    insights: options?.insights ?? [],
    movers: options?.movers ?? buildDashboardMovers([], sessionTradeDate),
  };

  const locale = options?.locale ?? DEFAULT_LOCALE;
  const turnoverRatio =
    pulse.turnoverContext.activityMeterPercent === 50
      ? null
      : 1 + (pulse.turnoverContext.activityMeterPercent - 50) / 42;

  return applyDashboardLocalization(baseModel, locale, {
    breadth,
    indexChangePercent: pulse.indexChangePercent,
    turnoverRatio,
    volumeRatio: parseRatioFromLabel(pulse.volumeContext.ratioVsAvg),
    priceBackedCount,
  });
}
