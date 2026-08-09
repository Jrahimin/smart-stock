"use client";

import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/features/auth/context/auth-context";
import type { ExchangeCode } from "@/lib/api/backend-api-types";
import { getPortfolioWorkspace } from "@/lib/api/portfolio-api";
import { useMarketDataFreshness } from "@/hooks/market/use-market-data-freshness";

export function usePortfolioWorkspace(exchange: ExchangeCode = "DSE") {
  const { user, isAuthenticated } = useAuth();
  const userId = user?.id ?? "anonymous";
  const freshness = useMarketDataFreshness(exchange);
  const generation = freshness.data?.market_sync_id ?? freshness.data?.last_synced_at ?? "unknown";

  return useQuery({
    queryKey: ["portfolio", "workspace", userId, exchange, generation],
    queryFn: () => getPortfolioWorkspace(exchange),
    // ProtectedRoute renders children while auth boots; keep the query idle until then.
    enabled: isAuthenticated,
    staleTime: 30_000,
    // Soften refresh blips without masking real failures.
    retry: 1,
    placeholderData: (previousData) => previousData,
  });
}

/**
 * TanStack Query v5: disabled queries are `isPending` (not `isLoading`).
 * Treating `!data` as an error during auth bootstrap flashes the failure UI.
 */
export function resolvePortfolioWorkspaceLoadState(query: {
  isPending: boolean;
  isError: boolean;
  data: unknown;
}): "loading" | "error" | "ready" {
  if (query.isPending) return "loading";
  if (query.isError || query.data == null) return "error";
  return "ready";
}
