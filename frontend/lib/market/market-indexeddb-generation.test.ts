import { describe, expect, it, vi, beforeEach } from "vitest";

import * as backendApi from "@/lib/api/backend-api-client";
import { resolveMarketTanStackRootsForUrl } from "@/lib/market/market-cache-url-registry";
import {
  evaluateMarketIndexedDbEntry,
  MARKET_INDEXEDDB_SCHEMA_VERSION,
  type MarketIndexedDbPayload,
} from "@/lib/market/market-indexeddb-cache";
import {
  hasMarketGenerationField,
  responseMatchesMarketFreshness,
} from "@/lib/market/market-generation";
import {
  getMarketFreshnessGeneration,
  resetMarketFreshnessGenerationForTests,
  setMarketFreshnessGeneration,
} from "@/lib/market/market-freshness-registry";
import {
  handleStaleMarketIndexedDbEntry,
  reconcileGenerationAwareMarketQueries,
} from "@/lib/market/market-cache-coordinator";

const FRESHNESS = "2026-07-12T10:00:00+06:00";
const STALE_FRESHNESS = "2026-07-11T10:00:00+06:00";
const BASE_URL = "http://localhost:8000/api/v1";

function buildMarketPayload<T>(data: T, overrides: Partial<MarketIndexedDbPayload<T>> = {}) {
  return {
    cacheKey: `${BASE_URL}/market/pulse/summary?exchange=DSE`,
    expiresAt: Date.now() + 60_000,
    data,
    scope: "market" as const,
    marketSchemaVersion: MARKET_INDEXEDDB_SCHEMA_VERSION,
    ...overrides,
  };
}

describe("market generation validation", () => {
  it("detects generation fields on market payloads", () => {
    expect(hasMarketGenerationField({ last_synced_at: FRESHNESS })).toBe(true);
    expect(hasMarketGenerationField({ session_trade_date: "2026-07-12" })).toBe(false);
  });

  it("treats missing generation metadata as a mismatch when freshness is known", () => {
    expect(responseMatchesMarketFreshness({ last_synced_at: null }, FRESHNESS)).toBe(false);
    expect(responseMatchesMarketFreshness({ last_synced_at: STALE_FRESHNESS }, FRESHNESS)).toBe(false);
  });

  it("allows responses without generation metadata to pass validation", () => {
    expect(responseMatchesMarketFreshness({ session_trade_date: "2026-07-12" }, FRESHNESS)).toBe(true);
  });

  it("accepts matching generation metadata", () => {
    expect(responseMatchesMarketFreshness({ last_synced_at: FRESHNESS }, FRESHNESS)).toBe(true);
  });
});

describe("evaluateMarketIndexedDbEntry", () => {
  beforeEach(() => {
    resetMarketFreshnessGenerationForTests();
  });

  it("returns a hit for matching generation and schema version", () => {
    setMarketFreshnessGeneration(FRESHNESS);
    const verdict = evaluateMarketIndexedDbEntry(
      buildMarketPayload({ last_synced_at: FRESHNESS, focus_stocks: [] }),
      { expectedScope: "market", freshnessLastSyncedAt: FRESHNESS },
    );

    expect(verdict).toEqual({
      status: "hit",
      data: { last_synced_at: FRESHNESS, focus_stocks: [] },
    });
  });

  it("rejects legacy market entries without schema version", () => {
    const verdict = evaluateMarketIndexedDbEntry(
      buildMarketPayload(
        { last_synced_at: FRESHNESS },
        { marketSchemaVersion: undefined },
      ),
      { expectedScope: "market", freshnessLastSyncedAt: FRESHNESS },
    );

    expect(verdict).toEqual({ status: "miss", reason: "schema" });
  });

  it("rejects generation mismatches when freshness is known", () => {
    const verdict = evaluateMarketIndexedDbEntry(
      buildMarketPayload({ last_synced_at: STALE_FRESHNESS }),
      { expectedScope: "market", freshnessLastSyncedAt: FRESHNESS },
    );

    expect(verdict).toEqual({ status: "miss", reason: "generation" });
  });

  it("defers generation checks until freshness is observed", () => {
    const verdict = evaluateMarketIndexedDbEntry(
      buildMarketPayload({ last_synced_at: STALE_FRESHNESS }),
      { expectedScope: "market" },
    );

    expect(verdict.status).toBe("hit");
  });

  it("rejects legacy market URLs without scope metadata via cache key classification", () => {
    const verdict = evaluateMarketIndexedDbEntry(
      {
        cacheKey: `${BASE_URL}/market/pulse/summary?exchange=DSE`,
        expiresAt: Date.now() + 60_000,
        data: { last_synced_at: FRESHNESS },
      },
      { expectedScope: "market", freshnessLastSyncedAt: FRESHNESS },
    );

    expect(verdict).toEqual({ status: "miss", reason: "schema" });
  });

  it("keeps non-market default cache entries on schema rules", () => {
    const verdict = evaluateMarketIndexedDbEntry(
      {
        cacheKey: `${BASE_URL}/stocks/search?q=gp`,
        expiresAt: Date.now() + 60_000,
        data: [{ symbol: "GP" }],
        scope: "default",
      },
      { expectedScope: "default", freshnessLastSyncedAt: FRESHNESS },
    );

    expect(verdict.status).toBe("hit");
  });
});

describe("resolveMarketTanStackRootsForUrl", () => {
  it("maps market endpoints to TanStack roots", () => {
    expect(resolveMarketTanStackRootsForUrl(`${BASE_URL}/dashboard/movers?exchange=DSE`)).toEqual([
      "dashboard",
    ]);
    expect(resolveMarketTanStackRootsForUrl(`${BASE_URL}/market/pulse/summary?exchange=DSE`)).toEqual([
      "market-pulse-summary",
    ]);
    expect(resolveMarketTanStackRootsForUrl(`${BASE_URL}/market/universe-rows?exchange=DSE`)).toEqual([
      "market-universe-rows",
    ]);
    expect(resolveMarketTanStackRootsForUrl(`${BASE_URL}/signals/latest?exchange=DSE`)).toEqual(["signals"]);
    expect(
      resolveMarketTanStackRootsForUrl(`${BASE_URL}/stock-details/DSE/GP/workspace`),
    ).toEqual(["stock-workspace"]);
  });
});

describe("handleStaleMarketIndexedDbEntry", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("invalidates related TanStack roots without deleting IndexedDB again", async () => {
    const deleteSpy = vi.spyOn(backendApi, "deleteCachedApiResponse").mockResolvedValue();
    const invalidateSpy = vi.fn().mockResolvedValue(undefined);
    const queryClient = {
      invalidateQueries: invalidateSpy,
    } as unknown as import("@tanstack/react-query").QueryClient;

    const url = `${BASE_URL}/market/pulse/summary?exchange=DSE`;
    await handleStaleMarketIndexedDbEntry(url, queryClient);

    expect(deleteSpy).not.toHaveBeenCalled();
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["market-pulse-summary"],
      refetchType: "none",
    });
  });
});

describe("reconcileGenerationAwareMarketQueries", () => {
  it("invalidates only generation-stamped queries that disagree with freshness", async () => {
    const invalidateSpy = vi.fn().mockResolvedValue(undefined);
    const queryClient = {
      invalidateQueries: invalidateSpy,
    } as unknown as import("@tanstack/react-query").QueryClient;

    await reconcileGenerationAwareMarketQueries(queryClient, FRESHNESS);

    expect(invalidateSpy).toHaveBeenCalled();
    const predicate = invalidateSpy.mock.calls[0]?.[0]?.predicate;
    expect(predicate?.({ state: { data: { last_synced_at: STALE_FRESHNESS } } })).toBe(true);
    expect(predicate?.({ state: { data: { last_synced_at: FRESHNESS } } })).toBe(false);
    expect(predicate?.({ state: { data: { session_trade_date: "2026-07-12" } } })).toBe(false);
  });
});

describe("freshness registry", () => {
  beforeEach(() => {
    resetMarketFreshnessGenerationForTests();
  });

  it("starts unknown and exposes the latest synced generation", () => {
    expect(getMarketFreshnessGeneration()).toBeUndefined();
    setMarketFreshnessGeneration(FRESHNESS);
    expect(getMarketFreshnessGeneration()).toBe(FRESHNESS);
  });
});
