import type { BackendUserWatchlistDto, TraderRecommendation } from "@/lib/api/backend-api-types";
import { formatNumber, formatPercent } from "@/lib/formatters/financial-formatters";
import type {
  WatchlistPageFilters,
  WatchlistRowViewModel,
  WatchlistTrendKey,
} from "@/features/watchlist/types/watchlist-types";
import type { StockIntelligenceModel, TrendDirection } from "@/lib/market/market-intelligence-types";
import { mapPersistedSignalToRecommendation, resolveTraderDecision, resolveWatchlistAction } from "@/lib/market/trader-decision";

/**
 * NEW = the trader decision changed during the latest trading session versus the
 * last persisted strategy signal (e.g. HOLD → BUY, WAIT → SELL).
 */
function getPriorTradeDate(stock: StockIntelligenceModel): string | null {
  if (!stock.latestTradeDate) {
    return null;
  }

  const priorDates = stock.prices
    .map((price) => price.trade_date)
    .filter((tradeDate) => tradeDate < stock.latestTradeDate!)
    .sort();

  return priorDates.at(-1) ?? null;
}

export function getPreviousSessionRecommendation(stock: StockIntelligenceModel): TraderRecommendation | null {
  const persisted = stock.persistedSignal;
  if (!persisted || !stock.latestTradeDate) {
    return null;
  }

  // Intraday refresh on the latest session.
  if (persisted.asOfTradeDate === stock.latestTradeDate) {
    return mapPersistedSignalToRecommendation(persisted.signal);
  }

  // Prior trading session only (not an older stale signal).
  const priorTradeDate = getPriorTradeDate(stock);
  if (priorTradeDate && persisted.asOfTradeDate === priorTradeDate) {
    return mapPersistedSignalToRecommendation(persisted.signal);
  }

  return null;
}

export function isNewWatchlistSignal(stock: StockIntelligenceModel): boolean {
  const current = resolveTraderDecision(stock).recommendation;
  const previous = getPreviousSessionRecommendation(stock);

  if (!previous || !stock.latestTradeDate) {
    return false;
  }

  return previous !== current;
}

function getTrendKey(trend: TrendDirection): WatchlistTrendKey {
  if (trend === "UPTREND") {
    return "BULLISH";
  }
  if (trend === "DOWNTREND") {
    return "BEARISH";
  }
  if (trend === "SIDEWAYS") {
    return "SIDEWAYS";
  }
  return "UNKNOWN";
}

function getTrendTone(trend: TrendDirection): "positive" | "negative" | "neutral" {
  if (trend === "UPTREND") {
    return "positive";
  }
  if (trend === "DOWNTREND") {
    return "negative";
  }
  return "neutral";
}

function formatShortTradeDate(tradeDate: string | null | undefined): string {
  if (!tradeDate) {
    return "—";
  }

  const parsed = new Date(tradeDate);
  if (Number.isNaN(parsed.getTime())) {
    return tradeDate;
  }

  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatTrendBadge(trend: TrendDirection): string {
  if (trend === "UPTREND") {
    return "Bullish";
  }
  if (trend === "DOWNTREND") {
    return "Bearish";
  }
  if (trend === "SIDEWAYS") {
    return "Sideways";
  }
  return "Unknown";
}

export function buildWatchlistRowViewModel(
  item: BackendUserWatchlistDto,
  intelligence: StockIntelligenceModel | null,
): WatchlistRowViewModel {
  const decision = intelligence ? resolveTraderDecision(intelligence) : null;
  const actionLabel = resolveWatchlistAction(intelligence, item.trader_decision?.recommendation);
  const previousActionLabel = intelligence ? getPreviousSessionRecommendation(intelligence) : null;
  const unrealized =
    item.unrealized_gain_percent !== null && item.unrealized_gain_percent !== undefined
      ? formatPercent(Number(item.unrealized_gain_percent))
      : null;
  const trendDirection = intelligence?.trend ?? "UNKNOWN";
  const buyPriceLabel =
    item.buy_price !== null && item.buy_price !== undefined ? formatNumber(Number(item.buy_price)) : null;

  return {
    item,
    intelligence,
    decision,
    companyName: intelligence?.stock.name ?? item.stock_symbol,
    buyPriceLabel,
    latestPriceLabel: formatNumber(intelligence?.latestPrice ?? item.current_price),
    changePercentLabel: formatPercent(intelligence?.priceChangePercent),
    rsiLabel: formatNumber(intelligence?.rsi),
    trendLabel: intelligence ? formatTrendBadge(trendDirection) : "Unknown",
    trendTone: intelligence ? getTrendTone(trendDirection) : "neutral",
    trendKey: intelligence ? getTrendKey(trendDirection) : "UNKNOWN",
    trendDirection,
    actionLabel,
    previousActionLabel,
    lastUpdatedLabel: formatShortTradeDate(intelligence?.latestTradeDate),
    unrealizedGainLabel: unrealized,
    isNewSignal: intelligence ? isNewWatchlistSignal(intelligence) : false,
  };
}

export function filterWatchlistRows(
  rows: WatchlistRowViewModel[],
  filters: WatchlistPageFilters,
): WatchlistRowViewModel[] {
  return rows.filter((row) => {
    if (filters.holdings === "HOLDINGS_ONLY" && !row.item.is_holding) {
      return false;
    }

    if (filters.action === "NEW") {
      if (!row.isNewSignal) {
        return false;
      }
    } else if (filters.action !== "ALL" && row.actionLabel !== filters.action) {
      return false;
    }

    if (filters.trend !== "ALL" && row.trendKey !== filters.trend) {
      return false;
    }

    return true;
  });
}

export function sortWatchlistRows(rows: WatchlistRowViewModel[]): WatchlistRowViewModel[] {
  return [...rows].sort((left, right) => {
    if (left.item.is_holding !== right.item.is_holding) {
      return left.item.is_holding ? -1 : 1;
    }
    return new Date(right.item.created_at).getTime() - new Date(left.item.created_at).getTime();
  });
}
