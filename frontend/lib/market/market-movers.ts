import { formatCompactNumber, formatNumber, formatPercent } from "@/lib/formatters/financial-formatters";
import type { StockIntelligenceModel } from "@/lib/market/market-intelligence-types";

export const DEFAULT_MARKET_MOVER_LIMIT = 5;

/**
 * Mirrors backend `market_mover_rules.is_eligible_session_mover` — keep both in sync.
 */
export function isEligibleSessionMover(
  stock: StockIntelligenceModel,
  sessionTradeDate: string | null | undefined,
): boolean {
  if (!sessionTradeDate || !stock.latestTradeDate) {
    return false;
  }

  if (stock.latestTradeDate !== sessionTradeDate) {
    return false;
  }

  if (stock.latestPrice == null || stock.latestPrice <= 0) {
    return false;
  }

  if (stock.volume <= 0) {
    return false;
  }

  return stock.priceChangePercent != null;
}

export function filterSessionMovers(
  universe: StockIntelligenceModel[],
  sessionTradeDate: string | null | undefined,
): StockIntelligenceModel[] {
  return universe.filter((stock) => isEligibleSessionMover(stock, sessionTradeDate));
}

export type DashboardMoverViewModel = {
  stockId: string;
  symbol: string;
  name: string;
  latestPrice: string;
  changePercent: string;
  turnover: string;
  volume: string;
  trend: string;
  href: string;
  tone: "positive" | "negative" | "neutral";
};

function toMoverViewModel(stock: StockIntelligenceModel): DashboardMoverViewModel {
  return {
    stockId: stock.stock.id,
    symbol: stock.stock.symbol,
    name: stock.stock.name,
    latestPrice: formatNumber(stock.latestPrice),
    changePercent: formatPercent(stock.priceChangePercent),
    turnover: formatCompactNumber(stock.turnover),
    volume: formatCompactNumber(stock.volume),
    trend: stock.trend,
    href: `/stocks/${stock.stock.exchange}/${stock.stock.symbol}`,
    tone:
      (stock.priceChangePercent ?? 0) > 0
        ? "positive"
        : (stock.priceChangePercent ?? 0) < 0
          ? "negative"
          : "neutral",
  };
}

export function buildDashboardMovers(
  universe: StockIntelligenceModel[],
  sessionTradeDate: string | null | undefined,
  limit = DEFAULT_MARKET_MOVER_LIMIT,
) {
  const traded = filterSessionMovers(universe, sessionTradeDate);

  return {
    gainers: [...traded]
      .filter((stock) => (stock.priceChangePercent ?? 0) > 0)
      .sort((left, right) => (right.priceChangePercent ?? 0) - (left.priceChangePercent ?? 0))
      .slice(0, limit)
      .map(toMoverViewModel),
    losers: [...traded]
      .filter((stock) => (stock.priceChangePercent ?? 0) < 0)
      .sort((left, right) => (left.priceChangePercent ?? 0) - (right.priceChangePercent ?? 0))
      .slice(0, limit)
      .map(toMoverViewModel),
    turnoverLeaders: [...traded]
      .sort((left, right) => (right.turnover ?? 0) - (left.turnover ?? 0))
      .slice(0, limit)
      .map(toMoverViewModel),
    volumeLeaders: [...traded]
      .sort((left, right) => right.volume - left.volume)
      .slice(0, limit)
      .map(toMoverViewModel),
  };
}
