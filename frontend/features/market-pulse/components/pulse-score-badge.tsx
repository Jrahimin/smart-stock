"use client";

import { MiniSparkline } from "@/components/charts/mini-sparkline";
import type { PulseScoreBreakdownModel } from "@/features/market-pulse/types/market-pulse-types";

export { MiniSparkline };

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

function signalStrengthLabel(band: PulseScoreBreakdownModel["band"]) {
  if (band === "High Attention") {
    return "Strong";
  }
  if (band === "Monitor") {
    return "Moderate";
  }
  return "Building";
}

function volumeExpansionLabel(volume: number) {
  if (volume >= 16) {
    return "High";
  }
  if (volume >= 10) {
    return "Moderate";
  }
  return "Light";
}

function participationLabel(trend: number, momentum: number) {
  const combined = trend + momentum;
  if (combined >= 30) {
    return "High";
  }
  if (combined >= 20) {
    return "Moderate";
  }
  return "Low";
}

function riskLabel(penalty: number) {
  if (penalty >= 12) {
    return "High";
  }
  if (penalty >= 6) {
    return "Moderate";
  }
  return "Low";
}

function ScoreRing({ score, breakdown, compact }: PulseScoreBadgeProps) {
  return (
    <div className={`pulse-score-badge pulse-score-badge-${bandTone(breakdown.band)}${compact ? " pulse-score-badge-compact" : ""}`}>
      <div className="pulse-score-badge-ring">
        <div className="pulse-score-badge-inner">
          <span className="pulse-score-value">{score}</span>
          <span className="pulse-score-max">/100</span>
        </div>
      </div>
      <span className="pulse-score-band pulse-score-band-hidden">{breakdown.band}</span>
    </div>
  );
}

export function PulseScoreHeaderCluster({ score, breakdown }: PulseScoreBadgeProps) {
  return (
    <div className="pulse-score-header-cluster">
      <ScoreRing breakdown={breakdown} compact score={score} />
      <div className="pulse-score-insight">
        <button
          aria-label={`Why score is ${score}`}
          className="pulse-score-insight-trigger"
          type="button"
        >
          i
        </button>
        <div className="pulse-score-insight-panel" role="tooltip">
          <strong>Why score is {score}</strong>
          <dl>
            <div>
              <dt>Signal Strength</dt>
              <dd>{signalStrengthLabel(breakdown.band)}</dd>
            </div>
            <div>
              <dt>Volume Expansion</dt>
              <dd>{volumeExpansionLabel(breakdown.volume)}</dd>
            </div>
            <div>
              <dt>Participation Score</dt>
              <dd>{participationLabel(breakdown.trend, breakdown.momentum)}</dd>
            </div>
            <div>
              <dt>Risk Level</dt>
              <dd>{riskLabel(breakdown.riskPenalty)}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}

export function PulseScoreBadge({ score, breakdown, compact = false }: PulseScoreBadgeProps) {
  return <ScoreRing breakdown={breakdown} compact={compact} score={score} />;
}
