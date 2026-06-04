import type {
  ExchangeCode,
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
  };
  opportunity: {
    score: number;
    components: ScoreComponentDto[];
  };
  risk: {
    score: number;
    label: "LOW" | "MEDIUM" | "HIGH" | "SPECULATIVE";
    components: ScoreComponentDto[];
  };
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
  };
  liquidity: {
    label: "STRONG" | "NORMAL" | "THIN" | "ILLIQUID";
    average_volume: number | null;
    latest_volume_ratio: number | null;
    volume_consistency_score: number;
    average_turnover: number | null;
    explanation: string;
  };
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
};

export type BreakoutAnalysisDto = {
  probability: number;
  factors: Array<{ label: string; matched: boolean; explanation: string }>;
  breakout_level: number | null;
  confirmation_level: number | null;
  projected_target: number | null;
  explanation: string;
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
