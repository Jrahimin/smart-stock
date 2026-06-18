"use client";

import { useState } from "react";

import { WorkspaceModal } from "@/components/ui/workspace-modal";
import type { StockDecisionViewModel } from "@/features/stock-workspace/view-models/stock-decision-view-model";

type SmartWarningsPanelProps = {
  decision: StockDecisionViewModel;
};

export function SmartWarningsPanel({ decision }: SmartWarningsPanelProps) {
  const [selectedWarning, setSelectedWarning] = useState<(typeof decision.topWarnings)[number] | null>(null);
  if (!decision.available || decision.topWarnings.length === 0) {
    return null;
  }

  return (
    <>
      <section className="trader-workspace-strip warnings-strip warnings-strip-compact">
        <div className="strip-heading">
          <span>Warnings</span>
        </div>
        <div className="warning-chip-row">
          {decision.topWarnings.map((warning) => (
            <button
              className={`warning-chip warning-chip-${warning.severity.toLowerCase()}`}
              key={warning.code}
              onClick={() => setSelectedWarning(warning)}
              title={warning.message}
              type="button"
            >
              ⚠ {warning.title}
            </button>
          ))}
        </div>
      </section>
      <WorkspaceModal isOpen={selectedWarning !== null} onClose={() => setSelectedWarning(null)} title={selectedWarning?.title ?? "Warning"}>
        {selectedWarning ? <p>{selectedWarning.message}</p> : null}
      </WorkspaceModal>
    </>
  );
}
