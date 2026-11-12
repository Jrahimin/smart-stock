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
import { shortTradeDate } from "@/lib/formatters/trader-formatters";

const state = vi.hoisted(() => ({ freshness: { exchange: "DSE", market_sync_id: "gA", trade_date: "2026-11-10", market_status: "OPEN", data_state: "LIVE", dashboard_cache_ttl_seconds: 60, last_synced_at: null as string | null } }));
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
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); clearStoredAuthTokens(); vi.unstubAllGlobals(); vi.useRealTimers(); Object.assign(state.freshness, { market_sync_id: "gA", trade_date: "2026-11-10", last_synced_at: null }); });

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


it.each(["en", "bn"].flatMap(locale => [{ quoteDate: "2026-11-12", activity: null }, { quoteDate: "2026-11-10", activity: null }, { quoteDate: "2026-11-12", activity: 250 }, { quoteDate: "2026-11-12", activity: 0 }].map(test => ({ locale: locale as "en" | "bn", ...test }))))("keeps independently dated quote breadth, index and activity through actual hooks ($locale, $quoteDate, activity=$activity)", async ({ locale, quoteDate, activity }) => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-12T05:00:00Z"));
  Object.assign(state.freshness, { trade_date: quoteDate, market_sync_id: "gA" });
  const body = overview("gA"); body.session_trade_date = quoteDate;
  if (activity !== null) body.summaries.push({ ...body.summaries[0], trade_date: quoteDate, index_close: null, index_change: null, index_change_percent: null, total_volume: activity, total_turnover: 500 });
  body.breadth = { ...breadth("gA"), as_of_date: quoteDate, advancing: 111, declining: 29, unchanged: 2, known_count: 142, denominator: 142, cohort_count: 142 };
  body.last_synced_at = "2026-11-12T04:59:00Z";
  const reading = sentiment("gA"); reading.interpretation = { ...reading.interpretation!, as_of_date: quoteDate, code: "BREADTH_ONLY", index_change_percent: null, volume_vs_average: activity === null ? null : String(activity / 100), breadth: body.breadth };
  vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve(new Response(JSON.stringify({ success: true,
    data: new URL(url).pathname.endsWith("/dashboard/overview") ? body : reading }), { status: 200, headers: { "Content-Type": "application/json" } }))));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }); clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  let current!: MarketDashboardModel;
  function View() { const data = useMarketDashboard({ locale }); current = data.model; return <><MarketOverview model={current} freshness={data.freshness} copy={getTerminalCopy(locale)} locale={locale} loading={false} leadersLoading={false} /><InsightSidebar model={current} insights={current.insights} intraday={current.isIntraday} copy={getTerminalCopy(locale)} locale={locale} /></>; }
  const { container } = render(<View />, { wrapper });
  await waitFor(() => expect(container.querySelector(".sw-insight-market-mood")).not.toBeNull());
  expect(current.breadth.advancing).toBe(111); expect(current.pulse.latestTradeDate).toBe(quoteDate);
  expect(current.pulse.indexTradeDate).toBe("2026-11-10"); expect(current.pulse.activityTradeDate).toBe(activity === null ? "2026-11-10" : quoteDate);
  expect(current.isIntraday).toBe(quoteDate === "2026-11-12"); expect(current.activityIsIntraday).toBe(activity !== null);
  if (activity !== null) {
    expect(current.pulse.volumeContext.primaryValue).toContain(String(activity));
    expect(current.pulse.volumeContext.ratioVsAvg).toBe(`${(activity / 100).toFixed(2)}x`);
    expect(container.querySelector(".sw-insight-market-mood")?.textContent).not.toMatch(/DSEX [+-]/);
  }
  expect(container.querySelector(".sw-index-value")?.textContent).toBe("5,000.00");
  expect(container.querySelector(".sw-breadth-labels .sw-positive b")?.textContent).toBe("111");
  if (quoteDate === "2026-11-12") {
    expect(container.querySelector(".sw-index-date")?.textContent).toContain(shortTradeDate("2026-11-10", locale));
    if (activity === null) {
      const activityMetrics = [...container.querySelectorAll(".sw-metric")].filter(node => [getTerminalCopy(locale).volume, getTerminalCopy(locale).turnover].includes(node.querySelector("dt")?.textContent ?? ""));
      expect(activityMetrics).toHaveLength(2);
      for (const metric of activityMetrics) expect(metric.textContent).toContain(shortTradeDate("2026-11-10", locale));
    }
    expect(container.textContent).not.toContain(locale === "en" ? "prices are not in" : "দাম এখনও আসেনি");
    expect(container.textContent).not.toContain(locale === "en" ? "DSEX still fell" : "তবু DSEX সূচক কমেছে");
  } else expect(container.textContent).toContain(locale === "en" ? "prices are not in" : "দাম এখনও আসেনি");
});

it.each(["en", "bn"].flatMap(locale => ["new-overview", "old-overview", "missing-own-time", "legacy"].map(mode => ({ locale: locale as "en" | "bn", mode }))))("timestamps actual overview bodies without borrowing another same-day generation ($locale, $mode)", async ({ locale, mode }) => {
  const older = "2026-11-12T04:03:00Z", newer = "2026-11-12T06:49:00Z";
  Object.assign(state.freshness, { trade_date: "2026-11-12", market_sync_id: mode === "old-overview" ? "gB" : "gA", last_synced_at: mode === "old-overview" ? newer : older });
  const body = overview(mode === "old-overview" ? "gA" : "gB"); body.session_trade_date = "2026-11-12";
  body.last_synced_at = mode === "new-overview" ? newer : mode === "old-overview" ? older : null;
  if (mode === "legacy") delete body.market_sync_id;
  vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve(new Response(JSON.stringify({ success: true,
    data: new URL(url).pathname.endsWith("/dashboard/overview") ? body : sentiment("gA") }), { status: 200, headers: { "Content-Type": "application/json" } }))));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }); clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  function View() { const data = useMarketDashboard({ locale }); return <MarketOverview model={data.model} freshness={data.freshness} copy={getTerminalCopy(locale)} locale={locale} loading={false} leadersLoading={false} />; }
  const { container } = render(<View />, { wrapper });
  await waitFor(() => expect(container.querySelector(".sw-index-value")?.textContent).toBe("5,000.00"));
  const times = [...container.querySelectorAll(".sw-session time")].map(node => node.getAttribute("datetime"));
  if (mode === "missing-own-time") { expect(times).not.toContain(older); expect(times).not.toContain(newer); }
  else { const expected = mode === "new-overview" ? newer : older; expect(times).toContain(expected); expect(times).not.toContain(expected === older ? newer : older); }
  expect(container.querySelector(".sw-session-state")?.textContent).toContain(getTerminalCopy(locale).open);
});
