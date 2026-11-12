import type { BackendScoredUniverseRowDto, SignalType } from "@/lib/api/backend-api-types";
import type { DerivedSignalModel, RiskLevel, StockIntelligenceModel, TrendDirection } from "@/lib/market/market-intelligence-types";
import { normalizeTrendDirection } from "@/lib/market/trend-display";

function mapRiskLabel(value: string | undefined): RiskLevel {
  if (value === "LOW" || value === "MEDIUM" || value === "HIGH" || value === "SPECULATIVE") {
    return value;
  }
  return "UNKNOWN";
}

function mapRecommendationToSignal(recommendation: string | undefined): SignalType {
  if (recommendation === "POTENTIAL_BUY") {
    return "BUY";
  }
  if (recommendation === "SELL") {
    return "SELL";
  }
  return "HOLD";
}

function mapTrend(value: string): TrendDirection {
  return normalizeTrendDirection(value);
}

export function mapUniverseRowToListRow(row: BackendScoredUniverseRowDto, publicationDate?: string | null): StockIntelligenceModel {
  const snapshot = row.technical_snapshot;
  const session = row.session;
  const stock = row.stock;
  const decision = row.decision;
  const latestPrice = row.display_quote ? row.display_quote.current_price : snapshot.latest_price;
  const priceChangePercent =
    row.display_quote ? row.display_quote.price_change_percent ?? null : snapshot.price_change_percent;

  const signal: DerivedSignalModel = {
    stockId: stock.id,
    symbol: stock.symbol,
    name: stock.name,
    exchange: stock.exchange,
    signal: mapRecommendationToSignal(decision?.display_action),
    confidence: decision?.confidence ?? 0,
    risk: mapRiskLabel(decision?.risk_label),
    reason: decision?.reason ?? "Awaiting decision data",
    supportingContext: [],
    generatedAt: snapshot.latest_trade_date ?? session.latest_trade_date,
    asOfTradeDate: snapshot.latest_trade_date ?? session.latest_trade_date,
    source: "derived",
  };

  return {
    decisionDate: decision ? decision.canonical?.as_of_date ?? publicationDate ?? null : null,
    latestVolumeRatio: row.analysis?.liquidity?.latest_volume_ratio ?? null,
    publicComparison: row.public_comparison,
    shortlist: row.shortlist,
    displayQuote: row.display_quote,
    previousFinalizedDecision: row.previous_finalized_decision,
    stock,
    prices: [],
    candles: [],
    volumeBars: [],
    latestPrice,
    previousClose: snapshot.previous_close,
    priceChange: row.display_quote ? row.display_quote.price_change ?? null : snapshot.price_change,
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
    isBreakout: snapshot.is_breakout ?? false,
    returnFiveDayPercent: snapshot.return_5d_percent ?? null,
    returnTwentyDayPercent: snapshot.return_20d_percent ?? null,
    averageTurnover: snapshot.average_turnover ?? null,
    structure: snapshot.structure ?? null,
    scannerConditions: row.scanner?.matches ?? [],
    volumeBehavior: snapshot.volume_behavior ?? "UNKNOWN",
  };
}
