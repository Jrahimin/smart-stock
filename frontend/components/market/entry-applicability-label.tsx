import type { EntryApplicabilityDto } from "@/lib/api/stock-decision-support-types";
import type { AppLocale } from "@/lib/locale/app-locale";
import { getStockWorkspaceLanguage, type StockWorkspaceLanguage } from "@/features/stock-workspace/stock-workspace-language";

// Display the backend assessment; never infer permission from action or price.
export function EntryApplicabilityLabel({ assessment, locale = "en", copy: suppliedCopy, announce = true, policyReason }: { assessment?: EntryApplicabilityDto | null; locale?: AppLocale; copy?: StockWorkspaceLanguage["panels"]; announce?: boolean; policyReason?: string | null }) {
  const copy = suppliedCopy ?? getStockWorkspaceLanguage(locale).panels;
  const time = (value?: string | null) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(value)) : null;
  const assessed = time(assessment?.assessed_at);
  const source = time(assessment?.source_observed_at);
  const timingReason = assessment?.quote_timing_status ? (locale === "bn" ? "উৎসের দামের যাচাইকৃত সময় নেই; তথ্য আনার সময় দিয়ে দামের সতেজতা নিশ্চিত করা যায় না।" : "Verified quote timing is unavailable; retrieval time cannot establish quote freshness.") : null;
  return <div className={`entry-applicability entry-applicability-${assessment?.status.toLowerCase() ?? "unverified"}`}>
    <strong aria-live={announce ? "polite" : undefined} aria-atomic={announce ? "true" : undefined}>{assessment ? copy.entryStatus[assessment.status] ?? copy.currentEntryUnverified : copy.currentEntryUnverified}</strong>
    {assessment ? <p>{assessment.reason_code === "ACTION_NOT_PERMITTED" && policyReason ? policyReason : assessment.status === "APPLICABLE" && assessed ? copy.entryApplicableAt(assessed) : timingReason ?? copy.entryReason[assessment.reason_code] ?? copy.currentEntryUnverified}</p> : null}
    {assessment && source ? <small>{copy.quoteObservedAt(source)}</small> : null}
  </div>;
}
