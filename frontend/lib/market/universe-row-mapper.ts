import type { BackendScoredUniverseRowDto, SignalType } from "@/lib/api/backend-api-types";
import type { DerivedSignalModel, RiskLevel, StockIntelligenceModel, TrendDirection } from "@/lib/market/market-intelligence-types";

function mapRiskLabel(value: string | undefined): RiskLevel {
  if (value === "LOW" || value === "MEDIUM" || value === "HIGH") {
    return value;
  }
  return "MEDIUM";
}

function mapRecommendationToSignal(recommendation: string | undefined): SignalType {
  if (recommendation === "BUY" || recommendation === "SELL") {
    return recommendation;
  }
  return "HOLD";
}

function mapTrend(value: string): TrendDirection {
  if (value === "UPTREND" || value === "DOWNTREND" || value === "SIDEWAYS" || value === "UNKNOWN") {
    return value;
  }
  return "UNKNOWN";
}

export function mapUniverseRowToListRow(row: BackendScoredUniverseRowDto): StockIntelligenceModel {
  const snapshot = row.technical_snapshot;
  const session = row.session;
  const stock = row.stock;
  const decision = row.decision;
  const latestPrice = snapshot.latest_price ?? Number(session.close_price);
  const priceChangePercent =
    snapshot.price_change_percent ?? (session.change_percent != null ? Number(session.change_percent) : null);

  const signal: DerivedSignalModel = {
    stockId: stock.id,
    symbol: stock.symbol,
    name: stock.name,
    exchange: stock.exchange,
    signal: mapRecommendationToSignal(decision?.recommendation),
    confidence: decision?.confidence ?? 48,
    risk: mapRiskLabel(decision?.risk_label),
    reason: decision?.reason ?? "Awaiting decision data",
    supportingContext: [],
    generatedAt: snapshot.latest_trade_date ?? session.latest_trade_date,
    asOfTradeDate: snapshot.latest_trade_date ?? session.latest_trade_date,
    source: "derived",
  };

  return {
    stock,
    prices: [],
    candles: [],
    volumeBars: [],
    latestPrice,
    previousClose: snapshot.previous_close,
    priceChange: snapshot.price_change,
    priceChangePercent,
    volume: snapshot.volume ?? session.volume,
    averageVolume: snapshot.average_volume,
    turnover: snapshot.turnover ?? (session.turnover != null ? Number(session.turnover) : null),
    marketCap: stock.market_cap != null ? Number(stock.market_cap) : null,
    sector: stock.sector || stock.category || "Unclassified",
    latestTradeDate: snapshot.latest_trade_date ?? session.latest_trade_date,
    dataQuality: snapshot.data_quality ?? session.data_quality_flag ?? "UNKNOWN",
    rsi: snapshot.rsi,
    sma20: snapshot.sma20,
    ema20: snapshot.ema20,
    volatility: snapshot.volatility,
    support: snapshot.support,
    resistance: snapshot.resistance,
    week52Low: null,
    week52High: null,
    trend: mapTrend(snapshot.trend),
    signal,
    traderDecision: decision,
  };
}
