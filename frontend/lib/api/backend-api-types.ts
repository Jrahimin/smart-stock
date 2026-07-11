export type ApiResponse<T> = {
  success: boolean;
  message: string;
  data: T;
};

export type ExchangeCode = "DSE" | "CSE";

export type DataQualityFlag = "OK" | "PARTIAL" | "SUSPICIOUS";

export type MarketSessionStatus = "PRE_OPEN" | "OPEN" | "POST_CLOSE" | "HOLIDAY";

export type BackendMarketFreshnessDto = {
  exchange: ExchangeCode;
  trade_date: string | null;
  last_synced_at: string | null;
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

export type BackendMarketPriceWindowDto = {
  stock: BackendStockDto;
  prices: BackendDailyPriceDto[];
  trader_decision: BackendTraderDecisionSummaryDto | null;
};

export type BackendTraderDecisionSummaryDto = {
  recommendation: TraderRecommendation;
  confidence: number;
  reason: string;
  opportunity_score: number;
  risk_label: "LOW" | "MEDIUM" | "HIGH" | "SPECULATIVE";
};

export type BackendStockTraderDecisionDto = {
  stock: BackendStockDto;
  decision: BackendTraderDecisionSummaryDto;
  latest_trade_date: string | null;
};

export type BackendTechnicalSnapshotDto = {
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

export type BackendScoredUniverseRowDto = {
  stock: BackendStockDto;
  technical_snapshot: BackendTechnicalSnapshotDto;
  decision: BackendTraderDecisionSummaryDto | null;
  session: BackendUniverseSessionDto;
};

export type BackendUniverseRowsMetaDto = {
  exchange: ExchangeCode;
  listed_stock_count: number;
  session_trade_date: string | null;
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
  index_change: string | number;
  index_change_percent: string | number;
  day_open: string | number;
  day_high: string | number;
  day_low: string | number;
  range_52w_low: string | number;
  range_52w_high: string | number;
  range_position_percent: string | number;
  return_1m_percent: string | number | null;
  return_6m_percent: string | number | null;
  return_1y_percent: string | number | null;
  total_volume: number | null;
  total_turnover: string | number | null;
  total_trades: number | null;
  advancing_issues: number;
  declining_issues: number;
  unchanged_issues: number;
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
  gainers: BackendDashboardMoverDto[];
  losers: BackendDashboardMoverDto[];
  turnover_leaders: BackendDashboardMoverDto[];
  volume_leaders: BackendDashboardMoverDto[];
};

export type BackendDashboardOverviewDto = {
  exchange: ExchangeCode;
  session_trade_date: string | null;
  last_synced_at: string | null;
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
  session_trade_date: string | null;
  sectors: BackendDashboardSectorDto[];
  top_gainer: {
    symbol: string;
    name: string;
    change_percent: string | number;
  } | null;
};

export type BackendDashboardTimelineItemDto = {
  time: string;
  title: string;
  description: string;
};

export type BackendDashboardMarketAlertsDto = {
  session_trade_date: string | null;
  items: BackendDashboardTimelineItemDto[];
};

export type BackendDashboardSignalDto = {
  symbol: string;
  exchange: ExchangeCode;
  signal: TraderRecommendation;
  confidence: number;
  reason: string;
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
  change_percent: string | number;
  weight: string | number;
  tone: string;
  latest_price: string | number;
  turnover: string | number;
  turnover_value: string | number;
  liquidity_score: number;
};

export type BackendDashboardHeatmapDto = {
  session_trade_date: string | null;
  tiles: BackendDashboardHeatmapTileDto[];
};

export type BackendDashboardInsightDto = {
  id: string;
  title: string;
  description: string;
  tone: string;
  category: string;
  source: string;
};

export type BackendDashboardMarketSentimentDto = {
  exchange: ExchangeCode;
  session_trade_date: string | null;
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
  buy_price: string | number | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  unrealized_gain_percent: string | number | null;
  has_note: boolean;
  watching_days: number;
  watching_label: string;
  current_price: string | number | null;
  trader_decision: BackendTraderDecisionSummaryDto | null;
  technical_snapshot: BackendTechnicalSnapshotDto | null;
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
};

export type BackendFocusStockDto = {
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
  recommendation: string;
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

export type BackendMarketStoryDto = {
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
};

export type BackendOpportunityScoreDto = {
  score: number;
  label: string;
  history: number[];
  previous_session?: number | null;
  weekly_average?: number | null;
  trend_label?: string | null;
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
};

export type BackendMarketPulsePreviousSnapshotDto = {
  last_synced_at: string | null;
  focus_stock_ids: string[];
  scores: Record<string, number>;
  recommendations: Record<string, string>;
  alert_ids: string[];
};

