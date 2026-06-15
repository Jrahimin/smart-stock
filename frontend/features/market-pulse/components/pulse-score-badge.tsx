"use client";

import type { PulseScoreBreakdownModel } from "@/features/market-pulse/types/market-pulse-types";
import { InfoTooltip } from "@/components/ui/info-tooltip";

type PulseScoreBadgeProps = {
  score: number;
  breakdown: PulseScoreBreakdownModel;
  compact?: boolean;
};

function bandTone(band: PulseScoreBreakdownModel["band"]) {
  if (band === "High Attention") {
    return "positive";
  }
  if (band === "Monitor") {
    return "warning";
  }
  return "info";
}

export function PulseScoreBadge({ score, breakdown, compact = false }: PulseScoreBadgeProps) {
  const tooltip = [
    breakdown.contributors.length > 0 ? breakdown.contributors.join(", ") : "Pulse Score attention ranking",
    `Trend ${breakdown.trend} · Momentum ${breakdown.momentum} · Volume ${breakdown.volume}`,
    breakdown.signalBoost > 0 ? `Signal boost +${breakdown.signalBoost}` : null,
    breakdown.riskPenalty > 0 ? `Risk penalty -${breakdown.riskPenalty}` : null,
  ]
    .filter(Boolean)
    .join(". ");

  return (
    <div className={`pulse-score-badge pulse-score-badge-${bandTone(breakdown.band)}${compact ? " pulse-score-badge-compact" : ""}`}>
      <InfoTooltip content={tooltip} label="Pulse Score breakdown">
        <div className="pulse-score-badge-ring">
          <div className="pulse-score-badge-inner">
            <span className="pulse-score-value">{score}</span>
            <span className="pulse-score-max">/100</span>
          </div>
        </div>
      </InfoTooltip>
      <span className="pulse-score-band">{breakdown.band}</span>
    </div>
  );
}

function MiniSparkline({ points, tone }: { points: number[]; tone: "positive" | "negative" | "neutral" }) {
  if (points.length < 2) {
    return null;
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const width = 88;
  const height = 28;
  const polyline = points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * width;
      const y = height - ((point - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg aria-hidden="true" className={`pulse-sparkline pulse-sparkline-${tone}`} height={height} viewBox={`0 0 ${width} ${height}`} width={width}>
      <polyline fill="none" points={polyline} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

export { MiniSparkline };
