import { getBackendAuthSessionVersion, isBackendAuthSessionCurrent } from "@/lib/api/backend-api-client";
import type { QueryClient } from "@tanstack/react-query";

/** Only the account that started a mutation is revalidated, even after an auth switch. */
export async function refreshAccountQueries(client: QueryClient, userId: string, sessionVersion = getBackendAuthSessionVersion()) {
  const refetchType = isBackendAuthSessionCurrent(sessionVersion) ? "active" : "none";
  await Promise.all([
    client.invalidateQueries({ queryKey: ["portfolio", "workspace", userId], refetchType }),
    client.invalidateQueries({ queryKey: ["watchlist", "items", userId], refetchType }),
    client.invalidateQueries({ queryKey: ["watchlist", "summary", userId], refetchType }),
  ]);
}
