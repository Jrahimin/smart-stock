import type { BackendDailyPriceDto, BackendStockDto, BackendTradingSignalDto } from "@/lib/api/backend-api-types";
import { toNumber } from "@/lib/formatters/financial-formatters";
import type {
  ChartCandleModel,
  MarketBreadthStats,
  MarketCondition,
  PersistedSignalContext,
  SignalScoreContext,
  StockIntelligenceModel,
  VolumeBarModel,
} from "@/lib/market/market-intelligence-types";

function sortPricesAscending(prices: BackendDailyPriceDto[]) {
  return [...prices].sort((a, b) => a.trade_date.localeCompare(b.trade_date));
}

function isTradableOhlc(price: BackendDailyPriceDto) {
  const open = toNumber(price.open_price);
  const high = toNumber(price.high_price);
  const low = toNumber(price.low_price);
  const close = toNumber(price.close_price);

  return (
    open !== null &&
    high !== null &&
    low !== null &&
    close !== null &&
    open > 0 &&
    high > 0 &&
    low > 0 &&
    close > 0 &&
    high >= Math.max(open, low, close) &&
    low <= Math.min(open, high, close)
  );
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildCandles(prices: BackendDailyPriceDto[]): ChartCandleModel[] {
  return sortPricesAscending(prices).flatMap((price) => {
    if (!isTradableOhlc(price)) {
      return [];
    }

    const open = toNumber(price.open_price);
    const high = toNumber(price.high_price);
    const low = toNumber(price.low_price);
    const close = toNumber(price.close_price);
    if (open === null || high === null || low === null || close === null) {
      return [];
    }

    return [{ time: price.trade_date, open, high, low, close }];
  });
}

function buildVolumeBars(prices: BackendDailyPriceDto[]): VolumeBarModel[] {
  return sortPricesAscending(prices).flatMap((price) => {
    if (!isTradableOhlc(price)) {
      return [];
    }

    const close = toNumber(price.close_price);
    const previousClose = toNumber(price.previous_close_price);
    const tone = close !== null && previousClose !== null ? (close > previousClose ? "positive" : close < previousClose ? "negative" : "neutral") : "neutral";

    return [
      {
        time: price.trade_date,
        value: price.volume,
        tone,
      },
    ];
  });
}

function normalizeSignalScore(value: string | number | null): number | null {
  const normalizedValue = toNumber(value);
  if (normalizedValue === null) {
    return null;
  }

  const score = normalizedValue <= 1 ? normalizedValue * 100 : normalizedValue;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function buildSignalScores(signal: BackendTradingSignalDto): SignalScoreContext {
  return {
    momentum: normalizeSignalScore(signal.momentum_score),
    trend: normalizeSignalScore(signal.trend_score),
    volume: normalizeSignalScore(signal.volume_score),
    risk: normalizeSignalScore(signal.risk_score),
  };
}

function buildPersistedSignalContext(signal: BackendTradingSignalDto, latestTradeDate: string | null): PersistedSignalContext {
  return {
    asOfTradeDate: signal.trade_date,
    computedAt: signal.updated_at,
    confidence: normalizeSignalScore(signal.confidence) ?? 0,
    isStale: latestTradeDate !== null && signal.trade_date !== latestTradeDate,
    reason: signal.reason,
    scores: buildSignalScores(signal),
    signal: signal.signal_type,
    source: "backend",
    strategyName: signal.strategy_name,
    strategyVersion: signal.strategy_version ?? null,
    thresholdVersion: signal.threshold_version ?? null,
    actionTaxonomy: signal.action_taxonomy ?? null,
    canonicalRecommendation: signal.canonical_recommendation ?? null,
    signalAsOf: signal.signal_as_of ?? null,
    sharedDecisionId: signal.shared_decision_id ?? null,
  };
}

export function applyPersistedSignalEnrichment(
  intelligence: StockIntelligenceModel,
  persistedSignal: BackendTradingSignalDto | null | undefined,
): StockIntelligenceModel {
  if (!persistedSignal) {
    return {
      ...intelligence,
      persistedSignal: null,
    };
  }

  const persistedContext = buildPersistedSignalContext(persistedSignal, intelligence.latestTradeDate);
  return {
    ...intelligence,
    persistedSignal: persistedContext,
  };
}

export function buildChartStockIntelligence(
  stock: BackendStockDto,
  prices: BackendDailyPriceDto[],
): StockIntelligenceModel | null {
  // Match the backend analytical policy: zero-price placeholders are no-trade
  // observations, so they are omitted rather than plotted or used as latest.
  const sortedPrices = sortPricesAscending(prices).filter(isTradableOhlc);
  const latest = sortedPrices.at(-1);

  if (!latest) {
    return null;
  }

  const latestPrice = toNumber(latest.close_price);
  const previousClose =
    toNumber(latest.previous_close_price) ??
    toNumber(sortedPrices.at(-2)?.close_price ?? null);
  const priceChange = toNumber(latest.price_change) ?? (latestPrice !== null && previousClose !== null ? latestPrice - previousClose : null);
  const priceChangePercent =
    toNumber(latest.price_change_percent) ??
    (priceChange !== null && previousClose !== null && previousClose !== 0 ? (priceChange / previousClose) * 100 : null);
  const weekPrices = sortedPrices.slice(-252).flatMap((price) => [toNumber(price.low_price), toNumber(price.high_price)]).filter((value): value is number => value !== null);

  return {
    stock,
    prices: sortedPrices,
    candles: buildCandles(sortedPrices),
    volumeBars: buildVolumeBars(sortedPrices),
    latestPrice,
    previousClose,
    priceChange,
    priceChangePercent,
    volume: latest.volume,
    averageVolume: null,
    turnover: toNumber(latest.turnover),
    marketCap: toNumber(stock.market_cap),
    sector: stock.sector || stock.category || "Unclassified",
    latestTradeDate: latest.trade_date,
    dataQuality: latest.data_quality_flag,
    rsi: null,
    sma20: null,
    ema20: null,
    volatility: null,
    support: null,
    resistance: null,
    week52Low: weekPrices.length ? Math.min(...weekPrices) : null,
    week52High: weekPrices.length ? Math.max(...weekPrices) : null,
    trend: "UNKNOWN",
    signal: {
      stockId: stock.id,
      symbol: stock.symbol,
      name: stock.name,
      exchange: stock.exchange,
      signal: "HOLD",
      confidence: 0,
      risk: "MEDIUM",
      reason: "Canonical decision data is unavailable.",
      supportingContext: [],
      generatedAt: latest.trade_date,
      asOfTradeDate: latest.trade_date,
      source: "derived",
    },
  };
}

export function deriveMarketBreadth(stocks: StockIntelligenceModel[]): MarketBreadthStats {
  const advancing = stocks.filter((stock) => (stock.priceChangePercent ?? 0) > 0).length;
  const declining = stocks.filter((stock) => (stock.priceChangePercent ?? 0) < 0).length;
  const unchanged = stocks.filter((stock) => (stock.priceChangePercent ?? 0) === 0).length;

  return {
    advancing,
    declining,
    unchanged,
    total: stocks.length,
  };
}

export function deriveMarketCondition(stocks: StockIntelligenceModel[], breadth: MarketBreadthStats): MarketCondition {
  if (stocks.length === 0) {
    return "Unknown";
  }

  const averageMove = average(stocks.map((stock) => stock.priceChangePercent ?? 0)) ?? 0;
  const averageVolatility = average(stocks.map((stock) => stock.volatility ?? 0)) ?? 0;
  const volumeExpansion = stocks.filter(
    (stock) => stock.averageVolume !== null && stock.averageVolume > 0 && stock.volume > stock.averageVolume * 1.5,
  ).length;

  if (averageVolatility >= 3.2) {
    return "High volatility";
  }

  if (breadth.advancing > breadth.declining * 1.3 && averageMove > 0.5 && volumeExpansion > stocks.length * 0.15) {
    return "Accumulation";
  }

  if (breadth.advancing > breadth.declining * 1.2 && averageMove > 0) {
    return "Bullish";
  }

  if (breadth.declining > breadth.advancing * 1.25 && averageMove < -0.35) {
    return "Bearish";
  }

  if (averageMove > 0 && breadth.declining >= breadth.advancing) {
    return "Weak recovery";
  }

  return "Cautious";
}
