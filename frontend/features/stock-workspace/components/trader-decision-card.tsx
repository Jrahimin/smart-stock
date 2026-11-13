"use client";

import { MeasuredDecisionFacts } from "@/components/market/measured-decision-facts";


import type { StockDecisionViewModel } from "@/features/stock-workspace/view-models/stock-decision-view-model";
import type { StockWorkspaceLanguage } from "@/features/stock-workspace/stock-workspace-language";
import { EntryApplicabilityLabel } from "@/components/market/entry-applicability-label";
import { getTraderJourneyLanguage } from "@/lib/market/trader-journey-language";

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
  const language = getTraderJourneyLanguage(decision.locale);
  const adding = !holder || decision.displayAction === "POTENTIAL_BUY" || (decision.tradePlanVisual.entryApplicability && decision.tradePlanVisual.entryApplicability.status !== "NOT_APPLICABLE");
  return (
    <section className={`trader-decision-hero trader-decision-${decision.recommendationTone}`}>
      <span className="trader-decision-label">{copy.label}</span>
      <span className="trader-decision-subtle">{holder ? language.holding : decision.audience}</span>
      <strong className="trader-decision-action">{holder?.label ?? decision.recommendation}</strong>
      <small className="trader-decision-subtle">{decision.datedActionLabel}</small>
      {holder && <p className="trader-decision-subtle">{holder.reason}</p>}
      {holder && <small className="trader-decision-subtle">{language.publicAction}: {decision.recommendation}</small>}
      {adding && <div className={holder ? "holder-addition-context" : undefined}>
      {holder && <strong>{language.adding}</strong>}
      <EntryApplicabilityLabel assessment={decision.tradePlanVisual.entryApplicability} locale={decision.locale} />
      {decision.controllingReason ? <p className="trader-decision-subtle">{decision.controllingReason}</p> : null}
      {decision.entryCondition ? (
        <p className="trader-decision-subtle">{decision.entryCondition}</p>
      ) : null}
      </div>}
      <MeasuredDecisionFacts facts={decision.measuredFacts} locale={decision.locale} limit={3} />
    </section>
  );
}

export function DecisionSourceDetails({ decision }: { decision: StockDecisionViewModel }) {
  return decision.sourceDetail.length ? <details className="decision-source-detail"><summary>{getTraderJourneyLanguage(decision.locale).sourceDetails}</summary>{decision.sourceDetail.map((text, index) => <p key={index}>{text}</p>)}</details> : null;
}
