import Link from "next/link";

import type { WealthInsightCard as WealthInsightCardType } from "@/features/wealth/types/wealth-types";
import { insightToneClass } from "@/features/wealth/view-models/wealth-view-model";
import { getWealthInsightCopy, getWealthLandingLanguage } from "@/features/wealth/wealth-language";
import type { AppLocale } from "@/lib/locale/app-locale";

type WealthInsightCardProps = {
  insight: WealthInsightCardType;
  locale?: AppLocale;
};

export function WealthInsightCard({ insight, locale = "en" }: WealthInsightCardProps) {
  const language = getWealthLandingLanguage(locale);
  const copy = getWealthInsightCopy(insight, locale);

  return (
    <article className={`wealth-insight-card ${insightToneClass(insight.severity)}`}>
      <p className="eyebrow">{language.insights.cardEyebrow}</p>
      <h3>{copy.title}</h3>
      <p>{copy.body}</p>
      {copy.action_label && copy.action_href ? (
        <Link className="wealth-inline-link" href={copy.action_href}>
          {copy.action_label}
        </Link>
      ) : null}
    </article>
  );
}
