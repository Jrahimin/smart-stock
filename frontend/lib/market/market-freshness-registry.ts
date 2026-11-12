import type { BackendMarketFreshnessDto } from "@/lib/api/backend-api-types";
let marketFreshnessLastSyncedAt: string | null | undefined;
let currentFreshness: BackendMarketFreshnessDto | undefined;
export function setCurrentMarketFreshness(freshness: BackendMarketFreshnessDto | undefined) { currentFreshness = freshness; }
export function getCurrentMarketFreshness() { return currentFreshness; }

/** `undefined` means freshness has not been observed yet — generation checks are deferred. */
export function getMarketFreshnessGeneration(): string | null | undefined {
  return marketFreshnessLastSyncedAt;
}

export function setMarketFreshnessGeneration(lastSyncedAt: string | null) {
  marketFreshnessLastSyncedAt = lastSyncedAt;
}

export function resetMarketFreshnessGenerationForTests() {
  marketFreshnessLastSyncedAt = undefined;
  currentFreshness = undefined;
}
