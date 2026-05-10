type StatusBadgeProps = {
  label: string;
  tone?: "positive" | "negative" | "neutral";
};

export function StatusBadge({ label, tone = "neutral" }: StatusBadgeProps) {
  return <span className={`status-badge status-badge-${tone}`}>{label}</span>;
}

