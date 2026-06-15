import { backendApiGet } from "@/lib/api/backend-api-client";
import type {
  BackendMarketPulseDto,
  BackendMarketPulsePreviousSnapshotDto,
  ExchangeCode,
} from "@/lib/api/backend-api-types";

export type GetMarketPulseParams = {
  exchange?: ExchangeCode;
  previousSnapshot?: BackendMarketPulsePreviousSnapshotDto | null;
  displayName?: string | null;
};

export function getMarketPulse(params: GetMarketPulseParams = {}) {
  const previousSnapshot = params.previousSnapshot
    ? encodeURIComponent(JSON.stringify(params.previousSnapshot))
    : undefined;

  return backendApiGet<BackendMarketPulseDto>(
    "/market/pulse",
    {
      exchange: params.exchange ?? "DSE",
      previous_snapshot: previousSnapshot,
      display_name: params.displayName ?? undefined,
    },
    { cache: "no-store" },
  );
}
