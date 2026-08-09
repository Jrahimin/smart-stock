import { QueryClient, dehydrate, type DehydratedState } from "@tanstack/react-query";

import type { DashboardCorePayload } from "@/lib/api/dashboard-server";
import { dashboardQueryKey } from "@/features/market-dashboard/hooks/dashboard-query-key";

const DASHBOARD_FRESHNESS_QUERY_KEY = ["market-freshness", "DSE"] as const;

function stampQueryUpdatedAt(queryClient: QueryClient, queryKey: readonly unknown[], updatedAt: number) {
  const query = queryClient.getQueryCache().find({ queryKey });
  if (!query) {
    return;
  }

  query.setState({
    ...query.state,
    dataUpdatedAt: updatedAt,
  });
}

/** Seeds TanStack cache for dashboard SSR before client hooks mount. */
export function buildDashboardDehydratedState(core: DashboardCorePayload | null): DehydratedState {
  const queryClient = new QueryClient();

  if (!core) {
    return dehydrate(queryClient);
  }

  if (core.freshness) {
    queryClient.setQueryData(DASHBOARD_FRESHNESS_QUERY_KEY, core.freshness);
    stampQueryUpdatedAt(queryClient, DASHBOARD_FRESHNESS_QUERY_KEY, core.fetchedAt);
  }

  const generation = core.freshness?.market_sync_id ?? core.freshness?.last_synced_at ?? null;
  if (!generation) {
    return dehydrate(queryClient);
  }

  if (core.overview) {
    const key = dashboardQueryKey("overview", "DSE", generation);
    queryClient.setQueryData(key, core.overview);
    stampQueryUpdatedAt(queryClient, key, core.fetchedAt);
  }

  if (core.sectors) {
    const key = dashboardQueryKey("sectors", "DSE", generation);
    queryClient.setQueryData(key, core.sectors);
    stampQueryUpdatedAt(queryClient, key, core.fetchedAt);
  }

  if (core.movers) {
    const key = dashboardQueryKey("movers", "DSE", generation);
    queryClient.setQueryData(key, core.movers);
    stampQueryUpdatedAt(queryClient, key, core.fetchedAt);
  }

  return dehydrate(queryClient);
}
