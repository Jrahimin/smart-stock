"use client";

import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Mail,
  Server,
  Shield,
  Users,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { AdminKpiCard, AdminKpiGrid } from "@/features/admin/components/admin-kpi-card";
import { AdminPageHeader } from "@/features/admin/components/admin-page-header";
import {
  AdminDataTable,
  AdminDataTableBody,
  AdminDataTableCell,
  AdminDataTableRow,
  AdminEmptyState,
  AdminSection,
} from "@/features/admin/components/admin-data-table";
import { AdminKpiSkeleton, AdminTableSkeleton } from "@/features/admin/components/admin-skeleton";
import {
  AdminStatusBadge,
  formatStatusLabel,
  jobStatusTone,
} from "@/features/admin/components/admin-status-badge";
import {
  adminHealthTone,
  buildAdminMarketHealthCards,
} from "@/features/admin/lib/admin-operations-view-model";
import { fetchAdminDashboard } from "@/lib/api/admin-api";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function healthTone(count: number, warningAt = 1, criticalAt = 5) {
  if (count >= criticalAt) return "negative" as const;
  if (count >= warningAt) return "warning" as const;
  return "positive" as const;
}

export function AdminDashboardView() {
  const { data, isLoading, error, dataUpdatedAt } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: fetchAdminDashboard,
    refetchInterval: 60_000,
  });

  const healthCards = data ? buildAdminMarketHealthCards(data) : [];

  return (
    <div className="admin-workspace workspace-page-stack">
      <AdminPageHeader
        description="Operational overview, data health, and recent system jobs."
        lastUpdated={data ? new Date(dataUpdatedAt).toISOString() : null}
        title="Operations Dashboard"
      />

      {isLoading ? <AdminKpiSkeleton count={6} /> : null}
      {error ? <section className="placeholder-panel">Failed to load admin dashboard.</section> : null}

      {data ? (
        <>
          <AdminKpiGrid>
            <AdminKpiCard
              helper={`${data.users.active_users} active users`}
              icon={Users}
              label="Total Users"
              tone="info"
              value={data.users.total_users}
            />
            <AdminKpiCard
              helper={`${data.users.inactive_users} inactive`}
              icon={Activity}
              label="Active Users"
              tone="positive"
              value={data.users.active_users}
            />
            <AdminKpiCard
              helper={`${data.users.super_admin_users} super admins`}
              icon={Shield}
              label="Admins"
              tone="neutral"
              value={data.users.admin_users + data.users.super_admin_users}
            />
            <AdminKpiCard
              helper="Across all job types"
              icon={AlertTriangle}
              label="Failed Jobs"
              tone={healthTone(data.data_health.failed_jobs_count)}
              value={data.data_health.failed_jobs_count}
            />
            <AdminKpiCard
              helper={`${data.email_campaign_health.running_count} running`}
              icon={Mail}
              label="Queued Campaigns"
              tone={data.email_campaign_health.queued_count > 0 ? "warning" : "neutral"}
              value={data.email_campaign_health.queued_count}
            />
            <AdminKpiCard
              helper={data.data_health.market_data_health.reason}
              icon={CheckCircle2}
              label="Market Data Health"
              tone={adminHealthTone(data.data_health.market_data_health.state)}
              value={data.data_health.market_data_health.state}
            />
            <AdminKpiCard
              helper={data.scheduler.liveness.reason}
              icon={Server}
              label="Backend Scheduler"
              tone={schedulerTone(data.scheduler.liveness.state)}
              value={data.scheduler.liveness.state}
            />
          </AdminKpiGrid>

          <AdminSection
            description="Persisted liveness is measured separately from enabled configuration and calculated next runs."
            title="Scheduler Runtime"
          >
            <div className="admin-health-grid">
              <HealthCard
                label="Backend Scheduler"
                meta={`${data.scheduler.liveness.reason} Last heartbeat ${formatDate(
                  data.scheduler.liveness.last_heartbeat_at,
                )}.`}
                tone={schedulerHealthTone(data.scheduler.liveness.state)}
                value={data.scheduler.liveness.state}
              />
              <HealthCard
                label="Market Snapshot Schedule"
                meta={`Next run ${formatDate(
                  data.scheduler.next_runs.market_snapshot_at,
                )}. Queue poll ${data.scheduler.configuration.queue_poll_seconds}s.`}
                tone={
                  data.scheduler.configuration.market_snapshot_scheduler_enabled
                    ? "positive"
                    : "warning"
                }
                value={
                  data.scheduler.configuration.market_snapshot_scheduler_enabled
                    ? "ENABLED"
                    : "DISABLED"
                }
              />
              <HealthCard
                label="Daily Close Schedule"
                meta={`Next run ${formatDate(
                  data.scheduler.next_runs.daily_market_sync_at,
                )}.`}
                tone={
                  data.scheduler.configuration
                    .daily_market_sync_scheduler_enabled
                    ? "positive"
                    : "warning"
                }
                value={
                  data.scheduler.configuration
                    .daily_market_sync_scheduler_enabled
                    ? "ENABLED"
                    : "DISABLED"
                }
              />
              <HealthCard
                label="Stock Details Due Batch"
                meta={`${
                  data.scheduler.configuration.stock_details_sync_batch_size
                } due stocks at ${
                  data.scheduler.configuration.stock_details_sync_time
                } Asia/Dhaka. Next run ${formatDate(
                  data.scheduler.next_runs.stock_details_sync_at,
                )}.`}
                tone={
                  data.scheduler.configuration
                    .stock_details_sync_scheduler_enabled
                    ? "positive"
                    : "warning"
                }
                value={
                  data.scheduler.configuration
                    .stock_details_sync_scheduler_enabled
                    ? "ENABLED"
                    : "DISABLED"
                }
              />
            </div>
          </AdminSection>

          <AdminSection
            description="Measured publication, DSEX finalization, stock-detail, and latest-session quality state."
            title="Market Data Health"
          >
            <div className="admin-health-grid">
              {healthCards.map((card) => (
                <HealthCard key={card.label} {...card} />
              ))}
            </div>
          </AdminSection>

          <AdminSection description="Latest operational runs across the platform" title="Recent Job Executions">
            {data.recent_job_executions.length === 0 ? (
              <AdminEmptyState description="Triggered jobs will appear here once they run." title="No job executions yet" />
            ) : (
              <AdminDataTable>
                <div className="admin-data-table-head">
                  <AdminDataTableCell>Job</AdminDataTableCell>
                  <AdminDataTableCell>Status</AdminDataTableCell>
                  <AdminDataTableCell>Started</AdminDataTableCell>
                  <AdminDataTableCell>Duration</AdminDataTableCell>
                  <AdminDataTableCell>Trigger</AdminDataTableCell>
                </div>
                <AdminDataTableBody>
                  {data.recent_job_executions.map((job) => (
                    <AdminDataTableRow key={job.id}>
                      <AdminDataTableCell>
                        <strong>{job.job_name}</strong>
                        <div className="admin-config-key">{job.job_type}</div>
                      </AdminDataTableCell>
                      <AdminDataTableCell>
                        <AdminStatusBadge label={formatStatusLabel(job.status)} tone={jobStatusTone(job.status)} />
                      </AdminDataTableCell>
                      <AdminDataTableCell>{formatDate(job.started_at)}</AdminDataTableCell>
                      <AdminDataTableCell>
                        {job.duration_ms != null ? `${job.duration_ms} ms` : "—"}
                      </AdminDataTableCell>
                      <AdminDataTableCell>{formatStatusLabel(job.trigger_source)}</AdminDataTableCell>
                    </AdminDataTableRow>
                  ))}
                </AdminDataTableBody>
              </AdminDataTable>
            )}
          </AdminSection>
        </>
      ) : null}

      {isLoading ? <AdminTableSkeleton rows={4} /> : null}
    </div>
  );
}

function schedulerTone(state: "ONLINE" | "OFFLINE" | "UNKNOWN") {
  if (state === "ONLINE") return "positive" as const;
  if (state === "OFFLINE") return "negative" as const;
  return "warning" as const;
}

function schedulerHealthTone(
  state: "ONLINE" | "OFFLINE" | "UNKNOWN",
): "positive" | "warning" | "negative" {
  return schedulerTone(state);
}

function HealthCard({
  label,
  value,
  meta,
  tone,
}: {
  label: string;
  value: string | number;
  meta: string;
  tone: "positive" | "warning" | "negative";
}) {
  const icon =
    tone === "positive" ? (
      <CheckCircle2 size={16} />
    ) : tone === "warning" ? (
      <Clock3 size={16} />
    ) : (
      <AlertTriangle size={16} />
    );

  return (
    <article className={`admin-health-card admin-health-card-${tone}`}>
      <div className="admin-health-card-head">
        <strong>{label}</strong>
        <span aria-hidden="true">{icon}</span>
      </div>
      <div className="admin-health-card-value">{value}</div>
      <div className="admin-health-card-meta">{meta}</div>
    </article>
  );
}
