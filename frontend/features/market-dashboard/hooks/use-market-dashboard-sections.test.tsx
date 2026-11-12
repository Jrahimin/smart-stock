/** @vitest-environment jsdom */
import { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useMarketDashboard } from "./use-market-dashboard";
import { dashboardQueryKey, type DashboardSection } from "./dashboard-query-key";
import { clearStoredAuthTokens } from "@/lib/api/backend-api-client";

vi.mock("@/hooks/market/use-market-data-freshness", () => ({ useMarketDataFreshness: () => ({ data: { market_sync_id: "gA", market_status: "OPEN", trade_date: "2026-11-10" } }) }));
vi.mock("@/hooks/market/use-market-cache-coordinator", () => ({ useMarketCacheRefresh: () => vi.fn() }));
vi.mock("./use-dashboard-stocks-in-focus", () => ({ useDashboardStocksInFocus: () => ({ data: undefined, isLoading: false }) }));
afterEach(() => { cleanup(); clearStoredAuthTokens(); vi.unstubAllGlobals(); });

const sections = ["movers", "sectors", "heatmap", "market-alerts"] as const;
it.each(sections.flatMap(section => ["en", "bn"].flatMap(locale => ["overview", "section"].map(first => ({ section, locale: locale as "en" | "bn", first })))))("joins actual delivered $section identity and recovers in either arrival order ($locale, $first first)", async ({ section, locale, first }) => {
  clearStoredAuthTokens();
  const overview = { exchange: "DSE", market_sync_id: "gA", summaries: [], dsex_index: null, listed_stock_count: 4, session_trade_date: "2026-11-10" };
  const responses: Record<string, Record<string, unknown>> = {
    overview,
    movers: { market_sync_id: "gA", gainers: [{ stock_id: "s", symbol: "VISIBLE-MARKER", name: "Marker", exchange: "DSE", latest_price: 10, price_change_percent: 2, turnover: 100, volume: 50, trend_direction: "UPTREND" }], losers: [], turnover_leaders: [], volume_leaders: [] },
    sectors: { market_sync_id: "gA", sectors: [{ name: "VISIBLE-MARKER", change_percent: 1, stock_count: 2 }], top_gainer: null },
    heatmap: { market_sync_id: "gA", tiles: [{ stock_id: "s", symbol: "VISIBLE-MARKER", sector: "Bank", change_percent: 1, weight: 1, tone: "positive", latest_price: 10, turnover: 100, turnover_value: 100, liquidity_score: 1 }] },
    // Event date is independently owned: a prior-session company event remains
    // usable when the enclosing section belongs to this overview generation.
    "market-alerts": { market_sync_id: "gA", session_trade_date: "2026-11-10", items: [{ time: "2026-11-09", title: "Company event", description: "VISIBLE-MARKER", source_url: "https://example.com/event" }] },
    "market-sentiment": { market_sync_id: "gA", market_mood: "Unknown", signal_count: 0, price_backed_count: 4, turnover_value: null, insights: [], interpretation: null },
  };
  vi.stubGlobal("fetch", vi.fn((url: string) => {
    const name = new URL(url).pathname.split("/").at(-1)!;
    if (!responses[name]) throw new Error(`Unexpected path: ${url}`);
    return Promise.resolve(new Response(JSON.stringify({ success: true, data: responses[name] }), { status: 200, headers: { "Content-Type": "application/json" } }));
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const { result, unmount } = renderHook(() => useMarketDashboard({ locale }), { wrapper });
  const slice = () => {
    const model = result.current.model;
    return section === "movers" ? model.movers : section === "sectors" ? model.pulse.leadersContext : section === "heatmap" ? model.heatmapTiles : model.timeline;
  };
  await waitFor(() => expect(JSON.stringify(slice())).toContain("VISIBLE-MARKER"));
  // Update one body without changing the query key, just as a network miss can.
  const firstName: DashboardSection = first === "overview" ? "overview" : section;
  responses[firstName] = { ...responses[firstName], market_sync_id: "gB" };
  await act(async () => { await client.refetchQueries({ queryKey: dashboardQueryKey(firstName, "DSE", "gA"), exact: true }); });
  await waitFor(() => expect(JSON.stringify(slice())).not.toContain("VISIBLE-MARKER"));
  const secondName: DashboardSection = first === "overview" ? section : "overview";
  responses[secondName] = { ...responses[secondName], market_sync_id: "gB" };
  await act(async () => { await client.refetchQueries({ queryKey: dashboardQueryKey(secondName, "DSE", "gA"), exact: true }); });
  await waitFor(() => expect(JSON.stringify(slice())).toContain("VISIBLE-MARKER"));
  if (section === "market-alerts") expect(JSON.stringify(slice())).toContain("2026-11-09");
  unmount(); client.clear();
});
