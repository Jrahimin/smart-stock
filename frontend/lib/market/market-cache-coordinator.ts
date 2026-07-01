import type { QueryClient } from "@tanstack/react-query";

import { clearBackendApiCache } from "@/lib/api/backend-api-client";

/**
 * TanStack Query roots invalidated after a backend market sync or manual refresh.
 * Scanner, signals, and stock explorer consume `market-universe-rows`; no separate keys.
 */
export const MARKET_TANSTACK_QUERY_ROOTS = [
  "dashboard",
  "market-universe-rows",
  "market-pulse-summary",
  "market-pulse-briefing",
  "signals",
] as const;

export async function invalidateMarketTanStackQueries(queryClient: QueryClient): Promise<void> {
  await Promise.all(
    MARKET_TANSTACK_QUERY_ROOTS.map((root) => queryClient.invalidateQueries({ queryKey: [root] })),
  );
}

/** TanStack-only invalidation after backend sync (IndexedDB entries are kept). */
export async function syncMarketClientCachesOnBackendUpdate(queryClient: QueryClient): Promise<void> {
  await invalidateMarketTanStackQueries(queryClient);
}

/** Clears IndexedDB market API cache and invalidates active market TanStack queries. */
export async function invalidateMarketClientCaches(queryClient: QueryClient): Promise<void> {
  await clearBackendApiCache();
  await invalidateMarketTanStackQueries(queryClient);
}

/** Manual refresh: clear client caches, invalidate market queries, and refetch freshness metadata. */
export async function refreshMarketClientCaches(queryClient: QueryClient): Promise<void> {
  await invalidateMarketClientCaches(queryClient);
  await queryClient.invalidateQueries({ queryKey: ["market-freshness"] });
}
