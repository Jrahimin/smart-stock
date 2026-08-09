"use client";

import { useQuery } from "@tanstack/react-query";

import { getDashboardMovers } from "@/lib/api/market-dashboard-api";
import type { BackendDashboardMoversDto, ExchangeCode } from "@/lib/api/backend-api-types";
import { dashboardQueryKey } from "./dashboard-query-key";

type UseDashboardMoversOptions = {
  exchange?: ExchangeCode;
  generation: string;
  staleTimeMs: number;
  refetchIntervalMs?: number | false;
  enabled?: boolean;
  initialData?: BackendDashboardMoversDto;
  initialDataUpdatedAt?: number;
};

export function useDashboardMovers({
  exchange = "DSE",
  generation,
  staleTimeMs,
  refetchIntervalMs = false,
  enabled = true,
  initialData,
  initialDataUpdatedAt,
}: UseDashboardMoversOptions) {
  return useQuery({
    queryKey: dashboardQueryKey("movers", exchange, generation),
    queryFn: () => getDashboardMovers(exchange, generation),
    initialData,
    initialDataUpdatedAt,
    staleTime: staleTimeMs,
    refetchInterval: refetchIntervalMs,
    enabled,
  });
}
