import type {
  AdminDashboardOverview,
  AdminDataHealthState,
  SystemJobExecutionStatus,
  SystemJobTriggerResult,
  SystemJobTriggerSource,
  SystemJobType,
} from "@/features/admin/types/admin-types";
import { formatAdminDateTime } from "@/features/admin/utils/format-admin-datetime";

export type AdminJobAction = {
  jobType: SystemJobType;
  label: string;
  description: string;
};

export type AdminOperationSummaryCard = {
  key: string;
  label: string;
  status: string;
  statusTone: "positive" | "warning" | "negative" | "neutral" | "info";
  explanation: string;
  footer: string;
};

export type AdminScheduleRow = {
  name: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  status: AdminDataHealthState;
};

export type AdminDataQualityCard = {
  label: string;
  value: string | number;
  helper: string;
  tone: "positive" | "warning" | "negative";
};

export type AdminJobHistoryFilters = {
  jobType: SystemJobType | "ALL";
  jobStatus: SystemJobExecutionStatus | "ALL";
  triggerSource: SystemJobTriggerSource | "ALL";
  dateFrom: string;
  dateTo: string;
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

export function schedulerTone(state: "ONLINE" | "OFFLINE" | "UNKNOWN") {
  if (state === "ONLINE") return "positive" as const;
  if (state === "OFFLINE") return "negative" as const;
  return "warning" as const;
}

export function buildOperationalSummaryCards(
  data: AdminDashboardOverview,
): AdminOperationSummaryCard[] {
  const health = data.data_health;
  const generation = health.latest_market_generation;
  const session = health.latest_market_session;
  const stockDetails = health.stock_details;

  return [
    {
      key: "market-snapshot",
      label: "Live Market Snapshot",
      status: health.market_snapshot_health.state,
      statusTone: adminHealthTone(health.market_snapshot_health.state),
      explanation: shortenReason(health.market_snapshot_health.reason),
      footer: generation
        ? `Last success ${formatAdminDateTime(health.market_snapshot_health.last_successful_at)} · ${generation.accepted_count}/${generation.fetched_count} accepted`
        : `Last success ${formatAdminDateTime(health.market_snapshot_health.last_successful_at)}`,
    },
    {
      key: "dsex-finalization",
      label: "DSEX Finalization",
      status: health.market_session_health.state,
      statusTone: adminHealthTone(health.market_session_health.state),
      explanation: shortenReason(health.market_session_health.reason),
      footer: session
        ? `Last success ${formatAdminDateTime(health.market_session_health.last_successful_at)} · ${session.trade_date}`
        : `Last success ${formatAdminDateTime(health.market_session_health.last_successful_at)}`,
    },
    {
      key: "stock-details",
      label: "Stock Details",
      status: stockDetails.health.state,
      statusTone: adminHealthTone(stockDetails.health.state),
      explanation: shortenReason(stockDetails.health.reason),
      footer: `${stockDetails.due_count} due · ${stockDetails.completed_count} completed · Last success ${formatAdminDateTime(stockDetails.health.last_successful_at)}`,
    },
    {
      key: "backend-scheduler",
      label: "Backend Scheduler",
      status: data.scheduler.liveness.state,
      statusTone: schedulerTone(data.scheduler.liveness.state),
      explanation: shortenReason(data.scheduler.liveness.reason),
      footer: `Last heartbeat ${formatAdminDateTime(data.scheduler.liveness.last_heartbeat_at)}`,
    },
  ];
}

export function buildScheduleOverviewRows(
  data: AdminDashboardOverview,
): AdminScheduleRow[] {
  const { configuration, next_runs } = data.scheduler;
  const health = data.data_health;

  return [
    {
      name: "Market Snapshot",
      enabled: configuration.market_snapshot_scheduler_enabled,
      lastRunAt: health.market_snapshot_health.last_successful_at,
      nextRunAt: next_runs.market_snapshot_at,
      status: health.market_snapshot_health.state,
    },
    {
      name: "Daily Close & Finalization",
      enabled: configuration.daily_market_sync_scheduler_enabled,
      lastRunAt: health.market_session_health.last_successful_at,
      nextRunAt: next_runs.daily_market_sync_at,
      status: health.market_session_health.state,
    },
    {
      name: "Stock Details Due Batch",
      enabled: configuration.stock_details_sync_scheduler_enabled,
      lastRunAt: health.stock_details.health.last_successful_at,
      nextRunAt: next_runs.stock_details_sync_at,
      status: health.stock_details.health.state,
    },
  ];
}

export function buildDataQualityCards(
  data: AdminDashboardOverview,
): AdminDataQualityCard[] {
  const health = data.data_health;
  const sessionDate = health.latest_price_trade_date ?? "the latest session";

  return [
    {
      label: "Missing Prices",
      value: health.active_stocks_without_latest_price,
      helper: `Active DSE stocks without a price row for ${sessionDate}`,
      tone: countHealthTone(health.active_stocks_without_latest_price, 1, 10),
    },
    {
      label: "Expected No-Trade",
      value: health.expected_no_trade_count,
      helper: "Source placeholders for no-trade stocks; not counted as missing prices",
      tone: "positive",
    },
    {
      label: "Suspicious Prices",
      value: health.suspicious_prices_count,
      helper: `Latest session only${health.latest_price_trade_date ? ` · ${health.latest_price_trade_date}` : ""}`,
      tone: countHealthTone(health.suspicious_prices_count, 1, 3),
    },
    {
      label: "Failed Jobs",
      value: health.failed_jobs_count,
      helper: "Jobs that ended in a failed state across all types",
      tone: countHealthTone(health.failed_jobs_count, 1, 1),
    },
  ];
}

/** @deprecated Use buildOperationalSummaryCards and buildDataQualityCards instead. */
export function buildAdminMarketHealthCards(data: AdminDashboardOverview) {
  const summary = buildOperationalSummaryCards(data);
  const quality = buildDataQualityCards(data);

  return [
    ...summary.map((card) => ({
      label: card.label,
      value: card.status,
      meta: `${card.explanation} ${card.footer}`,
      tone: card.statusTone,
    })),
    ...quality.map((card) => ({
      label: card.label,
      value: card.value,
      meta: card.helper,
      tone: card.tone,
    })),
  ];
}

export function buildJobHistoryEmptyState(filters: AdminJobHistoryFilters) {
  if (hasActiveJobHistoryFilters(filters)) {
    return {
      title: "No executions match these filters",
      description: "Try clearing filters or choosing a wider date range.",
    };
  }

  return {
    title: "No executions yet",
    description: "Jobs will appear here once the queue runs for the first time.",
  };
}

export function hasActiveJobHistoryFilters(filters: AdminJobHistoryFilters) {
  return (
    filters.jobType !== "ALL" ||
    filters.jobStatus !== "ALL" ||
    filters.triggerSource !== "ALL" ||
    Boolean(filters.dateFrom) ||
    Boolean(filters.dateTo)
  );
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
      message: `Using the existing ${result.execution.status.toLowerCase()} execution.`,
      execution: result.execution,
    };
  }

  return {
    tone: "positive" as const,
    title: `${label} queued`,
    message: "The job is waiting to be picked up by the scheduler.",
    execution: result.execution,
  };
}

function shortenReason(reason: string) {
  const trimmed = reason.trim();
  if (trimmed.length <= 120) return trimmed;
  return `${trimmed.slice(0, 117)}…`;
}

function countHealthTone(count: number, warningAt = 1, criticalAt = 5) {
  if (count >= criticalAt) return "negative" as const;
  if (count >= warningAt) return "warning" as const;
  return "positive" as const;
}
