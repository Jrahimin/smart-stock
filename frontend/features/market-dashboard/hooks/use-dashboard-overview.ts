"use client";

import { useQuery } from "@tanstack/react-query";

import { getDashboardOverview } from "@/lib/api/market-dashboard-api";
import type { BackendDashboardOverviewDto, ExchangeCode } from "@/lib/api/backend-api-types";
import { dashboardQueryKey } from "./dashboard-query-key";

type UseDashboardOverviewOptions = {
  exchange?: ExchangeCode;
  generation: string;
  staleTimeMs: number;
  refetchIntervalMs?: number | false;
  enabled?: boolean;
  initialData?: BackendDashboardOverviewDto;
  initialDataUpdatedAt?: number;
};

export function useDashboardOverview({
  exchange = "DSE",
  generation,
  staleTimeMs,
  refetchIntervalMs = false,
  enabled = true,
  initialData,
  initialDataUpdatedAt,
}: UseDashboardOverviewOptions) {
  return useQuery({
    queryKey: dashboardQueryKey("overview", exchange, generation),
    queryFn: () => getDashboardOverview(exchange),
    initialData,
    initialDataUpdatedAt,
    staleTime: staleTimeMs,
    refetchInterval: refetchIntervalMs,
    enabled,
  });
}
