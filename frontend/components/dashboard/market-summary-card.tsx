import { SurfaceCard } from "@/components/ui/surface-card";

type MarketSummaryCardProps = {
  label: string;
  value: string | number;
  helperText: string;
};

export function MarketSummaryCard({ label, value, helperText }: MarketSummaryCardProps) {
  return (
    <SurfaceCard>
      <p className="card-label">{label}</p>
      <strong className="card-value">{value}</strong>
      <span className="card-helper">{helperText}</span>
    </SurfaceCard>
  );
}

