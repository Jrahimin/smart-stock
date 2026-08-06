"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ListChecks,
  Play,
  Workflow,
} from "lucide-react";
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
import { AdminKpiCard, AdminKpiGrid } from "@/features/admin/components/admin-kpi-card";
import { AdminPageHeader } from "@/features/admin/components/admin-page-header";
import { AdminKpiSkeleton } from "@/features/admin/components/admin-skeleton";
import {
  AdminStatusBadge,
  formatStatusLabel,
  jobStatusTone,
} from "@/features/admin/components/admin-status-badge";
import {
  ADMIN_JOB_ACTIONS,
  buildJobTriggerFeedback,
} from "@/features/admin/lib/admin-operations-view-model";
import type {
  SystemJobExecution,
  SystemJobExecutionStatus,
  SystemJobTriggerSource,
  SystemJobType,
} from "@/features/admin/types/admin-types";
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

  return (
    <div className="admin-workspace workspace-page-stack">
      <AdminPageHeader
        actions={
          isSuperAdmin ? (
            <div className="admin-action-group">
              {ADMIN_JOB_ACTIONS.map((action) => (
                <button
                  className="admin-btn"
                  disabled={triggerMutation.isPending}
                  key={action.jobType}
                  onClick={() => confirmAndTrigger(action.jobType)}
                  title={action.description}
                  type="button"
                >
                  <Play size={14} />
                  {action.label}
                </button>
              ))}
            </div>
          ) : undefined
        }
        description="Queue operational work and inspect durable execution history."
        lastUpdated={
          executionsQuery.data
            ? new Date(executionsQuery.dataUpdatedAt).toISOString()
            : null
        }
        title="Jobs"
      />

      {isSuperAdmin ? (
        <section className="placeholder-panel">
          <p className="eyebrow">Manual queue scope</p>
          <div className="admin-detail-grid">
            {ADMIN_JOB_ACTIONS.map((action) => (
              <DetailItem
                key={action.jobType}
                label={action.label}
                value={action.description}
              />
            ))}
          </div>
        </section>
      ) : null}

      {triggerFeedback ? (
        <section
          className={`placeholder-panel admin-health-card-${triggerFeedback.tone}`}
          role="status"
        >
          <p className="eyebrow">Queue result</p>
          <h2>{triggerFeedback.title}</h2>
          <p>{triggerFeedback.message}</p>
        </section>
      ) : null}

      {executionsQuery.isLoading ? <AdminKpiSkeleton count={4} /> : null}

      {executionsQuery.data ? (
        <>
          <AdminKpiGrid>
            <AdminKpiCard
              helper="Waiting for backend-scheduler"
              icon={ListChecks}
              label="Queued Jobs"
              tone={metrics.pending > 0 ? "warning" : "neutral"}
              value={metrics.pending}
            />
            <AdminKpiCard
              helper="Currently executing"
              icon={Workflow}
              label="Running Jobs"
              tone="info"
              value={metrics.running}
            />
            <AdminKpiCard
              helper="Needs attention"
              icon={AlertTriangle}
              label="Failed Jobs"
              tone="negative"
              value={metrics.failed}
            />
            <AdminKpiCard
              helper="Terminal successes since midnight"
              icon={CheckCircle2}
              label="Completed Today"
              tone="positive"
              value={metrics.completedToday}
            />
          </AdminKpiGrid>

          <AdminSection
            className="admin-section-compact admin-section-flush"
            description="Filter durable queue history by execution contract."
            title="Execution History"
          >
            <div className="admin-toolbar admin-toolbar-compact">
              <select
                aria-label="Job type"
                className="admin-select"
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
                className="admin-select"
                onChange={(event) =>
                  setJobStatus(event.target.value as JobStatusFilter)
                }
                value={jobStatus}
              >
                <option value="ALL">All statuses</option>
                <option value="PENDING">Queued</option>
                <option value="RUNNING">Running</option>
                <option value="SUCCEEDED">Succeeded</option>
                <option value="PARTIAL">Partial</option>
                <option value="SKIPPED">Skipped</option>
                <option value="FAILED">Failed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
              <select
                aria-label="Trigger source"
                className="admin-select"
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
              <label className="admin-search-inline">
                <span className="admin-search-inline-label">From</span>
                <input
                  className="admin-filter-control"
                  onChange={(event) => setDateFrom(event.target.value)}
                  type="date"
                  value={dateFrom}
                />
              </label>
              <label className="admin-search-inline">
                <span className="admin-search-inline-label">To</span>
                <input
                  className="admin-filter-control"
                  onChange={(event) => setDateTo(event.target.value)}
                  type="date"
                  value={dateTo}
                />
              </label>
            </div>

            {executions.length ? (
              <AdminDataTable className="admin-data-table-jobs">
                <div className="admin-data-table-head">
                  <AdminDataTableCell>Job Name</AdminDataTableCell>
                  <AdminDataTableCell>Type</AdminDataTableCell>
                  <AdminDataTableCell>Status</AdminDataTableCell>
                  <AdminDataTableCell>Queued</AdminDataTableCell>
                  <AdminDataTableCell>Started</AdminDataTableCell>
                  <AdminDataTableCell>Duration</AdminDataTableCell>
                  <AdminDataTableCell>Trigger</AdminDataTableCell>
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
                      </AdminDataTableCell>
                      <AdminDataTableCell>{job.job_type}</AdminDataTableCell>
                      <AdminDataTableCell>
                        <AdminStatusBadge
                          label={formatStatusLabel(job.status)}
                          tone={jobStatusTone(job.status)}
                        />
                      </AdminDataTableCell>
                      <AdminDataTableCell>
                        {formatDate(job.created_at)}
                      </AdminDataTableCell>
                      <AdminDataTableCell>
                        {formatDate(job.started_at)}
                      </AdminDataTableCell>
                      <AdminDataTableCell>
                        {job.duration_ms != null
                          ? `${job.duration_ms} ms`
                          : "—"}
                      </AdminDataTableCell>
                      <AdminDataTableCell>
                        {formatStatusLabel(job.trigger_source)}
                      </AdminDataTableCell>
                      <AdminDataTableCell align="right">
                        <span className="admin-config-key">Open</span>
                      </AdminDataTableCell>
                    </AdminDataTableRow>
                  ))}
                </AdminDataTableBody>
              </AdminDataTable>
            ) : (
              <AdminEmptyState
                description="Adjust the filters or queue an operational job."
                title="No matching job executions"
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
        {selectedJob ? <JobDetails job={selectedJob} /> : null}
        {selectedExecutionQuery.error ? (
          <p className="admin-field-error">Failed to load execution details.</p>
        ) : null}
      </AdminDrawer>
    </div>
  );
}

function JobDetails({ job }: { job: SystemJobExecution }) {
  const result = asRecord(job.metadata_json.result);
  const requestMetadata = { ...job.metadata_json };
  delete requestMetadata.result;
  delete requestMetadata.error;
  return (
    <div className="admin-detail-grid">
      <DetailItem label="Execution ID" value={job.id} />
      <DetailItem label="Status" value={formatStatusLabel(job.status)} />
      <DetailItem label="Queued" value={formatDate(job.created_at)} />
      <DetailItem label="Started" value={formatDate(job.started_at)} />
      <DetailItem label="Completed" value={formatDate(job.completed_at)} />
      <DetailItem
        label="Duration"
        value={job.duration_ms != null ? `${job.duration_ms} ms` : "—"}
      />
      <DetailItem label="Attempts" value={String(job.attempt_count)} />
      <DetailItem
        label="Trigger Source"
        value={formatStatusLabel(job.trigger_source)}
      />
      <DetailItem
        label="Triggered By"
        value={job.triggered_by_user_id ?? "System"}
      />
      <DetailItem label="Dedupe Key" value={job.dedupe_key ?? "—"} />
      <DetailItem label="Error" value={job.error_message ?? "—"} />
      <JsonDetail label="Request Metadata" value={requestMetadata} />
      <JsonDetail label="Result Metadata" value={result} />
      <JsonDetail label="Error Metadata" value={asRecord(job.metadata_json.error)} />
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

function JsonDetail({
  label,
  value,
}: {
  label: string;
  value: Record<string, unknown> | null;
}) {
  return (
    <div className="admin-detail-item">
      <span>{label}</span>
      <pre>{value ? JSON.stringify(value, null, 2) : "—"}</pre>
    </div>
  );
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
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
