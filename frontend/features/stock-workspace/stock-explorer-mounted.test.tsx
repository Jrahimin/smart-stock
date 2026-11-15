/** @vitest-environment jsdom */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import rowFixture from "@/test-fixtures/practicality-universe-row.json";
import { StockExplorerView } from "@/features/stock-workspace/stock-explorer-view";
import type { BackendScoredUniverseRowDto } from "@/lib/api/backend-api-types";

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/lib/api/market-universe-api", () => ({ listUniverseRows: api }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@/hooks/market/use-market-data-freshness", () => ({ useMarketDataFreshness: () => ({ data: {
  exchange: "DSE", decision_generation_id: "qa-decision", quote_generation_id: "qa-quote", market_sync_id: "qa-quote", decision_status: "CURRENT",
  market_status: "HOLIDAY", snapshot_interval_minutes: 15, dashboard_cache_ttl_seconds: 600,
} }) }));
vi.mock("@/hooks/market/use-market-cache-coordinator", () => ({ useMarketCacheRefresh: () => vi.fn() }));
vi.mock("@/features/watchlist/hooks/use-user-watchlist", () => ({ useUserWatchlist: () => ({ watchedStockIds: new Set(), holdingStockIds: new Set() }) }));
vi.mock("@/features/watchlist/components/watchlist-star-toggle", () => ({ WatchlistStarToggle: () => <span /> }));
vi.mock("@/components/layout/workspace-page-hero", () => ({ WorkspacePageHero: ({ children, subtitle }: { children: React.ReactNode; subtitle: string }) => <><p>{subtitle}</p>{children}</> }));
// jsdom has no layout. Keep the production table/filter and provide a viewport.
vi.mock("@tanstack/react-virtual", () => ({ useVirtualizer: ({ count }: { count: number }) => ({
  getVirtualItems: () => Array.from({ length: Math.min(count, 15) }, (_, index) => ({ index, key: index, start: index*54, end: (index+1)*54, size: 54 })),
  getTotalSize: () => count*54, measureElement: vi.fn(),
}) }));

describe("Explorer mounted adapters, boundary and table", () => {
  it("commits rapid symbol/company search, keeps focus and resets 426 rows", async () => {
    HTMLElement.prototype.scrollTo = vi.fn();
    const rows = Array.from({ length: 426 }, (_, index) => ({ ...JSON.parse(JSON.stringify(rowFixture)),
      decision: { ...rowFixture.decision, canonical: { ...rowFixture.decision.canonical, stock_id: `stock-${index}` } },
      stock: { ...rowFixture.stock, id: `stock-${index}`, symbol: index === 425 ? "BSRMSTEEL" : `TEST${index}`, name: index === 424 ? "Unique Company" : `Public Company ${index}` },
    })) as unknown as BackendScoredUniverseRowDto[];
    api.mockResolvedValue({ meta: { exchange: "DSE", listed_stock_count: 426, decision_generation_id: "qa-decision", quote_generation_id: "qa-quote", decision_status: "CURRENT", decision_session_date: "2026-11-12" }, rows });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const view = render(<QueryClientProvider client={client}><StockExplorerView locale="en" /></QueryClientProvider>);
    await waitFor(() => expect(screen.getByText(/426 stocks/)).toBeTruthy());
    const search = screen.getByRole("textbox");
    search.focus();
    for (const value of ["BS", "BSRM", "BSRMSTEEL"]) fireEvent.change(search, { target: { value } });
    await waitFor(() => expect(screen.getByText("BSRMSTEEL")).toBeTruthy());
    expect(screen.queryByText("TEST0")).toBeNull();
    expect(document.activeElement).toBe(search);
    fireEvent.change(search, { target: { value: "Unique Company" } });
    await waitFor(() => expect(screen.getByText("TEST424")).toBeTruthy());
    expect(screen.queryByText("BSRMSTEEL")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /reset/i }));
    await waitFor(() => expect(screen.getByText(/426 stocks/)).toBeTruthy());
    expect((search as HTMLInputElement).value).toBe("");
    view.unmount(); client.clear();
  });
});
