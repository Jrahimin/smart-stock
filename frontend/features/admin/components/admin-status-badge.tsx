import { cn } from "@/lib/utils/cn";

import type { AdminDataHealthState } from "@/features/admin/types/admin-types";

type AdminStatusTone =
  | "success"
  | "running"
  | "queued"
  | "failed"
  | "partial"
  | "draft"
  | "neutral"
  | "warning";

type AdminStatusBadgeProps = {
  label: string;
  tone?: AdminStatusTone;
};

export function AdminStatusBadge({ label, tone = "neutral" }: AdminStatusBadgeProps) {
  return <span className={cn("admin-status-badge", `admin-status-badge-${tone}`)}>{label}</span>;
}

export function jobStatusTone(status: string): AdminStatusTone {
  switch (status) {
    case "SUCCEEDED":
      return "success";
    case "RUNNING":
      return "running";
    case "PENDING":
    case "QUEUED":
      return "queued";
    case "PARTIAL":
      return "partial";
    case "SKIPPED":
      return "warning";
    case "FAILED":
      return "failed";
    case "CANCELLED":
      return "neutral";
    default:
      return "neutral";
  }
}

export function campaignStatusTone(status: string): AdminStatusTone {
  switch (status) {
    case "SUCCEEDED":
      return "success";
    case "RUNNING":
      return "running";
    case "QUEUED":
      return "queued";
    case "PARTIAL":
      return "partial";
    case "FAILED":
      return "failed";
    case "DRAFT":
      return "draft";
    case "CANCELLED":
      return "neutral";
    default:
      return "neutral";
  }
}

export function healthStateTone(state: AdminDataHealthState | string): AdminStatusTone {
  switch (state) {
    case "CURRENT":
      return "success";
    case "DELAYED":
      return "warning";
    case "STALE":
    case "MISSING":
      return "failed";
    case "ONLINE":
      return "success";
    case "OFFLINE":
      return "failed";
    case "UNKNOWN":
      return "warning";
    default:
      return "neutral";
  }
}

export function formatStatusLabel(status: string) {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatJobStatusLabel(status: string) {
  switch (status) {
    case "PENDING":
      return "Waiting";
    case "RUNNING":
      return "Running";
    case "SUCCEEDED":
      return "Completed";
    case "PARTIAL":
      return "Partial";
    case "SKIPPED":
      return "Skipped";
    case "FAILED":
      return "Failed";
    case "CANCELLED":
      return "Cancelled";
    default:
      return formatStatusLabel(status);
  }
}

export function formatHealthStateLabel(state: AdminDataHealthState | string) {
  switch (state) {
    case "CURRENT":
      return "Current";
    case "DELAYED":
      return "Delayed";
    case "STALE":
      return "Stale";
    case "MISSING":
      return "Missing";
    case "ONLINE":
      return "Online";
    case "OFFLINE":
      return "Offline";
    case "UNKNOWN":
      return "Unknown";
    default:
      return formatStatusLabel(state);
  }
}

export function formatTriggerSourceLabel(source: string) {
  switch (source) {
    case "MANUAL":
      return "Manual";
    case "SCHEDULER":
      return "Scheduler";
    case "API":
      return "API";
    case "SYSTEM":
      return "System";
    default:
      return formatStatusLabel(source);
  }
}
