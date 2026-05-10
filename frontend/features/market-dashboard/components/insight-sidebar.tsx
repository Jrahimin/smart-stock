import type { InsightBlockModel } from "@/lib/insights/insight-types";

type InsightSidebarProps = {
  insights: InsightBlockModel[];
};

export function InsightSidebar({ insights }: InsightSidebarProps) {
  return (
    <aside className="insight-sidebar">
      <div className="section-heading">
        <p className="eyebrow">Insights</p>
        <h2>Deterministic intelligence</h2>
      </div>
      {insights.map((insight) => (
        <article className={`insight-block insight-block-${insight.tone}`} key={insight.id}>
          <strong>{insight.title}</strong>
          <p>{insight.description}</p>
          <span>{insight.source}</span>
        </article>
      ))}
    </aside>
  );
}
