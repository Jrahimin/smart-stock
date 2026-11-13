export type ApiResponse<T> = {
  success: boolean;
  message: string;
  data: T;
};

export type ExchangeCode = "DSE" | "CSE";

export type DataQualityFlag = "OK" | "PARTIAL" | "SUSPICIOUS";
export type TurnoverProvenance = "REPORTED" | "ESTIMATED" | "MIXED" | "UNKNOWN";
export type EligibilityStatus = "ELIGIBLE" | "LIMITED" | "REVIEW_ONLY" | "INELIGIBLE";
export type DataReliabilityLabel = "HIGH" | "MEDIUM" | "LOW" | "UNRELIABLE";
export type EvidenceDirection = "BULLISH" | "BEARISH" | "NEUTRAL" | "UNKNOWN";
export type DecisionConstraintKind = "BLOCK" | "DOWNGRADE" | "EXIT_AVOID" | "INFORMATIONAL";
export type TraderStance = "BULLISH" | "CONSTRUCTIVE" | "NEUTRAL" | "BEARISH" | "UNAVAILABLE";
export type NonHolderAction = "BUY" | "WAIT" | "AVOID";
export type HolderAction = "HOLD" | "REVIEW" | "SELL" | "REDUCE";
export type OpportunityQuality = "WEAK" | "CONSTRUCTIVE" | "STRONG";
export type EntryReadiness = "NOT_READY" | "CONDITIONAL" | "READY";
export type EntryTiming = "READY" | "PULLBACK" | "BREAKOUT" | "CONTINUATION";
export type TradePlanManagementMode =
  | "STRUCTURAL"
  | "ATR_PROJECTION"
  | "MEASURED_MOVE"
  | "TRAILING";
export type MarketRegimePhase = "EARLY" | "HEALTHY" | "EXTENDED" | "REVERSAL_RISK";

export type MarketSessionStatus = "PRE_OPEN" | "OPEN" | "POST_CLOSE" | "HOLIDAY";
export type MarketDataState = "LIVE" | "FINALIZATION_PENDING" | "FINALIZED" | "STALE";

export type BackendMarketFreshnessDto = {
  exchange: ExchangeCode;
  trade_date: string | null;
  last_synced_at: string | null;
  decision_generation_id?: string | null;
  decision_status?: "CURRENT" | "UPDATING" | "UNAVAILABLE";
  quote_generation_id?: string | null;
  market_sync_id?: string | null;
  data_state?: MarketDataState;
  decision_session_date?: string | null;
  live_data_as_of?: string | null;
  is_live_session?: boolean;
  next_sync_at: string | null;
  snapshot_interval_minutes: number;
  market_sync_interval_seconds: number;
  dashboard_cache_ttl_seconds: number;
  expected_delay_minutes: number;
  market_open_time: string;
  market_close_time: string;
  market_status: MarketSessionStatus;
  freshness_label: string;
};

export type SignalType = "BUY" | "SELL" | "HOLD";

export type TraderRecommendation = "BUY" | "HOLD" | "WAIT" | "SELL";
export type DecisionDisplayAction = "POTENTIAL_BUY" | "HOLD" | "WAIT" | "SELL";

export type WarningSeverity = "INFO" | "WARNING" | "CRITICAL";

export type IndicatorType = "RSI" | "SMA" | "EMA";

export type BackendStockDto = {
  symbol: string;
  name: string;
  exchange: ExchangeCode;
  sector: string | null;
  category: string | null;
  isin: string | null;
  listing_date: string | null;
  lot_size: number | null;
  paid_up_capital: string | number | null;
  market_cap: string | number | null;
  is_active: boolean;
  should_fetch_details?: boolean;
  id: string;
  created_at: string;
  updated_at: string;
};

export type BackendStockSearchResultDto = BackendStockDto & {
  latest_price: string | number | null;
  latest_trade_date: string | null;
  data_quality_flag: DataQualityFlag | null;
};

export type BackendDailyPriceDto = {
  stock_id: string;
  trade_date: string;
  open_price: string | number;
  high_price: string | number;
  low_price: string | number;
  close_price: string | number;
  adjusted_close_price: string | number | null;
  previous_close_price: string | number | null;
  price_change: string | number | null;
  price_change_percent: string | number | null;
  day_range: string | number | null;
  day_range_percent: string | number | null;
  vwap: string | number | null;
  volume: number;
  trade_count: number | null;
  turnover: string | number | null;
  turnover_provenance?: TurnoverProvenance;
  source: string;
  data_quality_flag: DataQualityFlag;
  id: string;
  created_at: string;
  updated_at: string;
};

export type BackendLatestMarketPriceDto = {
  stock: BackendStockDto;
  price: BackendDailyPriceDto;
};

export type BackendTraderDecisionSummaryDto = {
  measured_support_component?: import("./stock-decision-support-types").ScoreComponentDto | null;
  opposing_constraint_code?: string | null;
  opposing_component?: import("./stock-decision-support-types").ScoreComponentDto | null;
  entry_applicability?: import("./stock-decision-support-types").EntryApplicabilityDto | null;
  measured_support?: string | null;
  opposing_constraint?: string | null;
  recommendation: TraderRecommendation;
  internal_action?: TraderRecommendation | null;
  display_action?: DecisionDisplayAction;
  decision_taxonomy_version?: string;
  confidence: number;
  reason: string;
  opportunity_score: number;
  risk_label: "LOW" | "MEDIUM" | "HIGH" | "SPECULATIVE";
  confidence_semantics?: "HEURISTIC_EVIDENCE";
  evidence_status?: "UNAVAILABLE" | "MIXED" | "BULLISH" | "BEARISH";
  evidence_strength?: number | null;
  evidence_strength_semantics?: "HEURISTIC_DIRECTIONAL_EVIDENCE";
  primary_reason?: string | null;
  primary_reason_code?: string | null;
  stance?: TraderStance | null;
  non_holder_action?: NonHolderAction | null;
  holder_action?: HolderAction | null;
  data_reliability?: BackendDataReliabilityDto | null;
  trading_risk?: BackendTradingRiskDto | null;
  constraints?: BackendDecisionConstraintDto[];
  opportunity_quality?: OpportunityQuality | null;
  entry_readiness?: EntryReadiness;
  entry_timing?: EntryTiming | null;
  entry_condition?: string | null;
  blocker_codes?: string[];
  canonical?: BackendCanonicalDecisionResultDto | null;
};

export type BackendCanonicalDecisionResultDto = {
  stock_id: string;
  exchange: ExchangeCode;
  strategy_version: string;
  threshold_version: string;
  action_taxonomy: string;
  decision_taxonomy_version?: string;
  as_of_date: string;
  previous_session_date: string | null;
  calculated_at: string;
  shared_decision_id: string;
  input_schema_version?: string;
  data_revision?: string;
  event_revision?: string;
  input_hash?: string;
  replay_status?: string;
  replay_limitations?: string[];
  result_semantics: Record<string, string>;
  recommendation: TraderRecommendation;
  internal_action?: TraderRecommendation | null;
  display_action?: DecisionDisplayAction;
  evidence_strength: number;
  opportunity_score: number;
  opportunity_quality?: OpportunityQuality | null;
  entry_readiness?: EntryReadiness;
  entry_timing?: EntryTiming | null;
  entry_condition?: string | null;
  blocker_codes?: string[];
  risk_label: "LOW" | "MEDIUM" | "HIGH" | "SPECULATIVE";
  trade_plan_status: "VALID_ENTRY_PLAN" | "WATCH_ONLY" | "UNAVAILABLE";
  eligibility_status: EligibilityStatus;
  primary_reason: string;
  primary_reason_code: string;
  stance: TraderStance;
  non_holder_action: NonHolderAction;
  holder_action: HolderAction;
  regime_score?: number;
  regime_label?: string;
  regime_phase?: MarketRegimePhase;
  regime_confidence?: number;
};

export type BackendDecisionConstraintDto = {
  code: string;
  title: string;
  kind: DecisionConstraintKind;
  reason: string;
  is_critical: boolean;
};

export type BackendDataReliabilityDto = {
  score: number;
  label: DataReliabilityLabel;
  reason_codes: string[];
  explanation: string;
  score_semantics?: "DETERMINISTIC_INPUT_RELIABILITY";
};

export type BackendTradingRiskDto = {
  score: number;
  label: "LOW" | "MEDIUM" | "HIGH" | "SPECULATIVE";
  components: Array<{
    key: string;
    label: string;
    score: number;
    weight: number;
    explanation: string;
  }>;
  score_semantics?: "HEURISTIC_TRADING_RISK";
};

export type BackendStockTraderDecisionDto = {
  shortlist?: BackendShortlistDto | null;
  stock: BackendStockDto;
  decision: BackendTraderDecisionSummaryDto;
  latest_trade_date: string | null;
};

export type BackendTechnicalSnapshotDto = {
  price_change_percent_ratio?: { numerator: string; denominator: string } | null;
  latest_price: number | null;
  previous_close: number | null;
  price_change: number | null;
  price_change_percent: number | null;
  volume: number;
  average_volume: number | null;
  turnover: number | null;
  rsi: number | null;
  sma20: number | null;
  ema20: number | null;
  volatility: number | null;
  support: number | null;
  resistance: number | null;
  trend: string;
  data_quality: DataQualityFlag;
  latest_trade_date: string | null;
  ohlcv_row_count: number;
  sma50?: number | null;
  atr14?: number | null;
  average_turnover?: number | null;
  return_5d_percent?: number | null;
  return_20d_percent?: number | null;
  is_breakout?: boolean;
  structure?: string;
  gap_frequency_percent?: number | null;
  invalid_ohlcv_row_count?: number;
  latest_row_valid?: boolean;
  traded_session_count?: number;
  zero_volume_session_count?: number;
  traded_session_ratio?: number;
  volume_observation_count?: number;
  median_turnover?: number | null;
  turnover_observation_count?: number;
  turnover_provenance?: TurnoverProvenance;
  analytical_price_basis?: string;
  adjusted_close_coverage_ratio?: number;
  volume_behavior?: "EXPANSION" | "NORMAL" | "THIN" | "UNKNOWN";
};

export type BackendEligibilityResultDto = {
  status: EligibilityStatus;
  reason_codes: string[];
  exchange_session_date: string | null;
  latest_trade_date: string | null;
  missed_session_count: number | null;
  valid_ohlcv_row_count: number;
  invalid_ohlcv_row_count: number;
  traded_session_count: number;
  zero_volume_session_count: number;
  traded_session_ratio: number;
  quality_ok_count: number;
  quality_partial_count: number;
  quality_suspicious_count: number;
  median_turnover: number | null;
  turnover_observation_count: number;
  turnover_provenance: TurnoverProvenance;
  analytical_price_basis: string;
  corporate_action_status: string;
};

export type BackendUniverseSessionDto = {
  latest_trade_date: string;
  close_price: string | number;
  open_price: string | number | null;
  volume: number;
  turnover: string | number | null;
  change_percent: string | number | null;
  data_quality_flag: DataQualityFlag;
  updated_at: string | null;
};

export type BackendScannerConditionId =
  | "PRICE_VOLUME_BREAKOUT"
  | "SUPPORT_REBOUND"
  | "MOMENTUM_CONTINUATION"
  | "BREAKDOWN"
  | "HIGH_RISK_WATCH"
  | "LOW_VOLATILITY_COMPRESSION";

export type BackendScannerConditionMatchDto = {
  condition_id: BackendScannerConditionId;
  reason_code: string;
  reason: string;
  rank_score: number;
  capacity_score: number;
  rank: number;
};

export type BackendScannerResultDto = {
  version: string;
  matches: BackendScannerConditionMatchDto[];
};

export type BackendShortlistDto = { version: string; entry_rank: number; holder_exit_rank: number; risk_rank: number; volume_rank: number };

export type BackendDisplayQuoteDto = NonNullable<BackendScoredUniverseRowDto["display_quote"]> & { previous_close?: number | null };

export type BackendScoredUniverseRowDto = {
  measured_facts?: import("./stock-decision-support-types").MeasuredDecisionFactsDto | null;
  public_comparison?: BackendPublicDecisionComparisonDto | null;
  analysis?: { liquidity?: { latest_volume_ratio?: number | null } } | null;
  entry_applicability?: import("./stock-decision-support-types").EntryApplicabilityDto | null;
  display_quote?: { volume?: number | null; session_date_verified?: boolean | null; current_price: number | null; price_change?: number | null; price_change_percent?: number | null; as_of_trade_date?: string | null; observation_session_date?: string | null; observation_status: string; source_observed_at?: string | null; batch_fetched_at?: string | null; max_age_seconds?: number; data_quality?: string | null; source?: string | null; ingested_at?: string | null } | null;
  shortlist?: BackendShortlistDto | null;
  previous_finalized_decision?: BackendCanonicalDecisionResultDto | null;
  stock: BackendStockDto;
  technical_snapshot: BackendTechnicalSnapshotDto;
  decision: BackendTraderDecisionSummaryDto | null;
  eligibility?: BackendEligibilityResultDto | null;
  scanner?: BackendScannerResultDto | null;
  session: BackendUniverseSessionDto;
};

export type BackendPublicDecisionComparisonDto = { status: "CHANGED" | "UNCHANGED" | "UNCOMPARABLE"; previous_action?: DecisionDisplayAction | null; current_action?: DecisionDisplayAction | null; previous_session_date?: string | null };

export type BackendUniverseRowsMetaDto = {
  decision_generation_id?: string | null;
  quote_generation_id?: string | null;
  decision_status?: "CURRENT" | "UPDATING" | "UNAVAILABLE";
  exchange: ExchangeCode;
  listed_stock_count: number;
  session_trade_date: string | null;
  decision_session_date?: string | null;
  live_data_as_of?: string | null;
  is_live_session?: boolean;
  strategy_version?: string;
  threshold_version?: string;
  scanner_version?: string;
  decision_taxonomy_version?: string;
};

export type BackendUniverseRowsDto = {
  meta: BackendUniverseRowsMetaDto;
  rows: BackendScoredUniverseRowDto[];
};

export type BackendDsexIndexSnapshotDto = {
  index_name: string;
  trade_date: string;
  market_status: string;
  index_close: string | number;
  index_change: string | number | null;
  index_change_percent: string | number | null;
  day_open: string | number | null;
  day_high: string | number | null;
  day_low: string | number | null;
  range_52w_low: string | number;
  range_52w_high: string | number;
  range_position_percent: string | number;
  return_1m_percent: string | number | null;
  return_6m_percent: string | number | null;
  return_1y_percent: string | number | null;
  total_volume: number | null;
  total_turnover: string | number | null;
  total_trades: number | null;
  advancing_issues: number | null;
  declining_issues: number | null;
  unchanged_issues: number | null;
  source: string;
};

export type BackendDailyMarketSummaryDto = {
  exchange: ExchangeCode;
  trade_date: string;
  index_name: string;
  index_close: string | number | null;
  index_change: string | number | null;
  index_change_percent: string | number | null;
  total_volume: number | null;
  total_turnover: string | number | null;
  total_trades: number | null;
  advancing_issues: number | null;
  declining_issues: number | null;
  unchanged_issues: number | null;
  market_cap: string | number | null;
  source: string;
  has_suspicious_prices?: boolean;
  data_quality_flag: DataQualityFlag;
  id: string;
  created_at: string;
  updated_at: string;
};

export type BackendDashboardMoverDto = {
  stock_id: string;
  symbol: string;
  name: string;
  exchange: ExchangeCode;
  latest_price: string | number;
  price_change_percent: string | number | null;
  turnover: string | number | null;
  volume: number;
  trend_direction: string;
};

export type BackendDashboardMoversDto = {
  session_trade_date: string | null;
  decision_generation_id?: string | null;
  decision_status?: "CURRENT" | "UPDATING" | "UNAVAILABLE";
  quote_generation_id?: string | null;
  market_sync_id?: string | null;
  gainers: BackendDashboardMoverDto[];
  losers: BackendDashboardMoverDto[];
  turnover_leaders: BackendDashboardMoverDto[];
  volume_leaders: BackendDashboardMoverDto[];
};

export type BackendBreadthDto = {
  cohort: string; source: string; as_of_date: string | null; neutral_band_percent: number;
  advancing: number; declining: number; unchanged: number; known_count: number; unknown_count: number; cohort_count: number; denominator: number;
};

export type BackendDashboardOverviewDto = {
  index_snapshot_version?: number;
  breadth?: BackendBreadthDto | null;
  exchange: ExchangeCode;
  session_trade_date: string | null;
  last_synced_at: string | null;
  decision_generation_id?: string | null;
  decision_status?: "CURRENT" | "UPDATING" | "UNAVAILABLE";
  quote_generation_id?: string | null;
  market_sync_id?: string | null;
  listed_stock_count: number;
  dsex_index: BackendDsexIndexSnapshotDto;
  summaries: BackendDailyMarketSummaryDto[];
};

export type BackendDashboardSectorDto = {
  name: string;
  change_percent: string | number;
  stock_count: number;
};

export type BackendDashboardSectorsDto = {
  leadership_status?: "MEASURED" | "NO_ADVANCING_SECTOR" | "UNAVAILABLE";
  excluded_sector_count?: number;
  session_trade_date: string | null;
  decision_generation_id?: string | null;
  decision_status?: "CURRENT" | "UPDATING" | "UNAVAILABLE";
  quote_generation_id?: string | null;
  market_sync_id?: string | null;
  sectors: BackendDashboardSectorDto[];
  top_gainer: {
    symbol: string;
    name: string;
    change_percent: string | number;
  } | null;
};

export type BackendDashboardTimelineItemDto = {
  source_url?: string | null;
  time: string;
  title: string;
  description: string;
};

export type BackendDashboardMarketAlertsDto = {
  session_trade_date: string | null;
  decision_generation_id?: string | null;
  decision_status?: "CURRENT" | "UPDATING" | "UNAVAILABLE";
  quote_generation_id?: string | null;
  market_sync_id?: string | null;
  items: BackendDashboardTimelineItemDto[];
};

export type BackendDashboardSignalDto = {
  symbol: string;
  exchange: ExchangeCode;
  signal: DecisionDisplayAction;
  confidence: number;
  confidence_semantics?: "HEURISTIC_EVIDENCE";
  reason: string;
  primary_reason_code?: string | null;
  entry_condition?: string | null;
  risk: string;
  priority: string;
  supporting_context: string[];
  generated_at: string;
};

export type BackendDashboardStocksInFocusDto = {
  session_trade_date: string | null;
  evaluated_count: number;
  signals: BackendDashboardSignalDto[];
};

export type BackendDashboardHeatmapTileDto = {
  stock_id: string;
  symbol: string;
  sector: string;
  trade_date?: string | null;
  change_percent: string | number | null;
  weight: string | number;
  tone: string;
  latest_price: string | number | null;
  turnover: string | number | null;
  turnover_value: string | number;
  liquidity_score: number;
};

export type BackendDashboardHeatmapDto = {
  session_trade_date: string | null;
  decision_generation_id?: string | null;
  decision_status?: "CURRENT" | "UPDATING" | "UNAVAILABLE";
  quote_generation_id?: string | null;
  market_sync_id?: string | null;
  tiles: BackendDashboardHeatmapTileDto[];
  sectors?: BackendDashboardHeatmapSectorDto[];
};

export type BackendDashboardHeatmapSectorDto = {
  name: string;
  change_percent: string | number | null;
  measured_count: number;
  total_count: number;
  weighting: "TURNOVER" | "EQUAL" | "UNAVAILABLE";
};

export type BackendDashboardInsightDto = {
  id: string;
  title: string;
  description: string;
  tone: string;
  category: string;
  source: string;
};

export type BackendMarketInterpretationDto = {
  code: "ALIGNED_UP" | "ALIGNED_DOWN" | "DIVERGENT" | "MIXED" | "INDEX_ONLY" | "BREADTH_ONLY" | "UNAVAILABLE";
  as_of_date: string | null; index_change_percent: string | null; breadth: BackendBreadthDto;
  volume_vs_average: string | null; volume_average_sessions: number;
};

export type BackendDashboardMarketSentimentDto = {
  interpretation?: BackendMarketInterpretationDto | null;
  exchange: ExchangeCode;
  session_trade_date: string | null;
  decision_generation_id?: string | null;
  decision_status?: "CURRENT" | "UPDATING" | "UNAVAILABLE";
  quote_generation_id?: string | null;
  market_sync_id?: string | null;
  market_mood: string;
  signal_count: number;
  price_backed_count: number;
  turnover_value: string | number | null;
  has_partial_data: boolean;
  insights: BackendDashboardInsightDto[];
};

export type BackendTechnicalIndicatorDto = {
  stock_id: string;
  trade_date: string;
  indicator_type: IndicatorType;
  period: number;
  value: string | number;
  normalized_value: string | number | null;
  signal_score: string | number | null;
  metadata?: Record<string, unknown>;
  id: string;
  created_at: string;
  updated_at: string;
};

export type BackendTradingSignalDto = {
  stock_id: string;
  trade_date: string;
  signal_type: SignalType;
  confidence: string | number;
  momentum_score: string | number | null;
  trend_score: string | number | null;
  volume_score: string | number | null;
  risk_score: string | number | null;
  reason: string;
  strategy_name: string;
  strategy_version?: string | null;
  threshold_version?: string | null;
  action_taxonomy?: string | null;
  canonical_recommendation?: TraderRecommendation | null;
  signal_as_of?: string | null;
  calculated_at?: string | null;
  shared_decision_id?: string | null;
  components: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  is_active: boolean;
  id: string;
  created_at: string;
  updated_at: string;
};

export type MarketOverview = {
  totalStocks: number;
  advancingStocks: number;
  decliningStocks: number;
  neutralStocks: number;
};

export type WatchlistStock = {
  symbol: string;
  name: string;
  exchange: ExchangeCode;
  price: string;
  changePercent: string;
  signal: SignalType;
};

export type BackendUserWatchlistDto = {
  id: string;
  user_id: string;
  stock_id: string;
  stock_symbol: string;
  is_holding: boolean;
  quantity: string | number | null;
  buy_price: string | number | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  unrealized_gain_percent: string | number | null;
  has_note: boolean;
  watching_days: number;
  watching_label: string;
  current_price: string | number | null;
  display_quote?: BackendDisplayQuoteDto | null;
  trader_decision: BackendTraderDecisionSummaryDto | null;
  technical_snapshot: BackendTechnicalSnapshotDto | null;
  decision_source?: "CANONICAL_UNIVERSE" | "UNAVAILABLE";
  contextual_action?: DecisionDisplayAction | null;
};

export type PortfolioPriceStatus =
  | "FINALIZED"
  | "PROVISIONAL"
  | "NON_TRADED"
  | "STALE_LAST_KNOWN"
  | "SUSPENDED"
  | "SUSPICIOUS"
  | "UNAVAILABLE";

export type PortfolioWhatNextCode =
  | "REVIEW_HOLDER_GUIDANCE"
  | "DATA_INCOMPLETE"
  | "PRICE_STALE_OR_SUSPENDED"
  | "REVIEW_SUPPORT_BREAK"
  | "REVIEW_SELL_OR_REDUCE"
  | "REVIEW_ELEVATED_RISK"
  | "DO_NOT_AVERAGE_DOWN_FOR_COST_ONLY"
  | "WATCH_RESISTANCE"
  | "PROFITABLE_TREND_INTACT"
  | "NO_ACTION_NEEDED";

export type PortfolioAttentionCode =
  | "HOLDER_REVIEW"
  | "SUPPORT_BREAK"
  | "SELL_OR_REDUCE"
  | "PRICE_QUALITY"
  | "ELEVATED_RISK"
  | "INCOMPLETE_HOLDING"
  | "HIGH_CONCENTRATION"
  | "WATCH_RESISTANCE"
  | "UNUSUAL_VOLUME"
  | "IMPORTANT_EVENT";

export type BackendPortfolioEventDto = {
  event_type: string;
  event_date: string;
  title: string;
  summary: string | null;
};

export type BackendHolderDecisionComparisonDto = Omit<BackendPublicDecisionComparisonDto, "previous_action" | "current_action"> & { previous_action?: HolderAction | null; current_action?: HolderAction | null };

export type BackendPortfolioHoldingDto = {
  watchlist_item_id: string;
  stock_id: string;
  is_holding: boolean;
  symbol: string;
  name: string;
  exchange: ExchangeCode;
  sector: string | null;
  quantity: string | null;
  average_buy_price: string | null;
  note: string | null;
  current_price: string | null;
  previous_close: string | null;
  price_change: string | null;
  price_change_percent: string | null;
  price_status: PortfolioPriceStatus;
  latest_trade_date: string | null;
  display_quote?: BackendDisplayQuoteDto | null;
  decision_session_date?: string | null;
  decision_taxonomy_version?: string | null;
  primary_reason_code?: string | null;
  public_comparison?: BackendPublicDecisionComparisonDto | null;
  holder_comparison?: BackendHolderDecisionComparisonDto | null;
  invested_amount: string | null;
  current_value: string | null;
  unrealized_gain_amount: string | null;
  unrealized_gain_percent: string | null;
  portfolio_weight: string | null;
  estimated_daily_change_amount: string | null;
  estimated_daily_contribution_percent: string | null;
  action: DecisionDisplayAction | null;
  holder_action: HolderAction | null;
  trend: string;
  risk: "LOW" | "MEDIUM" | "HIGH" | "SPECULATIVE" | null;
  rsi: string | null;
  support: string | null;
  resistance: string | null;
  scanner_conditions: string[];
  relevant_event: BackendPortfolioEventDto | null;
  decision_reason: string | null;
  what_next_code: PortfolioWhatNextCode;
  requires_attention: boolean;
};

export type BackendPortfolioWorkspaceDto = {
  meta: {
    quote_generation_id?: string | null;
    decision_generation_id?: string | null;
    exchange: ExchangeCode;
    market_sync_id: string | null;
    decision_session_date?: string | null;
    decision_status?: string;
    published_market_date: string | null;
    live_data_as_of: string | null;
    data_state: MarketDataState;
    is_provisional: boolean;
    total_watchlisted: number;
    holding_count: number;
    valued_holding_count: number;
    costed_holding_count: number;
  };
  pulse: {
    known_current_value: string;
    current_value_is_complete: boolean;
    known_invested_amount: string;
    invested_amount_is_complete: boolean;
    known_unrealized_gain_amount: string;
    known_unrealized_gain_percent: string | null;
    unrealized_gain_is_complete: boolean;
    estimated_daily_change_amount: string;
    estimated_daily_change_percent: string | null;
    daily_change_is_complete: boolean;
    holding_count: number;
    valued_holding_count: number;
  };
  attention: Array<{
    code: PortfolioAttentionCode;
    severity: "HIGH" | "MEDIUM" | "LOW" | "INFO";
    stock_ids: string[];
    symbols: string[];
    count: number;
  }>;
  holder_review_attention?: BackendPortfolioWorkspaceDto["attention"][number] | null;
  holdings: BackendPortfolioHoldingDto[];
  watchlist_items: BackendPortfolioHoldingDto[];
  shape: {
    position_exposure: Array<{ label: string; current_value: string; weight_percent: string }>;
    sector_exposure: Array<{ label: string; current_value: string; weight_percent: string }>;
    action_groups: Array<{ action: DecisionDisplayAction; count: number; current_value: string }>;
    holder_action_groups?: Array<{ holder_action: HolderAction | null; count: number; current_value: string }>;
    largest_holding: BackendPortfolioPositionReferenceDto | null;
    strongest_position: BackendPortfolioPositionReferenceDto | null;
    weakest_position: BackendPortfolioPositionReferenceDto | null;
    best_daily_contributor: BackendPortfolioPositionReferenceDto | null;
    worst_daily_contributor: BackendPortfolioPositionReferenceDto | null;
  };
  watchlist_to_review: BackendPortfolioWatchlistSuggestionDto[];
};

export type BackendPortfolioPositionReferenceDto = {
  stock_id: string;
  symbol: string;
  name: string;
  amount: string | null;
  percent: string | null;
};

export type BackendPortfolioWatchlistSuggestionDto = {
  price_status?: PortfolioPriceStatus | null;
  stock_id: string;
  symbol: string;
  name: string;
  exchange: ExchangeCode;
  sector: string | null;
  current_price: string | null;
  price_change_percent: string | null;
  display_quote?: BackendScoredUniverseRowDto["display_quote"];
  action: DecisionDisplayAction;
  trend: string;
  risk: "LOW" | "MEDIUM" | "HIGH" | "SPECULATIVE" | null;
  reason_code: string;
  scanner_condition: string | null;
  relevant_event: BackendPortfolioEventDto | null;
};

export type BackendUserWatchlistSummaryDto = {
  total_watchlisted: number;
  total_holdings: number;
};

export type BackendUserWatchlistToggleResultDto = {
  added: boolean;
  is_watchlisted: boolean;
  item: BackendUserWatchlistDto | null;
};

export type TradingSignalSummary = {
  symbol: string;
  signal: SignalType;
  confidence: string;
  reason: string;
};

export type PulseFocusLabel =
  | "Potential Buy Setup"
  | "New BUY Setup"
  | "Momentum Building"
  | "Volume Breakout"
  | "Watch Closely"
  | "Signal Upgrade";

export type PulseScoreBand = "High Attention" | "Worth Watching" | "Monitor";

export type MarketAlertType =
  | "unusual-volume"
  | "momentum-reversal"
  | "liquidity-surge"
  | "sector-rotation"
  | "pulse-score-jump";

export type BackendPulseScoreBreakdownDto = {
  trend: number;
  momentum: number;
  volume: number;
  signal_boost: number;
  risk_penalty: number;
  total: number;
  contributors: string[];
  band: PulseScoreBand;
  score_version?: string;
};

export type BackendFocusStockDto = {
  measured_facts?: import("./stock-decision-support-types").MeasuredDecisionFactsDto | null;
  entry_applicability?: import("./stock-decision-support-types").EntryApplicabilityDto | null;
  display_quote?: BackendScoredUniverseRowDto["display_quote"];
  decision_taxonomy_version?: string | null;
  public_comparison?: BackendPublicDecisionComparisonDto | null;
  entry_risk_label?: string | null;
  entry_readiness?: string;
  controlling_reason_code?: string | null;
  controlling_reason?: string | null;
  decision_session_date?: string | null;
  watch_level?: number | null;
  actionable_trigger?: boolean;
  rank: number;
  stock_id: string;
  symbol: string;
  name: string;
  exchange: ExchangeCode;
  pulse_score: number;
  score_breakdown: BackendPulseScoreBreakdownDto;
  focus_label: PulseFocusLabel;
  label_tone: string;
  why_here: string[];
  trigger: string;
  action_summary: string;
  latest_price: string;
  price_change_percent: string;
  price_tone: string;
  sparkline_points: number[];
  recommendation: DecisionDisplayAction;
};

export type BackendMarketPulseHeroDto = {
  greeting: string;
  attention_headline: string;
  attention_subline: string;
  last_updated_label: string | null;
  relative_updated_label: string | null;
  session_label: string | null;
  focus_count: number;
  recent_focus_count: number;
};

export type BackendSinceLastVisitDto = {
  visible: boolean;
  new_changes_count: number;
  new_focus_count: number;
  new_alerts_count: number;
  summary_label: string;
};

export type BackendTodayInsightDto = {
  title: string;
  explanation: string;
  supporting_fact: string;
  tone: string;
};

export type BackendPulseChangeDto = {
  id: string;
  time_label: string;
  change_type: string;
  title: string;
  description: string;
  badge: string;
  badge_tone: string;
  symbol: string | null;
  exchange: ExchangeCode | null;
};

export type BackendMarketAlertDto = {
  id: string;
  alert_type: MarketAlertType;
  event_title: string;
  event_explanation: string;
  why_it_matters: string;
  metric_label: string;
  significance: string;
  time_label: string | null;
  symbol: string | null;
  exchange: ExchangeCode | null;
  latest_price: string | null;
  price_change_percent: string | null;
  price_tone: string | null;
};

export type BackendMarketMoverDto = {
  symbol: string;
  name: string;
  exchange: ExchangeCode;
  latest_price: string;
  price_change_percent: string;
  price_tone: string;
  turnover: string | null;
};

export type BackendMarketMoversDto = {
  gainers: BackendMarketMoverDto[];
  losers: BackendMarketMoverDto[];
};

export type BackendMarketStoryMetricDto = {
  label: string;
  value: string;
  sub_value: string | null;
  tone: string;
};

export type PulseStoryHeadlineCode = "STRENGTH_SECTORS" | "STRENGTH_STOCKS" | "WEAKNESS_SECTORS" | "WEAKNESS_STOCKS" | "MIXED_SECTORS" | "NO_POSITIVE_SECTOR" | "SECTOR_UNAVAILABLE" | "BREADTH_UNAVAILABLE";

export type BackendMarketStoryDto = {
  headline_code?: PulseStoryHeadlineCode | null;
  sector_count?: number | null;
  headline: string;
  explanation: string;
  tone: string;
  metrics: BackendMarketStoryMetricDto[];
};

export type BackendMarketStateDimensionDto = {
  key: string;
  label: string;
  value: string;
  tone: string;
};

export type BackendMarketStateDto = {
  excluded_sector_count?: number;
  dimensions: BackendMarketStateDimensionDto[];
  overall_label: string;
  overall_tone: string;
};

export type BackendMoneyFlowSectorDto = {
  sector: string;
  change_label: string;
  strength: number;
  tone: string;
};

export type BackendMoneyFlowDto = {
  inflows: BackendMoneyFlowSectorDto[];
  outflows: BackendMoneyFlowSectorDto[];
  semantics?: "SECTOR_PRICE_CHANGE";
};

export type BackendOpportunityScoreDto = {
  score: number;
  label: string;
  history: number[];
  previous_session?: number | null;
  weekly_average?: number | null;
  trend_label?: string | null;
  semantics?: "PULSE_ATTENTION_SCORE";
};

export type BackendPulseCoverageDto = {
  quote_session_date?: string | null;
  market_status?: MarketSessionStatus | null;
  breadth?: BackendBreadthDto | null;
  quote_generation_id?: string | null;
  decision_session_date?: string | null;
  decision_generation_id?: string | null;
  decision_status?: string;
  score_version: string;
  decision_taxonomy_version: string;
  session_trade_date: string | null;
  universe_candidate_count: number;
  eligible_candidate_count: number;
  excluded_candidate_count: number;
};

export type BackendPlaybookItemDto = {
  profile: string;
  summary: string;
  guidance?: string;
  tone: string;
};

export type BackendPlaybookDto = {
  question: string;
  items: BackendPlaybookItemDto[];
};

export type BackendHighPriorityDto = {
  symbol: string;
  name: string;
  exchange: ExchangeCode;
  reason: string;
  trigger_level: string;
  metric_label: string;
  latest_price: string;
  price_change_percent: string;
  price_tone: string;
  sparkline_points: number[];
};

export type BackendLeadershipCardDto = {
  kind: string;
  title: string;
  name: string;
  detail: string | null;
  subtitle: string | null;
  tone: string;
  href: string | null;
  sparkline_points: number[];
};

export type BackendMarketLeadershipDto = {
  cards: BackendLeadershipCardDto[];
  fresh_buy_signals: string[];
  narrative: string;
  fresh_new_count: number;
  fresh_upgraded_count: number;
};

export type BackendMarketSummaryHighlightDto = {
  label: string;
  value: string;
  tone: string;
};

export type BackendTradingEnvironmentSignalDto = {
  text: string;
  tone: string;
};

export type BackendTradingEnvironmentDto = {
  signals: BackendTradingEnvironmentSignalDto[];
  overall_label: string;
  overall_tone: string;
};

export type BackendMarketSummaryDto = {
  text: string;
  tone: string;
  highlights: BackendMarketSummaryHighlightDto[];
  trading_environment: BackendTradingEnvironmentDto | null;
};

export type BackendMarketBriefingDto = {
  breadth?: BackendBreadthDto | null;
  decision_generation_id?: string | null;
  market_sync_id?: string | null;
  decision_status?: string;
  story: BackendMarketStoryDto;
  state: BackendMarketStateDto;
  money_flow: BackendMoneyFlowDto;
  opportunity_score: BackendOpportunityScoreDto;
  playbook: BackendPlaybookDto;
  high_priority: BackendHighPriorityDto | null;
  leadership: BackendMarketLeadershipDto;
  summary: BackendMarketSummaryDto;
};

export type BackendMarketPulseDto = {
  hero: BackendMarketPulseHeroDto;
  since_last_visit: BackendSinceLastVisitDto;
  briefing: BackendMarketBriefingDto | null;
  focus_stocks: BackendFocusStockDto[];
  monitor_candidates: BackendFocusStockDto[];
  today_insight: BackendTodayInsightDto | null;
  changes: BackendPulseChangeDto[];
  alerts: BackendMarketAlertDto[];
  market_movers?: BackendMarketMoversDto;
  empty_state: string;
  empty_message: string | null;
  data_quality_note: string | null;
  coverage?: BackendPulseCoverageDto | null;
  last_synced_at?: string | null;
  decision_generation_id?: string | null;
  decision_status?: "CURRENT" | "UPDATING" | "UNAVAILABLE";
  quote_generation_id?: string | null;
  market_sync_id?: string | null;
  data_state?: MarketDataState;
};

export type BackendMarketPulsePreviousSnapshotDto = {
  last_synced_at: string | null;
  score_version?: string | null;
  decision_taxonomy_version?: string | null;
  focus_stock_ids: string[];
  scores: Record<string, number>;
  recommendations: Record<string, string>;
  alert_ids: string[];
};

