"use client";

import type { StockDecisionViewModel } from "@/features/stock-workspace/view-models/stock-decision-view-model";
import type { StockWorkspaceLanguage } from "@/features/stock-workspace/stock-workspace-language";

type TraderDecisionCardProps = {
  decision: StockDecisionViewModel;
  copy: StockWorkspaceLanguage["decision"];
};

export function TraderDecisionCard({ decision, copy }: TraderDecisionCardProps) {
  if (!decision.available) {
    return (
      <section className="trader-decision-hero trader-decision-neutral trader-decision-loading">
        <span className="trader-decision-label">{copy.label}</span>
        <strong className="trader-decision-action">—</strong>
        <p className="trader-decision-subtle">{copy.loading}</p>
      </section>
    );
  }

  return (
    <section className={`trader-decision-hero trader-decision-${decision.recommendationTone}`}>
      <span className="trader-decision-label">{copy.label}</span>
      <strong className="trader-decision-action">{decision.recommendation}</strong>
      {decision.entryCondition ? (
        <p className="trader-decision-subtle">{decision.entryCondition}</p>
      ) : null}
      <div className="trader-decision-metrics">
        <div>
          <span>{copy.confidence}</span>
          <strong>{decision.confidenceLabel}</strong>
        </div>
        <div>
          <span>{copy.opportunity}</span>
          <strong>{decision.opportunityScore}</strong>
        </div>
        <div>
          <span>{copy.risk}</span>
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
