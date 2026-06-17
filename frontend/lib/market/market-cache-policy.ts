import type { BackendMarketFreshnessDto } from "@/lib/api/backend-api-types";

const DASHBOARD_CACHE_TTL_FALLBACK_MS = 600_000;

export function getDashboardStaleTimeMs(
  freshness?: Pick<BackendMarketFreshnessDto, "dashboard_cache_ttl_seconds"> | null,
): number {
  const seconds = freshness?.dashboard_cache_ttl_seconds;
  if (seconds == null) {
    return DASHBOARD_CACHE_TTL_FALLBACK_MS;
  }

  return seconds * 1000;
}

export function getDashboardRefetchIntervalMs(
  freshness?: Pick<BackendMarketFreshnessDto, "dashboard_cache_ttl_seconds" | "market_status"> | null,
): number | false {
  if (!freshness) {
    return false;
  }

  const shouldPoll = freshness.market_status === "OPEN" || freshness.market_status === "PRE_OPEN";
  if (!shouldPoll) {
    return false;
  }

  return getDashboardStaleTimeMs(freshness);
}
