import { describe, expect, it } from "vitest";

import {
  buildExplorerSearchText,
  createDefaultExplorerTableFilters,
  filterExplorerUniverseRows,
  hasActiveExplorerTableFilters,
  matchesExplorerTableSearch,
} from "@/features/stock-workspace/lib/stock-explorer-filters";
import type { StockIntelligenceModel } from "@/lib/market/market-intelligence-types";
import type { ResolvedTraderDecision } from "@/lib/market/trader-decision";

function makeStock(overrides: {
  id: string;
  symbol: string;
  name: string;
  volume?: number;
  averageVolume?: number;
  volumeBehavior?: string;
}): StockIntelligenceModel {
  return {
    stock: {
      id: overrides.id,
      exchange: "DSE",
      symbol: overrides.symbol,
      name: overrides.name,
      sector: "Bank",
      category: "A",
      isin: null,
      is_active: true,
      should_fetch_details: true,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    latestPrice: 100,
    previousClose: 98,
    priceChange: 2,
    priceChangePercent: 2,
    volume: overrides.volume ?? 1000,
    averageVolume: overrides.averageVolume ?? 1000,
    turnover: 1,
    rsi: 55,
    trend: "BULLISH",
    signal: "HOLD",
    confidence: 60,
    riskLabel: "MEDIUM",
    opportunityScore: 50,
    reason: "test",
    reasonCode: null,
    levels: null,
    scanner: null,
    traderDecision: null,
    volumeBehavior: overrides.volumeBehavior ?? "NORMAL",
  } as unknown as StockIntelligenceModel;
}

function makeDecision(recommendation: ResolvedTraderDecision["recommendation"]): ResolvedTraderDecision {
  return {
    recommendation,
    confidence: 60,
    riskLabel: "MEDIUM",
    reason: "test",
    reasonCode: null,
    opportunityScore: null,
    entryTiming: null,
    entryCondition: null,
    source: "unavailable",
  };
}

describe("stock explorer table filters", () => {
  const gp = makeStock({ id: "1", symbol: "GP", name: "Grameenphone Ltd" });
  const batbc = makeStock({ id: "2", symbol: "BATBC", name: "British American Tobacco" });
  const brac = makeStock({
    id: "3",
    symbol: "BRACBANK",
    name: "BRAC Bank Limited",
    volume: 50,
    averageVolume: 500,
    volumeBehavior: "THIN",
  });

  const universe = [gp, batbc, brac];
  const decisionByStockId = new Map([
    ["1", makeDecision("WAIT")],
    ["2", makeDecision("POTENTIAL_BUY")],
    ["3", makeDecision("SELL")],
  ]);
  const searchTextByStockId = new Map(universe.map((row) => [row.stock.id, buildExplorerSearchText(row)]));

  it("matches symbol and company name case-insensitively", () => {
    expect(matchesExplorerTableSearch("gp grameenphone ltd", "GP")).toBe(true);
    expect(matchesExplorerTableSearch("gp grameenphone ltd", "grameen")).toBe(true);
    expect(matchesExplorerTableSearch("gp grameenphone ltd", "BAT")).toBe(false);
  });

  it("filters locally by symbol/company without sector-only matches", () => {
    const filtered = filterExplorerUniverseRows({
      universe,
      decisionByStockId,
      searchTextByStockId,
      filters: { ...createDefaultExplorerTableFilters(), tableSearch: "british" },
      watchedStockIds: new Set(),
      holdingStockIds: new Set(),
    });

    expect(filtered.map((row) => row.stock.symbol)).toEqual(["BATBC"]);
  });

  it("combines table search with action, volume, watchlist, and holdings filters", () => {
    const filtered = filterExplorerUniverseRows({
      universe,
      decisionByStockId,
      searchTextByStockId,
      filters: {
        tableSearch: "bank",
        signalFilter: "SELL",
        volumeFilter: "THIN",
        portfolioScope: "WATCHLIST",
      },
      watchedStockIds: new Set(["3"]),
      holdingStockIds: new Set(),
    });

    expect(filtered.map((row) => row.stock.symbol)).toEqual(["BRACBANK"]);
  });

  it("reports active table filters and default reset state", () => {
    expect(hasActiveExplorerTableFilters(createDefaultExplorerTableFilters())).toBe(false);
    expect(
      hasActiveExplorerTableFilters({
        ...createDefaultExplorerTableFilters(),
        tableSearch: "GP",
      }),
    ).toBe(true);
  });
});
