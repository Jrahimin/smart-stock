import { describe, expect, it } from "vitest";

import type {
  AdminDashboardOverview,
  SystemJobTriggerResult,
} from "@/features/admin/types/admin-types";
import {
  ADMIN_JOB_ACTIONS,
  buildAdminMarketHealthCards,
  buildJobTriggerFeedback,
} from "@/features/admin/lib/admin-operations-view-model";

function dashboardFixture(): AdminDashboardOverview {
  return {
    users: {
      total_users: 2,
      active_users: 2,
      inactive_users: 0,
      deleted_users: 0,
      admin_users: 1,
      super_admin_users: 1,
    },
    scheduler: {
      liveness: {
        component_name: "backend-scheduler",
        state: "ONLINE",
        reason: "Heartbeat is current.",
        last_heartbeat_at: "2026-08-06T10:25:00+06:00",
        heartbeat_age_seconds: 30,
      },
      configuration: {
        market_snapshot_scheduler_enabled: true,
        daily_market_sync_scheduler_enabled: true,
        stock_details_sync_scheduler_enabled: true,
        queue_poll_seconds: 10,
        stock_details_sync_time: "15:35",
        stock_details_sync_batch_size: 50,
      },
      next_runs: {
        market_snapshot_at: "2026-08-06T10:30:00+06:00",
        daily_market_sync_at: "2026-08-06T15:15:00+06:00",
        stock_details_sync_at: "2026-08-06T15:35:00+06:00",
      },
    },
    data_health: {
      market_data_health: {
        state: "CURRENT",
        reason: "Published market data is current.",
        last_successful_at: "2026-08-06T10:25:00+06:00",
      },
      market_snapshot_health: {
        state: "CURRENT",
        reason: "Latest LIVE generation is current.",
        last_successful_at: "2026-08-06T10:25:00+06:00",
      },
      market_session_health: {
        state: "CURRENT",
        reason: "DSEX is finalized.",
        last_successful_at: "2026-08-06T10:25:00+06:00",
      },
      latest_market_generation: {
        trade_date: "2026-08-06",
        sync_id: "live-20260806",
        source: "AMARSTOCK_MARKET_MSGPACK",
        source_last_synced_at: "2026-08-06T10:25:00+06:00",
        published_at: "2026-08-06T10:26:00+06:00",
        fetched_count: 400,
        accepted_count: 390,
        suspicious_count: 2,
      },
      latest_market_session: {
        trade_date: "2026-08-06",
        source: "AMARSTOCK_INDEX_API",
        updated_at: "2026-08-06T10:26:00+06:00",
        is_finalized: true,
      },
      stock_details: {
        health: {
          state: "DELAYED",
          reason: "12 stocks are due.",
          last_successful_at: "2026-08-04T10:00:00+06:00",
        },
        latest_status: "PARTIAL",
        latest_source: "AMARSTOCK_API",
        due_count: 12,
        completed_count: 280,
        failed_count: 3,
      },
      failed_jobs_count: 0,
      suspicious_prices_count: 2,
      expected_no_trade_count: 9,
      active_stocks_without_latest_price: 7,
      latest_price_trade_date: "2026-08-06",
    },
    email_campaign_health: {
      queued_count: 0,
      running_count: 0,
      failed_count: 0,
      last_sent_at: null,
    },
    recent_job_executions: [],
  };
}

describe("admin operations view models", () => {
  it("renders Missing Prices from active missing stocks and separates no-trade rows", () => {
    const cards = buildAdminMarketHealthCards(dashboardFixture());

    expect(cards.find((card) => card.label === "Missing Prices")?.value).toBe(7);
    expect(cards.find((card) => card.label === "Expected No-Trade")?.value).toBe(9);
    expect(
      cards.find((card) => card.label === "Expected No-Trade")?.meta,
    ).toContain("not counted as missing");
  });

  it("exposes only truthful manual actions with accurate names and scope", () => {
    expect(ADMIN_JOB_ACTIONS.map((action) => action.jobType)).toEqual([
      "MARKET_SNAPSHOT",
      "MARKET_SYNC",
      "STOCK_DETAILS_SYNC",
    ]);
    expect(ADMIN_JOB_ACTIONS.map((action) => action.label)).toContain(
      "Daily Close, News & Finalization",
    );
    expect(ADMIN_JOB_ACTIONS.map((action) => action.label)).toContain(
      "Stock Details Batch (20)",
    );
    expect(
      ADMIN_JOB_ACTIONS.find((action) => action.jobType === "STOCK_DETAILS_SYNC")
        ?.description,
    ).toContain("20");
  });

  it("shows queued feedback for a new durable execution", () => {
    const result = {
      execution: {
        id: "execution-1",
        status: "PENDING",
      } as SystemJobTriggerResult["execution"],
      deduplicated: false,
    };

    expect(buildJobTriggerFeedback("MARKET_SNAPSHOT", result)).toMatchObject({
      tone: "positive",
      title: "Market Snapshot queued",
    });
  });

  it("reports an existing active execution instead of a duplicate failure", () => {
    const result = {
      execution: {
        id: "execution-1",
        status: "RUNNING",
      } as SystemJobTriggerResult["execution"],
      deduplicated: true,
    };

    expect(buildJobTriggerFeedback("MARKET_SNAPSHOT", result)).toMatchObject({
      tone: "warning",
      title: "Market Snapshot is already queued or running",
    });
  });
});
