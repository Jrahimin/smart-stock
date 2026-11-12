import type { BackendBreadthDto } from "@/lib/api/backend-api-types";
import type { AppLocale } from "@/lib/locale/app-locale";
import { shortTradeDate } from "@/lib/formatters/trader-formatters";

export function breadthCoverageLabel(facts: BackendBreadthDto | null | undefined, locale: AppLocale): string | null {
  if (!facts) return null;
  const cohort = facts.cohort === "ACTIVE_VALID_OHLC" ? (locale === "bn" ? "সক্রিয় শেয়ার" : "Active stocks") : (locale === "bn" ? "এই সেশনে পর্যালোচিত শেয়ার" : "Stocks reviewed for this session");
  return `${cohort} · ${compactBreadthCoverage(facts, locale)} · ${shortTradeDate(facts.as_of_date, locale)} · ${locale === "bn" ? "অপরিবর্তিত সীমা" : "Unchanged band"} ±${facts.neutral_band_percent}%`;
}

export function compactBreadthCoverage(facts: BackendBreadthDto | null | undefined, locale: AppLocale) {
  if (!facts) return locale === "bn" ? "তথ্যের পরিধি" : "Data coverage";
  return facts.unknown_count > 0
    ? (locale === "bn" ? `${facts.cohort_count}টির মধ্যে ${facts.known_count}টির তথ্য আছে · ${facts.unknown_count}টির তথ্য নেই` : `${facts.known_count} of ${facts.cohort_count} stocks reported · ${facts.unknown_count} not reported`)
    : (locale === "bn" ? `${facts.cohort_count}টি শেয়ারের তথ্য আছে` : `All ${facts.cohort_count} stocks reported`);
}
