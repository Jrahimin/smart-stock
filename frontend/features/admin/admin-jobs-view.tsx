"use client";

import { AlertTriangle, CheckCircle2, Clock3, Play, Workflow } from "lucide-react";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AdminDrawer } from "@/features/admin/components/admin-drawer";
import {
  AdminDataTable,
  AdminDataTableBody,
  AdminDataTableCell,
  AdminDataTableRow,
  AdminEmptyState,
  AdminSection,
} from "@/features/admin/components/admin-data-table";
import { AdminIconAction } from "@/features/admin/components/admin-icon-action";
import { AdminKpiCard, AdminKpiGrid } from "@/features/admin/components/admin-kpi-card";
import { AdminPageHeader } from "@/features/admin/components/admin-page-header";
import { AdminKpiSkeleton, AdminTableSkeleton } from "@/features/admin/components/admin-skeleton";
import {
  AdminStatusBadge,
  formatStatusLabel,
  jobStatusTone,
} from "@/features/admin/components/admin-status-badge";
import { SuperAdminRoute } from "@/features/auth/components/admin-route";
import type { SystemJobExecution, SystemJobType } from "@/features/admin/types/admin-types";
import { fetchSystemJobExecutions, triggerSystemJob } from "@/lib/api/admin-api";

const TRIGGERABLE_JOBS: SystemJobType[] = [
  "MARKET_SNAPSHOT",
  "MARKET_SYNC",
  "STOCK_DETAILS_SYNC",
  "INDICATORS",
  "SIGNALS",
];

export function AdminJobsView() {
  return (
    <SuperAdminRoute>
      <AdminJobsContent />
    </SuperAdminRoute>
  );
}

function AdminJobsContent() {
  const queryClient = useQueryClient();
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const { data, isLoading, error, dataUpdatedAt } = useQuery({
    queryKey: ["admin-job-executions"],
    queryFn: () => fetchSystemJobExecutions({ limit: 50 }),
  });

  const triggerMutation = useMutation({
    mutationFn: (jobType: SystemJobType) => triggerSystemJob({ job_type: jobType }),
    onMutate: () => setTriggerError(null),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-job-executions"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
    },
    onError: (mutationError) => {
      setTriggerError(mutationError instanceof Error ? mutationError.message : "Failed to trigger job.");
    },
  });

  const metrics = useMemo(() => computeJobMetrics(data ?? []), [data]);
  const selectedJob = data?.find((job) => job.id === selectedJobId) ?? null;

  return (
    <div className="admin-workspace workspace-page-stack">
      <AdminPageHeader
        actions={
          <div className="admin-action-group">
            {TRIGGERABLE_JOBS.map((jobType) => (
              <button
                className="admin-btn"
                disabled={triggerMutation.isPending}
                key={jobType}
                onClick={() => triggerMutation.mutate(jobType)}
                type="button"
              >
                <Play size={14} />
                {formatStatusLabel(jobType)}
              </button>
            ))}
          </div>
        }
        description="Review system job executions and trigger operational jobs manually."
        lastUpdated={data ? new Date(dataUpdatedAt).toISOString() : null}
        title="Jobs"
      />

      {isLoading ? <AdminKpiSkeleton count={4} /> : null}

      {data ? (
        <>
          <AdminKpiGrid>
            <AdminKpiCard helper="Currently executing" icon={Workflow} label="Running Jobs" tone="info" value={metrics.running} />
            <AdminKpiCard helper="Needs attention" icon={AlertTriangle} label="Failed Jobs" tone="negative" value={metrics.failed} />
            <AdminKpiCard helper="Succeeded since midnight" icon={CheckCircle2} label="Completed Today" tone="positive" value={metrics.completedToday} />
            <AdminKpiCard helper="Across recent executions" icon={Clock3} label="Average Duration" tone="neutral" value={`${metrics.avgDurationMs} ms`} />
          </AdminKpiGrid>

          <AdminSection description="Operational runs with status, timing, and trigger context." title="Execution History">
            {data.length ? (
              <AdminDataTable className="admin-data-table-jobs">
                <div className="admin-data-table-head">
                  <AdminDataTableCell>Job Name</AdminDataTableCell>
                  <AdminDataTableCell>Type</AdminDataTableCell>
                  <AdminDataTableCell>Status</AdminDataTableCell>
                  <AdminDataTableCell>Started</AdminDataTableCell>
                  <AdminDataTableCell>Completed</AdminDataTableCell>
                  <AdminDataTableCell>Duration</AdminDataTableCell>
                  <AdminDataTableCell>Trigger</AdminDataTableCell>
                  <AdminDataTableCell align="right">Actions</AdminDataTableCell>
                </div>
                <AdminDataTableBody>
                  {data.map((job) => (
                    <AdminDataTableRow key={job.id} onClick={() => setSelectedJobId(job.id)} selected={selectedJobId === job.id}>
                      <AdminDataTableCell>
                        <strong>{job.job_name}</strong>
                      </AdminDataTableCell>
                      <AdminDataTableCell>{job.job_type}</AdminDataTableCell>
                      <AdminDataTableCell>
                        <AdminStatusBadge label={formatStatusLabel(job.status)} tone={jobStatusTone(job.status)} />
                      </AdminDataTableCell>
                      <AdminDataTableCell>{formatDate(job.started_at)}</AdminDataTableCell>
                      <AdminDataTableCell>{formatDate(job.completed_at)}</AdminDataTableCell>
                      <AdminDataTableCell>{job.duration_ms != null ? `${job.duration_ms} ms` : "—"}</AdminDataTableCell>
                      <AdminDataTableCell>{formatStatusLabel(job.trigger_source)}</AdminDataTableCell>
                      <AdminDataTableCell align="right">
                        <div className="admin-action-group">
                          <AdminIconAction icon={Workflow} label="View details" onClick={() => setSelectedJobId(job.id)} />
                          <AdminIconAction
                            icon={Play}
                            label="Run now"
                            onClick={() => triggerMutation.mutate(job.job_type)}
                          />
                        </div>
                      </AdminDataTableCell>
                    </AdminDataTableRow>
                  ))}
                </AdminDataTableBody>
              </AdminDataTable>
            ) : (
              <AdminEmptyState
                description="Manual triggers and email campaigns are logged here. Use the buttons above to run a job now."
                title="No job executions yet"
              />
            )}
          </AdminSection>
        </>
      ) : null}

      {error ? <section className="placeholder-panel">Failed to load job executions.</section> : null}
      {triggerError ? <section className="placeholder-panel admin-field-error">{triggerError}</section> : null}

      <AdminDrawer
        isOpen={Boolean(selectedJob)}
        onClose={() => setSelectedJobId(null)}
        subtitle={selectedJob?.job_type}
        title={selectedJob?.job_name ?? "Job details"}
      >
        {selectedJob ? <JobDetails job={selectedJob} /> : null}
      </AdminDrawer>
    </div>
  );
}

function JobDetails({ job }: { job: SystemJobExecution }) {
  return (
    <div className="admin-detail-grid">
      <DetailItem label="Status" value={formatStatusLabel(job.status)} />
      <DetailItem label="Started" value={formatDate(job.started_at)} />
      <DetailItem label="Completed" value={formatDate(job.completed_at)} />
      <DetailItem label="Duration" value={job.duration_ms != null ? `${job.duration_ms} ms` : "—"} />
      <DetailItem label="Attempts" value={String(job.attempt_count)} />
      <DetailItem label="Trigger Source" value={formatStatusLabel(job.trigger_source)} />
      <DetailItem label="Triggered By" value={job.triggered_by_user_id ?? "System"} />
      <DetailItem label="Error" value={job.error_message ?? "—"} />
      <DetailItem label="Metadata" value={JSON.stringify(job.metadata_json, null, 2)} />
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="admin-detail-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function computeJobMetrics(jobs: SystemJobExecution[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const running = jobs.filter((job) => job.status === "RUNNING").length;
  const failed = jobs.filter((job) => job.status === "FAILED").length;
  const completedToday = jobs.filter((job) => {
    if (!job.completed_at || job.status !== "SUCCEEDED") return false;
    return new Date(job.completed_at) >= today;
  }).length;

  const durations = jobs.map((job) => job.duration_ms).filter((value): value is number => value != null);
  const avgDurationMs = durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : 0;

  return { running, failed, completedToday, avgDurationMs };
}
