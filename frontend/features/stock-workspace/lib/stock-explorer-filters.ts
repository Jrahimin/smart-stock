import type { StockIntelligenceModel } from "@/lib/market/market-intelligence-types";
import { getVolumeBehaviorId, resolveTraderDecision, type ResolvedTraderDecision } from "@/lib/market/trader-decision";

export type ExplorerPortfolioScope = "ALL" | "WATCHLIST" | "HOLDINGS";

export type ExplorerTableFilters = {
  tableSearch: string;
  signalFilter: string;
  volumeFilter: string;
  portfolioScope: ExplorerPortfolioScope;
};

export function buildExplorerSearchText(stock: StockIntelligenceModel): string {
  return `${stock.stock.symbol} ${stock.stock.name}`.toLowerCase();
}

export function matchesExplorerTableSearch(searchText: string, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return searchText.includes(normalized);
}

export function filterExplorerUniverseRows(args: {
  universe: StockIntelligenceModel[];
  decisionByStockId: Map<string, ResolvedTraderDecision>;
  searchTextByStockId: Map<string, string>;
  filters: ExplorerTableFilters;
  watchedStockIds: Set<string>;
  holdingStockIds: Set<string>;
}): StockIntelligenceModel[] {
  const { universe, decisionByStockId, searchTextByStockId, filters, watchedStockIds, holdingStockIds } = args;
  const query = filters.tableSearch.trim().toLowerCase();

  return universe.filter((stock) => {
    const decision = decisionByStockId.get(stock.stock.id);
    if (!decision) {
      return false;
    }

    const searchText = searchTextByStockId.get(stock.stock.id) ?? buildExplorerSearchText(stock);
    const matchesSearch = matchesExplorerTableSearch(searchText, query);
    const matchesSignal = filters.signalFilter === "ALL" || decision.recommendation === filters.signalFilter;
    const matchesVolume = filters.volumeFilter === "ALL" || getVolumeBehaviorId(stock) === filters.volumeFilter;
    const stockId = stock.stock.id;
    const matchesPortfolioScope =
      filters.portfolioScope === "ALL" ||
      (filters.portfolioScope === "WATCHLIST" && watchedStockIds.has(stockId)) ||
      (filters.portfolioScope === "HOLDINGS" && holdingStockIds.has(stockId));

    return matchesSearch && matchesSignal && matchesVolume && matchesPortfolioScope;
  });
}

export function hasActiveExplorerTableFilters(filters: ExplorerTableFilters): boolean {
  return (
    Boolean(filters.tableSearch.trim()) ||
    filters.signalFilter !== "ALL" ||
    filters.volumeFilter !== "ALL" ||
    filters.portfolioScope !== "ALL"
  );
}

export function createDefaultExplorerTableFilters(): ExplorerTableFilters {
  return {
    tableSearch: "",
    signalFilter: "ALL",
    volumeFilter: "ALL",
    portfolioScope: "ALL",
  };
}

export function resolveTraderDecisionsByStockId(
  universe: StockIntelligenceModel[],
): Map<string, ResolvedTraderDecision> {
  return new Map(universe.map((row) => [row.stock.id, resolveTraderDecision(row)] as const));
}

export function buildExplorerSearchTextByStockId(
  universe: StockIntelligenceModel[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of universe) {
    map.set(row.stock.id, buildExplorerSearchText(row));
  }
  return map;
}
