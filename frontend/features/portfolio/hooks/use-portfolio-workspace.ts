"use client";

import { useQuery } from "@tanstack/react-query";

import { assertBackendAuthSession, getBackendAuthSessionVersion } from "@/lib/api/backend-api-client";
import { useAuth } from "@/features/auth/context/auth-context";
import type { ExchangeCode } from "@/lib/api/backend-api-types";
import { getPortfolioWorkspace } from "@/lib/api/portfolio-api";
import { useMarketDataFreshness } from "@/hooks/market/use-market-data-freshness";
import { freshnessGenerationToken } from "@/lib/market/market-generation";

export function usePortfolioWorkspace(exchange: ExchangeCode = "DSE") {
  const { user, isAuthenticated } = useAuth();
  const userId = user?.id ?? "anonymous";
  const sessionVersion = getBackendAuthSessionVersion();
  const freshness = useMarketDataFreshness(exchange);
  const generation = freshnessGenerationToken(freshness.data) ?? "unknown";

  return useQuery({
    queryKey: ["portfolio", "workspace", userId, exchange, generation],
    queryFn: () => { assertBackendAuthSession(sessionVersion); return getPortfolioWorkspace(exchange); },
    // ProtectedRoute renders children while auth boots; keep the query idle until then.
    enabled: isAuthenticated,
    staleTime: 30_000,
    refetchInterval: Math.max(30_000, (freshness.data?.dashboard_cache_ttl_seconds ?? 120) * 1000),
    // Soften refresh blips without masking real failures.
    retry: 1,
    placeholderData: (previousData, previousQuery) => {
      if (previousQuery?.queryKey[2] !== userId || previousQuery?.queryKey[3] !== exchange) return undefined;
      if (freshness.data?.decision_status === "UNAVAILABLE") return undefined;
      return previousData?.meta.decision_status === freshness.data?.decision_status ? previousData : undefined;
    },
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
