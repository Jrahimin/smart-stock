"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import type { DashboardCorePayload } from "@/lib/api/dashboard-server";
import { useMarketDataFreshness } from "@/hooks/market/use-market-data-freshness";
import { syncMarketClientCachesOnBackendUpdate } from "@/lib/market/market-cache-coordinator";
import { dashboardQueryKey } from "@/features/market-dashboard/hooks/dashboard-query-key";

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
    const liveGeneration = freshness?.market_sync_id ?? freshness?.last_synced_at ?? null;
    if (hasInvalidatedRef.current || !liveGeneration) {
      return;
    }

    const overview = queryClient.getQueryData<{ last_synced_at?: string | null }>(
      dashboardQueryKey("overview", "DSE", liveGeneration),
    );
    const liveFreshnessSyncedAt = freshness?.last_synced_at ?? null;
    const liveOverviewSyncedAt = overview?.last_synced_at ?? null;
    const initialGeneration =
      initialCore.freshness?.market_sync_id ?? initialCore.freshness?.last_synced_at ?? null;

    const freshnessMismatch =
      Boolean(initialGeneration) && liveGeneration !== initialGeneration;

    const overviewMismatch =
      Boolean(initialCore.overviewLastSyncedAt && liveOverviewSyncedAt) &&
      liveOverviewSyncedAt !== initialCore.overviewLastSyncedAt;

    const crossGenerationMismatch =
      Boolean(liveOverviewSyncedAt) && liveFreshnessSyncedAt !== liveOverviewSyncedAt;

    if (freshnessMismatch || overviewMismatch || crossGenerationMismatch) {
      hasInvalidatedRef.current = true;
      void syncMarketClientCachesOnBackendUpdate(queryClient);
    }
  }, [freshness?.market_sync_id, freshness?.last_synced_at, initialCore, queryClient]);

  return null;
}
