import { clearBackendApiCache } from "@/lib/api/backend-api-client";

/** Clears client-side IndexedDB API cache before a manual market data refresh. */
export async function refreshMarketClientCaches(): Promise<void> {
  await clearBackendApiCache();
}
