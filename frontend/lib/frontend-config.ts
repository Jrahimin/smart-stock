function readBooleanFlag(value: string | undefined, fallback = false) {
  if (value === undefined) {
    return fallback;
  }

  return value.toLowerCase() === "true";
}

function readPositiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

export const frontendConfig = {
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1",
  /** Long-lived IndexedDB TTL for non-market GETs (e.g. stock search). */
  cacheHours: readPositiveNumber(process.env.NEXT_PUBLIC_MARKET_CACHE_HOURS, 2),
  /** Short-lived IndexedDB TTL for market intelligence GETs (aligned with backend sync cadence). */
  marketCacheMinutes: Math.min(
    10,
    Math.max(5, readPositiveNumber(process.env.NEXT_PUBLIC_MARKET_CACHE_MINUTES, 10)),
  ),
  googleClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "",
  facebookAppId: process.env.NEXT_PUBLIC_FACEBOOK_APP_ID ?? "",
  features: {
    advancedChartOverlays: readBooleanFlag(process.env.NEXT_PUBLIC_FEATURE_ADVANCED_CHART_OVERLAYS),
    advancedScanners: readBooleanFlag(process.env.NEXT_PUBLIC_FEATURE_ADVANCED_SCANNERS),
    backendSignalEnrichment: readBooleanFlag(process.env.NEXT_PUBLIC_FEATURE_BACKEND_SIGNAL_ENRICHMENT),
  },
};

