"use client";

import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/features/auth/context/auth-context";
import type { ExchangeCode } from "@/lib/api/backend-api-types";
import { getPortfolioWorkspace } from "@/lib/api/portfolio-api";

export function usePortfolioWorkspace(exchange: ExchangeCode = "DSE") {
  const { user, isAuthenticated } = useAuth();
  const userId = user?.id ?? "anonymous";

  return useQuery({
    queryKey: ["portfolio", "workspace", userId, exchange],
    queryFn: () => getPortfolioWorkspace(exchange),
    enabled: isAuthenticated,
    staleTime: 30_000,
    placeholderData: (previousData) => previousData,
  });
}
