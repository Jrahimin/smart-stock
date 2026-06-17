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
  significance: "HIGH" | "MEDIUM" | "WATCH";
  timeLabel: string | null;
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

export type MarketStoryMetricModel = {
  label: string;
  value: string;
  subValue: string | null;
  tone: "positive" | "negative" | "neutral" | "info" | "warning";
};

export type MarketStoryModel = {
  headline: string;
  explanation: string;
  tone: "positive" | "negative" | "neutral" | "info" | "warning";
  metrics: MarketStoryMetricModel[];
};

export type MarketStateDimensionModel = {
  key: string;
  label: string;
  value: string;
  tone: "positive" | "negative" | "neutral" | "info" | "warning";
};

export type MarketStateModel = {
  dimensions: MarketStateDimensionModel[];
  overallLabel: string;
  overallTone: "positive" | "negative" | "neutral" | "info" | "warning";
};

export type MoneyFlowSectorModel = {
  sector: string;
  changeLabel: string;
  strength: number;
  tone: "positive" | "negative";
};

export type MoneyFlowModel = {
  inflows: MoneyFlowSectorModel[];
  outflows: MoneyFlowSectorModel[];
};

export type OpportunityScoreModel = {
  score: number;
  label: string;
  history: number[];
  previousSession: number | null;
  weeklyAverage: number | null;
  trendLabel: string | null;
};

export type PlaybookItemModel = {
  profile: string;
  summary: string;
  guidance: string;
  tone: "positive" | "negative" | "neutral" | "info" | "warning";
};

export type PlaybookModel = {
  question: string;
  items: PlaybookItemModel[];
};

export type HighPriorityModel = {
  symbol: string;
  name: string;
  exchange: ExchangeCode;
  href: string;
  reason: string;
  triggerLevel: string;
  metricLabel: string;
  latestPrice: string;
  priceChangePercent: string;
  priceTone: "positive" | "negative" | "neutral";
  sparklinePoints: number[];
};

export type LeadershipCardModel = {
  kind: string;
  title: string;
  name: string;
  detail: string | null;
  subtitle: string | null;
  tone: "positive" | "negative" | "neutral" | "info" | "warning";
  href: string | null;
  sparklinePoints: number[];
};

export type MarketSummaryHighlightModel = {
  label: string;
  value: string;
  tone: "positive" | "negative" | "neutral" | "info" | "warning";
};

export type MarketLeadershipModel = {
  cards: LeadershipCardModel[];
  freshBuySignals: string[];
  narrative: string;
  freshNewCount: number;
  freshUpgradedCount: number;
};

export type TradingEnvironmentSignalModel = {
  text: string;
  tone: "positive" | "negative" | "neutral" | "info" | "warning";
};

export type TradingEnvironmentModel = {
  signals: TradingEnvironmentSignalModel[];
  overallLabel: string;
  overallTone: "positive" | "negative" | "neutral" | "info" | "warning";
};

export type MarketSummaryModel = {
  text: string;
  tone: "positive" | "negative" | "neutral" | "info" | "warning";
  highlights: MarketSummaryHighlightModel[];
  tradingEnvironment: TradingEnvironmentModel | null;
};

export type MarketBriefingModel = {
  story: MarketStoryModel;
  state: MarketStateModel;
  moneyFlow: MoneyFlowModel;
  opportunityScore: OpportunityScoreModel;
  playbook: PlaybookModel;
  highPriority: HighPriorityModel | null;
  leadership: MarketLeadershipModel;
  summary: MarketSummaryModel;
};

export type MarketPulseModel = {
  hero: MarketPulseHeroModel;
  sinceLastVisit: SinceLastVisitModel;
  briefing: MarketBriefingModel | null;
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
