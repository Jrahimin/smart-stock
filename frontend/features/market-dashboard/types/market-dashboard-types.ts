import type { DataQualityFlag, ExchangeCode, TraderRecommendation } from "@/lib/api/backend-api-types";
import type { InsightBlockModel } from "@/lib/insights/insight-types";
import type { MarketSessionModel } from "@/lib/market/market-session-engine";

export type MarketMood =
  | "Bullish"
  | "Cautious"
  | "Bearish"
  | "Accumulation"
  | "Weak recovery"
  | "High volatility"
  | "Unknown";

export type MarketMetricModel = {
  label: string;
  value: string;
  helper: string;
  tone: "positive" | "negative" | "neutral" | "warning" | "info";
};

export type BreadthModel = {
  advancing: number;
  declining: number;
  unchanged: number;
  total: number;
};

export type HeatmapTileModel = {
  stockId: string;
  symbol: string;
  label: string;
  sector: string;
  value: string;
  changePercent: number;
  weight: number;
  tone: "positive" | "negative" | "neutral";
  href: string;
  latestPrice: string;
  turnover: string;
  turnoverValue: number;
  liquidityScore: number;
};

export type SignalFeedItemModel = {
  symbol: string;
  signal: TraderRecommendation;
  confidence: string;
  confidenceValue: number;
  reason: string;
  risk: string;
  priority: "high" | "medium" | "low";
  href: string;
  supportingContext: string[];
  generatedAt: string;
};

export type MarketMoverModel = {
  stockId: string;
  symbol: string;
  name: string;
  latestPrice: string;
  changePercent: string;
  turnover: string;
  volume: string;
  trend: string;
  href: string;
  tone: "positive" | "negative" | "neutral";
};

export type MarketTimelineItemModel = {
  time: string;
  title: string;
  description: string;
};

export type MarketDirection = "buyers" | "sellers" | "mixed";

export type LeadingSectorModel = {
  name: string;
  changePercent: number;
  label: string;
};

export type IndexDayStatsModel = {
  open: string;
  high: string;
  low: string;
};

export type IndexRangeModel = {
  lowLabel: string;
  highLabel: string;
  positionPercent: number;
};

export type IndexPerformanceModel = {
  oneMonth: string;
  sixMonth: string;
  oneYear: string;
};

export type MarketPulseModel = {
  indexName: string;
  indexAvailable: boolean;
  indexValue: string;
  indexChangePercent: number | null;
  indexChangeLabel: string;
  indexTone: "positive" | "negative" | "neutral" | "warning";
  indexDayStats: IndexDayStatsModel | null;
  indexRange: IndexRangeModel | null;
  indexPerformance: IndexPerformanceModel;
  marketStatus: string | null;
  turnoverLabel: string;
  turnoverHelper: string;
  volumeLabel: string;
  volumeHelper: string;
  breadthLabel: string;
  breadthAdvancing: number;
  breadthDeclining: number;
  leadingSector: LeadingSectorModel | null;
  marketDirection: MarketDirection;
  marketDirectionLabel: string;
  marketMood: MarketMood;
  latestTradeDate: string;
};

export type MarketDashboardModel = {
  exchange: ExchangeCode;
  marketMood: MarketMood;
  latestTradeDate: string;
  dataQuality: DataQualityFlag | "UNKNOWN";
  session: MarketSessionModel;
  pulse: MarketPulseModel;
  heroMetrics: MarketMetricModel[];
  breadth: BreadthModel;
  heatmapTiles: HeatmapTileModel[];
  signals: SignalFeedItemModel[];
  timeline: MarketTimelineItemModel[];
  insights: InsightBlockModel[];
  movers: {
    gainers: MarketMoverModel[];
    losers: MarketMoverModel[];
    turnoverLeaders: MarketMoverModel[];
    volumeLeaders: MarketMoverModel[];
  };
};
