const MARKET_API_PATH_PREFIXES = [
  "/dashboard/",
  "/market/",
  "/signals/",
  "/stock-details/",
] as const;

const MARKET_STOCK_SUBRESOURCE_PATTERN = /^\/stocks\/[^/]+\/(prices|signals)(?:\?|$)/;

/** True when a cached API URL was written via `backendApiGetMarket`. */
export function isMarketApiCacheUrl(url: string): boolean {
  try {
    const { pathname } = new URL(url);
    const apiPath = pathname.replace(/.*\/api\/v1/, "") || pathname;
    if (MARKET_API_PATH_PREFIXES.some((prefix) => apiPath.startsWith(prefix))) {
      return true;
    }
    return MARKET_STOCK_SUBRESOURCE_PATTERN.test(apiPath);
  } catch {
    return false;
  }
}

/** TanStack roots invalidated when a specific market URL cache entry is stale. */
export function resolveMarketTanStackRootsForUrl(url: string): readonly string[] {
  try {
    const { pathname } = new URL(url);
    const apiPath = pathname.replace(/.*\/api\/v1/, "") || pathname;

    if (apiPath.startsWith("/dashboard/")) {
      return ["dashboard"];
    }
    if (apiPath.startsWith("/market/pulse/summary")) {
      return ["market-pulse-summary"];
    }
    if (apiPath.startsWith("/market/pulse/briefing")) {
      return ["market-pulse-briefing"];
    }
    if (apiPath.startsWith("/market/pulse")) {
      return ["market-pulse-summary", "market-pulse-briefing"];
    }
    if (apiPath.startsWith("/market/universe-rows")) {
      return ["market-universe-rows"];
    }
    if (apiPath.startsWith("/signals/")) {
      return ["signals"];
    }
    if (apiPath.startsWith("/stock-details/") && apiPath.endsWith("/sector-context")) {
      return ["stock-sector-context"];
    }
    if (apiPath.startsWith("/stock-details/")) {
      return ["stock-workspace"];
    }
    if (MARKET_STOCK_SUBRESOURCE_PATTERN.test(apiPath)) {
      return ["signals", "stock-workspace"];
    }
    if (MARKET_API_PATH_PREFIXES.some((prefix) => apiPath.startsWith(prefix))) {
      return ["dashboard"];
    }
  } catch {
    return [];
  }

  return [];
}
