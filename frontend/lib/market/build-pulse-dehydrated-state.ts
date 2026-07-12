import { QueryClient, dehydrate, type DehydratedState } from "@tanstack/react-query";

import type { MarketPulseCorePayload } from "@/lib/api/pulse-server";
import { PULSE_ANONYMOUS_SUMMARY_QUERY_KEY } from "@/lib/market/pulse-query-keys";

const PULSE_FRESHNESS_QUERY_KEY = ["market-freshness", "DSE"] as const;

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

/** Seeds TanStack cache for Market Pulse SSR before client hooks mount. */
export function buildPulseDehydratedState(core: MarketPulseCorePayload | null): DehydratedState {
  const queryClient = new QueryClient();

  if (!core) {
    return dehydrate(queryClient);
  }

  if (core.freshness) {
    queryClient.setQueryData(PULSE_FRESHNESS_QUERY_KEY, core.freshness);
    stampQueryUpdatedAt(queryClient, PULSE_FRESHNESS_QUERY_KEY, core.fetchedAt);
  }

  if (core.summary) {
    queryClient.setQueryData(PULSE_ANONYMOUS_SUMMARY_QUERY_KEY, core.summary);
    stampQueryUpdatedAt(queryClient, PULSE_ANONYMOUS_SUMMARY_QUERY_KEY, core.fetchedAt);
  }

  return dehydrate(queryClient);
}
