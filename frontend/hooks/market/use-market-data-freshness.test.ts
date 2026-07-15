import { describe, expect, it } from "vitest";

import type { BackendMarketFreshnessDto } from "@/lib/api/backend-api-types";

import { buildMarketFreshnessViewModel } from "./use-market-data-freshness";

const freshness: BackendMarketFreshnessDto = {
  exchange: "DSE",
  trade_date: "2026-07-15",
  last_synced_at: "2026-07-15T12:30:00+06:00",
  decision_session_date: "2026-07-14",
  live_data_as_of: "2026-07-15T12:30:00+06:00",
  is_live_session: true,
  next_sync_at: "2026-07-15T12:45:00+06:00",
  snapshot_interval_minutes: 15,
  market_sync_interval_seconds: 900,
  dashboard_cache_ttl_seconds: 600,
  expected_delay_minutes: 15,
  market_open_time: "10:00",
  market_close_time: "15:00",
  market_status: "OPEN",
  freshness_label: "Snapshot prices; updates about every 15 minutes",
};

describe("buildMarketFreshnessViewModel", () => {
  it("preserves explicit provisional and completed-session metadata", () => {
    const model = buildMarketFreshnessViewModel(freshness, false, false);

    expect(model.isLiveSession).toBe(true);
    expect(model.decisionSessionLabel).toBe("2026-07-14");
    expect(model.raw?.live_data_as_of).toBe("2026-07-15T12:30:00+06:00");
  });
});
