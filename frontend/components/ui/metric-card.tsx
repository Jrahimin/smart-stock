import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

type MetricCardProps = {
  label: string;
  value: string | number;
  helper?: string;
  tone?: "positive" | "negative" | "neutral" | "warning" | "info";
  children?: ReactNode;
};

export function MetricCard({ label, value, helper, tone = "neutral", children }: MetricCardProps) {
  return (
    <section className={cn("metric-card", `metric-card-${tone}`)}>
      <p className="eyebrow">{label}</p>
      <strong>{value}</strong>
      {helper ? <span>{helper}</span> : null}
      {children}
    </section>
  );
}
