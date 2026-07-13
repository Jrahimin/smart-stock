"use client";

import { useState } from "react";

import { CircularProgressRing } from "@/components/ui/circular-progress-ring";
import { WorkspaceModal } from "@/components/ui/workspace-modal";
import { formatNumber } from "@/lib/formatters/financial-formatters";
import type { StockDecisionViewModel } from "@/features/stock-workspace/view-models/stock-decision-view-model";
import type { StockWorkspaceLanguage } from "@/features/stock-workspace/stock-workspace-language";

type BreakoutAnalysisCardProps = {
  decision: StockDecisionViewModel;
  copy: StockWorkspaceLanguage["panels"];
};

function resolveBreakoutScenario(decision: StockDecisionViewModel) {
  return decision.breakout?.direction === "breakdown" ? "breakdown" : "breakout";
}

export function BreakoutAnalysisCard({ decision, copy }: BreakoutAnalysisCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  if (!decision.available || !decision.breakout) {
    return null;
  }

  const breakout = decision.breakout;
  const scenario = resolveBreakoutScenario(decision);
  const isBreakdown = scenario === "breakdown";
  const compactFactors = breakout.factors.slice(0, 3);
  const title = isBreakdown ? copy.breakdownProbability : copy.breakoutProbability;
  const triggerLabel = isBreakdown ? copy.breakdown : copy.breakout;
  const modalTitle = isBreakdown ? copy.breakdownAnalysis : copy.breakoutAnalysis;
  const levelLabel = isBreakdown ? copy.breakdownLevel : copy.breakoutLevel;

  return (
    <>
      <button
        className={`trader-workspace-strip breakout-strip breakout-strip-clickable${isBreakdown ? " breakdown-strip-bearish" : ""}`}
        onClick={() => setIsOpen(true)}
        type="button"
      >
        <div className="breakout-strip-main">
          <div className="breakout-strip-copy">
            <span className="breakout-strip-title">{title}</span>
            <div className="breakout-strip-levels">
              <span>
                {triggerLabel} {formatNumber(breakout.breakout_level)}
              </span>
              <span>{copy.target} {formatNumber(breakout.projected_target)}</span>
            </div>
          </div>
          <CircularProgressRing
            icon={isBreakdown ? "📉" : "🚀"}
            label=""
            score={breakout.probability}
            size={64}
            tone={isBreakdown ? "risk" : "breakout"}
          />
        </div>
        <ul className="breakout-factor-compact">
          {compactFactors.map((factor) => (
            <li className={factor.matched ? "breakout-factor-match" : "breakout-factor-miss"} key={factor.label}>
              {factor.matched ? "✓" : "○"} {factor.label.replace(" increasing", "").replace(" aligned", "").replace(" active", "").replace("Near ", "")}
            </li>
          ))}
        </ul>
      </button>
      <WorkspaceModal isOpen={isOpen} onClose={() => setIsOpen(false)} title={modalTitle}>
        <div className="breakout-detail-modal">
          <p>{breakout.explanation}</p>
          <p>
            <strong>{levelLabel}:</strong> {breakout.breakout_level ?? "N/A"}
          </p>
          <p>
            <strong>{copy.confirmationLevel}:</strong> {breakout.confirmation_level ?? "N/A"}
          </p>
          <p>
            <strong>{copy.projectedTarget}:</strong> {breakout.projected_target ?? "N/A"}
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
