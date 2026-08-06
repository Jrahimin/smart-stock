import type { ReactNode } from "react";

import { AdminStatusBadge } from "@/features/admin/components/admin-status-badge";
import { cn } from "@/lib/utils/cn";

type AdminOperationCardTone = "positive" | "warning" | "negative" | "neutral" | "info";

type AdminOperationCardProps = {
  label: string;
  statusLabel: string;
  statusTone: AdminOperationCardTone;
  explanation: string;
  footer?: ReactNode;
  className?: string;
};

const toneToBadge = {
  positive: "success",
  warning: "warning",
  negative: "failed",
  neutral: "neutral",
  info: "running",
} as const;

export function AdminOperationCard({
  label,
  statusLabel,
  statusTone,
  explanation,
  footer,
  className,
}: AdminOperationCardProps) {
  return (
    <article className={cn("admin-operation-card", `admin-operation-card-${statusTone}`, className)}>
      <div className="admin-operation-card-head">
        <span className="admin-operation-card-label">{label}</span>
        <AdminStatusBadge label={statusLabel} tone={toneToBadge[statusTone]} />
      </div>
      <p className="admin-operation-card-explanation">{explanation}</p>
      {footer ? <div className="admin-operation-card-footer">{footer}</div> : null}
    </article>
  );
}

export function AdminOperationGrid({ children }: { children: ReactNode }) {
  return <div className="admin-operation-grid">{children}</div>;
}

export function AdminMetricCard({
  label,
  value,
  helper,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  helper?: string;
  tone?: AdminOperationCardTone;
}) {
  return (
    <article className={cn("admin-metric-card", `admin-metric-card-${tone}`)}>
      <span className="admin-metric-card-label">{label}</span>
      <strong className="admin-metric-card-value">{value}</strong>
      {helper ? <p className="admin-metric-card-helper">{helper}</p> : null}
    </article>
  );
}

export function AdminMetricGrid({ children }: { children: ReactNode }) {
  return <div className="admin-metric-grid">{children}</div>;
}
