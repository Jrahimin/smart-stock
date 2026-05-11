export type ApiResponse<T> = {
  success: boolean;
  message: string;
  data: T;
};

export type ExchangeCode = "DSE" | "CSE";

export type DataQualityFlag = "OK" | "PARTIAL" | "SUSPICIOUS";

export type SignalType = "BUY" | "SELL" | "HOLD";

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

export type TradingSignalSummary = {
  symbol: string;
  signal: SignalType;
  confidence: string;
  reason: string;
};

