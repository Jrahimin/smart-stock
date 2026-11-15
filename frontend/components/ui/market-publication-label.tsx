import React from "react";

import type { AppLocale } from "@/lib/locale/app-locale";
import { shortTradeDate } from "@/lib/formatters/trader-formatters";

export type DecisionPublication = {
  decision_session_date?: string | null;
  decision_status?: string | null;
};

export type QuotePublication = {
  current_price?: number | null;
  source_observed_at?: string | null;
  batch_fetched_at?: string | null;
  as_of_trade_date?: string | null;
  observation_session_date?: string | null;
  observation_status?: string | null;
};

/** Dated decisions remain visible; publication health stays internal. */
export function DecisionPublicationLabel({ decision, locale, compact = false }: {
  decision?: DecisionPublication | null; locale: AppLocale; compact?: boolean;
}) {
  if (!decision?.decision_session_date) return decision?.decision_status === "UNAVAILABLE"
    ? <small>{locale === "bn" ? "সিদ্ধান্ত অনুপলব্ধ" : "Decision unavailable"}</small> : null;
  return <small className={compact?"decision-publication-compact":undefined}>
    {locale==="bn"?"সিদ্ধান্ত":"Decision"} · <time dateTime={decision.decision_session_date}>{shortTradeDate(decision.decision_session_date,locale)}</time>
  </small>;
}
/** Quote availability and authority remain API facts; the numeric renderer owns its dash. */
export function QuotePublicationLabel({ quote, locale }: { quote?: QuotePublication | null; locale: AppLocale }) {
  return quote?.observation_status === "NO_TRADE"
    ? <small>{locale === "bn" ? "লেনদেন হয়নি" : "No trade"}</small> : null;
}
