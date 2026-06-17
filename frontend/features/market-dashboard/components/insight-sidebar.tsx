import { memo } from "react";

import type { InsightBlockModel } from "@/lib/insights/insight-types";

type InsightSidebarProps = {
  insights: InsightBlockModel[];
};

export const InsightSidebar = memo(function InsightSidebar({ insights }: InsightSidebarProps) {
  return (
    <aside className="insight-sidebar">
      <div className="section-heading">
        <p className="eyebrow">Insights</p>
        <h2>Deterministic intelligence</h2>
      </div>
      {insights.map((insight) => (
        <article className={`insight-block insight-block-${insight.tone} insight-category-${insight.category}`} key={insight.id}>
          <span className="insight-category-label">{insight.category}</span>
          <strong>{insight.title}</strong>
          <p>{insight.description}</p>
          <span>{insight.source}</span>
        </article>
      ))}
    </aside>
  );
});
