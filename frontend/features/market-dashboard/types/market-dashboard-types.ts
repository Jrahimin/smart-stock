import type {
  DataQualityFlag,
  DecisionDisplayAction,
  ExchangeCode,
} from "@/lib/api/backend-api-types";
import type { InsightBlockModel } from "@/lib/insights/insight-types";
import type {
  BreadthPulseContext,
  LeadersPulseContext,
  TurnoverPulseContext,
  VolumePulseContext,
} from "@/lib/market/market-pulse-metrics";
import type {
  ResolvedTraderDecisionReason,
  SignalTechnicalContext,
} from "@/lib/market/trader-decision-reason";
import type { MarketSessionModel } from "@/lib/market/market-session-engine";

export type MarketMood =
  | "Bullish"
  | "Cautious"
  | "Bearish"
  | "Accumulation"
  | "Weak recovery"
  | "High volatility"
  | "Unknown";

export type HeroMetricKind = "market_mood" | "index" | "turnover" | "listed_stocks";

export type HeroMetricHelperKind =
  | "breadth_summary"
  | "awaiting_coverage"
  | "index_change"
  | "index_unavailable"
  | "latest_turnover"
  | "turnover_snapshot"
  | "price_backed_count";

export type IndexValueStatus = "available" | "pending";

export type ExchangeMetricSource = "exchange" | "snapshot";

export type TradeDateStatus = "available" | "awaiting";

export type MarketMetricModel = {
  kind: HeroMetricKind;
  helperKind: HeroMetricHelperKind;
  indexValueStatus?: IndexValueStatus;
  label: string;
  value: string;
  helper: string;
  tone: "positive" | "negative" | "neutral" | "warning" | "info";
};

export type BreadthModel = {
  provenance?: import("@/lib/api/backend-api-types").BackendBreadthDto;
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
  changePercent: number | null;
  tradeDate?: string | null;
  sectorSummary?: { changePercent: number | null; measuredCount: number; totalCount: number; weighting: "TURNOVER" | "EQUAL" | "UNAVAILABLE" };
  weight: number;
  tone: "positive" | "negative" | "neutral";
  href: string;
  latestPrice: string;
  turnover: string;
  turnoverValue: number;
  liquidityScore: number;
};

export type SignalFeedItemModel = {
  decisionDate?: string | null;
  name?: string;
  measuredFacts?: import("@/lib/api/stock-decision-support-types").MeasuredDecisionFactsDto | null;
  decisionSummary?: import("@/lib/api/backend-api-types").BackendTraderDecisionSummaryDto | null;
  symbol: string;
  signal: DecisionDisplayAction | null;
  confidence: string;
  confidenceValue: number;
  reason: string;
  reasonSummary: string;
  reasonKey: ResolvedTraderDecisionReason["key"];
  reasonCode?: string | null;
  reasonParams?: ResolvedTraderDecisionReason["params"];
  entryCondition?: string | null;
  entryApplicability?: import("@/lib/api/stock-decision-support-types").EntryApplicabilityDto | null;
  technicalContext: SignalTechnicalContext;
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
  kind?: "snapshot" | "mover" | "alert";
  sourceUrl?: string;
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
  indexTradeDate?: string | null;
  activityTradeDate?: string | null;
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
  turnoverSource: ExchangeMetricSource;
  volumeLabel: string;
  volumeHelper: string;
  volumeSource: ExchangeMetricSource;
  tradeDateStatus: TradeDateStatus;
  breadthLabel: string;
  breadthAdvancing: number;
  breadthDeclining: number;
  leadingSector: LeadingSectorModel | null;
  marketDirection: MarketDirection;
  marketDirectionLabel: string;
  marketMood: MarketMood;
  latestTradeDate: string;
  turnoverContext: TurnoverPulseContext;
  volumeContext: VolumePulseContext;
  breadthContext: BreadthPulseContext;
  leadersContext: LeadersPulseContext;
};

export type MarketDashboardModel = {
  overviewPublication?: Pick<import("@/lib/api/backend-api-types").BackendDashboardOverviewDto, "market_sync_id" | "last_synced_at" | "session_trade_date">;
  activityIsIntraday?: boolean;
  isIntraday: boolean;
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
