import { describe, expect, it, vi, beforeEach } from "vitest";

import * as backendApi from "@/lib/api/backend-api-client";
import {
  syncMarketClientCachesOnBackendUpdate,
  invalidateMarketClientCaches,
} from "@/lib/market/market-cache-coordinator";

describe("isMarketApiCacheUrl", () => {
  it("matches market intelligence paths and stock market subresources", () => {
    expect(backendApi.isMarketApiCacheUrl("http://localhost:8000/api/v1/dashboard/movers?exchange=DSE")).toBe(true);
    expect(backendApi.isMarketApiCacheUrl("http://localhost:8000/api/v1/market/universe-rows?exchange=DSE")).toBe(true);
    expect(backendApi.isMarketApiCacheUrl("http://localhost:8000/api/v1/stock-details/DSE/GP/workspace")).toBe(true);
    expect(backendApi.isMarketApiCacheUrl("http://localhost:8000/api/v1/stocks/abc/prices?limit=100")).toBe(true);
  });

  it("does not match non-market paths", () => {
    expect(backendApi.isMarketApiCacheUrl("http://localhost:8000/api/v1/stocks/search?q=gp")).toBe(false);
    expect(backendApi.isMarketApiCacheUrl("http://localhost:8000/api/v1/wealth/snapshot")).toBe(false);
  });
});

describe("market cache coordinator sync path", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("clears market IndexedDB entries before TanStack invalidation", async () => {
    const clearMarketSpy = vi.spyOn(backendApi, "clearMarketBackendApiCache").mockResolvedValue();
    const clearAllSpy = vi.spyOn(backendApi, "clearBackendApiCache").mockResolvedValue();
    const invalidateSpy = vi.fn().mockResolvedValue(undefined);
    const queryClient = {
      invalidateQueries: invalidateSpy,
    } as unknown as import("@tanstack/react-query").QueryClient;

    await syncMarketClientCachesOnBackendUpdate(queryClient);

    expect(clearMarketSpy).toHaveBeenCalledTimes(1);
    expect(clearAllSpy).not.toHaveBeenCalled();
    expect(invalidateSpy).toHaveBeenCalled();
    expect(clearMarketSpy.mock.invocationCallOrder[0]).toBeLessThan(invalidateSpy.mock.invocationCallOrder[0]!);
  });

  it("manual refresh still clears all IndexedDB entries", async () => {
    const clearMarketSpy = vi.spyOn(backendApi, "clearMarketBackendApiCache").mockResolvedValue();
    const clearAllSpy = vi.spyOn(backendApi, "clearBackendApiCache").mockResolvedValue();
    const invalidateSpy = vi.fn().mockResolvedValue(undefined);
    const queryClient = {
      invalidateQueries: invalidateSpy,
    } as unknown as import("@tanstack/react-query").QueryClient;

    await invalidateMarketClientCaches(queryClient);

    expect(clearAllSpy).toHaveBeenCalledTimes(1);
    expect(clearMarketSpy).not.toHaveBeenCalled();
    expect(invalidateSpy).toHaveBeenCalled();
  });
});
