"use client";

import type { StockDecisionViewModel } from "@/features/stock-workspace/view-models/stock-decision-view-model";
import type { StockWorkspaceLanguage } from "@/features/stock-workspace/stock-workspace-language";
import { EntryApplicabilityLabel } from "@/components/market/entry-applicability-label";

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

  const holder = decision.holderInstruction;
  const adding = !holder || decision.displayAction === "POTENTIAL_BUY" || (decision.tradePlanVisual.entryApplicability && decision.tradePlanVisual.entryApplicability.status !== "NOT_APPLICABLE");
  return (
    <section className={`trader-decision-hero trader-decision-${decision.recommendationTone}`}>
      <span className="trader-decision-label">{copy.label}</span>
      <span className="trader-decision-subtle">{holder ? (decision.locale === "bn" ? "আপনার হোল্ডিংয়ের জন্য" : "For your holding") : decision.audience}</span>
      <strong className="trader-decision-action">{holder?.label ?? decision.recommendation}</strong>
      <small className="trader-decision-subtle">{decision.datedActionLabel}</small>
      {holder && <p className="trader-decision-subtle">{holder.reason}</p>}
      {holder && <small className="trader-decision-subtle">{decision.locale === "bn" ? "প্রকাশিত সাধারণ অ্যাকশন" : "Dated public action"}: {decision.recommendation}</small>}
      {adding && <div className={holder ? "holder-addition-context" : undefined}>
      {holder && <strong>{decision.locale === "bn" ? "এই পজিশনে আরও যোগ করার ক্ষেত্রে" : "Adding to this position"}</strong>}
      <EntryApplicabilityLabel assessment={decision.tradePlanVisual.entryApplicability} locale={decision.locale} />
      {decision.controllingReason ? <p className="trader-decision-subtle">{decision.controllingReason}</p> : null}
      {decision.entryCondition ? (
        <p className="trader-decision-subtle">{decision.entryCondition}</p>
      ) : null}
      </div>}
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
          <span>{decision.riskBasisLabel}</span>
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
      {decision.sourceDetail.length ? <details className="decision-source-detail"><summary>{decision.locale === "bn" ? "প্রকাশিত উৎসের বিস্তারিত" : "Published source detail"}</summary>{decision.sourceDetail.map((text, i) => <p key={i}>{text}</p>)}</details> : null}
    </section>
  );
}
