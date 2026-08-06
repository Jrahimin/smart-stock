"use client";

import { ChevronRight } from "lucide-react";
import { useState, type ReactNode } from "react";

import {
  AdminStatusBadge,
  formatHealthStateLabel,
  formatJobStatusLabel,
  formatTriggerSourceLabel,
  healthStateTone,
  jobStatusTone,
} from "@/features/admin/components/admin-status-badge";
import type { SystemJobExecution } from "@/features/admin/types/admin-types";
import {
  formatAdminDateTime,
  formatAdminDuration,
} from "@/features/admin/utils/format-admin-datetime";

export function JobDetailsDrawer({ job }: { job: SystemJobExecution }) {
  const result = asRecord(job.metadata_json.result);
  const error = asRecord(job.metadata_json.error);
  const requestMetadata = { ...job.metadata_json };
  delete requestMetadata.result;
  delete requestMetadata.error;

  return (
    <div className="admin-drawer-sections">
      <JobDetailSection title="Overview">
        <JobDetailGrid>
          <JobDetailItem label="Execution ID" value={job.id} />
          <JobDetailItem label="Job type" value={job.job_type} />
          <JobDetailItem
            label="Status"
            value={
              <AdminStatusBadge
                label={formatJobStatusLabel(job.status)}
                tone={jobStatusTone(job.status)}
              />
            }
          />
          <JobDetailItem label="Attempts" value={String(job.attempt_count)} />
        </JobDetailGrid>
      </JobDetailSection>

      <JobDetailSection title="Timing">
        <JobDetailGrid>
          <JobDetailItem label="Queued at" value={formatAdminDateTime(job.created_at)} />
          <JobDetailItem label="Started at" value={formatAdminDateTime(job.started_at)} />
          <JobDetailItem label="Completed at" value={formatAdminDateTime(job.completed_at)} />
          <JobDetailItem label="Duration" value={formatAdminDuration(job.duration_ms)} />
        </JobDetailGrid>
      </JobDetailSection>

      <JobDetailSection title="Trigger context">
        <JobDetailGrid>
          <JobDetailItem
            label="Trigger source"
            value={formatTriggerSourceLabel(job.trigger_source)}
          />
          <JobDetailItem
            label="Triggered by"
            value={job.triggered_by_user_id ?? "System"}
          />
          <JobDetailItem label="Dedupe key" value={job.dedupe_key ?? "—"} />
        </JobDetailGrid>
      </JobDetailSection>

      <JobDetailSection title="Request scope">
        <CollapsibleJson label="Request metadata" value={requestMetadata} />
      </JobDetailSection>

      <JobDetailSection title="Result">
        <CollapsibleJson label="Result metadata" value={result} />
      </JobDetailSection>

      {job.error_message || error ? (
        <JobDetailSection title="Error details">
          <JobDetailGrid>
            <JobDetailItem label="Message" value={job.error_message ?? "—"} />
          </JobDetailGrid>
          <CollapsibleJson label="Error metadata" value={error} />
        </JobDetailSection>
      ) : null}
    </div>
  );
}

function JobDetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="admin-drawer-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function JobDetailGrid({ children }: { children: ReactNode }) {
  return <div className="admin-detail-grid admin-detail-grid-compact">{children}</div>;
}

function JobDetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="admin-detail-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function CollapsibleJson({
  label,
  value,
}: {
  label: string;
  value: Record<string, unknown> | null;
}) {
  const [open, setOpen] = useState(false);

  if (!value || Object.keys(value).length === 0) {
    return (
      <div className="admin-detail-item">
        <span>{label}</span>
        <strong>—</strong>
      </div>
    );
  }

  return (
    <details
      className="admin-json-details"
      onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
      open={open}
    >
      <summary>
        <span>{label}</span>
        <ChevronRight aria-hidden="true" className={open ? "admin-json-open" : ""} size={14} />
      </summary>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export { formatHealthStateLabel, healthStateTone };
