/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from "vitest";
import { backendApiGetMarket, clearStoredAuthTokens } from "@/lib/api/backend-api-client";
import { frontendConfig } from "@/lib/frontend-config";
import { marketPresentationCacheKey, MARKET_INDEXEDDB_SCHEMA_VERSION } from "./market-indexeddb-cache";

afterEach(() => { clearStoredAuthTokens(); vi.unstubAllGlobals(); delete (window as unknown as { indexedDB?: unknown }).indexedDB; });

it("revises only persisted full Pulse and briefing keys, retaining HTTP identity and summary keys", () => {
  for (const path of ["/market/pulse", "/market/pulse/briefing"]) {
    const url = `${frontendConfig.apiBaseUrl}${path}?exchange=DSE`;
    expect(marketPresentationCacheKey(url)).toBe(`${url}#pulse-sector-exact-v5`);
  }
  for (const path of ["/market/pulse/summary", "/market/freshness", "/dashboard/overview"]) {
    const url = `${frontendConfig.apiBaseUrl}${path}?exchange=DSE`;
    expect(marketPresentationCacheKey(url)).toBe(url);
  }
});

it("uses a new persisted key for ten dashboard movers while preserving the request URL", () => {
  const url = `${frontendConfig.apiBaseUrl}/dashboard/movers?exchange=DSE`;
  expect(marketPresentationCacheKey(url)).toBe(`${url}#movers-top10-v1`);
});

it("misses the old same-generation verdict once, then reuses the new IndexedDB record without another HTTP call", async () => {
  const url = `${frontendConfig.apiBaseUrl}/market/pulse/briefing?exchange=DSE`;
  const records = new Map<string, unknown>([[url, { cacheKey: url, expiresAt: Date.now() + 60000, scope: "market", marketSchemaVersion: MARKET_INDEXEDDB_SCHEMA_VERSION, data: { market_sync_id: "gA", marker: "old-float-verdict" } }]]);
  records.set(`${url}#pulse-sector-exact-v3`, records.get(url));
  const database = {
    close: vi.fn(),
    transaction() {
      const transaction = {} as IDBTransaction;
      const complete = () => queueMicrotask(() => transaction.oncomplete?.call(transaction, new Event("complete")));
      Object.assign(transaction, { objectStore: () => ({
        get(key: string) {
          const request = { result: records.get(key) } as IDBRequest;
          queueMicrotask(() => { request.onsuccess?.call(request, new Event("success")); complete(); });
          return request;
        },
        put(payload: { cacheKey: string }) { records.set(payload.cacheKey, payload); complete(); },
        delete(key: string) { records.delete(key); complete(); },
      }) });
      return transaction;
    },
  } as unknown as IDBDatabase;
  Object.defineProperty(window, "indexedDB", { configurable: true, value: { open() {
    const request = { result: database } as IDBOpenDBRequest;
    queueMicrotask(() => request.onsuccess?.call(request, new Event("success")));
    return request;
  } } });
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: { market_sync_id: "gA", marker: "exact-verdict" } }), { status: 200, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetcher);
  const first = await backendApiGetMarket("/market/pulse/briefing", { exchange: "DSE" });
  const second = await backendApiGetMarket("/market/pulse/briefing", { exchange: "DSE" });
  expect(first).toEqual({ market_sync_id: "gA", marker: "exact-verdict" }); expect(second).toEqual(first);
  expect(fetcher).toHaveBeenCalledTimes(1); expect(fetcher.mock.calls[0][0]).toBe(url);
  expect(records.has(url)).toBe(true); expect(records.has(marketPresentationCacheKey(url))).toBe(true);
  expect(records.has(`${url}#pulse-sector-exact-v3`)).toBe(true);
});
