"use client";

import { useState } from "react";

import { CircularProgressRing } from "@/components/ui/circular-progress-ring";
import { WorkspaceModal } from "@/components/ui/workspace-modal";
import type { StockDecisionViewModel } from "@/features/stock-workspace/view-models/stock-decision-view-model";
import type { StockWorkspaceLanguage } from "@/features/stock-workspace/stock-workspace-language";

type DecisionScoresPanelProps = {
  decision: StockDecisionViewModel;
  copy: StockWorkspaceLanguage["decision"];
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

export function DecisionScoresPanel({ decision, copy }: DecisionScoresPanelProps) {
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
          label={copy.opportunity}
          onClick={() => setOpenModal("opportunity")}
          score={decision.opportunityScore}
          title={opportunityTooltip}
          tone="opportunity"
        />
        <CircularProgressRing
          icon="⚠"
          label={copy.risk}
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
        title={copy.opportunityBreakdown}
      />
      <ScoreBreakdownModal
        components={decision.riskComponents}
        isOpen={openModal === "risk"}
        onClose={() => setOpenModal(null)}
        title={copy.riskBreakdown}
      />
    </>
  );
}
