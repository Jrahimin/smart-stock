import type { BackendPortfolioWorkspaceDto } from "@/lib/api/backend-api-types";
import type { UpdateWatchlistItemPayload } from "@/lib/api/watchlist-api";

/** Compatibility helper: money-bearing edits require an authoritative workspace read. */
export function patchPortfolioWorkspace(workspace: BackendPortfolioWorkspaceDto | undefined, _stockId: string, _payload: UpdateWatchlistItemPayload) {
  return workspace;
}
