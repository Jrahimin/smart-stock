import type { EntryApplicabilityDto } from "@/lib/api/stock-decision-support-types";
import type { AppLocale } from "@/lib/locale/app-locale";
import type { StockWorkspaceLanguage } from "@/features/stock-workspace/stock-workspace-language";
import { entryAssessmentPresentation } from "@/lib/market/entry-assessment-presentation";

export function EntryApplicabilityLabel({ assessment, locale = "en", announce = true, policyReason }: { assessment?: EntryApplicabilityDto | null; locale?: AppLocale; copy?: StockWorkspaceLanguage["panels"]; announce?: boolean; policyReason?: string | null }) {
  const view = entryAssessmentPresentation(assessment, locale, policyReason);
  const context = assessment?.price_context;
  const comparison = context?.zone_relation === "ABOVE_ENTRY_ZONE" ? (locale === "bn" ? "দাম Entry zone-এর ওপরে" : "Price above entry zone")
    : context?.zone_relation === "BELOW_ENTRY_ZONE" ? (locale === "bn" ? "দাম Entry zone-এর নিচে" : "Price below entry zone") : null;
  const secondary = context && comparison ? <small className="entry-price-context">{comparison}
    {context.first_target_reward_risk != null ? ` · ${locale === "bn" ? "এই দামে R/R" : "R/R at this price"} ${context.first_target_reward_risk.toFixed(3)}× (${locale === "bn" ? "খরচের আগে" : "before costs"})` : ""}</small> : null;
  if (assessment?.status === "NOT_APPLICABLE") return secondary;
  if (!view) return secondary;
  return <div className={`entry-applicability entry-applicability-${view.tone}${view.tone === "invalidated" || view.tone === "expired" ? " entry-check-alert" : ""}`}>
    <strong aria-live={announce ? "polite" : undefined} aria-atomic={announce ? "true" : undefined}>{view.label}</strong>
    {view.detail ? <p>{view.detail}</p> : null}
    {view.helper ? <small>{view.helper}</small> : null}
    {secondary}
  </div>;
}
