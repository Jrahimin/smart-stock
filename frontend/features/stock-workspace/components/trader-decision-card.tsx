"use client";

import { MeasuredDecisionFacts } from "@/components/market/measured-decision-facts";


import type { StockDecisionViewModel } from "@/features/stock-workspace/view-models/stock-decision-view-model";
import type { StockWorkspaceLanguage } from "@/features/stock-workspace/stock-workspace-language";
import { EntryApplicabilityLabel } from "@/components/market/entry-applicability-label";
import { potentialBuyNextStep } from "@/lib/market/entry-assessment-presentation";
import { getTraderJourneyLanguage } from "@/lib/market/trader-journey-language";
import { shortTradeDate } from "@/lib/formatters/trader-formatters";
import { formatNumber } from "@/lib/formatters/financial-formatters";

type TraderDecisionCardProps = {
  decision: StockDecisionViewModel;
  copy: StockWorkspaceLanguage["decision"];
  previousTrigger?: number | null;
  previousTriggerDate?: string | null;
};

export function TraderDecisionCard({ decision, copy, previousTrigger, previousTriggerDate }: TraderDecisionCardProps) {
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
  const buyIdea = decision.displayAction === "POTENTIAL_BUY" ? potentialBuyNextStep(decision.tradePlanVisual.entryApplicability, decision.measuredFacts, decision.locale, decision.entryCondition) : null;
  const headline = buyIdea?.headline ?? decision.recommendation;
  const bn = decision.locale === "bn";
  const price = (level: number) => `৳${formatNumber(level)}`;
  const plan = decision.tradePlanVisual;
  const trigger = decision.measuredFacts?.trigger_price;
  const changedTrigger = !buyIdea?.terminal && trigger != null && previousTrigger != null && trigger !== previousTrigger && previousTriggerDate;
  const adding = !holder || decision.displayAction === "POTENTIAL_BUY" || (decision.tradePlanVisual.entryApplicability && decision.tradePlanVisual.entryApplicability.status !== "NOT_APPLICABLE");
  return (
    <section className={`trader-decision-hero trader-decision-${buyIdea?.terminal && !holder ? "neutral" : decision.recommendationTone}`}>
      <span className="trader-decision-label">{copy.label}</span>
      <span className="trader-decision-subtle">{holder ? language.holding : decision.audience}</span>
      <strong className="trader-decision-action">{holder?.label ?? headline}</strong>
      <small className="trader-decision-subtle">{decision.datedActionLabel}</small>
      {holder && <p className="trader-decision-subtle">{holder.reason}</p>}
      {holder && <small className="trader-decision-subtle">{language.publicAction}: {headline}</small>}
      {adding && <div className={holder ? "holder-addition-context" : undefined}>
      {holder && <strong>{language.adding}</strong>}
      {buyIdea ? <p className="trader-decision-subtle" aria-live="polite">{buyIdea.nextStep}</p> : <EntryApplicabilityLabel assessment={decision.tradePlanVisual.entryApplicability} locale={decision.locale} />}
      {buyIdea && !buyIdea.terminal && plan.entryLow != null && plan.entryHigh != null && plan.stopLoss != null && plan.targetLow != null ? <dl className="buy-idea-levels">
        <div><dt>{bn ? "কেনার দামের সীমা" : "Entry range"}</dt><dd>{price(plan.entryLow)}–{price(plan.entryHigh)}</dd></div>
        <div><dt>{bn ? "স্টপ" : "Stop"}</dt><dd>{price(plan.stopLoss)}</dd></div>
        <div><dt>{decision.measuredFacts?.entry_timing === "BREAKOUT" ? (bn ? "সম্ভাব্য লক্ষ্য" : "Projected target") : (bn ? "প্রথম লক্ষ্য" : "First target")}</dt><dd>{price(plan.targetLow)}</dd></div>
      </dl> : null}
      {!buyIdea && decision.controllingReason ? <p className="trader-decision-subtle">{decision.controllingReason}</p> : null}
      {!buyIdea && decision.entryCondition ? (
        <p className="trader-decision-subtle">{decision.entryCondition}</p>
      ) : null}
      </div>}
      {changedTrigger ? <p className="trader-decision-subtle"><strong>{bn ? "দিন শেষে কী বদলাল?" : "What changed at the close?"}</strong>{" "}
        {bn ? `নতুন স্তর ${price(trigger)}। ${shortTradeDate(previousTriggerDate, decision.locale)}-এর স্তর ছিল ${price(previousTrigger)}।`
          : `The new plan puts the trigger at ${price(trigger)}. It was ${price(previousTrigger)} on ${shortTradeDate(previousTriggerDate, decision.locale)}.`}</p> : null}
      <MeasuredDecisionFacts facts={decision.measuredFacts} locale={decision.locale} limit={3} />
    </section>
  );
}

export function DecisionSourceDetails({ decision }: { decision: StockDecisionViewModel }) {
  return decision.sourceDetail.length ? <details className="decision-source-detail"><summary>{getTraderJourneyLanguage(decision.locale).sourceDetails}</summary>{decision.sourceDetail.map((text, index) => <p key={index}>{text}</p>)}</details> : null;
}
