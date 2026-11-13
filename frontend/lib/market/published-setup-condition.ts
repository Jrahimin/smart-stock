import type { EntryApplicabilityDto, MeasuredDecisionFactsDto } from "@/lib/api/stock-decision-support-types";
import { formatNumber } from "@/lib/formatters/financial-formatters";
import type { AppLocale } from "@/lib/locale/app-locale";
import { getTraderJourneyLanguage } from "./trader-journey-language";

/** A published watch condition is context, never permission to enter. */
export function publishedSetupCondition(facts: MeasuredDecisionFactsDto | null | undefined, assessment: EntryApplicabilityDto | null | undefined, locale: AppLocale, reasonCode?: string | null): string | null {
  const level = facts?.trigger_price;
  if (assessment && ["INVALIDATED", "EXPIRED", "NOT_APPLICABLE"].includes(assessment.status)) return null;
  if (level == null || !Number.isFinite(level) || level <= 0) return null;
  const copy = getTraderJourneyLanguage(locale);
  const price = formatNumber(level, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return assessment?.reason_code === "COMPLETED_BREAKOUT_REQUIRED" || reasonCode === "bullish_setup_breakout" && assessment?.status !== "APPLICABLE" ? copy.pendingTrigger(price) : copy.publishedTrigger(price);
}
