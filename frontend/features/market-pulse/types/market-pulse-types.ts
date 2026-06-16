import type {
  ExchangeCode,
  MarketAlertType,
  PulseFocusLabel,
  PulseScoreBand,
} from "@/lib/api/backend-api-types";

export type PulseScoreBreakdownModel = {
  trend: number;
  momentum: number;
  volume: number;
  signalBoost: number;
  riskPenalty: number;
  total: number;
  contributors: string[];
  band: PulseScoreBand;
};

export type FocusStockModel = {
  rank: number;
  stockId: string;
  symbol: string;
  name: string;
  exchange: ExchangeCode;
  href: string;
  pulseScore: number;
  scoreBreakdown: PulseScoreBreakdownModel;
  focusLabel: PulseFocusLabel;
  labelTone: "positive" | "warning" | "info" | "negative";
  whyHere: string[];
  trigger: string;
  actionSummary: string;
  latestPrice: string;
  priceChangePercent: string;
  priceTone: "positive" | "negative" | "neutral";
  sparklinePoints: number[];
};

export type MarketPulseHeroModel = {
  greeting: string;
  attentionHeadline: string;
  attentionSubline: string;
  lastUpdatedLabel: string | null;
  relativeUpdatedLabel: string | null;
  sessionLabel: string | null;
  focusCount: number;
  recentFocusCount: number;
};

export type SinceLastVisitModel = {
  visible: boolean;
  newChangesCount: number;
  newFocusCount: number;
  newAlertsCount: number;
  summaryLabel: string;
};

export type TodayInsightModel = {
  title: string;
  explanation: string;
  whyItMatters: string;
  tone: "positive" | "negative" | "warning" | "info";
};

export type PulseBriefingChipModel = {
  id: string;
  label: string;
  value: string;
  tone: "positive" | "warning" | "info" | "primary";
};

export type PulseChangeModel = {
  id: string;
  timeLabel: string;
  type: string;
  title: string;
  description: string;
  badge: string;
  badgeTone: "positive" | "warning" | "info" | "negative";
  href?: string;
};

export type MarketAlertModel = {
  id: string;
  type: MarketAlertType;
  eventTitle: string;
  eventExplanation: string;
  whyItMatters: string;
  metricLabel: string;
  symbol: string | null;
  latestPrice: string | null;
  priceChangePercent: string | null;
  priceTone: "positive" | "negative" | "neutral" | null;
  href: string | null;
};

export type MarketMoverModel = {
  symbol: string;
  name: string;
  exchange: ExchangeCode;
  latestPrice: string;
  priceChangePercent: string;
  priceTone: "positive" | "negative" | "neutral";
  turnover: string | null;
  href: string;
};

export type MarketMoversModel = {
  gainers: MarketMoverModel[];
  losers: MarketMoverModel[];
};

export type MarketPulseModel = {
  hero: MarketPulseHeroModel;
  sinceLastVisit: SinceLastVisitModel;
  briefingChips: PulseBriefingChipModel[];
  focusStocks: FocusStockModel[];
  monitorCandidates: FocusStockModel[];
  todayInsight: TodayInsightModel | null;
  changes: PulseChangeModel[];
  alerts: MarketAlertModel[];
  marketMovers: MarketMoversModel;
  emptyState: "none" | "waiting-snapshot" | "insufficient-history" | "no-attention";
  emptyMessage: string | null;
  dataQualityNote: string | null;
  sessionDisablesRefresh: boolean;
  sessionDescription: string;
};

export type MarketPulseStoredSnapshot = {
  lastSyncedAt: string | null;
  focusStockIds: string[];
  scores: Record<string, number>;
  recommendations: Record<string, string>;
  alertIds: string[];
};
