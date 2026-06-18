"use client";

import { useQuery } from "@tanstack/react-query";

import type { ExchangeCode } from "@/lib/api/backend-api-types";
import { getSectorContext } from "@/lib/api/stock-details-api";
import { useMarketDataFreshness } from "@/hooks/market/use-market-data-freshness";
import { getMarketStaleTimeMs } from "@/lib/market/market-cache-policy";

type UseSectorContextOptions = {
  exchange: ExchangeCode;
  symbol: string;
  enabled: boolean;
};

export function useSectorContext({ exchange, symbol, enabled }: UseSectorContextOptions) {
  const freshnessQuery = useMarketDataFreshness(exchange);
  const staleTimeMs = getMarketStaleTimeMs(freshnessQuery.data);

  const query = useQuery({
    queryKey: ["stock-sector-context", exchange, symbol],
    queryFn: () => getSectorContext(exchange, symbol),
    enabled,
    staleTime: staleTimeMs,
    retry: false,
  });

  return {
    sectorContext: query.data ?? null,
    isLoading: enabled && query.isLoading,
    isError: enabled && query.isError,
  };
}
