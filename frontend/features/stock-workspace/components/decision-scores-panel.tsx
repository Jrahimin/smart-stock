"use client";

import { useState } from "react";

import { CircularProgressRing } from "@/components/ui/circular-progress-ring";
import { WorkspaceModal } from "@/components/ui/workspace-modal";
import type { StockDecisionViewModel } from "@/features/stock-workspace/view-models/stock-decision-view-model";

type DecisionScoresPanelProps = {
  decision: StockDecisionViewModel;
};

function ScoreBreakdownModal({
  title,
  components,
  isOpen,
  onClose,
}: {
  title: string;
  components: Array<{ label: string; score: number; explanation: string }>;
  isOpen: boolean;
  onClose: () => void;
}) {
  return (
    <WorkspaceModal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="score-breakdown-list">
        {components.map((component) => (
          <article className="score-breakdown-item" key={component.label}>
            <div>
              <strong>{component.label}</strong>
              <span>{component.score}/100</span>
            </div>
            <p>{component.explanation}</p>
          </article>
        ))}
      </div>
    </WorkspaceModal>
  );
}

export function DecisionScoresPanel({ decision }: DecisionScoresPanelProps) {
  const [openModal, setOpenModal] = useState<"opportunity" | "risk" | null>(null);
  if (!decision.available) {
    return null;
  }

  const opportunityTooltip = decision.opportunityComponents.map((item) => `${item.label}: ${item.explanation}`).join(" ");
  const riskTooltip = decision.riskComponents.map((item) => `${item.label}: ${item.explanation}`).join(" ");

  return (
    <>
      <div className="decision-score-rings">
        <CircularProgressRing
          icon="🎯"
          label="Opportunity"
          onClick={() => setOpenModal("opportunity")}
          score={decision.opportunityScore}
          title={opportunityTooltip}
          tone="opportunity"
        />
        <CircularProgressRing
          icon="⚠"
          label="Risk"
          onClick={() => setOpenModal("risk")}
          score={decision.riskScore}
          title={riskTooltip}
          tone="risk"
        />
      </div>
      <ScoreBreakdownModal
        components={decision.opportunityComponents}
        isOpen={openModal === "opportunity"}
        onClose={() => setOpenModal(null)}
        title="Opportunity Score Breakdown"
      />
      <ScoreBreakdownModal
        components={decision.riskComponents}
        isOpen={openModal === "risk"}
        onClose={() => setOpenModal(null)}
        title="Risk Score Breakdown"
      />
    </>
  );
}
