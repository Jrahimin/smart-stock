"use client";

import type { ExchangeCode } from "@/lib/api/backend-api-types";
import { useMarketCacheSyncCoordinator } from "@/hooks/market/use-market-cache-coordinator";

type MarketCacheSyncCoordinatorProps = {
  exchange?: ExchangeCode;
};

/** App-level listener that aligns browser caches with backend market sync events. */
export function MarketCacheSyncCoordinator({ exchange = "DSE" }: MarketCacheSyncCoordinatorProps) {
  useMarketCacheSyncCoordinator(exchange);
  return null;
}
