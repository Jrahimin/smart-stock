"use client";

import { useQuery } from "@tanstack/react-query";

import { getDashboardSectors } from "@/lib/api/market-dashboard-api";
import type { BackendDashboardSectorsDto, ExchangeCode } from "@/lib/api/backend-api-types";
import { dashboardQueryKey } from "./dashboard-query-key";

type UseDashboardSectionOptions = {
  exchange?: ExchangeCode;
  generation: string;
  staleTimeMs: number;
  refetchIntervalMs?: number | false;
  enabled?: boolean;
  initialData?: BackendDashboardSectorsDto;
  initialDataUpdatedAt?: number;
};

export function useDashboardSectors({
  exchange = "DSE",
  generation,
  staleTimeMs,
  refetchIntervalMs = false,
  enabled = true,
  initialData,
  initialDataUpdatedAt,
}: UseDashboardSectionOptions) {
  return useQuery({
    queryKey: dashboardQueryKey("sectors", exchange, generation),
    queryFn: () => getDashboardSectors(exchange, generation),
    initialData,
    initialDataUpdatedAt,
    staleTime: staleTimeMs,
    refetchInterval: refetchIntervalMs,
    enabled,
  });
}
