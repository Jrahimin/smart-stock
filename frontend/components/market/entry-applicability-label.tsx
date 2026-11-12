import type { EntryApplicabilityDto } from "@/lib/api/stock-decision-support-types";
import type { AppLocale } from "@/lib/locale/app-locale";
import { getStockWorkspaceLanguage, type StockWorkspaceLanguage } from "@/features/stock-workspace/stock-workspace-language";
import { shortTradeDate } from "@/lib/formatters/trader-formatters";

// Display the backend assessment; never infer permission from action or price.
export function EntryApplicabilityLabel({ assessment, locale = "en", copy: suppliedCopy, announce = true, policyReason }: { assessment?: EntryApplicabilityDto | null; locale?: AppLocale; copy?: StockWorkspaceLanguage["panels"]; announce?: boolean; policyReason?: string | null }) {
  const copy = suppliedCopy ?? getStockWorkspaceLanguage(locale).panels;
  if (assessment?.status === "NOT_APPLICABLE") return null;
  const bn = locale === "bn";
  if (!assessment || assessment.status === "UNVERIFIED") {
    const quoteDate = assessment?.quote_session_date ? shortTradeDate(assessment.quote_session_date, locale) : null;
    const quoteUnusable = assessment?.reason_code === "QUOTE_UNUSABLE";
    const missingQuoteTime = quoteUnusable && !assessment?.source_observed_at;
    const reason = missingQuoteTime
      ? (bn ? `${quoteDate ? `শেষ নথিভুক্ত দামের তারিখ ${quoteDate}। ` : ""}দামটি কখন পর্যবেক্ষণ করা হয়েছে জানা নেই, তাই এখন এন্ট্রির শর্ত মিলছে কি না যাচাই করা যায়নি।`
        : `${quoteDate ? `The latest recorded price is from ${quoteDate}. ` : ""}The quote observation time is unavailable, so current entry conditions could not be verified.`)
      : assessment?.reason_code ? copy.entryReason[assessment.reason_code] ?? copy.currentEntryUnverified : copy.currentEntryUnverified;
    const label = missingQuoteTime
      ? (bn ? "এন্ট্রি যাচাই হয়নি · দামের সময় জানা নেই" : "Entry unverified · quote time unavailable")
      : (bn ? "এন্ট্রি যাচাই হয়নি" : "Entry unverified");
    return <details className="entry-applicability entry-applicability-unverified entry-check-detail"><summary aria-live={announce ? "polite" : undefined}>{label} <span aria-hidden="true">ⓘ</span></summary><p>{reason}</p></details>;
  }
  const time = (value?: string | null) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat(locale === "bn" ? "bn-BD-u-nu-latn" : "en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(value)) : null;
  const assessed = time(assessment?.assessed_at);
  const source = time(assessment?.source_observed_at);
  const closingBasis = assessment.price_basis === "LAST_CLOSE" && assessment.quote_session_date;
  const basisLabel = closingBasis ? (bn ? `${shortTradeDate(assessment.quote_session_date, locale)}-এর সমাপনী দামের ভিত্তিতে` : `Based on the ${shortTradeDate(assessment.quote_session_date, locale)} closing quote`) : null;
  return <div className={`entry-applicability entry-applicability-${assessment.status.toLowerCase()}${["INVALIDATED", "EXPIRED"].includes(assessment.status) ? " entry-check-alert" : ""}`}>
    <strong aria-live={announce ? "polite" : undefined} aria-atomic={announce ? "true" : undefined}>{assessment ? copy.entryStatus[assessment.status] ?? copy.currentEntryUnverified : copy.currentEntryUnverified}</strong>
    {assessment ? <p>{assessment.reason_code === "ACTION_NOT_PERMITTED" && policyReason ? policyReason : assessment.status === "APPLICABLE" && assessed ? (basisLabel ?? copy.entryApplicableAt(assessed)) : copy.entryReason[assessment.reason_code] ?? copy.currentEntryUnverified}</p> : null}
    {basisLabel && assessment.status !== "APPLICABLE" ? <small>{basisLabel}</small> : null}
    {assessment && source ? <small>{copy.quoteObservedAt(source)}</small> : null}
  </div>;
}
