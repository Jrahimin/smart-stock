import type { BackendDailyPriceDto, BackendStockDto, BackendTradingSignalDto, SignalType } from "@/lib/api/backend-api-types";
import { toNumber } from "@/lib/formatters/financial-formatters";
import type {
  ChartCandleModel,
  DerivedSignalModel,
  MarketBreadthStats,
  MarketCondition,
  PersistedSignalContext,
  RiskLevel,
  SignalScoreContext,
  StockIntelligenceModel,
  TrendDirection,
  VolumeBarModel,
} from "@/lib/market/market-intelligence-types";

function sortPricesAscending(prices: BackendDailyPriceDto[]) {
  return [...prices].sort((a, b) => a.trade_date.localeCompare(b.trade_date));
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getStandardDeviation(values: number[]) {
  const avg = average(values);
  if (avg === null || values.length < 2) {
    return null;
  }

  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function calculateSma(values: number[], period: number) {
  if (values.length < period) {
    return null;
  }

  return average(values.slice(-period));
}

export function calculateEma(values: number[], period: number) {
  if (values.length < period) {
    return null;
  }

  const multiplier = 2 / (period + 1);
  const seed = average(values.slice(0, period));
  if (seed === null) {
    return null;
  }

  return values.slice(period).reduce((ema, value) => (value - ema) * multiplier + ema, seed);
}

export function calculateRsi(values: number[], period = 14) {
  if (values.length <= period) {
    return null;
  }

  const changes = values.slice(1).map((value, index) => value - values[index]);
  const recentChanges = changes.slice(-period);
  const gains = recentChanges.map((change) => Math.max(change, 0));
  const losses = recentChanges.map((change) => Math.abs(Math.min(change, 0)));
  const averageGain = average(gains) ?? 0;
  const averageLoss = average(losses) ?? 0;

  if (averageLoss === 0) {
    return 100;
  }

  const relativeStrength = averageGain / averageLoss;
  return 100 - 100 / (1 + relativeStrength);
}

function buildCandles(prices: BackendDailyPriceDto[]): ChartCandleModel[] {
  return sortPricesAscending(prices)
    .map((price) => {
      const open = toNumber(price.open_price);
      const high = toNumber(price.high_price);
      const low = toNumber(price.low_price);
      const close = toNumber(price.close_price);

      if (open === null || high === null || low === null || close === null) {
        return null;
      }

      return {
        time: price.trade_date,
        open,
        high,
        low,
        close,
      };
    })
    .filter((price): price is ChartCandleModel => price !== null);
}

function buildVolumeBars(prices: BackendDailyPriceDto[]): VolumeBarModel[] {
  return sortPricesAscending(prices).map((price) => {
    const close = toNumber(price.close_price);
    const previousClose = toNumber(price.previous_close_price);
    const tone = close !== null && previousClose !== null ? (close > previousClose ? "positive" : close < previousClose ? "negative" : "neutral") : "neutral";

    return {
      time: price.trade_date,
      value: price.volume,
      tone,
    };
  });
}

function inferTrend(latestPrice: number | null, sma20: number | null, ema20: number | null, changePercent: number | null): TrendDirection {
  if (latestPrice === null || sma20 === null || ema20 === null || changePercent === null) {
    return "UNKNOWN";
  }

  if (latestPrice > sma20 && latestPrice > ema20 && changePercent > 0) {
    return "UPTREND";
  }

  if (latestPrice < sma20 && latestPrice < ema20 && changePercent < 0) {
    return "DOWNTREND";
  }

  return "SIDEWAYS";
}

function inferRisk(volatility: number | null, dataQuality: string, volume: number, averageVolume: number | null): RiskLevel {
  if (dataQuality === "SUSPICIOUS" || volatility !== null && volatility >= 4) {
    return "HIGH";
  }

  if (dataQuality === "PARTIAL" || volume === 0 || averageVolume !== null && volume < averageVolume * 0.45 || volatility !== null && volatility >= 2.3) {
    return "MEDIUM";
  }

  return "LOW";
}

function inferMomentumPhase(trend: TrendDirection, rsi: number | null, changePercent: number | null) {
  if (trend === "UPTREND" && (changePercent ?? 0) > 0 && (rsi ?? 50) < 72) {
    return "Momentum expansion";
  }

  if (trend === "DOWNTREND" && (changePercent ?? 0) < 0) {
    return "Distribution pressure";
  }

  if (rsi !== null && rsi < 35) {
    return "Oversold recovery watch";
  }

  if (rsi !== null && rsi > 72) {
    return "Extended momentum";
  }

  return "Confirmation pending";
}

function inferVolumeBehavior(volume: number, averageVolume: number | null) {
  if (!averageVolume || averageVolume <= 0) {
    return "Volume baseline unavailable";
  }

  const ratio = volume / averageVolume;
  if (ratio >= 1.8) {
    return "Volume expansion";
  }

  if (ratio <= 0.55) {
    return "Thin participation";
  }

  return "Normal participation";
}

// Legacy client-side BUY/SELL/HOLD synthesis retained for backward-compatible
// `stock.signal` metadata. UI action badges must use `resolveTraderDecision`.
function generateSignal(input: {
  stock: BackendStockDto;
  latestPrice: number | null;
  priceChangePercent: number | null;
  volume: number;
  averageVolume: number | null;
  rsi: number | null;
  sma20: number | null;
  ema20: number | null;
  trend: TrendDirection;
  risk: RiskLevel;
  latestTradeDate: string | null;
}): DerivedSignalModel {
  const supportingContext: string[] = [];
  let signal: SignalType = "HOLD";
  let confidence = 48;
  let reason = "Insufficient confirmation for a directional signal.";

  if (input.rsi !== null) {
    supportingContext.push(`RSI ${input.rsi.toFixed(1)}`);
  }

  if (input.averageVolume !== null && input.averageVolume > 0) {
    const volumeRatio = input.volume / input.averageVolume;
    supportingContext.push(`Volume ${volumeRatio.toFixed(1)}x avg`);

    if (volumeRatio >= 1.8 && input.priceChangePercent !== null && input.priceChangePercent > 1) {
      signal = "BUY";
      confidence = 72;
      reason = "Unusual volume is confirming positive price action; monitor for continuation.";
    }
  }

  if (input.rsi !== null && input.rsi < 30) {
    signal = "BUY";
    confidence = Math.max(confidence, 66);
    reason = "RSI is oversold, creating a rebound watchlist candidate if price stabilizes.";
  } else if (input.rsi !== null && input.rsi > 72) {
    signal = "SELL";
    confidence = Math.max(confidence, 64);
    reason = "RSI is extended; upside may be crowded without fresh volume confirmation.";
  }

  if (input.trend === "UPTREND" && input.priceChangePercent !== null && input.priceChangePercent > 0) {
    signal = signal === "SELL" ? "HOLD" : "BUY";
    confidence = Math.max(confidence, 68);
    reason = "Price is holding above moving-average context with positive momentum.";
  }

  if (input.trend === "DOWNTREND" && input.priceChangePercent !== null && input.priceChangePercent < 0) {
    signal = signal === "BUY" ? "HOLD" : "SELL";
    confidence = Math.max(confidence, 68);
    reason = "Price is below moving-average context with negative momentum.";
  }

  if (input.risk === "HIGH") {
    confidence = Math.max(35, confidence - 12);
    supportingContext.push("High risk profile");
  }

  return {
    stockId: input.stock.id,
    symbol: input.stock.symbol,
    name: input.stock.name,
    exchange: input.stock.exchange,
    signal,
    confidence,
    risk: input.risk,
    reason,
    supportingContext,
    generatedAt: input.latestTradeDate ?? "Awaiting price data",
    asOfTradeDate: input.latestTradeDate ?? undefined,
    momentumPhase: inferMomentumPhase(input.trend, input.rsi, input.priceChangePercent),
    source: "derived",
    triggerReason: reason,
    volumeBehavior: inferVolumeBehavior(input.volume, input.averageVolume),
  };
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
  if (persistedContext.isStale) {
    return {
      ...intelligence,
      persistedSignal: persistedContext,
    };
  }

  return {
    ...intelligence,
    persistedSignal: persistedContext,
    signal: {
      ...intelligence.signal,
      signal: persistedContext.signal,
      confidence: persistedContext.confidence,
      reason: persistedContext.reason,
      supportingContext: [
        `Strategy ${persistedContext.strategyName}`,
        `As of ${persistedContext.asOfTradeDate}`,
        ...intelligence.signal.supportingContext,
      ],
      generatedAt: persistedContext.asOfTradeDate,
      asOfTradeDate: persistedContext.asOfTradeDate,
      computedAt: persistedContext.computedAt,
      scores: persistedContext.scores,
      source: "backend",
      triggerReason: persistedContext.reason,
    },
  };
}

export function buildStockIntelligence(stock: BackendStockDto, prices: BackendDailyPriceDto[]): StockIntelligenceModel | null {
  const sortedPrices = sortPricesAscending(prices);
  const latest = sortedPrices.at(-1);

  if (!latest) {
    return null;
  }

  const closes = sortedPrices.map((price) => toNumber(price.close_price)).filter((value): value is number => value !== null);
  const latestPrice = toNumber(latest.close_price);
  const previousClose = toNumber(latest.previous_close_price) ?? closes.at(-2) ?? null;
  const priceChange = toNumber(latest.price_change) ?? (latestPrice !== null && previousClose !== null ? latestPrice - previousClose : null);
  const priceChangePercent =
    toNumber(latest.price_change_percent) ??
    (priceChange !== null && previousClose !== null && previousClose !== 0 ? (priceChange / previousClose) * 100 : null);
  const volumeWindow = sortedPrices.slice(-20).map((price) => price.volume);
  const averageVolume = average(volumeWindow);
  const dailyChanges = sortedPrices
    .slice(-20)
    .map((price) => toNumber(price.price_change_percent))
    .filter((value): value is number => value !== null);
  const volatility = getStandardDeviation(dailyChanges);
  const sma20 = calculateSma(closes, 20);
  const ema20 = calculateEma(closes, 20);
  const rsi = calculateRsi(closes);
  const trend = inferTrend(latestPrice, sma20, ema20, priceChangePercent);
  const weekPrices = sortedPrices.slice(-252).flatMap((price) => [toNumber(price.low_price), toNumber(price.high_price)]).filter((value): value is number => value !== null);
  const support = sortedPrices.slice(-20).map((price) => toNumber(price.low_price)).filter((value): value is number => value !== null).sort((a, b) => a - b)[0] ?? null;
  const resistance = sortedPrices.slice(-20).map((price) => toNumber(price.high_price)).filter((value): value is number => value !== null).sort((a, b) => b - a)[0] ?? null;
  const risk = inferRisk(volatility, latest.data_quality_flag, latest.volume, averageVolume);

  const signal = generateSignal({
    stock,
    latestPrice,
    priceChangePercent,
    volume: latest.volume,
    averageVolume,
    rsi,
    sma20,
    ema20,
    trend,
    risk,
    latestTradeDate: latest.trade_date,
  });

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
    averageVolume,
    turnover: toNumber(latest.turnover),
    marketCap: toNumber(stock.market_cap),
    sector: stock.sector || stock.category || "Unclassified",
    latestTradeDate: latest.trade_date,
    dataQuality: latest.data_quality_flag,
    rsi,
    sma20,
    ema20,
    volatility,
    support,
    resistance,
    week52Low: weekPrices.length ? Math.min(...weekPrices) : null,
    week52High: weekPrices.length ? Math.max(...weekPrices) : null,
    trend,
    signal,
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
