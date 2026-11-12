import type { BackendBreadthDto } from "@/lib/api/backend-api-types";
import type { AppLocale } from "@/lib/locale/app-locale";

export function breadthCoverageLabel(facts: BackendBreadthDto | null | undefined, locale: AppLocale): string | null {
  if (!facts) return null;
  const cohort = facts.cohort === "ACTIVE_VALID_OHLC" ? (locale === "bn" ? "সক্রিয় বৈধ OHLC" : "Active valid OHLC") : (locale === "bn" ? "যোগ্য একই সেশনের শেয়ার" : "Eligible same-session stocks");
  return locale === "bn" ? `${cohort} · জানা ${facts.known_count}/${facts.cohort_count} · অজানা ${facts.unknown_count} · ${facts.as_of_date ?? "—"} · নিরপেক্ষ ±${facts.neutral_band_percent}%` : `${cohort} · ${facts.known_count}/${facts.cohort_count} known · ${facts.unknown_count} unknown · ${facts.as_of_date ?? "—"} · neutral ±${facts.neutral_band_percent}%`;
}

export function compactBreadthCoverage(facts: BackendBreadthDto | null | undefined, locale: AppLocale) {
  return facts ? (locale === "bn" ? `${facts.known_count}/${facts.cohort_count} জানা · ${facts.unknown_count} অজানা` : `${facts.known_count}/${facts.cohort_count} measured · ${facts.unknown_count} unknown`) : (locale === "bn" ? "পরিধি জানা নেই" : "Coverage unavailable");
}
