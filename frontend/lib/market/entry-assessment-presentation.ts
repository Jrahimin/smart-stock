import type { EntryApplicabilityDto } from "@/lib/api/stock-decision-support-types";
import type { AppLocale } from "@/lib/locale/app-locale";
import { shortTradeDate } from "@/lib/formatters/trader-formatters";
import { controllingReasonLabel } from "@/lib/market/decision-presentation";
import { getEntryAssessmentLanguage } from "@/lib/market/entry-assessment-language";

function clock(value?: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(value));
}

type EntryView = { label: string; detail: string | null; helper: string | null; tone: string; ariaLabel?: string };

/** Present the backend's explicit outcome; never infer permission from a price. */
export function entryAssessmentPresentation(assessment: EntryApplicabilityDto | null | undefined, locale: AppLocale, _policyReason?: string | null): EntryView | null {
  const copy = getEntryAssessmentLanguage(locale);
  if (assessment?.status === "NOT_APPLICABLE") return null;
  if (assessment?.reason_code === "SESSION_SETTLING") return { label: copy.settling, detail: copy.settlingDetail, helper: null, tone: "unverified" };
  if (!assessment || assessment.status === "UNVERIFIED") {
    const fetched = clock(assessment?.batch_fetched_at);
    const reasons: Record<string, string> = { MARKET_CLOSED: copy.marketClosed, PATH_INCOMPLETE: copy.incompletePath, COVERAGE_UNKNOWN: copy.missingHistory, TERMS_UNKNOWN: copy.missingTerms };
    const quoteUnusable = assessment?.reason_code === "QUOTE_UNUSABLE";
    const dated = quoteUnusable && assessment.quote_session_date ? copy.lastPrice(shortTradeDate(assessment.quote_session_date, locale)) : "";
    const detail = !assessment ? copy.unavailable : reasons[assessment.reason_code] ?? (fetched ? copy.missingSession : assessment.source_observed_at ? copy.unusablePrice : copy.missingTime);
    return { label: copy.checkPrice, ariaLabel: copy.unverifiedAria, detail: dated + detail, helper: fetched ? copy.fetched(fetched) : null, tone: "unverified" };
  }
  const permanent = ["INVALIDATED", "EXPIRED"].includes(assessment.status);
  const outcomes: Record<string, string> = copy.outcomes;
  const base = outcomes[assessment.reason_code] ?? copy.checkPrice;
  let label = base;
  if (!permanent) {
    const time = clock(assessment.price_basis === "SNAPSHOT" ? assessment.batch_fetched_at : assessment.source_observed_at);
    if (assessment.price_basis === "LAST_CLOSE" && assessment.quote_session_date) label = copy.closeAt(base, shortTradeDate(assessment.quote_session_date, locale));
    else if (assessment.price_basis === "SNAPSHOT" && time) label = copy.snapshotAt(base, time);
    else if (assessment.price_basis === "CURRENT" && time) label = copy.currentAt(base, time);
    else return { label: copy.checkPrice, ariaLabel: copy.unverifiedAria, detail: copy.unknownBasis, helper: null, tone: "unverified" };
  }
  const blocker = assessment.controlling_blocker ? controllingReasonLabel(assessment.controlling_blocker, "", locale) : null;
  return { label, detail: assessment.reason_code === "STOP_BREACHED" ? copy.stopped : blocker || null,
    helper: assessment.price_basis === "SNAPSHOT" ? copy.snapshotAdvice : null, tone: assessment.status.toLowerCase() };
}
