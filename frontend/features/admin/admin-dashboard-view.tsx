"use client";

import { useQuery } from "@tanstack/react-query";

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
  AdminMetricGrid,
  AdminOperationCard,
  AdminOperationGrid,
} from "@/features/admin/components/admin-operation-card";
import { AdminPageHeader } from "@/features/admin/components/admin-page-header";
import { AdminScheduleOverview } from "@/features/admin/components/admin-schedule-overview";
import { AdminUsersSummaryCard } from "@/features/admin/components/admin-users-summary-card";
import {
  AdminStatusBadge,
  formatHealthStateLabel,
  formatJobStatusLabel,
  formatTriggerSourceLabel,
  healthStateTone,
  jobStatusTone,
} from "@/features/admin/components/admin-status-badge";
import {
  buildDataQualityCards,
  buildOperationalSummaryCards,
  buildScheduleOverviewRows,
} from "@/features/admin/lib/admin-operations-view-model";
import {
  formatAdminDateTime,
  formatAdminDuration,
} from "@/features/admin/utils/format-admin-datetime";
import { fetchAdminDashboard } from "@/lib/api/admin-api";

export function AdminDashboardView() {
  const { data, isLoading, error, dataUpdatedAt, refetch, isFetching } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: fetchAdminDashboard,
    refetchInterval: 60_000,
  });

  const summaryCards = data ? buildOperationalSummaryCards(data) : [];
  const scheduleRows = data ? buildScheduleOverviewRows(data) : [];
  const qualityCards = data ? buildDataQualityCards(data) : [];

  return (
    <div className="admin-workspace workspace-page-stack">
      <AdminPageHeader
        description="Live market operations, schedules, and recent job activity."
        lastUpdated={data ? new Date(dataUpdatedAt).toISOString() : null}
        onRefresh={() => void refetch()}
        isRefreshing={isFetching}
        statusChip={
          data
            ? {
                label: formatHealthStateLabel(data.scheduler.liveness.state),
                tone: healthStateTone(data.scheduler.liveness.state),
              }
            : null
        }
        title="Operations Dashboard"
      />

      {isLoading ? <AdminKpiSkeleton count={4} /> : null}
      {error ? <section className="placeholder-panel">Failed to load admin dashboard.</section> : null}

      {data ? (
        <>
          <AdminSection
            actions={<AdminUsersSummaryCard users={data.users} />}
            className="admin-section-compact"
            title="Operational summary"
          >
            <AdminOperationGrid>
              {summaryCards.map((card) => (
                <AdminOperationCard
                  explanation={card.explanation}
                  footer={card.footer}
                  key={card.key}
                  label={card.label}
                  statusLabel={formatHealthStateLabel(card.status)}
                  statusTone={card.statusTone}
                />
              ))}
            </AdminOperationGrid>
          </AdminSection>

          <AdminSection className="admin-section-compact" title="Schedule overview">
            <AdminScheduleOverview rows={scheduleRows} />
          </AdminSection>

          <AdminSection className="admin-section-compact" title="Data quality">
            <AdminMetricGrid>
              {qualityCards.map((card) => (
                <article
                  className={`admin-metric-card admin-metric-card-${card.tone}`}
                  key={card.label}
                >
                  <span className="admin-metric-card-label">{card.label}</span>
                  <strong className="admin-metric-card-value">{card.value}</strong>
                  <p className="admin-metric-card-helper">{card.helper}</p>
                </article>
              ))}
            </AdminMetricGrid>
          </AdminSection>

          <AdminSection className="admin-section-compact" title="Recent activity">
            {data.recent_job_executions.length === 0 ? (
              <AdminEmptyState
                description="Jobs will appear here once the queue runs for the first time."
                title="No executions yet"
              />
            ) : (
              <AdminDataTable className="admin-data-table-activity">
                <div className="admin-data-table-head">
                  <AdminDataTableCell>Job</AdminDataTableCell>
                  <AdminDataTableCell>Status</AdminDataTableCell>
                  <AdminDataTableCell>Trigger</AdminDataTableCell>
                  <AdminDataTableCell>Created</AdminDataTableCell>
                  <AdminDataTableCell>Duration</AdminDataTableCell>
                  <AdminDataTableCell align="right">Details</AdminDataTableCell>
                </div>
                <AdminDataTableBody>
                  {data.recent_job_executions.map((job) => (
                    <AdminDataTableRow key={job.id}>
                      <AdminDataTableCell>
                        <strong>{job.job_name}</strong>
                        <div className="admin-config-key">{job.job_type}</div>
                      </AdminDataTableCell>
                      <AdminDataTableCell>
                        <AdminStatusBadge
                          label={formatJobStatusLabel(job.status)}
                          tone={jobStatusTone(job.status)}
                        />
                      </AdminDataTableCell>
                      <AdminDataTableCell>
                        {formatTriggerSourceLabel(job.trigger_source)}
                      </AdminDataTableCell>
                      <AdminDataTableCell>
                        <time dateTime={job.created_at} title={formatAdminDateTime(job.created_at)}>
                          {formatAdminDateTime(job.created_at)}
                        </time>
                      </AdminDataTableCell>
                      <AdminDataTableCell>{formatAdminDuration(job.duration_ms)}</AdminDataTableCell>
                      <AdminDataTableCell align="right">
                        <span className="admin-config-key">{job.id.slice(0, 8)}</span>
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
