"use client";

import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Mail,
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
  AdminDataTableHead,
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
  });

  const freshness = data?.data_health.overall_freshness_label ?? "Unknown";
  const systemHealthTone =
    freshness.toLowerCase().includes("stale") || freshness.toLowerCase().includes("critical")
      ? "warning"
      : freshness.toLowerCase().includes("healthy")
        ? "positive"
        : "neutral";

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
              helper={data.data_health.failed_jobs_count === 0 ? "No critical issues" : "Review failed jobs"}
              icon={CheckCircle2}
              label="System Health"
              tone={systemHealthTone}
              value={freshness}
            />
          </AdminKpiGrid>

          <AdminSection description="Live ingestion and data quality signals" title="Data Health">
            <div className="admin-health-grid">
              <HealthCard
                label="Market Sync"
                meta={`Last updated ${formatDate(data.data_health.latest_market_sync_at)}`}
                tone={data.data_health.latest_market_sync_at ? "positive" : "warning"}
                value={data.data_health.latest_market_sync_at ? "Current" : "Missing"}
              />
              <HealthCard
                label="Snapshot Status"
                meta={`Last updated ${formatDate(data.data_health.latest_market_snapshot_at)}`}
                tone={data.data_health.latest_market_snapshot_at ? "positive" : "warning"}
                value={data.data_health.latest_market_snapshot_at ? "Current" : "Missing"}
              />
              <HealthCard
                label="Stock Details"
                meta={`Last updated ${formatDate(data.data_health.latest_stock_details_sync_at)}`}
                tone={data.data_health.latest_stock_details_sync_at ? "positive" : "warning"}
                value={data.data_health.latest_stock_details_sync_at ? "Current" : "Missing"}
              />
              <HealthCard
                label="Suspicious Prices"
                meta="Requires review if elevated"
                tone={healthTone(data.data_health.suspicious_prices_count, 1, 3)}
                value={data.data_health.suspicious_prices_count}
              />
              <HealthCard
                label="Missing Prices"
                meta={`${data.data_health.active_stocks_without_latest_price} active stocks missing latest price`}
                tone={healthTone(data.data_health.active_stocks_without_latest_price, 1, 10)}
                value={data.data_health.partial_prices_count}
              />
              <HealthCard
                label="Email Failures"
                meta={`Last sent ${formatDate(data.email_campaign_health.last_sent_at)}`}
                tone={healthTone(data.email_campaign_health.failed_count)}
                value={data.email_campaign_health.failed_count}
              />
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
                  <AdminDataTableCell align="right">Actions</AdminDataTableCell>
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
                      <AdminDataTableCell align="right">
                        <span className="admin-config-key">View</span>
                      </AdminDataTableCell>
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
    tone === "positive" ? <CheckCircle2 size={16} /> : tone === "warning" ? <Clock3 size={16} /> : <AlertTriangle size={16} />;

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
