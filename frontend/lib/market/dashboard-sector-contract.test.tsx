/** @vitest-environment jsdom */
import React, { type ReactNode } from "react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { entryFreshness } from "@/test-fixtures/current-entry-fixtures";
import { useMarketDashboard } from "@/features/market-dashboard/hooks/use-market-dashboard";
import { dashboardQueryKey } from "@/features/market-dashboard/hooks/dashboard-query-key";
import { getDashboardSectors } from "@/lib/api/market-dashboard-api";
import { loadDashboardCore, type DashboardCorePayload } from "@/lib/api/dashboard-server";
import { buildDashboardDehydratedState } from "./build-dashboard-dehydrated-state";
import { dashboardSectorGenerationToken } from "./dashboard-sector-generation";
import { evaluateMarketIndexedDbEntry, MARKET_INDEXEDDB_SCHEMA_VERSION } from "./market-indexeddb-cache";
import { frontendConfig } from "@/lib/frontend-config";
import { clearStoredAuthTokens } from "@/lib/api/backend-api-client";
import type { BackendDashboardOverviewDto, BackendDashboardSectorsDto } from "@/lib/api/backend-api-types";

const state = vi.hoisted(() => ({ freshness: {} as ReturnType<typeof entryFreshness> }));
vi.mock("@/hooks/market/use-market-data-freshness", () => ({ useMarketDataFreshness: () => ({ data: state.freshness, isLoading: false, isError: false }) }));
vi.mock("@/hooks/market/use-market-cache-coordinator", () => ({ useMarketCacheRefresh: () => vi.fn() }));
vi.mock("@/features/market-dashboard/hooks/use-dashboard-stocks-in-focus", () => ({ useDashboardStocksInFocus: () => ({ data: undefined, isLoading: false }) }));
vi.mock("@/features/market-dashboard/hooks/use-dashboard-movers", () => ({ useDashboardMovers: () => ({ data: undefined, isLoading: false }) }));
vi.mock("@/features/market-dashboard/hooks/use-dashboard-heatmap", () => ({ useDashboardHeatmap: () => ({ data: undefined, isLoading: false }) }));
vi.mock("@/features/market-dashboard/hooks/use-dashboard-market-alerts", () => ({ useDashboardMarketAlerts: () => ({ data: undefined, isLoading: false }) }));
vi.mock("@/features/market-dashboard/hooks/use-dashboard-market-sentiment", () => ({ useDashboardMarketSentiment: () => ({ data: undefined, isLoading: false }) }));
const fresh = (decision = "old") => entryFreshness({ market_sync_id: "q", quote_generation_id: "q", decision_generation_id: decision });
const sector = (quote = "q", decision = "old", name = "OLD BANK"): BackendDashboardSectorsDto => ({ market_sync_id: quote, decision_generation_id: decision,
  session_trade_date: "2026-11-11", leadership_status: "MEASURED", sectors: [{ name, change_percent: "1.2", stock_count: 3 }], top_gainer: null });
const overview = { market_sync_id: "q", session_trade_date: "2026-11-11", exchange: "DSE", summaries: [], dsex_index: null, listed_stock_count: 3 } as unknown as BackendDashboardOverviewDto;
const core = (): DashboardCorePayload => ({ freshness: fresh(), overview, sectors: sector(), movers: null, fetchedAt: Date.now(), lastSyncedAt: "q", overviewLastSyncedAt: null });
const json = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200 });
afterEach(() => { cleanup(); clearStoredAuthTokens(); vi.unstubAllGlobals(); delete (window as unknown as { indexedDB?: unknown }).indexedDB; });

it.each(["matching", "correction", "withdrawal", "wrong quote", "updating"])("SSR fan-out and hydration seed bind both IDs/status: %s", async kind => {
  const data = core();
  if (kind === "correction") data.freshness = fresh("new");
  if (kind === "withdrawal") data.freshness = { ...fresh(), decision_generation_id: null, decision_status: "UNAVAILABLE" };
  if (kind === "updating") data.freshness = { ...fresh(), decision_status: "UPDATING" };
  if (kind === "wrong quote") data.sectors = sector("other");
  vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve(json(url.includes("/freshness") ? data.freshness : url.includes("/overview") ? data.overview : url.includes("/sectors") ? data.sectors : null))));
  const result = await loadDashboardCore(); expect(result.status).toBe("ok");
  if (result.status !== "error") expect(result.data.sectors !== null).toBe(kind === "matching");
  const seed = buildDashboardDehydratedState(data);
  const entry = seed.queries.find(query => query.queryKey[1] === "sectors");
  expect(Boolean(entry)).toBe(kind === "matching");
  if (entry) expect(entry.queryKey).toEqual(dashboardQueryKey("sectors", "DSE", "q|old|CURRENT"));
});

function mockIdb(records: Map<string, unknown>) {
  const database = { close() {}, transaction() {
    const transaction = {} as IDBTransaction;
    const complete = () => queueMicrotask(() => transaction.oncomplete?.call(transaction, new Event("complete")));
    Object.assign(transaction, { objectStore: () => ({
      get(key: string) { const request = { result: records.get(key) } as IDBRequest; queueMicrotask(() => { request.onsuccess?.call(request, new Event("success")); complete(); }); return request; },
      put(payload: { cacheKey: string }) { records.set(payload.cacheKey, payload); complete(); }, delete(key: string) { records.delete(key); complete(); },
    }) }); return transaction;
  } } as unknown as IDBDatabase;
  Object.defineProperty(window, "indexedDB", { configurable: true, value: { open() { const request = { result: database } as IDBOpenDBRequest; queueMicrotask(() => request.onsuccess?.call(request, new Event("success"))); return request; } } });
}

it("uses an actual matching warm IDB hit, but never reuses the same quote after decision correction/withdrawal", async () => {
  const url = `${frontendConfig.apiBaseUrl}/dashboard/sectors?exchange=DSE`;
  const stored = { cacheKey: url, data: JSON.parse(JSON.stringify(sector())), scope: "market" as const, marketSchemaVersion: MARKET_INDEXEDDB_SCHEMA_VERSION, expiresAt: Date.now() + 600_000 };
  const records = new Map<string, unknown>([[url, stored]]); mockIdb(records);
  const fetcher = vi.fn().mockResolvedValue(json(sector("q", "new", "NEW BANK"))); vi.stubGlobal("fetch", fetcher);
  expect((await getDashboardSectors("DSE", "q|old|CURRENT")).sectors[0].name).toBe("OLD BANK");
  await getDashboardSectors("DSE", "q|old|CURRENT"); expect(fetcher).not.toHaveBeenCalled();
  expect((await getDashboardSectors("DSE", "q|new|CURRENT")).sectors[0].name).toBe("NEW BANK"); expect(fetcher).toHaveBeenCalledTimes(1);
  await getDashboardSectors("DSE", "q|new|CURRENT"); expect(fetcher).toHaveBeenCalledTimes(1);
  for (const token of ["q||UNAVAILABLE", "different|new|CURRENT", "q|new|UPDATING"]) {
    expect(evaluateMarketIndexedDbEntry({ ...stored, data: sector("q", "new") }, { expectedScope: "market", freshnessLastSyncedAt: token, requireGeneration: true, cacheKey: url })).toMatchObject({ status: "miss", reason: "generation" });
  }
});

it.each(["en", "bn"] as const)("mounted real sector query withholds late old bodies through correction, withdrawal and wrong quote (%s)", async locale => {
  state.freshness = fresh(); const initial = core();
  let response = sector(); let release: (() => void) | null = null;
  const fetcher = vi.fn((url: string) => url.includes("/overview") ? Promise.resolve(json(overview)) : new Promise<Response>(resolve => { release = () => resolve(json(response)); })); vi.stubGlobal("fetch", fetcher);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: Infinity } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  function View() { const { model } = useMarketDashboard({ locale, initialCore: initial }); return <span>{model.pulse.leadingSector?.name ?? "NO LEADER"}</span>; }
  const view = render(<View />, { wrapper }); expect(view.container.textContent).toBe("OLD BANK");
  state.freshness = fresh("new"); view.rerender(<View />);
  expect(view.container.textContent).toBe("NO LEADER"); await waitFor(() => expect(release).not.toBeNull());
  await act(async () => { release!(); });
  await waitFor(() => expect(client.getQueryData<BackendDashboardSectorsDto>(dashboardQueryKey("sectors", "DSE", "q|new|CURRENT"))?.decision_generation_id).toBe("old"));
  expect(view.container.textContent).toBe("NO LEADER");
  response = sector("q", "new", "NEW BANK");
  let request!: Promise<void>; release = null;
  await act(async () => { request = client.refetchQueries({ queryKey: dashboardQueryKey("sectors", "DSE", "q|new|CURRENT"), exact: true }); });
  await waitFor(() => expect(release).not.toBeNull()); await act(async () => { release!(); await request; });
  await waitFor(() => expect(view.container.textContent).toBe("NEW BANK"));
  release = null; state.freshness = { ...fresh("new"), decision_generation_id: null, decision_status: "UNAVAILABLE" }; view.rerender(<View />);
  expect(view.container.textContent).toBe("NO LEADER");
  await waitFor(() => expect(release).not.toBeNull()); await act(async () => { release!(); }); expect(view.container.textContent).toBe("NO LEADER");
  release = null; state.freshness = { ...fresh("new"), market_sync_id: "other", quote_generation_id: "other" }; view.rerender(<View />);
  expect(view.container.textContent).toBe("NO LEADER");
  await waitFor(() => expect(release).not.toBeNull()); await act(async () => { release!(); });
  expect(view.container.textContent).toBe("NO LEADER");
  expect(client.getQueryCache().getAll().some(query => query.queryKey[1] === "sectors" && query.queryKey[3] === dashboardSectorGenerationToken(state.freshness))).toBe(true);
  view.unmount(); client.clear();
});
