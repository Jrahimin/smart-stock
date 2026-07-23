import { BackendApiError } from "@/lib/api/backend-api-client";

export const UNIVERSE_CACHE_WARM_RETRY_DELAY_MS = 20_000;

export function isUniverseCacheWarming(error: unknown): boolean {
  return error instanceof BackendApiError && error.status === 503;
}

export function shouldRetryUniverseCache(failureCount: number, error: Error): boolean {
  if (isUniverseCacheWarming(error)) {
    return failureCount < 1;
  }
  return false;
}
