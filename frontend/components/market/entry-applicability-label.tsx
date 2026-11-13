import type { EntryApplicabilityDto } from "@/lib/api/stock-decision-support-types";
import type { AppLocale } from "@/lib/locale/app-locale";
import type { StockWorkspaceLanguage } from "@/features/stock-workspace/stock-workspace-language";
import { entryAssessmentPresentation } from "@/lib/market/entry-assessment-presentation";

export function EntryApplicabilityLabel({ assessment, locale = "en", announce = true, policyReason }: { assessment?: EntryApplicabilityDto | null; locale?: AppLocale; copy?: StockWorkspaceLanguage["panels"]; announce?: boolean; policyReason?: string | null }) {
  const view = entryAssessmentPresentation(assessment, locale, policyReason);
  if (!view) return null;
  if (view.tone === "unverified") return <details className="entry-applicability entry-applicability-unverified entry-check-detail"><summary aria-label={view.ariaLabel} aria-live={announce ? "polite" : undefined}>{view.label} <span aria-hidden="true">ⓘ</span></summary>{view.detail ? <p>{view.detail}</p> : null}{view.helper ? <small>{view.helper}</small> : null}</details>;
  return <div className={`entry-applicability entry-applicability-${view.tone}${view.tone === "invalidated" || view.tone === "expired" ? " entry-check-alert" : ""}`}>
    <strong aria-live={announce ? "polite" : undefined} aria-atomic={announce ? "true" : undefined}>{view.label}</strong>
    {view.detail ? <p>{view.detail}</p> : null}
    {view.helper ? <small>{view.helper}</small> : null}
  </div>;
}
