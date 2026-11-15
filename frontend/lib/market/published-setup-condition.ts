import type { EntryApplicabilityDto, MeasuredDecisionFactsDto } from "@/lib/api/stock-decision-support-types";
import { formatNumber } from "@/lib/formatters/financial-formatters";
import type { AppLocale } from "@/lib/locale/app-locale";
import { getTraderJourneyLanguage } from "./trader-journey-language";

/** A published watch condition is context, never permission to enter. */
export function publishedSetupCondition(facts: MeasuredDecisionFactsDto | null | undefined, assessment: EntryApplicabilityDto | null | undefined, locale: AppLocale, reasonCode?: string | null): string | null {
  if (assessment && ["INVALIDATED", "EXPIRED"].includes(assessment.status)) return null;
  if (facts?.entry_timing === "PULLBACK") {
    if (assessment?.status === "NOT_APPLICABLE") return locale === "bn"
      ? "Pullback scenario; নতুন Entry সীমিত। Holding confirmation যাচাই করা হয়নি।"
      : "Pullback scenario; fresh entry remains restricted. Holding confirmation not assessed.";
    return facts.confirmation_rule === "COMPLETED_PULLBACK_HOLD"
      ? (locale === "bn" ? "সম্পূর্ণ session-এ zone ছুঁয়ে support-এর ওপর close দরকার; পরের অনুমোদিত session-এ Entry বিবেচনা করুন।" : "Await a completed-session zone touch and close at/above support; entry is considered in a subsequent eligible session.")
      : (locale === "bn" ? "পরিকল্পিত pullback zone; holding confirmation যাচাই করা হয়নি।" : "Planned pullback zone; holding confirmation not assessed.");
  }
  if (assessment?.status === "NOT_APPLICABLE") return null;
  const level = facts?.trigger_price;
  if (level == null || !Number.isFinite(level) || level <= 0) return null;
  const copy = getTraderJourneyLanguage(locale);
  const price = formatNumber(level, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return assessment?.reason_code === "COMPLETED_BREAKOUT_REQUIRED" || reasonCode === "bullish_setup_breakout" && assessment?.status !== "APPLICABLE" ? copy.pendingTrigger(price) : copy.publishedTrigger(price);
}
