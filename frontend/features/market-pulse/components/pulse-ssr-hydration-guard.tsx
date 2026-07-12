"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import type { MarketPulseCorePayload } from "@/lib/api/pulse-server";
import { useMarketDataFreshness } from "@/hooks/market/use-market-data-freshness";
import { shouldInvalidatePulseSsrSeed } from "@/features/market-pulse/lib/market-pulse-query-state";
import { syncMarketClientCachesOnBackendUpdate } from "@/lib/market/market-cache-coordinator";

type PulseSsrHydrationGuardProps = {
  initialCore: MarketPulseCorePayload;
};

/**
 * One-shot TanStack invalidation when live freshness disagrees with the SSR seed.
 */
export function PulseSsrHydrationGuard({ initialCore }: PulseSsrHydrationGuardProps) {
  const queryClient = useQueryClient();
  const hasInvalidatedRef = useRef(false);
  const { data: freshness } = useMarketDataFreshness("DSE", { refetchInterval: false });

  useEffect(() => {
    if (
      !shouldInvalidatePulseSsrSeed(initialCore, freshness?.last_synced_at, hasInvalidatedRef.current)
    ) {
      return;
    }

    hasInvalidatedRef.current = true;
    void syncMarketClientCachesOnBackendUpdate(queryClient);
  }, [freshness?.last_synced_at, initialCore, queryClient]);

  return null;
}
