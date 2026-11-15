import type { EntryApplicabilityDto } from "@/lib/api/stock-decision-support-types";
import type { AppLocale } from "@/lib/locale/app-locale";
import { controllingReasonLabel } from "@/lib/market/decision-presentation";
import { getEntryAssessmentLanguage } from "@/lib/market/entry-assessment-language";

type EntryView = { label: string; detail: string | null; helper: string | null; tone: string; ariaLabel?: string };

/** Present the backend's explicit outcome; never infer permission from a price. */
export function entryAssessmentPresentation(assessment: EntryApplicabilityDto | null | undefined, locale: AppLocale, policyReason?: string | null): EntryView | null {
  const copy = getEntryAssessmentLanguage(locale);
  if (!assessment || ["NOT_APPLICABLE","UNVERIFIED"].includes(assessment.status)) return null;
  const permanent = ["INVALIDATED", "EXPIRED"].includes(assessment.status);
  const outcomes: Record<string, string> = copy.outcomes;
  const base = outcomes[assessment.reason_code];
  if (!base) return null;
  const label = base;
  if (!permanent) {
    if (!["CURRENT","SNAPSHOT","LAST_CLOSE"].includes(assessment.price_basis ?? "")) return null;
  }
  const blocker = assessment.controlling_blocker ? controllingReasonLabel(assessment.controlling_blocker, "", locale) : null;
  const hold = assessment.reason_code === "COMPLETED_PULLBACK_HOLD_REQUIRED" ? (locale === "bn" ? "সম্পূর্ণ session-এ zone ছুঁয়ে support-এর ওপর close দরকার; Entry পরের অনুমোদিত session-এ।" : "A completed session must touch the zone and close at/above support; entry can qualify in a subsequent session.") : null;
  return { label, detail: assessment.reason_code === "STOP_BREACHED" ? copy.stopped : hold || blocker || (policyReason && policyReason !== base ? policyReason : null),
    helper: null, tone: assessment.status.toLowerCase() };
}
