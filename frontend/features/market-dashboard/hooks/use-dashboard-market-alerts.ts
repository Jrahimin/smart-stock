"use client";

import { useQuery } from "@tanstack/react-query";

import { getDashboardMarketAlerts } from "@/lib/api/market-dashboard-api";
import type { ExchangeCode } from "@/lib/api/backend-api-types";
import { dashboardQueryKey } from "./dashboard-query-key";

type UseDashboardSectionOptions = {
  exchange?: ExchangeCode;
  generation: string;
  staleTimeMs: number;
  refetchIntervalMs?: number | false;
  enabled?: boolean;
};

export function useDashboardMarketAlerts({
  exchange = "DSE",
  generation,
  staleTimeMs,
  refetchIntervalMs = false,
  enabled = true,
}: UseDashboardSectionOptions) {
  return useQuery({
    queryKey: dashboardQueryKey("market-alerts", exchange, generation),
    queryFn: () => getDashboardMarketAlerts(exchange, generation),
    staleTime: staleTimeMs,
    refetchInterval: refetchIntervalMs,
    enabled,
  });
}
