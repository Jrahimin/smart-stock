import { backendApiGetMarket } from "@/lib/api/backend-api-client";
import type {
  BackendMarketBriefingDto,
  BackendMarketPulseDto,
  BackendMarketPulsePreviousSnapshotDto,
  ExchangeCode,
} from "@/lib/api/backend-api-types";

export type GetMarketPulseParams = {
  exchange?: ExchangeCode;
  previousSnapshot?: BackendMarketPulsePreviousSnapshotDto | null;
  displayName?: string | null;
};

export type BackendMarketPulseSummaryDto = Pick<
  BackendMarketPulseDto,
  | "hero"
  | "since_last_visit"
  | "focus_stocks"
  | "monitor_candidates"
  | "alerts"
  | "empty_state"
  | "empty_message"
  | "data_quality_note"
> & {
  last_synced_at: string | null;
  market_sync_id?: string | null;
  data_state?: "LIVE" | "FINALIZATION_PENDING" | "FINALIZED" | "STALE";
};

export function getMarketPulse(params: GetMarketPulseParams = {}) {
  const previousSnapshot = params.previousSnapshot
    ? encodeURIComponent(JSON.stringify(params.previousSnapshot))
    : undefined;

  return backendApiGetMarket<BackendMarketPulseDto>("/market/pulse", {
    exchange: params.exchange ?? "DSE",
    previous_snapshot: previousSnapshot,
    display_name: params.displayName ?? undefined,
  });
}

export function getMarketPulseSummary(params: GetMarketPulseParams = {}) {
  const previousSnapshot = params.previousSnapshot
    ? encodeURIComponent(JSON.stringify(params.previousSnapshot))
    : undefined;

  return backendApiGetMarket<BackendMarketPulseSummaryDto>("/market/pulse/summary", {
    exchange: params.exchange ?? "DSE",
    previous_snapshot: previousSnapshot,
    display_name: params.displayName ?? undefined,
  });
}

export function getMarketPulseBriefing(params: { exchange?: ExchangeCode; displayName?: string | null } = {}) {
  return backendApiGetMarket<BackendMarketBriefingDto | null>("/market/pulse/briefing", {
    exchange: params.exchange ?? "DSE",
    display_name: params.displayName ?? undefined,
  });
}
