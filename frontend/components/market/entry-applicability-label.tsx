import type { EntryApplicabilityDto } from "@/lib/api/stock-decision-support-types";
import type { AppLocale } from "@/lib/locale/app-locale";
import { getStockWorkspaceLanguage, type StockWorkspaceLanguage } from "@/features/stock-workspace/stock-workspace-language";

// Display the backend assessment; never infer permission from action or price.
export function EntryApplicabilityLabel({ assessment, locale = "en", copy: suppliedCopy }: { assessment?: EntryApplicabilityDto | null; locale?: AppLocale; copy?: StockWorkspaceLanguage["panels"] }) {
  const copy = suppliedCopy ?? getStockWorkspaceLanguage(locale).panels;
  return <div className="my-2 text-sm">
    <strong>{assessment ? copy.entryStatus[assessment.status] ?? copy.currentEntryUnverified : copy.currentEntryUnverified}</strong>
    {assessment ? <p>{copy.entryReason[assessment.reason_code] ?? copy.currentEntryUnverified}</p> : null}
  </div>;
}
