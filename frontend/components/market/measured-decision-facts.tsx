import type { MeasuredDecisionFactsDto } from "@/lib/api/stock-decision-support-types";
import type { AppLocale } from "@/lib/locale/app-locale";
import { getTraderJourneyLanguage } from "@/lib/market/trader-journey-language";

export function measuredDecisionFacts(facts: MeasuredDecisionFactsDto | null | undefined, locale: AppLocale, limit = 2): string[] {
  if (!facts) return [];
  const number = (value: number) => new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 }).format(value);
  const values: string[] = [];
  if (facts.rsi != null && Number.isFinite(facts.rsi)) values.push(`RSI ${number(facts.rsi)}`);
  if (facts.volume_ratio != null && Number.isFinite(facts.volume_ratio)) values.push(getTraderJourneyLanguage(locale).medianVolume(number(facts.volume_ratio)));
  const price = (value: number) => new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  if (facts.trigger_price != null) values.push(`Trigger ${price(facts.trigger_price)}`);
  else if (facts.resistance != null) values.push(`Resistance ${price(facts.resistance)}`);
  if (facts.trend) values.push(`Trend ${facts.trend.replaceAll("_", " ").toLowerCase()}`);
  if (facts.opportunity_score != null) values.push(`Opportunity ${number(facts.opportunity_score)}/100`);
  return values.slice(0, limit);
}

export function MeasuredDecisionFacts({ facts, locale = "en", limit = 2, ratings = false }: { facts?: MeasuredDecisionFactsDto | null; locale?: AppLocale; limit?: number; ratings?: boolean }) {
  const values = measuredDecisionFacts(facts, locale, limit);
  const ratingFacts = ratings ? [facts?.trend ? `Trend ${facts.trend.replaceAll("_", " ").toLowerCase()}` : null,
    facts?.opportunity_score != null ? `Opportunity ${facts.opportunity_score}/100` : null].filter((value): value is string => Boolean(value) && !values.includes(value!)) : [];
  return <>{values.length ? <small className="measured-decision-facts">{values.join(" · ")}</small> : null}{ratingFacts.length ? <small className="measured-decision-facts decision-rating-facts">{ratingFacts.join(" · ")}</small> : null}</>;
}
