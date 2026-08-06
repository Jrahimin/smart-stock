"use client";

import { AlertTriangle, CheckCircle2, Clock3, ListChecks, Workflow } from "lucide-react";
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
import { AdminJobActionsMenu } from "@/features/admin/components/admin-job-actions";
import { JobDetailsDrawer } from "@/features/admin/components/admin-job-details";
import { AdminKpiCard, AdminKpiGrid } from "@/features/admin/components/admin-kpi-card";
import { AdminPageHeader } from "@/features/admin/components/admin-page-header";
import { AdminKpiSkeleton } from "@/features/admin/components/admin-skeleton";
import {
  AdminStatusBadge,
  formatJobStatusLabel,
  formatTriggerSourceLabel,
  jobStatusTone,
} from "@/features/admin/components/admin-status-badge";
import {
  ADMIN_JOB_ACTIONS,
  buildJobHistoryEmptyState,
  buildJobTriggerFeedback,
  hasActiveJobHistoryFilters,
} from "@/features/admin/lib/admin-operations-view-model";
import type {
  SystemJobExecution,
  SystemJobExecutionStatus,
  SystemJobTriggerSource,
  SystemJobType,
} from "@/features/admin/types/admin-types";
import {
  formatAdminDateTime,
  formatAdminDuration,
} from "@/features/admin/utils/format-admin-datetime";
import { AdminRoute, useIsSuperAdmin } from "@/features/auth/components/admin-route";
import {
  fetchSystemJobExecution,
  fetchSystemJobExecutions,
  triggerSystemJob,
} from "@/lib/api/admin-api";

type JobTypeFilter = SystemJobType | "ALL";
type JobStatusFilter = SystemJobExecutionStatus | "ALL";
type JobSourceFilter = SystemJobTriggerSource | "ALL";

export function AdminJobsView() {
  return (
    <AdminRoute>
      <AdminJobsContent />
    </AdminRoute>
  );
}

function AdminJobsContent() {
  const queryClient = useQueryClient();
  const isSuperAdmin = useIsSuperAdmin();
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [jobType, setJobType] = useState<JobTypeFilter>("ALL");
  const [jobStatus, setJobStatus] = useState<JobStatusFilter>("ALL");
  const [triggerSource, setTriggerSource] = useState<JobSourceFilter>("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const [triggerFeedback, setTriggerFeedback] = useState<ReturnType<
    typeof buildJobTriggerFeedback
  > | null>(null);

  const filters = useMemo(
    () => ({
      jobType,
      jobStatus,
      triggerSource,
      dateFrom,
      dateTo,
    }),
    [jobType, jobStatus, triggerSource, dateFrom, dateTo],
  );

  const executionsQuery = useQuery({
    queryKey: [
      "admin-job-executions",
      jobType,
      jobStatus,
      triggerSource,
      dateFrom,
      dateTo,
    ],
    queryFn: () =>
      fetchSystemJobExecutions({
        job_type: jobType === "ALL" ? undefined : jobType,
        status: jobStatus === "ALL" ? undefined : jobStatus,
        trigger_source: triggerSource === "ALL" ? undefined : triggerSource,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        limit: 100,
      }),
    refetchInterval: (query) =>
      hasActiveJobs(query.state.data as SystemJobExecution[] | undefined)
        ? 2_000
        : false,
  });

  const selectedExecutionQuery = useQuery({
    queryKey: ["admin-job-execution", selectedJobId],
    queryFn: () => fetchSystemJobExecution(selectedJobId!),
    enabled: Boolean(selectedJobId),
    refetchInterval: (query) =>
      isActiveJob(query.state.data as SystemJobExecution | undefined)
        ? 2_000
        : false,
  });

  const triggerMutation = useMutation({
    mutationFn: (requestedJobType: SystemJobType) =>
      triggerSystemJob({ job_type: requestedJobType }),
    onMutate: () => {
      setTriggerError(null);
      setTriggerFeedback(null);
    },
    onSuccess: (result, requestedJobType) => {
      setTriggerFeedback(buildJobTriggerFeedback(requestedJobType, result));
      setSelectedJobId(result.execution.id);
      queryClient.setQueryData(
        ["admin-job-execution", result.execution.id],
        result.execution,
      );
      void queryClient.invalidateQueries({
        queryKey: ["admin-job-executions"],
      });
      void queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
    },
    onError: (mutationError) => {
      setTriggerError(
        mutationError instanceof Error
          ? mutationError.message
          : "Failed to queue job.",
      );
    },
  });

  const executions = executionsQuery.data ?? [];
  const metrics = useMemo(() => computeJobMetrics(executions), [executions]);
  const selectedJob = selectedExecutionQuery.data ?? null;
  const emptyState = buildJobHistoryEmptyState(filters);
  const filtersActive = hasActiveJobHistoryFilters(filters);

  const confirmAndTrigger = (requestedJobType: SystemJobType) => {
    const action = ADMIN_JOB_ACTIONS.find(
      (candidate) => candidate.jobType === requestedJobType,
    );
    const confirmed = window.confirm(
      `${action?.label ?? requestedJobType}\n\n${
        action?.description ?? "Queue this operational job."
      }\n\nQueue this job now?`,
    );
    if (confirmed) triggerMutation.mutate(requestedJobType);
  };

  const clearFilters = () => {
    setJobType("ALL");
    setJobStatus("ALL");
    setTriggerSource("ALL");
    setDateFrom("");
    setDateTo("");
  };

  return (
    <div className="admin-workspace admin-workspace-tight admin-jobs-workspace workspace-page-stack">
      <AdminPageHeader
        actions={
          isSuperAdmin ? (
            <AdminJobActionsMenu
              actions={ADMIN_JOB_ACTIONS}
              disabled={triggerMutation.isPending}
              onTrigger={confirmAndTrigger}
            />
          ) : undefined
        }
        className="admin-page-header-compact"
        description="Run operational tasks and review their history."
        lastUpdated={
          executionsQuery.data
            ? new Date(executionsQuery.dataUpdatedAt).toISOString()
            : null
        }
        onRefresh={() => void executionsQuery.refetch()}
        isRefreshing={executionsQuery.isFetching}
        title="Jobs"
      />

      {triggerFeedback ? (
        <section
          className={`admin-feedback-banner admin-feedback-banner-${triggerFeedback.tone}`}
          role="status"
        >
          <strong>{triggerFeedback.title}</strong>
          <p>{triggerFeedback.message}</p>
        </section>
      ) : null}

      {executionsQuery.isLoading ? <AdminKpiSkeleton count={4} /> : null}

      {executionsQuery.data ? (
        <>
          <AdminKpiGrid className="admin-kpi-grid-4 admin-kpi-grid-jobs">
            <AdminKpiCard
              helper="Waiting to start"
              icon={ListChecks}
              label="Waiting"
              tone={metrics.pending > 0 ? "warning" : "neutral"}
              value={metrics.pending}
            />
            <AdminKpiCard
              helper="Currently executing"
              icon={Workflow}
              label="Running"
              tone="info"
              value={metrics.running}
            />
            <AdminKpiCard
              helper="Needs attention"
              icon={AlertTriangle}
              label="Failed"
              tone={metrics.failed > 0 ? "negative" : "neutral"}
              value={metrics.failed}
            />
            <AdminKpiCard
              helper="Completed since midnight"
              icon={CheckCircle2}
              label="Completed today"
              tone="positive"
              value={metrics.completedToday}
            />
          </AdminKpiGrid>

          <AdminSection className="admin-section-compact admin-section-jobs" title="Execution history">
            <div className="admin-toolbar admin-toolbar-compact admin-toolbar-scroll admin-jobs-filters">
            <select
              aria-label="Job type"
              className="admin-select admin-select-compact"
              onChange={(event) =>
                setJobType(event.target.value as JobTypeFilter)
              }
              value={jobType}
            >
              <option value="ALL">All job types</option>
              <option value="MARKET_SNAPSHOT">Market Snapshot</option>
              <option value="MARKET_SYNC">Daily Close</option>
              <option value="STOCK_DETAILS_SYNC">Stock Details</option>
              <option value="INDICATORS">Indicators</option>
              <option value="SIGNALS">Signals</option>
              <option value="EMAIL_CAMPAIGN">Email Campaign</option>
              <option value="OTHER">Other</option>
            </select>
            <select
              aria-label="Job status"
              className="admin-select admin-select-compact"
              onChange={(event) =>
                setJobStatus(event.target.value as JobStatusFilter)
              }
              value={jobStatus}
            >
              <option value="ALL">All statuses</option>
              <option value="PENDING">Waiting</option>
              <option value="RUNNING">Running</option>
              <option value="SUCCEEDED">Completed</option>
              <option value="PARTIAL">Partial</option>
              <option value="SKIPPED">Skipped</option>
              <option value="FAILED">Failed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
            <select
              aria-label="Trigger source"
              className="admin-select admin-select-compact"
              onChange={(event) =>
                setTriggerSource(event.target.value as JobSourceFilter)
              }
              value={triggerSource}
            >
              <option value="ALL">All sources</option>
              <option value="MANUAL">Manual</option>
              <option value="SCHEDULER">Scheduler</option>
              <option value="API">API</option>
              <option value="SYSTEM">System</option>
            </select>
            <label className="admin-search-inline admin-search-inline-compact">
              <span className="admin-search-inline-label">From</span>
              <input
                className="admin-filter-control admin-filter-control-compact"
                onChange={(event) => setDateFrom(event.target.value)}
                type="date"
                value={dateFrom}
              />
            </label>
            <label className="admin-search-inline admin-search-inline-compact">
              <span className="admin-search-inline-label">To</span>
              <input
                className="admin-filter-control admin-filter-control-compact"
                onChange={(event) => setDateTo(event.target.value)}
                type="date"
                value={dateTo}
              />
            </label>
            {filtersActive ? (
              <button className="admin-btn admin-btn-compact" onClick={clearFilters} type="button">
                Clear filters
              </button>
            ) : null}
          </div>

          {executions.length ? (
            <AdminDataTable className="admin-data-table-jobs">
              <div className="admin-data-table-head">
                <AdminDataTableCell>Job</AdminDataTableCell>
                <AdminDataTableCell>Status</AdminDataTableCell>
                <AdminDataTableCell>Trigger</AdminDataTableCell>
                <AdminDataTableCell>Queued at</AdminDataTableCell>
                <AdminDataTableCell>Started at</AdminDataTableCell>
                <AdminDataTableCell>Duration</AdminDataTableCell>
                <AdminDataTableCell align="right">Details</AdminDataTableCell>
              </div>
              <AdminDataTableBody>
                {executions.map((job) => (
                  <AdminDataTableRow
                    key={job.id}
                    onClick={() => setSelectedJobId(job.id)}
                    selected={selectedJobId === job.id}
                  >
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
                    <AdminDataTableCell>
                      <time dateTime={job.started_at ?? undefined} title={formatAdminDateTime(job.started_at)}>
                        {formatAdminDateTime(job.started_at)}
                      </time>
                    </AdminDataTableCell>
                    <AdminDataTableCell>{formatAdminDuration(job.duration_ms)}</AdminDataTableCell>
                    <AdminDataTableCell align="right">
                      <span className="admin-config-key">Open</span>
                    </AdminDataTableCell>
                  </AdminDataTableRow>
                ))}
              </AdminDataTableBody>
            </AdminDataTable>
            ) : (
              <AdminEmptyState
                className="admin-empty-state-jobs"
                description={emptyState.description}
                title={emptyState.title}
              />
            )}
          </AdminSection>
        </>
      ) : null}

      {executionsQuery.error ? (
        <section className="placeholder-panel">
          Failed to load job executions.
        </section>
      ) : null}
      {triggerError ? (
        <section className="placeholder-panel admin-field-error">
          {triggerError}
        </section>
      ) : null}

      <AdminDrawer
        isOpen={Boolean(selectedJobId)}
        onClose={() => setSelectedJobId(null)}
        subtitle={selectedJob?.job_type}
        title={selectedJob?.job_name ?? "Job details"}
      >
        {selectedExecutionQuery.isLoading ? (
          <p>
            <Clock3 size={14} /> Loading execution…
          </p>
        ) : null}
        {selectedJob ? <JobDetailsDrawer job={selectedJob} /> : null}
        {selectedExecutionQuery.error ? (
          <p className="admin-field-error">Failed to load execution details.</p>
        ) : null}
      </AdminDrawer>
    </div>
  );
}

function isActiveJob(job: SystemJobExecution | undefined) {
  return job?.status === "PENDING" || job?.status === "RUNNING";
}

function hasActiveJobs(jobs: SystemJobExecution[] | undefined) {
  return jobs?.some(isActiveJob) ?? false;
}

function computeJobMetrics(jobs: SystemJobExecution[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const pending = jobs.filter((job) => job.status === "PENDING").length;
  const running = jobs.filter((job) => job.status === "RUNNING").length;
  const failed = jobs.filter((job) => job.status === "FAILED").length;
  const completedToday = jobs.filter((job) => {
    if (!job.completed_at || job.status !== "SUCCEEDED") return false;
    return new Date(job.completed_at) >= today;
  }).length;

  return { pending, running, failed, completedToday };
}
