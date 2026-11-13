import type { EntryApplicabilityDto, MeasuredDecisionFactsDto } from "@/lib/api/stock-decision-support-types";
import type { AppLocale } from "@/lib/locale/app-locale";
import { publishedSetupCondition } from "@/lib/market/published-setup-condition";

export function PublishedSetupCondition({ facts, assessment, locale, reasonCode }: { facts?: MeasuredDecisionFactsDto | null; assessment?: EntryApplicabilityDto | null; locale: AppLocale; reasonCode?: string | null }) {
  const text = publishedSetupCondition(facts, assessment, locale, reasonCode);
  return text ? <small className="published-setup-condition">{text}</small> : null;
}
