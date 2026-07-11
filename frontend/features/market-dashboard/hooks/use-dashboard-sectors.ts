"use client";

import { useQuery } from "@tanstack/react-query";

import { getDashboardSectors } from "@/lib/api/market-dashboard-api";
import type { BackendDashboardSectorsDto, ExchangeCode } from "@/lib/api/backend-api-types";

type UseDashboardSectionOptions = {
  exchange?: ExchangeCode;
  staleTimeMs: number;
  refetchIntervalMs?: number | false;
  enabled?: boolean;
  initialData?: BackendDashboardSectorsDto;
  initialDataUpdatedAt?: number;
};

export function useDashboardSectors({
  exchange = "DSE",
  staleTimeMs,
  refetchIntervalMs = false,
  enabled = true,
  initialData,
  initialDataUpdatedAt,
}: UseDashboardSectionOptions) {
  return useQuery({
    queryKey: ["dashboard", "sectors", exchange],
    queryFn: () => getDashboardSectors(exchange),
    initialData,
    initialDataUpdatedAt,
    staleTime: staleTimeMs,
    refetchInterval: refetchIntervalMs,
    enabled,
  });
}
