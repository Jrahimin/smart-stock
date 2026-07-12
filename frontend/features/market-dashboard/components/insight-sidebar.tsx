import { memo } from "react";

import type { DashboardLanguage } from "@/features/market-dashboard/dashboard-language";
import type { InsightBlockModel } from "@/lib/insights/insight-types";

type InsightSidebarProps = {
  insights: InsightBlockModel[];
  copy: DashboardLanguage["insights"];
};

export const InsightSidebar = memo(function InsightSidebar({ insights, copy }: InsightSidebarProps) {
  return (
    <aside className="insight-sidebar">
      <div className="section-heading">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h2>{copy.title}</h2>
      </div>
      {insights.map((insight) => (
        <article className={`insight-block insight-block-${insight.tone} insight-category-${insight.category}`} key={insight.id}>
          <span className="insight-category-label">{insight.categoryLabel ?? insight.category}</span>
          <strong>{insight.title}</strong>
          <p>{insight.description}</p>
        </article>
      ))}
    </aside>
  );
});
