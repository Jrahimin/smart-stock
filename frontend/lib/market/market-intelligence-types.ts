import type {
  BackendDailyPriceDto,
  BackendScannerConditionMatchDto,
  BackendStockDto,
  BackendTraderDecisionSummaryDto,
  DataQualityFlag,
  ExchangeCode,
  SignalType,
  TraderRecommendation,
} from "@/lib/api/backend-api-types";

export type TrendDirection = "UPTREND" | "DOWNTREND" | "SIDEWAYS" | "UNKNOWN";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type MarketCondition =
  | "Bullish"
  | "Cautious"
  | "Bearish"
  | "Accumulation"
  | "Weak recovery"
  | "High volatility"
  | "Unknown";

export type ChartCandleModel = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type VolumeBarModel = {
  time: string;
  value: number;
  tone: "positive" | "negative" | "neutral";
};

export type SignalScoreContext = {
  momentum: number | null;
  trend: number | null;
  volume: number | null;
  risk: number | null;
};

export type SignalSource = "derived" | "backend";

export type DerivedSignalModel = {
  stockId: string;
  symbol: string;
  name: string;
  exchange: ExchangeCode;
  signal: SignalType;
  confidence: number;
  risk: RiskLevel;
  reason: string;
  supportingContext: string[];
  generatedAt: string;
  asOfTradeDate?: string;
  computedAt?: string;
  momentumPhase?: string;
  scores?: SignalScoreContext;
  source?: SignalSource;
  triggerReason?: string;
  volumeBehavior?: string;
};

export type PersistedSignalContext = {
  asOfTradeDate: string;
  computedAt: string;
  confidence: number;
  isStale: boolean;
  reason: string;
  scores: SignalScoreContext;
  signal: SignalType;
  source: "backend";
  strategyName: string;
  strategyVersion: string | null;
  thresholdVersion: string | null;
  actionTaxonomy: string | null;
  canonicalRecommendation: TraderRecommendation | null;
  signalAsOf: string | null;
  sharedDecisionId: string | null;
};

export type StockIntelligenceModel = {
  stock: BackendStockDto;
  prices: BackendDailyPriceDto[];
  candles: ChartCandleModel[];
  volumeBars: VolumeBarModel[];
  latestPrice: number | null;
  previousClose: number | null;
  priceChange: number | null;
  priceChangePercent: number | null;
  volume: number;
  averageVolume: number | null;
  turnover: number | null;
  marketCap: number | null;
  sector: string;
  latestTradeDate: string | null;
  dataQuality: DataQualityFlag | "UNKNOWN";
  rsi: number | null;
  sma20: number | null;
  ema20: number | null;
  volatility: number | null;
  support: number | null;
  resistance: number | null;
  week52Low: number | null;
  week52High: number | null;
  trend: TrendDirection;
  signal: DerivedSignalModel;
  persistedSignal?: PersistedSignalContext | null;
  traderDecision?: BackendTraderDecisionSummaryDto | null;
  isBreakout?: boolean;
  returnFiveDayPercent?: number | null;
  returnTwentyDayPercent?: number | null;
  averageTurnover?: number | null;
  structure?: string | null;
  scannerConditions?: BackendScannerConditionMatchDto[];
  volumeBehavior?: "EXPANSION" | "NORMAL" | "THIN" | "UNKNOWN";
};

export type MarketBreadthStats = {
  advancing: number;
  declining: number;
  unchanged: number;
  total: number;
};
