/** @vitest-environment jsdom */
import React, { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useMarketDashboard } from "./use-market-dashboard";
import { dashboardQueryKey } from "./dashboard-query-key";
import { MarketOverview } from "../components/market-overview";
import { InsightSidebar } from "../components/insight-sidebar";
import { getTerminalCopy } from "../terminal-copy";
import { clearStoredAuthTokens } from "@/lib/api/backend-api-client";
import type { BackendDashboardMarketSentimentDto, BackendDashboardOverviewDto } from "@/lib/api/backend-api-types";
import type { MarketDashboardModel } from "../types/market-dashboard-types";

const state = vi.hoisted(() => ({ freshness: { exchange: "DSE", market_sync_id: "gA", trade_date: "2026-11-10", market_status: "OPEN", data_state: "LIVE", dashboard_cache_ttl_seconds: 60 } }));
vi.mock("@/hooks/market/use-market-data-freshness", () => ({ useMarketDataFreshness: () => ({ data: state.freshness, isLoading: false, isError: false }) }));
vi.mock("@/hooks/market/use-market-cache-coordinator", () => ({ useMarketCacheRefresh: () => vi.fn() }));
vi.mock("./use-dashboard-heatmap", () => ({ useDashboardHeatmap: () => ({ data: undefined, isLoading: false }) }));
vi.mock("./use-dashboard-market-alerts", () => ({ useDashboardMarketAlerts: () => ({ data: undefined, isLoading: false }) }));
vi.mock("./use-dashboard-movers", () => ({ useDashboardMovers: () => ({ data: undefined, isLoading: false }) }));
vi.mock("./use-dashboard-sectors", () => ({ useDashboardSectors: () => ({ data: undefined, isLoading: false }) }));
vi.mock("./use-dashboard-stocks-in-focus", () => ({ useDashboardStocksInFocus: () => ({ data: undefined, isLoading: false }) }));

function breadth(generation: string) {
  return { cohort: "ACTIVE_VALID_OHLC", source: "daily_prices", as_of_date: "2026-11-10", neutral_band_percent: 0,
    advancing: generation === "gA" ? 1 : 3, declining: generation === "gA" ? 3 : 1, unchanged: 0,
    known_count: 4, unknown_count: 0, cohort_count: 4, denominator: 4 };
}
function overview(generation: string): BackendDashboardOverviewDto {
  const counts = breadth(generation), move = generation === "gA" ? "-0.5" : "1", volume = generation === "gA" ? 100 : 118;
  return { exchange: "DSE", market_sync_id: generation, session_trade_date: "2026-11-10", listed_stock_count: 4, breadth: counts,
    summaries: [{ trade_date: "2026-11-10", exchange: "DSE", index_name: "DSEX", index_close: "5000", index_change: move, index_change_percent: move,
      total_volume: volume, total_turnover: null, advancing_issues: counts.advancing, declining_issues: counts.declining, unchanged_issues: 0, data_quality_flag: "OK" }],
    dsex_index: { index_name: "DSEX", trade_date: "2026-11-10", market_status: "OPEN", index_close: "5000", index_change: move, index_change_percent: move,
      day_open: "5000", day_high: "5050", day_low: "4950", range_52w_low: "4500", range_52w_high: "5500", range_position_percent: "50",
      total_volume: volume, total_turnover: null, total_trades: null, advancing_issues: counts.advancing, declining_issues: counts.declining, unchanged_issues: 0, source: "FIXTURE" } } as BackendDashboardOverviewDto;
}
function sentiment(generation: string): BackendDashboardMarketSentimentDto {
  return { exchange: "DSE", market_sync_id: generation, session_trade_date: "2026-11-10", market_mood: "Unknown", signal_count: 0, price_backed_count: 4,
    turnover_value: null, has_partial_data: false, insights: [], interpretation: { code: generation === "gA" ? "ALIGNED_DOWN" : "ALIGNED_UP", as_of_date: "2026-11-10",
      index_change_percent: generation === "gA" ? "-0.5" : "1", volume_vs_average: generation === "gA" ? "0.8" : "1.18", volume_average_sessions: 29, breadth: breadth(generation) } };
}
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); clearStoredAuthTokens(); vi.unstubAllGlobals(); });

it.each([["en", "market-sentiment"], ["bn", "market-sentiment"], ["en", "overview"], ["bn", "overview"]] as const)("real section hooks/API wrappers withhold mixed same-day updates and restore matching IDs (%s, %s first)", async (locale, first) => {
  clearStoredAuthTokens();
  let overviewResponse = overview("gA"), sentimentResponse = sentiment("gA");
  const fetcher = vi.fn((url: string) => {
    const path = new URL(url).pathname;
    const data = path.endsWith("/dashboard/overview") ? overviewResponse : path.endsWith("/dashboard/market-sentiment") ? sentimentResponse : undefined;
    if (!data) throw new Error(`Unexpected mocked path ${path}`);
    return Promise.resolve(new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "Content-Type": "application/json" } }));
  }); vi.stubGlobal("fetch", fetcher);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }); clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  let current!: MarketDashboardModel;
  function View() {
    const { model } = useMarketDashboard({ locale }); current = model;
    return <><MarketOverview model={model} copy={getTerminalCopy(locale)} locale={locale} loading={false} leadersLoading={false} /><InsightSidebar model={model} insights={model.insights} copy={getTerminalCopy(locale)} locale={locale} /></>;
  }
  const { container } = render(<View />, { wrapper });
  await waitFor(() => expect(container.querySelector(".sw-insight-market-mood")).not.toBeNull());
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(locale === "en" ? "More stocks fell" : "বেশি শেয়ারের দাম কমেছে");
  if (first === "overview") overviewResponse = overview("gB"); else sentimentResponse = sentiment("gB");
  await act(async () => { await client.refetchQueries({ queryKey: dashboardQueryKey(first, "DSE", "gA"), exact: true }); });
  await waitFor(() => expect(client.getQueryData<BackendDashboardOverviewDto>(dashboardQueryKey(first, "DSE", "gA"))?.market_sync_id).toBe("gB"));
  await waitFor(() => expect(container.querySelector(".sw-insight-market-mood")).toBeNull());
  // The actual network miss admitted B under the A key. Composition checks the
  // delivered identities instead of treating the key/calendar date as identity.
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(locale === "en" ? "The session at a glance" : "সেশনের বাজারচিত্র");
  expect(current.pulse.volumeContext.priorAverageSessions).toBeUndefined();
  expect(current.pulse.volumeContext.ratioVsAvg).not.toBe("1.18x");
  expect(container.querySelector(".sw-breadth-labels .sw-positive b")?.textContent).toBe(first === "overview" ? "3" : "1");
  expect(container.querySelector(".sw-index > b")?.textContent).toContain(first === "overview" ? "+1%" : "-0.5%");
  overviewResponse = overview("gB"); sentimentResponse = sentiment("gB");
  const second = first === "overview" ? "market-sentiment" : "overview";
  await act(async () => { await client.refetchQueries({ queryKey: dashboardQueryKey(second, "DSE", "gA"), exact: true }); });
  await waitFor(() => expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(locale === "en" ? "More stocks rose" : "বেশি শেয়ারের দাম বেড়েছে"));
  expect(container.querySelector(".sw-insight-market-mood")?.textContent).toContain("DSEX +1.00%");
  expect(current.pulse.volumeContext.ratioVsAvg).toBe("1.18x"); expect(current.pulse.volumeContext.priorAverageSessions).toBe(29);
  expect(container.querySelector(".sw-breadth-labels .sw-positive b")?.textContent).toBe("3");
  expect(client.getQueryData<BackendDashboardOverviewDto>(dashboardQueryKey("overview", "DSE", "gA"))?.market_sync_id).toBe("gB");
  expect(client.getQueryData<BackendDashboardMarketSentimentDto>(dashboardQueryKey("market-sentiment", "DSE", "gA"))?.market_sync_id).toBe("gB");
  expect(fetcher).toHaveBeenCalledTimes(4);
});

it.each(["overview", "sentiment"] as const)("keeps the established date-compatible reading when the legacy %s has no generation ID", async (missing) => {
  clearStoredAuthTokens();
  const overviewResponse = overview("gA"), sentimentResponse = sentiment("gA");
  if (missing === "overview") delete overviewResponse.market_sync_id; else delete sentimentResponse.market_sync_id;
  vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve(new Response(JSON.stringify({ success: true,
    data: new URL(url).pathname.endsWith("/dashboard/overview") ? overviewResponse : sentimentResponse }), { status: 200, headers: { "Content-Type": "application/json" } }))));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }); clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  function View() {
    const { model } = useMarketDashboard({ locale: "en" });
    return <><MarketOverview model={model} copy={getTerminalCopy("en")} locale="en" loading={false} leadersLoading={false} /><InsightSidebar model={model} insights={model.insights} copy={getTerminalCopy("en")} locale="en" /></>;
  }
  const { container } = render(<View />, { wrapper });
  await waitFor(() => expect(container.querySelector(".sw-insight-market-mood")).not.toBeNull());
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("More stocks fell");
  expect(container.querySelector(".sw-insight-market-mood")?.textContent).toContain("DSEX -0.50%");
});
