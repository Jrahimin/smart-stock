import type {
  BackendDailyMarketSummaryDto,
  BackendStockDto,
  DataQualityFlag,
} from "@/lib/api/backend-api-types";
import {
  formatCompactNumber,
  formatNumber,
  formatPercent,
  toNumber,
} from "@/lib/formatters/financial-formatters";
import { buildMarketInsights } from "@/lib/insights/deterministic-insights";
import { deriveMarketBreadth, deriveMarketCondition } from "@/lib/market/market-intelligence";
import type { StockIntelligenceModel } from "@/lib/market/market-intelligence-types";
import { getMarketSession } from "@/lib/market/market-session-engine";
import type {
  BreadthModel,
  MarketDashboardModel,
  MarketMoverModel,
  MarketMood,
  SignalFeedItemModel,
} from "@/features/market-dashboard/types/market-dashboard-types";

function getLatestSummary(summaries: BackendDailyMarketSummaryDto[]) {
  return [...summaries].sort((a, b) => b.trade_date.localeCompare(a.trade_date))[0] ?? null;
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

function toBreadthModel(summary: BackendDailyMarketSummaryDto | null, universe: StockIntelligenceModel[]): BreadthModel {
  if (
    summary?.advancing_issues !== null &&
    summary?.advancing_issues !== undefined &&
    summary.declining_issues !== null &&
    summary.declining_issues !== undefined &&
    summary.unchanged_issues !== null &&
    summary.unchanged_issues !== undefined
  ) {
    return {
      advancing: summary.advancing_issues,
      declining: summary.declining_issues,
      unchanged: summary.unchanged_issues,
      total: summary.advancing_issues + summary.declining_issues + summary.unchanged_issues,
    };
  }

  return deriveMarketBreadth(universe);
}

function buildHeatmapTiles(universe: StockIntelligenceModel[]) {
  return [...universe]
    .sort((a, b) => (b.marketCap ?? b.turnover ?? 0) - (a.marketCap ?? a.turnover ?? 0))
    .slice(0, 64)
    .map((stock) => {
      const change = stock.priceChangePercent ?? 0;
      return {
        stockId: stock.stock.id,
        symbol: stock.stock.symbol,
        label: stock.stock.symbol,
        sector: stock.sector,
        value: formatPercent(change),
        weight: Math.max(1, Math.log10((stock.marketCap ?? stock.turnover ?? 1) + 10)),
        tone: change > 0 ? ("positive" as const) : change < 0 ? ("negative" as const) : ("neutral" as const),
        href: `/stocks/${stock.stock.exchange}/${stock.stock.symbol}`,
        latestPrice: formatNumber(stock.latestPrice),
        turnover: formatCompactNumber(stock.turnover),
      };
    });
}

function toSignalFeedItem(stock: StockIntelligenceModel): SignalFeedItemModel {
  return {
    symbol: stock.stock.symbol,
    signal: stock.signal.signal,
    confidence: `${stock.signal.confidence}%`,
    reason: stock.signal.reason,
    risk: stock.signal.risk,
    href: `/stocks/${stock.stock.exchange}/${stock.stock.symbol}`,
    supportingContext: stock.signal.supportingContext,
    generatedAt: stock.signal.generatedAt,
  };
}

function toMover(stock: StockIntelligenceModel): MarketMoverModel {
  return {
    symbol: stock.stock.symbol,
    name: stock.stock.name,
    latestPrice: formatNumber(stock.latestPrice),
    changePercent: formatPercent(stock.priceChangePercent),
    turnover: formatCompactNumber(stock.turnover),
    volume: formatCompactNumber(stock.volume),
    trend: stock.trend,
    href: `/stocks/${stock.stock.exchange}/${stock.stock.symbol}`,
    tone:
      (stock.priceChangePercent ?? 0) > 0
        ? "positive"
        : (stock.priceChangePercent ?? 0) < 0
          ? "negative"
          : "neutral",
  };
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

function buildTimeline(universe: StockIntelligenceModel[], latestSummary: BackendDailyMarketSummaryDto | null) {
  const items = [];
  const suspiciousCount = universe.filter((stock) => stock.dataQuality === "SUSPICIOUS").length;
  const highConfidenceSignal = [...universe].sort((a, b) => b.signal.confidence - a.signal.confidence)[0];

  if (latestSummary?.has_suspicious_prices || suspiciousCount > 0) {
    items.push({
      time: "Data quality",
      title: "Suspicious activity flagged",
      description: `${suspiciousCount || "Some"} instruments need source validation before acting on signals.`,
    });
  }

  if (highConfidenceSignal) {
    items.push({
      time: highConfidenceSignal.latestTradeDate ?? "Latest",
      title: `${highConfidenceSignal.stock.symbol} ${highConfidenceSignal.signal.signal}`,
      description: highConfidenceSignal.signal.reason,
    });
  }

  items.push({
    time: latestSummary?.trade_date ?? "Latest",
    title: "Market scan complete",
    description: `${universe.length} active instruments were evaluated for price action, volume, risk, and deterministic signals.`,
  });

  return items;
}

export function buildMarketDashboardModel(
  summaries: BackendDailyMarketSummaryDto[],
  stocks: BackendStockDto[],
  universe: StockIntelligenceModel[] = [],
): MarketDashboardModel {
  const latestSummary = getLatestSummary(summaries);
  const breadth = toBreadthModel(latestSummary, universe);
  const marketMood = deriveMarketCondition(universe, breadth);
  const dataQuality: DataQualityFlag | "UNKNOWN" = latestSummary?.data_quality_flag ?? "UNKNOWN";
  const session = getMarketSession({
    latestTradeDate: latestSummary?.trade_date ?? universe[0]?.latestTradeDate,
    dataQualityFlag: latestSummary?.data_quality_flag,
  });
  const derivedTurnover = getDerivedTurnover(universe);
  const turnoverValue = latestSummary?.total_turnover ?? derivedTurnover;
  const turnoverLabel = formatCompactNumber(turnoverValue);
  const indexChangePercent = latestSummary?.index_change_percent ?? null;
  const indexChangePercentNumber = toNumber(indexChangePercent);
  const hasRealIndexSummary = latestSummary !== null && latestSummary.index_name !== "SOURCE_VALIDATION" && latestSummary.index_close !== null;

  return {
    exchange: latestSummary?.exchange ?? "DSE",
    marketMood,
    latestTradeDate: latestSummary?.trade_date ?? "Awaiting market summary",
    dataQuality,
    session,
    heroMetrics: [
      {
        label: "Market Mood",
        value: marketMood,
        helper: universe.length ? `${breadth.advancing} advancing, ${breadth.declining} declining` : "Awaiting latest price coverage",
        tone: getMoodTone(marketMood),
      },
      {
        label: latestSummary?.index_name === "SOURCE_VALIDATION" ? "DSEX" : (latestSummary?.index_name ?? "DSEX"),
        value: hasRealIndexSummary ? formatNumber(latestSummary.index_close) : "Index pending",
        helper: hasRealIndexSummary ? formatPercent(indexChangePercent) : "Backend has validation rows, not DSEX index rows yet",
        tone:
          indexChangePercentNumber !== null && indexChangePercentNumber > 0
            ? "positive"
            : indexChangePercentNumber !== null && indexChangePercentNumber < 0
              ? "negative"
              : "neutral",
      },
      {
        label: "Turnover",
        value: turnoverLabel,
        helper: latestSummary?.total_turnover ? "Latest exchange turnover" : "Derived from loaded stock turnover",
        tone: turnoverValue !== null ? "info" : "warning",
      },
      {
        label: "Listed Stocks",
        value: formatNumber(stocks.length || 0, { maximumFractionDigits: 0 }),
        helper: `${universe.length} price-backed names loaded for analytics`,
        tone: "neutral",
      },
    ],
    breadth,
    heatmapTiles: buildHeatmapTiles(universe),
    signals: [...universe]
      .filter((stock) => stock.signal.signal !== "HOLD" || stock.signal.confidence >= 55)
      .sort((a, b) => b.signal.confidence - a.signal.confidence)
      .slice(0, 8)
      .map(toSignalFeedItem),
    timeline: buildTimeline(universe, latestSummary),
    insights: buildMarketInsights({
      marketMood,
      hasPartialData: dataQuality !== "OK" || latestSummary?.index_name === "SOURCE_VALIDATION",
      signalCount: universe.filter((stock) => stock.signal.signal !== "HOLD").length,
      turnoverLabel,
    }),
    movers: {
      gainers: [...universe].sort((a, b) => (b.priceChangePercent ?? -Infinity) - (a.priceChangePercent ?? -Infinity)).slice(0, 5).map(toMover),
      losers: [...universe].sort((a, b) => (a.priceChangePercent ?? Infinity) - (b.priceChangePercent ?? Infinity)).slice(0, 5).map(toMover),
      turnoverLeaders: [...universe].sort((a, b) => (b.turnover ?? 0) - (a.turnover ?? 0)).slice(0, 5).map(toMover),
      volumeLeaders: [...universe].sort((a, b) => b.volume - a.volume).slice(0, 5).map(toMover),
    },
  };
}
