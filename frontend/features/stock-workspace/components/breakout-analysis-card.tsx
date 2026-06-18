"use client";

import { useState } from "react";

import { CircularProgressRing } from "@/components/ui/circular-progress-ring";
import { WorkspaceModal } from "@/components/ui/workspace-modal";
import { formatNumber } from "@/lib/formatters/financial-formatters";
import type { StockDecisionViewModel } from "@/features/stock-workspace/view-models/stock-decision-view-model";

type BreakoutAnalysisCardProps = {
  decision: StockDecisionViewModel;
};

export function BreakoutAnalysisCard({ decision }: BreakoutAnalysisCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  if (!decision.available || !decision.breakout) {
    return null;
  }

  const breakout = decision.breakout;
  const compactFactors = breakout.factors.slice(0, 3);

  return (
    <>
      <button className="trader-workspace-strip breakout-strip breakout-strip-clickable" onClick={() => setIsOpen(true)} type="button">
        <div className="breakout-strip-main">
          <div className="breakout-strip-copy">
            <span className="breakout-strip-title">🚀 Breakout Probability</span>
            <div className="breakout-strip-levels">
              <span>Breakout {formatNumber(breakout.breakout_level)}</span>
              <span>Target {formatNumber(breakout.projected_target)}</span>
            </div>
          </div>
          <CircularProgressRing icon="🚀" label="" score={breakout.probability} size={64} tone="breakout" />
        </div>
        <ul className="breakout-factor-compact">
          {compactFactors.map((factor) => (
            <li className={factor.matched ? "breakout-factor-match" : "breakout-factor-miss"} key={factor.label}>
              {factor.matched ? "✓" : "○"} {factor.label.replace(" increasing", "").replace(" aligned", "").replace(" active", "").replace("Near ", "")}
            </li>
          ))}
        </ul>
      </button>
      <WorkspaceModal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Breakout Analysis">
        <div className="breakout-detail-modal">
          <p>{breakout.explanation}</p>
          <p>
            <strong>Breakout level:</strong> {breakout.breakout_level ?? "N/A"}
          </p>
          <p>
            <strong>Confirmation level:</strong> {breakout.confirmation_level ?? "N/A"}
          </p>
          <p>
            <strong>Projected target:</strong> {breakout.projected_target ?? "N/A"}
          </p>
          <ul>
            {breakout.factors.map((factor) => (
              <li key={factor.label}>
                <strong>{factor.label}:</strong> {factor.explanation}
              </li>
            ))}
          </ul>
        </div>
      </WorkspaceModal>
    </>
  );
}
