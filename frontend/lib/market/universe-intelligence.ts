import type {
  BackendScoredUniverseRowDto,
  BackendStockDto,
  BackendTechnicalSnapshotDto,
  BackendTradingSignalDto,
  BackendUserWatchlistDto,
} from "@/lib/api/backend-api-types";
import { applyPersistedSignalEnrichment } from "@/lib/market/market-intelligence";
import type { StockIntelligenceModel } from "@/lib/market/market-intelligence-types";
import { mapUniverseRowToListRow } from "@/lib/market/universe-row-mapper";
import { normalizeTrendDirection } from "@/lib/market/trend-display";

function buildIntelligenceFromSnapshot(
  stock: BackendStockDto,
  snapshot: BackendTechnicalSnapshotDto,
  decision: BackendScoredUniverseRowDto["decision"],
): StockIntelligenceModel {
  const latestPrice = snapshot.latest_price;
  const priceChangePercent = snapshot.price_change_percent;

  return {
    stock,
    prices: [],
    candles: [],
    volumeBars: [],
    latestPrice,
    previousClose: snapshot.previous_close,
    priceChange: snapshot.price_change,
    priceChangePercent,
    volume: snapshot.volume,
    averageVolume: snapshot.average_volume,
    turnover: snapshot.turnover,
    marketCap: stock.market_cap != null ? Number(stock.market_cap) : null,
    sector: stock.sector || stock.category || "Unclassified",
    latestTradeDate: snapshot.latest_trade_date,
    dataQuality: snapshot.data_quality ?? "UNKNOWN",
    rsi: snapshot.rsi,
    sma20: snapshot.sma20,
    ema20: snapshot.ema20,
    volatility: snapshot.volatility,
    support: snapshot.support,
    resistance: snapshot.resistance,
    week52Low: null,
    week52High: null,
    trend: normalizeTrendDirection(snapshot.trend),
    signal: {
      stockId: stock.id,
      symbol: stock.symbol,
      name: stock.name,
      exchange: stock.exchange,
      signal:
        decision?.display_action === "POTENTIAL_BUY"
          ? "BUY"
          : decision?.display_action === "SELL"
            ? "SELL"
            : "HOLD",
      confidence: decision?.confidence ?? 48,
      risk: decision?.risk_label === "LOW" || decision?.risk_label === "MEDIUM" || decision?.risk_label === "HIGH" ? decision.risk_label : "MEDIUM",
      reason: decision?.reason ?? "Awaiting decision data",
      supportingContext: [],
      generatedAt: snapshot.latest_trade_date ?? "Awaiting price data",
      asOfTradeDate: snapshot.latest_trade_date ?? undefined,
      source: "derived",
    },
    traderDecision: decision,
  };
}

export function buildStockIntelligenceFromUniverseRow(
  row: BackendScoredUniverseRowDto,
  persistedSignal?: BackendTradingSignalDto | null,
): StockIntelligenceModel {
  const model = mapUniverseRowToListRow(row);
  return persistedSignal ? applyPersistedSignalEnrichment(model, persistedSignal) : model;
}

export function buildStockIntelligenceFromWatchlistItem(
  item: BackendUserWatchlistDto,
  stock?: BackendStockDto | null,
): StockIntelligenceModel | null {
  if (!item.technical_snapshot) {
    return null;
  }

  const resolvedStock: BackendStockDto =
    stock ??
    ({
      id: item.stock_id,
      symbol: item.stock_symbol,
      name: item.stock_symbol,
      exchange: "DSE",
      sector: null,
      category: null,
      isin: null,
      listing_date: null,
      lot_size: null,
      paid_up_capital: null,
      market_cap: null,
      is_active: true,
      created_at: item.created_at,
      updated_at: item.updated_at,
    } satisfies BackendStockDto);

  return buildIntelligenceFromSnapshot(resolvedStock, item.technical_snapshot, item.trader_decision);
}

export function buildEnrichedIntelligenceMap(
  universeRows: BackendScoredUniverseRowDto[],
  persistedSignals: BackendTradingSignalDto[] = [],
): Map<string, StockIntelligenceModel> {
  const signalsByStockId = new Map(persistedSignals.map((signal) => [signal.stock_id, signal]));
  const intelligenceByStockId = new Map<string, StockIntelligenceModel>();

  for (const row of universeRows) {
    intelligenceByStockId.set(
      row.stock.id,
      buildStockIntelligenceFromUniverseRow(row, signalsByStockId.get(row.stock.id)),
    );
  }

  return intelligenceByStockId;
}

export function resolveWatchlistStockIntelligence(
  item: BackendUserWatchlistDto,
  intelligenceByStockId: Map<string, StockIntelligenceModel>,
  persistedSignalsByStockId?: Map<string, BackendTradingSignalDto>,
): StockIntelligenceModel | null {
  const fromUniverse = intelligenceByStockId.get(item.stock_id);
  if (fromUniverse) {
    return fromUniverse;
  }

  const fallback = buildStockIntelligenceFromWatchlistItem(item);
  if (!fallback) {
    return null;
  }

  const persistedSignal = persistedSignalsByStockId?.get(item.stock_id);
  return persistedSignal ? applyPersistedSignalEnrichment(fallback, persistedSignal) : fallback;
}
