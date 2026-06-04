function readBooleanFlag(value: string | undefined, fallback = false) {
  if (value === undefined) {
    return fallback;
  }

  return value.toLowerCase() === "true";
}

export const frontendConfig = {
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1",
  cacheHours: Number(process.env.NEXT_PUBLIC_MARKET_CACHE_HOURS ?? 2),
  googleClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "",
  facebookAppId: process.env.NEXT_PUBLIC_FACEBOOK_APP_ID ?? "",
  features: {
    advancedChartOverlays: readBooleanFlag(process.env.NEXT_PUBLIC_FEATURE_ADVANCED_CHART_OVERLAYS),
    advancedScanners: readBooleanFlag(process.env.NEXT_PUBLIC_FEATURE_ADVANCED_SCANNERS),
    backendSignalEnrichment: readBooleanFlag(process.env.NEXT_PUBLIC_FEATURE_BACKEND_SIGNAL_ENRICHMENT),
  },
};

