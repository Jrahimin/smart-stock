"use client";

import { useState } from "react";

import type { StockWorkspaceModel } from "@/features/stock-workspace/view-models/stock-workspace-view-model";

type FundamentalsPanelProps = {
  model: StockWorkspaceModel;
};

export function FundamentalsPanel({ model }: FundamentalsPanelProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <section className="trader-workspace-strip fundamentals-strip">
      <button className="collapsible-strip-toggle" onClick={() => setExpanded((value) => !value)} type="button">
        <span>{expanded ? "▼" : "▶"} Fundamentals</span>
        <small>Market cap, capital, category, listing</small>
      </button>
      {expanded ? (
        <div className="fundamentals-grid fundamentals-compact">
          {model.fundamentals.map((item) => (
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
