import { QueryClient, dehydrate, type DehydratedState } from "@tanstack/react-query";

import type { DashboardCorePayload } from "@/lib/api/dashboard-server";

const DASHBOARD_FRESHNESS_QUERY_KEY = ["market-freshness", "DSE"] as const;
const DASHBOARD_OVERVIEW_QUERY_KEY = ["dashboard", "overview", "DSE"] as const;
const DASHBOARD_SECTORS_QUERY_KEY = ["dashboard", "sectors", "DSE"] as const;
const DASHBOARD_MOVERS_QUERY_KEY = ["dashboard", "movers", "DSE"] as const;

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

  if (core.overview) {
    queryClient.setQueryData(DASHBOARD_OVERVIEW_QUERY_KEY, core.overview);
    stampQueryUpdatedAt(queryClient, DASHBOARD_OVERVIEW_QUERY_KEY, core.fetchedAt);
  }

  if (core.sectors) {
    queryClient.setQueryData(DASHBOARD_SECTORS_QUERY_KEY, core.sectors);
    stampQueryUpdatedAt(queryClient, DASHBOARD_SECTORS_QUERY_KEY, core.fetchedAt);
  }

  if (core.movers) {
    queryClient.setQueryData(DASHBOARD_MOVERS_QUERY_KEY, core.movers);
    stampQueryUpdatedAt(queryClient, DASHBOARD_MOVERS_QUERY_KEY, core.fetchedAt);
  }

  return dehydrate(queryClient);
}
