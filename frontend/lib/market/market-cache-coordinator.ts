import type { QueryClient } from "@tanstack/react-query";

import { clearBackendApiCache, clearMarketBackendApiCache } from "@/lib/api/backend-api-client";

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
] as const;

export async function invalidateMarketTanStackQueries(queryClient: QueryClient): Promise<void> {
  await Promise.all(
    MARKET_TANSTACK_QUERY_ROOTS.map((root) => queryClient.invalidateQueries({ queryKey: [root] })),
  );
}

/** Clears market IndexedDB entries, then invalidates TanStack market query roots. */
export async function syncMarketClientCachesOnBackendUpdate(queryClient: QueryClient): Promise<void> {
  await clearMarketBackendApiCache();
  await invalidateMarketTanStackQueries(queryClient);
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
