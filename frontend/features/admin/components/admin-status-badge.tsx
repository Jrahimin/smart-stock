import { cn } from "@/lib/utils/cn";

type AdminStatusTone = "success" | "running" | "queued" | "failed" | "partial" | "draft" | "neutral" | "warning";

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

export function formatStatusLabel(status: string) {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
