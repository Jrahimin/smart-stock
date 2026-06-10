import type { ExchangeCode } from "@/lib/api/backend-api-types";

export type StockSearchPick = {
  symbol: string;
  exchange: ExchangeCode;
  name: string;
};

export type ExplorerQuickAction =
  | { type: "stock"; symbol: string; exchange: ExchangeCode; label: string }
  | { type: "filter"; query: string; label: string };

export const RECENT_STOCK_SEARCHES_KEY = "smart-stock-recent-symbol-searches";
export const MAX_RECENT_STOCK_SEARCHES = 6;

export const EXPLORER_POPULAR_STOCKS: StockSearchPick[] = [
  { symbol: "GP", exchange: "DSE", name: "Grameenphone Ltd." },
  { symbol: "BATBC", exchange: "DSE", name: "British American Tobacco Bangladesh Co. Ltd." },
  { symbol: "SQURPHARMA", exchange: "DSE", name: "Square Pharmaceuticals PLC." },
  { symbol: "BRACBANK", exchange: "DSE", name: "BRAC Bank Ltd." },
  { symbol: "ACI", exchange: "DSE", name: "Advanced Chemical Industries Ltd." },
  { symbol: "RECKITTBEN", exchange: "DSE", name: "Reckitt Benckiser (Bangladesh) Ltd." },
];

export const EXPLORER_QUICK_ACTIONS: ExplorerQuickAction[] = [
  { type: "stock", symbol: "GP", exchange: "DSE", label: "GP" },
  { type: "stock", symbol: "BATBC", exchange: "DSE", label: "BATBC" },
  { type: "stock", symbol: "SQURPHARMA", exchange: "DSE", label: "SQURPHARMA" },
  { type: "filter", query: "bank", label: "BANKS" },
  { type: "filter", query: "textile", label: "Textile" },
];

export function loadRecentStockSearches(): StockSearchPick[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(RECENT_STOCK_SEARCHES_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as StockSearchPick[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENT_STOCK_SEARCHES) : [];
  } catch {
    return [];
  }
}

export function saveRecentStockSearch(stock: StockSearchPick) {
  if (typeof window === "undefined") {
    return;
  }

  const normalized = {
    symbol: stock.symbol.toUpperCase(),
    exchange: stock.exchange,
    name: stock.name,
  };

  const next = [normalized, ...loadRecentStockSearches().filter((item) => item.symbol !== normalized.symbol)].slice(
    0,
    MAX_RECENT_STOCK_SEARCHES,
  );

  window.localStorage.setItem(RECENT_STOCK_SEARCHES_KEY, JSON.stringify(next));
}
