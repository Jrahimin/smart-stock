import type { QueryClient } from "@tanstack/react-query";

import {
  clearBackendApiCache,
  clearMarketBackendApiCache,
} from "@/lib/api/backend-api-client";
import { resolveMarketTanStackRootsForUrl } from "@/lib/market/market-cache-url-registry";
import {
  hasMarketGenerationField,
  responseMatchesMarketFreshness,
} from "@/lib/market/market-generation";
import { registerStaleMarketCacheHandler } from "@/lib/market/market-cache-notifications";
import {
  getMarketFreshnessGeneration,
  setMarketFreshnessGeneration,
} from "@/lib/market/market-freshness-registry";

export { getMarketFreshnessGeneration, setMarketFreshnessGeneration };

registerStaleMarketCacheHandler((url) => invalidateTanStackForStaleMarketUrl(url));

/**
 * TanStack Query roots invalidated after a backend market sync or manual refresh.
 * Scanner, signals, and stock explorer consume `market-universe-rows`; no separate keys.
 * Stock detail page aggregate uses `stock-workspace` (+ lazy `stock-sector-context`).
 */
export const MARKET_TANSTACK_QUERY_ROOTS = [
  "dashboard",
  "market-universe-rows",
  "market-pulse-summary",
  "market-pulse-briefing",
  "signals",
  "stock-workspace",
  "stock-sector-context",
  "portfolio",
] as const;

/** Roots whose TanStack payloads may carry `last_synced_at` generation metadata. */
export const GENERATION_AWARE_MARKET_QUERY_ROOTS = [
  "dashboard",
  "market-pulse-summary",
] as const;

let marketCacheQueryClient: QueryClient | null = null;
let marketSyncInFlight: Promise<void> | null = null;

export function registerMarketCacheQueryClient(queryClient: QueryClient) {
  marketCacheQueryClient = queryClient;
}

export function unregisterMarketCacheQueryClient(queryClient: QueryClient) {
  if (marketCacheQueryClient === queryClient) {
    marketCacheQueryClient = null;
  }
}

export async function invalidateMarketTanStackQueries(queryClient: QueryClient): Promise<void> {
  await Promise.all(
    MARKET_TANSTACK_QUERY_ROOTS.map((root) => queryClient.invalidateQueries({ queryKey: [root] })),
  );
}

async function invalidateMarketTanStackRoots(
  queryClient: QueryClient,
  roots: readonly string[],
  options?: { refetchType?: "active" | "inactive" | "all" | "none" },
): Promise<void> {
  await Promise.all(
    roots.map((root) =>
      queryClient.invalidateQueries({
        queryKey: [root],
        refetchType: options?.refetchType ?? "active",
      }),
    ),
  );
}

/**
 * Marks related TanStack roots stale after IndexedDB deleted a market entry.
 * Uses `refetchType: "none"` so the in-flight `backendApiGetMarket` queryFn can
 * finish its network fetch without a concurrent refetch deadlock.
 */
export async function invalidateTanStackForStaleMarketUrl(
  url: string,
  queryClient: QueryClient | null = marketCacheQueryClient,
): Promise<void> {
  if (!queryClient) {
    return;
  }

  const roots = resolveMarketTanStackRootsForUrl(url);
  if (roots.length === 0) {
    return;
  }

  await invalidateMarketTanStackRoots(queryClient, roots, { refetchType: "none" });
}

/** @deprecated Use `invalidateTanStackForStaleMarketUrl` — kept for tests. */
export async function handleStaleMarketIndexedDbEntry(
  url: string,
  queryClient: QueryClient | null = marketCacheQueryClient,
): Promise<void> {
  await invalidateTanStackForStaleMarketUrl(url, queryClient);
}

/**
 * Invalidates generation-stamped TanStack queries that disagree with current freshness.
 * Skipped when a full sync is already in flight for the same generation transition.
 */
export async function reconcileGenerationAwareMarketQueries(
  queryClient: QueryClient,
  freshnessLastSyncedAt: string | null,
): Promise<void> {
  if (!freshnessLastSyncedAt || marketSyncInFlight) {
    return;
  }

  await Promise.all(
    GENERATION_AWARE_MARKET_QUERY_ROOTS.map((root) =>
      queryClient.invalidateQueries({
        queryKey: [root],
        predicate: (query) => {
          const data = query.state.data;
          if (!hasMarketGenerationField(data)) {
            return false;
          }
          return !responseMatchesMarketFreshness(data, freshnessLastSyncedAt);
        },
      }),
    ),
  );
}

/** Clears market IndexedDB entries, then invalidates TanStack market query roots. */
export async function syncMarketClientCachesOnBackendUpdate(queryClient: QueryClient): Promise<void> {
  if (marketSyncInFlight) {
    return marketSyncInFlight;
  }

  marketSyncInFlight = (async () => {
    await clearMarketBackendApiCache();
    await invalidateMarketTanStackQueries(queryClient);
  })().finally(() => {
    marketSyncInFlight = null;
  });

  return marketSyncInFlight;
}

/** Clears all IndexedDB API cache and invalidates active market TanStack queries. */
export async function invalidateMarketClientCaches(queryClient: QueryClient): Promise<void> {
  await clearBackendApiCache();
  await invalidateMarketTanStackQueries(queryClient);
}

/** Manual refresh: clear client caches, invalidate market queries, and refetch freshness metadata. */
export async function refreshMarketClientCaches(queryClient: QueryClient): Promise<void> {
  await invalidateMarketClientCaches(queryClient);
  await queryClient.invalidateQueries({ queryKey: ["market-freshness"] });
}
