import type {
  BackendDailyMarketSummaryDto,
  BackendDsexIndexSnapshotDto,
  BackendMarketFreshnessDto,
  BackendStockDto,
  DataQualityFlag,
} from "@/lib/api/backend-api-types";
import { formatCompactNumber, formatNumber, formatPercent, toNumber } from "@/lib/formatters/financial-formatters";
import { buildMarketInsights } from "@/lib/insights/deterministic-insights";
import { deriveMarketBreadth, deriveMarketCondition } from "@/lib/market/market-intelligence";
import { buildDashboardMovers } from "@/lib/market/market-movers";
import {
  buildBreadthPulseContext,
  buildLeadersPulseContext,
  buildTurnoverPulseContext,
  buildVolumePulseContext,
} from "@/lib/market/market-pulse-metrics";
import type { StockIntelligenceModel } from "@/lib/market/market-intelligence-types";
import {
  buildDecisionSupportingContext,
  getDecisionPriority,
  isActionableDecision,
  resolveTraderDecision,
} from "@/lib/market/trader-decision";
import { buildMarketIndexContext } from "@/lib/market/market-index-context";
import { getMarketSession } from "@/lib/market/market-session-engine";
import type {
  BreadthModel,
  MarketDashboardModel,
  MarketDirection,
  MarketMood,
  MarketPulseModel,
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

function toBreadthModel(
  summary: BackendDailyMarketSummaryDto | null,
  universe: StockIntelligenceModel[],
  listedStockCount: number,
): BreadthModel {
  const derived = deriveMarketBreadth(universe);
  const summaryTotal = getSummaryBreadthTotal(summary);
  const coverageTarget = Math.max(universe.length, listedStockCount);

  if (
    summary &&
    summary.index_name !== "SOURCE_VALIDATION" &&
    summaryTotal !== null &&
    coverageTarget > 0 &&
    summaryTotal >= coverageTarget * 0.75
  ) {
    return {
      advancing: summary.advancing_issues!,
      declining: summary.declining_issues!,
      unchanged: summary.unchanged_issues!,
      total: summaryTotal,
    };
  }

  return derived;
}

function buildHeatmapTiles(universe: StockIntelligenceModel[]) {
  const maxTurnover = Math.max(...universe.map((stock) => stock.turnover ?? 0), 1);

  return [...universe]
    .sort((a, b) => (b.marketCap ?? b.turnover ?? 0) - (a.marketCap ?? b.turnover ?? 0))
    .map((stock) => {
      const change = stock.priceChangePercent ?? 0;
      const sizeSource = stock.marketCap ?? stock.turnover ?? 1;
      return {
        stockId: stock.stock.id,
        symbol: stock.stock.symbol,
        label: stock.stock.symbol,
        sector: stock.sector,
        value: formatPercent(change),
        changePercent: change,
        weight: Math.max(1, Math.min(8, Math.log10(sizeSource + 10) / 1.8)),
        tone: change > 0 ? ("positive" as const) : change < 0 ? ("negative" as const) : ("neutral" as const),
        href: `/stocks/${stock.stock.exchange}/${stock.stock.symbol}`,
        latestPrice: formatNumber(stock.latestPrice),
        turnover: formatCompactNumber(stock.turnover),
        turnoverValue: stock.turnover ?? 0,
        liquidityScore: Math.round(((stock.turnover ?? 0) / maxTurnover) * 100),
      };
    });
}

function toSignalFeedItem(stock: StockIntelligenceModel): SignalFeedItemModel {
  const decision = resolveTraderDecision(stock);
  return {
    symbol: stock.stock.symbol,
    signal: decision.recommendation,
    confidence: `${decision.confidence}%`,
    confidenceValue: decision.confidence,
    reason: decision.reason,
    risk: decision.riskLabel,
    priority: getDecisionPriority(decision.confidence),
    href: `/stocks/${stock.stock.exchange}/${stock.stock.symbol}`,
    supportingContext: buildDecisionSupportingContext(stock),
    generatedAt: stock.latestTradeDate ?? "Awaiting price data",
  };
}

function buildSignalFeed(universe: StockIntelligenceModel[]): SignalFeedItemModel[] {
  const ranked = universe
    .map((stock) => ({ stock, decision: resolveTraderDecision(stock) }))
    .filter(
      ({ decision }) => isActionableDecision(decision.recommendation) || decision.confidence >= 55,
    )
    .sort((left, right) => right.decision.confidence - left.decision.confidence)
    .slice(0, 8);

  return ranked.map(({ stock }) => toSignalFeedItem(stock));
}

function getDerivedTurnover(universe: StockIntelligenceModel[]) {
  const values = universe
    .map((stock) => stock.turnover)
    .filter((turnover): turnover is number => turnover !== null);

  if (!values.length) {
    return null;
  }

  return values.reduce((sum, turnover) => sum + turnover, 0);
}

function getDerivedVolume(universe: StockIntelligenceModel[]) {
  if (!universe.length) {
    return null;
  }

  return universe.reduce((sum, stock) => sum + stock.volume, 0);
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
  universe: StockIntelligenceModel[];
  breadth: BreadthModel;
  marketMood: MarketMood;
  dsexSnapshot: BackendDsexIndexSnapshotDto | null;
  sessionTradeDate: string | null | undefined;
}): MarketPulseModel {
  const { summaries, latestSummary, universe, breadth, marketMood, dsexSnapshot, sessionTradeDate } = input;
  const indexContext = buildMarketIndexContext(summaries, latestSummary, dsexSnapshot);
  const derivedTurnover = getDerivedTurnover(universe);
  const derivedVolume = getDerivedVolume(universe);
  const turnoverValue =
    toNumber(dsexSnapshot?.total_turnover) ?? toNumber(latestSummary?.total_turnover) ?? derivedTurnover;
  const volumeValue = dsexSnapshot?.total_volume ?? latestSummary?.total_volume ?? derivedVolume;
  const { direction, label } = deriveMarketDirection(breadth, indexContext.indexChangePercent);
  const turnoverLabel = turnoverValue !== null ? `BDT ${formatCompactNumber(turnoverValue)}` : "N/A";
  const volumeLabel = volumeValue !== null ? `${formatCompactNumber(volumeValue)} Shares` : "N/A";
  const leadersContext = buildLeadersPulseContext(universe, sessionTradeDate);
  const leadingSector = leadersContext.primary;
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
    turnoverHelper: hasExchangeTurnover ? "Exchange turnover" : "Derived from loaded prices",
    volumeLabel,
    volumeHelper: hasExchangeVolume ? "Exchange volume" : "Derived from loaded prices",
    breadthLabel: `${breadth.advancing} / ${breadth.declining}`,
    breadthAdvancing: breadth.advancing,
    breadthDeclining: breadth.declining,
    leadingSector,
    marketDirection: direction,
    marketDirectionLabel: label,
    marketMood,
    latestTradeDate: dsexSnapshot?.trade_date ?? latestSummary?.trade_date ?? universe[0]?.latestTradeDate ?? "Awaiting market summary",
    turnoverContext: buildTurnoverPulseContext(summaries, turnoverValue, turnoverLabel),
    volumeContext: buildVolumePulseContext(summaries, volumeValue, volumeLabel),
    breadthContext: buildBreadthPulseContext(breadth, direction),
    leadersContext,
  };
}

function buildTimeline(universe: StockIntelligenceModel[], latestSummary: BackendDailyMarketSummaryDto | null) {
  const items = [];
  const suspiciousCount = universe.filter((stock) => stock.dataQuality === "SUSPICIOUS").length;
  const rankedByConfidence = universe
    .map((stock) => ({ stock, decision: resolveTraderDecision(stock) }))
    .sort((left, right) => right.decision.confidence - left.decision.confidence);
  const highConfidenceDecision = rankedByConfidence[0];

  if (latestSummary?.has_suspicious_prices || suspiciousCount > 0) {
    items.push({
      time: "Data quality",
      title: "Suspicious activity flagged",
      description: `${suspiciousCount || "Some"} instruments need source validation before acting on signals.`,
    });
  }

  if (highConfidenceDecision) {
    const decision = highConfidenceDecision.decision;
    items.push({
      time: highConfidenceDecision.stock.latestTradeDate ?? "Latest",
      title: `${highConfidenceDecision.stock.stock.symbol} ${decision.recommendation}`,
      description: decision.reason,
    });
  }

  items.push({
    time: latestSummary?.trade_date ?? "Latest",
    title: "Market scan complete",
    description: `${universe.length} active instruments were evaluated with the shared trader decision engine.`,
  });

  return items;
}

export function buildMarketDashboardModel(
  summaries: BackendDailyMarketSummaryDto[],
  stocks: BackendStockDto[],
  universe: StockIntelligenceModel[] = [],
  dsexSnapshot: BackendDsexIndexSnapshotDto | null = null,
  freshness: BackendMarketFreshnessDto | null = null,
  options?: {
    listedStockCount?: number;
    movers?: MarketDashboardModel["movers"];
  },
): MarketDashboardModel {
  const latestSummary = getLatestSummary(summaries);
  const listedStockCount = options?.listedStockCount ?? stocks.length;
  const breadth = dsexSnapshot
    ? toBreadthFromSnapshot(dsexSnapshot)
    : toBreadthModel(latestSummary, universe, listedStockCount);
  const marketMood = deriveMarketCondition(universe, breadth);
  const dataQuality: DataQualityFlag | "UNKNOWN" = latestSummary?.data_quality_flag ?? "UNKNOWN";
  const session = getMarketSession({
    latestTradeDate: latestSummary?.trade_date ?? universe[0]?.latestTradeDate ?? freshness?.trade_date,
    dataQualityFlag: latestSummary?.data_quality_flag,
    freshness,
  });
  const derivedTurnover = getDerivedTurnover(universe);
  const turnoverValue = latestSummary?.total_turnover ?? derivedTurnover;
  const turnoverLabel = formatCompactNumber(turnoverValue);
  const sessionTradeDate = dsexSnapshot?.trade_date ?? latestSummary?.trade_date ?? freshness?.trade_date ?? universe[0]?.latestTradeDate;
  const pulse = buildMarketPulseModel({
    summaries,
    latestSummary,
    universe,
    breadth,
    marketMood,
    dsexSnapshot,
    sessionTradeDate,
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
        helper: universe.length ? `${breadth.advancing} advancing, ${breadth.declining} declining` : "Awaiting latest price coverage",
        tone: getMoodTone(marketMood),
      },
      {
        label: pulse.indexName,
        value: pulse.indexAvailable ? pulse.indexValue : "Index pending",
        helper: pulse.indexAvailable ? pulse.indexChangeLabel : "Live DSEX feed unavailable",
        tone: pulse.indexTone === "warning" ? "neutral" : pulse.indexTone,
      },
      {
        label: "Turnover",
        value: turnoverLabel,
        helper: latestSummary?.total_turnover ? "Latest exchange turnover" : "Derived from loaded stock turnover",
        tone: turnoverValue !== null ? "info" : "warning",
      },
      {
        label: "Listed Stocks",
        value: formatNumber(listedStockCount || 0, { maximumFractionDigits: 0 }),
        helper: `${universe.length} price-backed names loaded for analytics`,
        tone: "neutral",
      },
    ],
    breadth,
    heatmapTiles: buildHeatmapTiles(universe),
    signals: buildSignalFeed(universe),
    timeline: buildTimeline(universe, latestSummary),
    insights: buildMarketInsights({
      marketMood,
      hasPartialData: dataQuality !== "OK" && !dsexSnapshot && latestSummary?.index_name === "SOURCE_VALIDATION",
      signalCount: universe.filter((stock) => isActionableDecision(resolveTraderDecision(stock).recommendation)).length,
      turnoverLabel,
    }),
    movers: options?.movers ?? buildDashboardMovers(universe, sessionTradeDate),
  };
}
