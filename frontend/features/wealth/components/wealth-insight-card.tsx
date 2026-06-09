import Link from "next/link";

import type { WealthInsightCard as WealthInsightCardType } from "@/features/wealth/types/wealth-types";
import { insightToneClass } from "@/features/wealth/view-models/wealth-view-model";

type WealthInsightCardProps = {
  insight: WealthInsightCardType;
};

export function WealthInsightCard({ insight }: WealthInsightCardProps) {
  return (
    <article className={`wealth-insight-card ${insightToneClass(insight.severity)}`}>
      <p className="eyebrow">Insight</p>
      <h3>{insight.title}</h3>
      <p>{insight.body}</p>
      {insight.action_label && insight.action_href ? (
        <Link className="wealth-inline-link" href={insight.action_href}>
          {insight.action_label}
        </Link>
      ) : null}
    </article>
  );
}
