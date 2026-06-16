import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

type AdminKpiTone = "positive" | "negative" | "warning" | "neutral" | "info";

type AdminKpiCardProps = {
  icon: LucideIcon;
  label: string;
  value: string | number;
  helper?: string;
  tone?: AdminKpiTone;
  children?: ReactNode;
};

export function AdminKpiCard({ icon: Icon, label, value, helper, tone = "neutral", children }: AdminKpiCardProps) {
  return (
    <article className={cn("admin-kpi-card", `admin-kpi-card-${tone}`)}>
      <div className="admin-kpi-card-top">
        <span className="admin-kpi-card-icon" aria-hidden="true">
          <Icon size={18} />
        </span>
        <p className="admin-kpi-card-label">{label}</p>
      </div>
      <strong className="admin-kpi-card-value">{value}</strong>
      {helper ? <span className="admin-kpi-card-helper">{helper}</span> : null}
      {children}
    </article>
  );
}

export function AdminKpiGrid({ children }: { children: ReactNode }) {
  return <div className="admin-kpi-grid">{children}</div>;
}
