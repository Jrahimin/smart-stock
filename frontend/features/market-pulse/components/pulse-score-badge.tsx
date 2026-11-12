"use client";

import { useId, useState } from "react";

import { MiniSparkline } from "@/components/charts/mini-sparkline";
import type { PulseScoreBreakdownModel } from "@/features/market-pulse/types/market-pulse-types";
import type { MarketPulseLanguage } from "@/features/market-pulse/market-pulse-language";

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

function signalStrengthLabel(
  band: PulseScoreBreakdownModel["band"],
  labels: MarketPulseLanguage["score"]["bandLabels"],
) {
  if (band === "High Attention") {
    return labels.strong;
  }
  if (band === "Monitor") {
    return labels.moderate;
  }
  return labels.building;
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

type PulseScoreHeaderClusterProps = PulseScoreBadgeProps & {
  copy: MarketPulseLanguage["score"];
};

export function PulseScoreHeaderCluster({ score, breakdown, copy }: PulseScoreHeaderClusterProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className="pulse-score-header-cluster">
      <ScoreRing breakdown={breakdown} compact score={score} />
      <div className="pulse-score-insight" data-open={open} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
        <button
          aria-label={copy.whyScoreAria(score)}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}
          className="pulse-score-insight-trigger"
          type="button"
        >
          i
        </button>
        <div className="pulse-score-insight-panel" role="region" aria-label={copy.whyScoreTitle(score)} id={panelId} hidden={!open}>
          <strong>{copy.whyScoreTitle(score)}</strong>
          <dl>
            <div>
              <dt>{copy.signalStrength}</dt>
              <dd>{signalStrengthLabel(breakdown.band, copy.bandLabels)}</dd>
            </div>
            <div>
              <dt>{copy.volumeExpansion}</dt>
              <dd>{breakdown.volume}</dd>
            </div>
            <div>
              <dt>{copy.participationScore}</dt>
              <dd>{breakdown.trend + breakdown.momentum}</dd>
            </div>
            <div>
              <dt>{copy.riskLevel}</dt>
              <dd>−{breakdown.riskPenalty}</dd>
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
