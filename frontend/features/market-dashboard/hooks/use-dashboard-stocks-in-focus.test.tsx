/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import { type ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useDashboardStocksInFocus } from "./use-dashboard-stocks-in-focus";
import { ENTRY_NOW, entryFreshness, entryUniverse } from "@/test-fixtures/current-entry-fixtures";
import type { BackendUniverseRowsDto } from "@/lib/api/backend-api-types";

const requests = vi.hoisted(() => ({ universe: vi.fn(), freshness: vi.fn() }));
vi.mock("@/lib/api/market-universe-api", () => ({ listUniverseRows: (...args: unknown[]) => requests.universe(...args) }));
vi.mock("@/lib/api/market-data-api", () => ({ getMarketFreshness: () => requests.freshness() }));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });

it("bounds Dashboard as the sole universe observer across an unchanged-ID positive expiry", async () => {
  vi.useFakeTimers(); vi.setSystemTime(ENTRY_NOW);
  const raw = entryUniverse(); raw.rows[0].display_quote.max_age_seconds = 30;
  const data = { ...raw, rows: [{ ...raw.rows[0], technical_snapshot: { trend: "UPTREND", latest_price: 100, latest_trade_date: "2026-11-10", volume: 1000, average_volume: 900, rsi: 55 }, session: { latest_trade_date: "2026-11-10", volume: 1000 }, decision: { ...raw.rows[0].decision, confidence: 70, reason: "Published thesis", opportunity_score: 60, risk_label: "LOW" } }] } as unknown as BackendUniverseRowsDto;
  requests.universe.mockResolvedValue(data); requests.freshness.mockResolvedValue(entryFreshness());
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const generation = "quote-1|decision-1|CURRENT";
  client.setQueryData(["market-freshness", "DSE"], entryFreshness());
  client.setQueryData(["market-universe-rows", "price-basis-v2", "DSE", 500, generation], data);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = renderHook(() => useDashboardStocksInFocus({ generation, staleTimeMs: 600_000, refetchIntervalMs: 600_000 }), { wrapper });
  expect(hook.result.current.data?.signals[0].entryApplicability?.status).toBe("APPLICABLE");
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  expect(hook.result.current.data?.signals[0].entryApplicability).toBeNull();
  expect(requests.universe).toHaveBeenCalledWith("DSE", generation, true);
});
