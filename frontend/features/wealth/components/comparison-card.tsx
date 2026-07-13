import Link from "next/link";

import { getWealthLandingLanguage } from "@/features/wealth/wealth-language";
import type { WealthComparisonSlug } from "@/features/wealth/types/wealth-types";
import { DEFAULT_LOCALE, type AppLocale } from "@/lib/locale/app-locale";

type ComparisonCardProps = {
  slug: WealthComparisonSlug;
  accent: string;
  locale?: AppLocale;
};

export function ComparisonCard({ slug, accent, locale = DEFAULT_LOCALE }: ComparisonCardProps) {
  const language = getWealthLandingLanguage(locale);
  const copy = language.comparison.items[slug];

  return (
    <Link className={`wealth-comparison-card wealth-comparison-card-${accent}`} href={`/wealth/compare/${slug}`}>
      <div className="wealth-comparison-card-header">
        <span className="wealth-comparison-icon-inline" aria-hidden="true">
          {comparisonIcon(accent)}
        </span>
        <p className="wealth-recommendation-cue">{copy.cue}</p>
      </div>
      <h3>{copy.title}</h3>
      <p>{copy.description}</p>
      <span className="wealth-card-link">{language.comparison.cardCta}</span>
    </Link>
  );
}

function comparisonIcon(accent: string) {
  const icons: Record<string, string> = {
    steady: "🐷",
    growth: "📈",
    choice: "⚖",
    debt: "💳",
    inflation: "📉",
  };
  return icons[accent] ?? "⇄";
}
