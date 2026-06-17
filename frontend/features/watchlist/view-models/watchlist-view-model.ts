import type { BackendUserWatchlistDto } from "@/lib/api/backend-api-types";
import { formatNumber, formatPercent } from "@/lib/formatters/financial-formatters";
import type {
  WatchlistPageFilters,
  WatchlistRowViewModel,
} from "@/features/watchlist/types/watchlist-types";
import type { StockIntelligenceModel } from "@/lib/market/market-intelligence-types";
import {
  formatTrendLabel,
  getTrendFilterKey,
  getTrendTone,
} from "@/lib/market/trend-display";
import {
  getPreviousSessionRecommendation,
  isTraderDecisionChangedThisSession,
  resolveTraderDecision,
} from "@/lib/market/trader-decision";

/**
 * Watchlist rows derive action, RSI, and trend from the shared scored-universe
 * intelligence map (same source as explorer, scanner, and signal center).
 */

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

export function buildWatchlistRowViewModel(
  item: BackendUserWatchlistDto,
  intelligence: StockIntelligenceModel | null,
): WatchlistRowViewModel {
  const decision = intelligence ? resolveTraderDecision(intelligence) : null;
  const actionLabel = decision?.recommendation ?? item.trader_decision?.recommendation ?? "WAIT";
  const previousActionLabel = intelligence ? getPreviousSessionRecommendation(intelligence) : null;
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
    trendLabel: intelligence ? formatTrendLabel(trendDirection) : "Unknown",
    trendTone: intelligence ? getTrendTone(trendDirection) : "neutral",
    trendKey: intelligence ? getTrendFilterKey(trendDirection) : "UNKNOWN",
    trendDirection,
    actionLabel,
    previousActionLabel,
    lastUpdatedLabel: formatShortTradeDate(intelligence?.latestTradeDate),
    unrealizedGainLabel:
      item.unrealized_gain_percent !== null && item.unrealized_gain_percent !== undefined
        ? formatPercent(Number(item.unrealized_gain_percent))
        : null,
    isNewSignal: intelligence ? isTraderDecisionChangedThisSession(intelligence) : false,
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
