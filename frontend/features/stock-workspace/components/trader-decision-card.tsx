"use client";

import type { StockDecisionViewModel } from "@/features/stock-workspace/view-models/stock-decision-view-model";

type TraderDecisionCardProps = {
  decision: StockDecisionViewModel;
};

export function TraderDecisionCard({ decision }: TraderDecisionCardProps) {
  if (!decision.available) {
    return (
      <section className="trader-decision-hero trader-decision-neutral trader-decision-loading">
        <span className="trader-decision-label">Decision</span>
        <strong className="trader-decision-action">—</strong>
        <p className="trader-decision-subtle">Loading decision support…</p>
      </section>
    );
  }

  return (
    <section className={`trader-decision-hero trader-decision-${decision.recommendationTone}`}>
      <span className="trader-decision-label">Decision</span>
      <strong className="trader-decision-action">{decision.recommendation}</strong>
      <div className="trader-decision-metrics">
        <div>
          <span>Confidence</span>
          <strong>{decision.confidenceLabel}</strong>
        </div>
        <div>
          <span>Opportunity</span>
          <strong>{decision.opportunityScore}</strong>
        </div>
        <div>
          <span>Risk</span>
          <strong>{decision.riskLabel}</strong>
        </div>
      </div>
      <ul className="trader-decision-signals">
        {decision.decisionSignals.map((signal) => (
          <li className={`trader-decision-signal trader-decision-signal-${signal.tone}`} key={signal.text}>
            {signal.tone === "positive" ? "✓" : "⚠"} {signal.text}
          </li>
        ))}
      </ul>
    </section>
  );
}
