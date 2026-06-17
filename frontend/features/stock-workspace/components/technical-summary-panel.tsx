"use client";

import { useState } from "react";

import type { StockWorkspaceModel } from "@/features/stock-workspace/view-models/stock-workspace-view-model";

type TechnicalSummaryPanelProps = {
  model: StockWorkspaceModel;
};

export function TechnicalSummaryPanel({ model }: TechnicalSummaryPanelProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <section className="trader-workspace-strip technical-strip">
      <button className="collapsible-strip-toggle" onClick={() => setExpanded((value) => !value)} type="button">
        <span>{expanded ? "▼" : "▶"} Technical Details</span>
        <small>Trend, RSI, volatility, volume, levels</small>
      </button>
      {expanded ? (
        <div className="technical-summary-grid technical-summary-compact">
          {model.technicalSummary.map((item) => (
            <article className="technical-summary-card" key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
