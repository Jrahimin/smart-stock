"use client";

import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/features/auth/context/auth-context";
import { getWealthDashboard, getWealthSeasonalContext } from "@/lib/api/wealth-api";

export function useWealthDashboard() {
  const { user, isAuthenticated } = useAuth();
  const userId = user?.id ?? "anonymous";

  const dashboardQuery = useQuery({
    queryKey: ["wealth", "dashboard", userId],
    queryFn: getWealthDashboard,
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  const seasonalQuery = useQuery({
    queryKey: ["wealth", "seasonal-context"],
    queryFn: getWealthSeasonalContext,
    staleTime: 60 * 60 * 1000,
  });

  return {
    dashboard: dashboardQuery.data,
    seasonalContext: seasonalQuery.data,
    isLoading: dashboardQuery.isLoading || seasonalQuery.isLoading,
    isError: dashboardQuery.isError || seasonalQuery.isError,
    refetch: async () => {
      await Promise.all([dashboardQuery.refetch(), seasonalQuery.refetch()]);
    },
  };
}
