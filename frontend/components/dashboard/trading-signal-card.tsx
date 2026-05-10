import type { TradingSignalSummary } from "@/lib/api/backend-api-types";

import { SurfaceCard } from "@/components/ui/surface-card";
import { StatusBadge } from "@/components/ui/status-badge";

type TradingSignalCardProps = {
  signal: TradingSignalSummary;
};

export function TradingSignalCard({ signal }: TradingSignalCardProps) {
  const tone = signal.signal === "BUY" ? "positive" : signal.signal === "SELL" ? "negative" : "neutral";

  return (
    <SurfaceCard>
      <div className="signal-card-header">
        <strong>{signal.symbol}</strong>
        <StatusBadge label={signal.signal} tone={tone} />
      </div>
      <p className="signal-confidence">{signal.confidence} confidence</p>
      <p className="card-helper">{signal.reason}</p>
    </SurfaceCard>
  );
}

