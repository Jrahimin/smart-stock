import React from "react";

import type { AppLocale } from "@/lib/locale/app-locale";
import { shortTradeDate } from "@/lib/formatters/trader-formatters";

export type DecisionPublication = {
  decision_session_date?: string | null;
  decision_status?: string | null;
};

export type QuotePublication = {
  source_observed_at?: string | null;
  batch_fetched_at?: string | null;
  as_of_trade_date?: string | null;
  observation_session_date?: string | null;
  observation_status?: string | null;
};

export function DecisionPublicationLabel({ decision, locale, compact = false }: {
  decision?: DecisionPublication | null;
  locale: AppLocale;
  compact?: boolean;
}) {
  if (!decision?.decision_status && !decision?.decision_session_date) return null;
  const bn = locale === "bn";
  const label = decision.decision_status === "UPDATING"
    ? (bn ? "আপডেট হচ্ছে · আগের চূড়ান্ত সিদ্ধান্ত" : "Updating · Previous finalized decision")
    : decision.decision_status === "UNAVAILABLE"
      ? (bn ? "সিদ্ধান্ত পাওয়া যায়নি" : "Decision unavailable")
      : (bn ? "চূড়ান্ত সিদ্ধান্ত" : "Finalized decision");
  if (compact) {
    const brief = decision.decision_status === "UPDATING" ? (bn ? "আপডেট হচ্ছে" : "Updating")
      : decision.decision_status === "UNAVAILABLE" ? (bn ? "অনুপলব্ধ" : "Unavailable") : (bn ? "চূড়ান্ত" : "Finalized");
    return <small className="decision-publication-compact" data-decision-status={decision.decision_status}>
      <span className="sr-only">{label}{decision.decision_session_date ? ` · ${decision.decision_session_date}` : ""}</span>
      <span aria-hidden="true">{brief}</span>
      {decision.decision_session_date && <time aria-hidden="true" dateTime={decision.decision_session_date}>{shortTradeDate(decision.decision_session_date, locale)}</time>}
    </small>;
  }
  return <small data-decision-status={decision.decision_status}>
    {label}{decision.decision_session_date ? ` · ${shortTradeDate(decision.decision_session_date, locale)}` : ""}
  </small>;
}

export function QuotePublicationLabel({ quote, locale }: {
  quote?: QuotePublication | null;
  locale: AppLocale;
}) {
  if (!quote?.observation_status) return null;
  const bn = locale === "bn";
  const labels: Record<string, string> = bn
    ? { PROVISIONAL: "সাময়িক দাম", FINALIZED: "চূড়ান্ত দাম", NO_TRADE: "লেনদেন হয়নি", UNAVAILABLE: "দামের তথ্য নেই" }
    : { PROVISIONAL: "Snapshot price", FINALIZED: "Closing price", NO_TRADE: "No trade", UNAVAILABLE: "Price unavailable" };
  const status = quote.observation_status;
  const observationDate = quote.observation_session_date;
  const priceDate = quote.as_of_trade_date;
  return <small data-quote-status={status}>
    {labels[status] ?? labels.UNAVAILABLE}
    {observationDate && (status !== "UNAVAILABLE" || observationDate !== priceDate)
      ? ` · ${shortTradeDate(observationDate, locale)}` : ""}
    {priceDate && (status === "UNAVAILABLE" || (observationDate && priceDate !== observationDate))
      ? ` · ${bn ? "শেষ বৈধ দাম" : "Last valid price"} ${shortTradeDate(priceDate, locale)}` : ""}
    {priceDate && !observationDate && status !== "UNAVAILABLE" ? ` · ${shortTradeDate(priceDate, locale)}` : ""}
  </small>;
}
