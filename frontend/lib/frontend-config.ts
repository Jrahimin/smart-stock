export const frontendConfig = {
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1",
  cacheHours: Number(process.env.NEXT_PUBLIC_MARKET_CACHE_HOURS ?? 2),
};

