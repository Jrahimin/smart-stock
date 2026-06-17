"use client";

import { useQuery } from "@tanstack/react-query";

import { getDashboardMarketAlerts } from "@/lib/api/market-dashboard-api";
import type { ExchangeCode } from "@/lib/api/backend-api-types";

type UseDashboardSectionOptions = {
  exchange?: ExchangeCode;
  staleTimeMs: number;
  refetchIntervalMs?: number | false;
  enabled?: boolean;
};

export function useDashboardMarketAlerts({
  exchange = "DSE",
  staleTimeMs,
  refetchIntervalMs = false,
  enabled = true,
}: UseDashboardSectionOptions) {
  return useQuery({
    queryKey: ["dashboard", "market-alerts", exchange],
    queryFn: () => getDashboardMarketAlerts(exchange),
    staleTime: staleTimeMs,
    refetchInterval: refetchIntervalMs,
    enabled,
  });
}
