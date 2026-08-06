import { describe, expect, it } from "vitest";

import {
  formatHealthStateLabel,
  formatJobStatusLabel,
} from "@/features/admin/components/admin-status-badge";
import type {
  AdminDashboardOverview,
  SystemJobTriggerResult,
} from "@/features/admin/types/admin-types";
import {
  ADMIN_JOB_ACTIONS,
  buildAdminMarketHealthCards,
  buildDataQualityCards,
  buildJobHistoryEmptyState,
  buildJobTriggerFeedback,
  buildOperationalSummaryCards,
  hasActiveJobHistoryFilters,
} from "@/features/admin/lib/admin-operations-view-model";
import { formatAdminDateTime } from "@/features/admin/utils/format-admin-datetime";

function dashboardFixture(
  overrides: Partial<AdminDashboardOverview> = {},
): AdminDashboardOverview {
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
        state: "DELAYED",
        reason: "Finalization is behind the live session.",
        last_successful_at: "2026-08-06T10:25:00+06:00",
      },
      market_snapshot_health: {
        state: "CURRENT",
        reason: "Latest LIVE generation is current.",
        last_successful_at: "2026-08-06T10:25:00+06:00",
      },
      market_session_health: {
        state: "DELAYED",
        reason: "The published market session is newer than the latest finalized DSEX session.",
        last_successful_at: "2026-08-03T15:15:00+06:00",
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
        is_finalized: false,
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
    ...overrides,
  };
}

describe("admin operations view models", () => {
  it("keeps live snapshot CURRENT and DSEX finalization DELAYED as separate facts", () => {
    const cards = buildOperationalSummaryCards(dashboardFixture());

    expect(cards.find((card) => card.key === "market-snapshot")).toMatchObject({
      label: "Live Market Snapshot",
      status: "CURRENT",
    });
    expect(cards.find((card) => card.key === "dsex-finalization")).toMatchObject({
      label: "DSEX Finalization",
      status: "DELAYED",
    });
  });

  it("shows scheduler Online in the operational summary", () => {
    const cards = buildOperationalSummaryCards(dashboardFixture());

    expect(cards.find((card) => card.key === "backend-scheduler")).toMatchObject({
      label: "Backend Scheduler",
      status: "ONLINE",
    });
    expect(formatHealthStateLabel("ONLINE")).toBe("Online");
  });

  it("renders Missing Prices from active missing stocks and separates no-trade rows", () => {
    const cards = buildDataQualityCards(dashboardFixture());

    expect(cards.find((card) => card.label === "Missing Prices")?.value).toBe(7);
    expect(cards.find((card) => card.label === "Expected No-Trade")?.value).toBe(9);
    expect(
      cards.find((card) => card.label === "Expected No-Trade")?.helper,
    ).toContain("not counted as missing");
  });

  it("formats admin timestamps in Asia/Dhaka", () => {
    const formatted = formatAdminDateTime("2026-08-06T15:18:53+06:00");
    expect(formatted).toContain("6 Aug 2026");
    expect(formatted).toMatch(/3:18/i);
  });

  it("uses friendly empty history states", () => {
    expect(buildJobHistoryEmptyState({
      jobType: "ALL",
      jobStatus: "ALL",
      triggerSource: "ALL",
      dateFrom: "",
      dateTo: "",
    })).toMatchObject({
      title: "No executions yet",
    });

    expect(buildJobHistoryEmptyState({
      jobType: "MARKET_SNAPSHOT",
      jobStatus: "ALL",
      triggerSource: "ALL",
      dateFrom: "",
      dateTo: "",
    })).toMatchObject({
      title: "No executions match these filters",
    });
  });

  it("detects active job history filters", () => {
    expect(
      hasActiveJobHistoryFilters({
        jobType: "ALL",
        jobStatus: "ALL",
        triggerSource: "ALL",
        dateFrom: "",
        dateTo: "",
      }),
    ).toBe(false);

    expect(
      hasActiveJobHistoryFilters({
        jobType: "ALL",
        jobStatus: "FAILED",
        triggerSource: "ALL",
        dateFrom: "",
        dateTo: "",
      }),
    ).toBe(true);
  });

  it("maps job statuses to friendly labels", () => {
    expect(formatJobStatusLabel("PENDING")).toBe("Waiting");
    expect(formatJobStatusLabel("SUCCEEDED")).toBe("Completed");
    expect(formatJobStatusLabel("PARTIAL")).toBe("Partial");
    expect(formatJobStatusLabel("SKIPPED")).toBe("Skipped");
    expect(formatJobStatusLabel("FAILED")).toBe("Failed");
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
      message: "The job is waiting to be picked up by the scheduler.",
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

  it("keeps legacy market health card builder compatible", () => {
    const cards = buildAdminMarketHealthCards(dashboardFixture());
    expect(cards.some((card) => card.label === "Live Market Snapshot")).toBe(true);
    expect(cards.some((card) => card.label === "Missing Prices")).toBe(true);
  });
});
