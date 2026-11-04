/** @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useMarketCacheSyncCoordinator } from "./use-market-cache-coordinator";
import { listUniverseRows } from "@/lib/api/market-universe-api";
import { getMarketFreshnessGeneration, resetMarketFreshnessGenerationForTests } from "@/lib/market/market-freshness-registry";

const freshness = vi.hoisted(() => ({
  data: { market_sync_id: "q2", decision_generation_id: "d1" as string | null,
    decision_status: "CURRENT", last_synced_at: "2026-11-04T10:00:00+06:00" },
}));
vi.mock("./use-market-data-freshness", () => ({ useMarketDataFreshness: () => freshness }));

// Minimal IndexedDB storage fixture; use the real cache client, cache coordinator and hook.
function installIndexedDb() {
  type Entry = { cacheKey: string };
  type Request = { result?: unknown; onsuccess?: () => void };
  const entries = new Map<string, Entry>();
  const requestFor = (result: unknown) => {
    const request: Request = { result };
    queueMicrotask(() => request.onsuccess?.());
    return request;
  };
  vi.stubGlobal("indexedDB", { open: () => requestFor({
    close() {},
    transaction() {
      const transaction = { oncomplete: () => {}, objectStore: () => ({
        get: (key: string) => requestFor(entries.get(key)),
        put: (entry: Entry) => { entries.set(entry.cacheKey, entry); },
        delete: (key: string) => { entries.delete(key); },
        openCursor() {
          const keys = [...entries.keys()];
          const request: Request = {};
          function next() {
            const key = keys.shift();
            request.result = key === undefined ? null : {
              value: entries.get(key),
              delete: () => entries.delete(key),
              continue: () => queueMicrotask(next),
            };
            request.onsuccess?.();
            if (key === undefined) transaction.oncomplete();
          }
          queueMicrotask(next);
          return request;
        },
      }) };
      setTimeout(() => transaction.oncomplete(), 0);
      return transaction;
    },
  }) });
  return entries;
}

afterEach(() => {
  cleanup();
  resetMarketFreshnessGenerationForTests();
  vi.unstubAllGlobals();
});

describe("market cache coordinator", () => {
  it("refreshes cached API reads on status-only transitions and rejects an invalidated decision", async () => {
    const entries = installIndexedDb();
    const network = vi.fn(async () => freshness.data.decision_status === "UNAVAILABLE"
      ? new Response('{"message":"Decision unavailable"}', { status: 503 })
      : Response.json({ success: true, data: { meta: {
          market_sync_id: "d1", quote_generation_id: "q2", decision_generation_id: "d1",
          decision_status: freshness.data.decision_status, decision_session_date: "2026-11-03",
        }, rows: [] } }));
    vi.stubGlobal("fetch", network);
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) =>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { rerender } = renderHook(() => useMarketCacheSyncCoordinator(), { wrapper });
    expect(getMarketFreshnessGeneration()).toBe("q2|d1|CURRENT");
    await listUniverseRows();
    await listUniverseRows();
    expect(entries.size).toBe(1);
    expect(network).toHaveBeenCalledTimes(1);

    for (const status of ["UPDATING", "CURRENT", "UNAVAILABLE"]) {
      const decisionId = status === "UNAVAILABLE" ? null : "d1";
      freshness.data = { ...freshness.data, decision_generation_id: decisionId, decision_status: status };
      rerender();
      await waitFor(() => expect(getMarketFreshnessGeneration()).toBe(`q2|${decisionId ?? ""}|${status}`));
      await waitFor(() => expect(entries.size).toBe(0));
      if (decisionId) {
        const result = await listUniverseRows();
        expect(result.meta).toMatchObject({ decision_status: status, decision_session_date: "2026-11-03" });
      } else {
        await expect(listUniverseRows()).rejects.toMatchObject({ status: 503 });
      }
    }
    expect(network).toHaveBeenCalledTimes(4);
  });
});
