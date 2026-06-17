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
import type {
  BreadthModel,
  HeatmapTileModel,
  MarketDashboardModel,
  MarketDirection,
  MarketMood,
  MarketPulseModel,
  MarketTimelineItemModel,
  SignalFeedItemModel,
} from "@/features/market-dashboard/types/market-dashboard-types";

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
    volumeLabel,
    volumeHelper: hasExchangeVolume ? "Exchange volume" : "Exchange volume snapshot",
    breadthLabel: `${breadth.advancing} / ${breadth.declining}`,
    breadthAdvancing: breadth.advancing,
    breadthDeclining: breadth.declining,
    leadingSector,
    marketDirection: direction,
    marketDirectionLabel: label,
    marketMood,
    latestTradeDate: dsexSnapshot?.trade_date ?? latestSummary?.trade_date ?? "Awaiting market summary",
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

  return {
    exchange: latestSummary?.exchange ?? "DSE",
    marketMood,
    latestTradeDate: latestSummary?.trade_date ?? "Awaiting market summary",
    dataQuality,
    session,
    pulse,
    heroMetrics: [
      {
        label: "Market Mood",
        value: marketMood,
        helper: priceBackedCount ? `${breadth.advancing} advancing, ${breadth.declining} declining` : "Awaiting latest price coverage",
        tone: getMoodTone(marketMood),
      },
      {
        label: pulse.indexName,
        value: pulse.indexAvailable ? pulse.indexValue : "Index pending",
        helper: pulse.indexAvailable ? pulse.indexChangeLabel : "Synced DSEX data unavailable",
        tone: pulse.indexTone === "warning" ? "neutral" : pulse.indexTone,
      },
      {
        label: "Turnover",
        value: turnoverLabel,
        helper: latestSummary?.total_turnover ? "Latest exchange turnover" : "Exchange turnover snapshot",
        tone: turnoverLabel !== "N/A" ? "info" : "warning",
      },
      {
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
}
