"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import type { DashboardCorePayload } from "@/lib/api/dashboard-server";
import { useMarketDataFreshness } from "@/hooks/market/use-market-data-freshness";
import { syncMarketClientCachesOnBackendUpdate } from "@/lib/market/market-cache-coordinator";

type DashboardSsrHydrationGuardProps = {
  initialCore: DashboardCorePayload;
};

/**
 * One-shot TanStack invalidation when live freshness/overview disagree with the SSR seed.
 * Clears market IndexedDB before invalidation — same policy as MarketCacheSyncCoordinator.
 */
export function DashboardSsrHydrationGuard({ initialCore }: DashboardSsrHydrationGuardProps) {
  const queryClient = useQueryClient();
  const hasInvalidatedRef = useRef(false);
  const { data: freshness } = useMarketDataFreshness("DSE", { refetchInterval: false });

  useEffect(() => {
    if (hasInvalidatedRef.current || !freshness?.last_synced_at) {
      return;
    }

    const overview = queryClient.getQueryData<{ last_synced_at?: string | null }>(["dashboard", "overview", "DSE"]);
    const liveFreshnessSyncedAt = freshness.last_synced_at;
    const liveOverviewSyncedAt = overview?.last_synced_at ?? null;

    const freshnessMismatch =
      Boolean(initialCore.lastSyncedAt) && liveFreshnessSyncedAt !== initialCore.lastSyncedAt;

    const overviewMismatch =
      Boolean(initialCore.overviewLastSyncedAt && liveOverviewSyncedAt) &&
      liveOverviewSyncedAt !== initialCore.overviewLastSyncedAt;

    const crossGenerationMismatch =
      Boolean(liveOverviewSyncedAt) && liveFreshnessSyncedAt !== liveOverviewSyncedAt;

    if (freshnessMismatch || overviewMismatch || crossGenerationMismatch) {
      hasInvalidatedRef.current = true;
      void syncMarketClientCachesOnBackendUpdate(queryClient);
    }
  }, [freshness?.last_synced_at, initialCore, queryClient]);

  return null;
}
