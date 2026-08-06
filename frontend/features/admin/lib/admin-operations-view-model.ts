import type {
  AdminDashboardOverview,
  AdminDataHealthState,
  SystemJobTriggerResult,
  SystemJobType,
} from "@/features/admin/types/admin-types";

export type AdminJobAction = {
  jobType: SystemJobType;
  label: string;
  description: string;
};

export const ADMIN_JOB_ACTIONS: AdminJobAction[] = [
  {
    jobType: "MARKET_SNAPSHOT",
    label: "Market Snapshot",
    description: "Publish one validated live price and DSEX snapshot.",
  },
  {
    jobType: "MARKET_SYNC",
    label: "Daily Close, News & Finalization",
    description: "Ingest daily news and finalize the DSEX session when its inputs exist.",
  },
  {
    jobType: "STOCK_DETAILS_SYNC",
    label: "Stock Details Batch (20)",
    description: "Sync up to 20 DSE stock-detail records in the default full scope.",
  },
];

export function findAdminJobAction(jobType: SystemJobType) {
  return ADMIN_JOB_ACTIONS.find((action) => action.jobType === jobType);
}

export function adminHealthTone(state: AdminDataHealthState) {
  if (state === "CURRENT") return "positive" as const;
  if (state === "DELAYED") return "warning" as const;
  return "negative" as const;
}

export function buildAdminMarketHealthCards(data: AdminDashboardOverview) {
  const health = data.data_health;
  const generation = health.latest_market_generation;
  const session = health.latest_market_session;
  const stockDetails = health.stock_details;
  return [
    {
      label: "Market Snapshot",
      value: health.market_snapshot_health.state,
      meta: generation
        ? `${generation.accepted_count}/${generation.fetched_count} accepted · ${generation.source} · ${generation.trade_date}. ${health.market_snapshot_health.reason} Last success ${formatHealthTimestamp(health.market_snapshot_health.last_successful_at)}.`
        : health.market_snapshot_health.reason,
      tone: adminHealthTone(health.market_snapshot_health.state),
    },
    {
      label: "Daily Close & Finalization",
      value: health.market_session_health.state,
      meta: session
        ? `Finalized ${session.trade_date} · ${session.source}. ${health.market_session_health.reason} Last success ${formatHealthTimestamp(health.market_session_health.last_successful_at)}.`
        : health.market_session_health.reason,
      tone: adminHealthTone(health.market_session_health.state),
    },
    {
      label: "Stock Details",
      value: stockDetails.health.state,
      meta: `${stockDetails.due_count} due · ${stockDetails.completed_count} completed · ${stockDetails.failed_count} failed. ${stockDetails.health.reason} Last success ${formatHealthTimestamp(stockDetails.health.last_successful_at)}.`,
      tone: adminHealthTone(stockDetails.health.state),
    },
    {
      label: "Suspicious Prices",
      value: health.suspicious_prices_count,
      meta: `Latest session only${health.latest_price_trade_date ? ` · ${health.latest_price_trade_date}` : ""}`,
      tone: countHealthTone(health.suspicious_prices_count, 1, 3),
    },
    {
      label: "Missing Prices",
      value: health.active_stocks_without_latest_price,
      meta: `Active DSE stocks without a row for ${health.latest_price_trade_date ?? "the latest published session"}`,
      tone: countHealthTone(health.active_stocks_without_latest_price, 1, 10),
    },
    {
      label: "Expected No-Trade",
      value: health.expected_no_trade_count,
      meta: "Latest-session source placeholders; not counted as missing prices",
      tone: "positive" as const,
    },
  ];
}

export function buildJobTriggerFeedback(
  jobType: SystemJobType,
  result: SystemJobTriggerResult,
) {
  const action = findAdminJobAction(jobType);
  const label = action?.label ?? jobType;
  if (result.deduplicated) {
    return {
      tone: "warning" as const,
      title: `${label} is already queued or running`,
      message: `Using the existing ${result.execution.status.toLowerCase()} execution ${result.execution.id}.`,
      execution: result.execution,
    };
  }

  return {
    tone: "positive" as const,
    title: `${label} queued`,
    message: `Execution ${result.execution.id} is pending and will be claimed by backend-scheduler.`,
    execution: result.execution,
  };
}

function formatHealthTimestamp(value: string | null) {
  return value ? new Date(value).toLocaleString() : "never";
}

function countHealthTone(count: number, warningAt = 1, criticalAt = 5) {
  if (count >= criticalAt) return "negative" as const;
  if (count >= warningAt) return "warning" as const;
  return "positive" as const;
}
