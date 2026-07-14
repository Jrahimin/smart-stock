import type {
  BackendDailyPriceDto,
  BackendCanonicalDecisionResultDto,
  BackendDataReliabilityDto,
  BackendDecisionConstraintDto,
  BackendEligibilityResultDto,
  BackendStockDto,
  BackendTechnicalSnapshotDto,
  BackendTradingRiskDto,
  EvidenceDirection,
  ExchangeCode,
  HolderAction,
  NonHolderAction,
  TraderStance,
  TraderRecommendation,
  WarningSeverity,
} from "@/lib/api/backend-api-types";

export type ScoreComponentDto = {
  key: string;
  label: string;
  score: number;
  weight: number;
  explanation: string;
};

export type StockDecisionSupportDto = {
  stock_id: string;
  symbol: string;
  exchange: ExchangeCode;
  decision: {
    recommendation: TraderRecommendation;
    confidence: number;
    reasoning: string[];
    confidence_semantics?: "HEURISTIC_EVIDENCE";
    evidence_strength?: number | null;
    evidence_strength_semantics?: "HEURISTIC_DIRECTIONAL_EVIDENCE";
    primary_reason?: string | null;
    primary_reason_code?: string | null;
    stance?: TraderStance | null;
    non_holder_action?: NonHolderAction | null;
    holder_action?: HolderAction | null;
    constraints?: BackendDecisionConstraintDto[];
    canonical?: BackendCanonicalDecisionResultDto | null;
  };
  canonical_decision?: BackendCanonicalDecisionResultDto | null;
  technical_snapshot?: BackendTechnicalSnapshotDto | null;
  opportunity: {
    score: number;
    components: ScoreComponentDto[];
    score_semantics?: "HEURISTIC_LONG_SETUP_INDEX";
  };
  risk: {
    score: number;
    label: "LOW" | "MEDIUM" | "HIGH" | "SPECULATIVE";
    components: ScoreComponentDto[];
    score_semantics?: "LEGACY_COMPOSITE_RISK";
  };
  directional_evidence?: {
    direction: EvidenceDirection;
    bullish_score: number;
    bearish_score: number;
    coverage_percent: number;
    components: Array<{
      key: string;
      label: string;
      direction: EvidenceDirection;
      strength: number;
      weight: number;
      explanation: string;
    }>;
    score_semantics?: "HEURISTIC_DIRECTIONAL_EVIDENCE";
  } | null;
  data_reliability?: BackendDataReliabilityDto | null;
  trading_risk?: BackendTradingRiskDto | null;
  price_position: {
    current_price: number | null;
    distance_to_support_percent: number | null;
    distance_to_resistance_percent: number | null;
    above_sma20_percent: number | null;
    above_ema20_percent: number | null;
  };
  trade_plan: {
    entry_zone_low: number | null;
    entry_zone_high: number | null;
    stop_loss: number | null;
    target_low: number | null;
    target_high: number | null;
    risk_reward_ratio: number | null;
    explanation: string;
    status?: "VALID_ENTRY_PLAN" | "WATCH_ONLY" | "UNAVAILABLE";
    reasons?: string[];
  };
  liquidity: {
    label: "STRONG" | "NORMAL" | "THIN" | "ILLIQUID";
    average_volume: number | null;
    latest_volume_ratio: number | null;
    volume_consistency_score: number;
    average_turnover: number | null;
    median_turnover?: number | null;
    turnover_observation_count?: number;
    turnover_provenance?: "REPORTED" | "ESTIMATED" | "MIXED" | "UNKNOWN";
    traded_session_ratio?: number;
    explanation: string;
  };
  eligibility?: BackendEligibilityResultDto;
  warnings: Array<{
    code: string;
    title: string;
    message: string;
    severity: WarningSeverity;
  }>;
  data_freshness: {
    latest_trade_date: string | null;
    ohlcv_row_count: number;
    is_stale: boolean;
    is_sparse: boolean;
    missing_fields: string[];
    data_quality: string;
    source_summary: string;
  };
  support: number | null;
  resistance: number | null;
  trend: string;
  patterns: PatternDetectionDto[];
  primary_pattern: PatternDetectionDto | null;
  breakout: BreakoutAnalysisDto | null;
  ownership: OwnershipInsightDto | null;
  valuation: ValuationInsightDto | null;
  events: EventTimelineItemDto[];
};

export type PatternDetectionDto = {
  name: string;
  confidence: number;
  status: "Forming" | "Active" | "Confirmed" | "Failed";
  breakout_level: number | null;
  target_estimate: number | null;
  invalidation_level: number | null;
  swing_points: Array<{ index: number; date: string; price: number; kind: string }>;
  matched_reasons: string[];
  target_calculation: string;
  direction: string;
  pattern_match_score?: number | null;
  score_semantics?: "HEURISTIC_PATTERN_MATCH";
};

export type BreakoutAnalysisDto = {
  probability: number;
  factors: Array<{ label: string; matched: boolean; explanation: string }>;
  breakout_level: number | null;
  confirmation_level: number | null;
  projected_target: number | null;
  explanation: string;
  direction?: "breakout" | "breakdown";
  evidence_score?: number | null;
  score_semantics?: "HEURISTIC_BREAKOUT_EVIDENCE";
};

export type OwnershipTrendPointDto = {
  snapshot_label: string | null;
  value: number;
};

export type OwnershipTrendDto = {
  segment_key: string;
  label: string;
  points: OwnershipTrendPointDto[];
  coverage_status: "full" | "partial" | "none";
  direction: "accumulation" | "distribution" | "stable" | null;
};

export type OwnershipInsightDto = {
  sponsor_percent: number | null;
  institution_percent: number | null;
  foreign_percent: number | null;
  public_percent: number | null;
  free_float_percent: number | null;
  interpretations: string[];
  snapshot_date: string | null;
  source: string | null;
  trends: OwnershipTrendDto[];
};

export type ValuationInsightDto = {
  close_price: number | null;
  market_cap: number | null;
  pe_ratio: number | null;
  pb_ratio: number | null;
  dividend_yield: number | null;
  earnings_yield: number | null;
  interpretations: string[];
  valuation_date: string | null;
  source: string | null;
};

export type EventTimelineItemDto = {
  event_type: string;
  category: string;
  event_date: string;
  title: string;
  summary: string | null;
  source: string | null;
};

export type FinancialMetricSnapshotDto = {
  metric_code: string;
  label: string;
  value: number | null;
  as_of_date: string | null;
  fiscal_year: number | null;
};

export type FundamentalsSnapshotDto = {
  metrics: FinancialMetricSnapshotDto[];
  latest_fiscal_year: number | null;
  latest_as_of_date: string | null;
};

export type FinancialTrendPointDto = {
  fiscal_year: number;
  value: number;
};

export type FinancialTrendDto = {
  metric_code: string;
  label: string;
  latest_value: number | null;
  points: FinancialTrendPointDto[];
  coverage_status: "full" | "partial" | "none";
  direction: "improving" | "deteriorating" | "flat" | null;
};

export type ValuationMetricContextDto = {
  metric_key: string;
  stock_value: number | null;
  sector_median: number | null;
  relative_label: string | null;
  peer_count: number;
  has_sufficient_peers: boolean;
};

export type ValuationContextDto = {
  pe: ValuationMetricContextDto | null;
  pb: ValuationMetricContextDto | null;
};

export type DividendIntelligenceDto = {
  last_dividend_year: number | null;
  last_dividend_value: string | null;
};

/** Backend-resolved mark-to-market metrics (Rule #1). Format only on the client. */
export type DisplayMetricsDto = {
  current_price: number | null;
  pe_ratio: number | null;
  pb_ratio: number | null;
  earnings_yield: number | null;
  market_cap: number | null;
  marked_to_latest_price: boolean;
  pe_helper: string | null;
  as_of_trade_date: string | null;
};

export type StockWorkspaceDto = {
  stock: BackendStockDto;
  prices: BackendDailyPriceDto[];
  latest_trade_date: string;
  decision_support: StockDecisionSupportDto;
  fundamentals_snapshot: FundamentalsSnapshotDto | null;
  financial_trends: FinancialTrendDto[];
  valuation_context: ValuationContextDto | null;
  dividend_intelligence: DividendIntelligenceDto | null;
  display_metrics?: DisplayMetricsDto | null;
};
