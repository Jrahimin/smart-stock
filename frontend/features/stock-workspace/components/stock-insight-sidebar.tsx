import type { StockWorkspaceModel } from "@/features/stock-workspace/view-models/stock-workspace-view-model";

type StockInsightSidebarProps = {
  model: StockWorkspaceModel;
};

export function StockInsightSidebar({ model }: StockInsightSidebarProps) {
  return (
    <aside className="insight-sidebar">
      <div className="section-heading">
        <p className="eyebrow">Stock Insights</p>
        <h2>Behavior explanation</h2>
      </div>
      {model.insights.map((insight) => (
        <article className={`insight-block insight-block-${insight.tone}`} key={insight.title}>
          <strong>{insight.title}</strong>
          <p>{insight.description}</p>
          <span>DETERMINISTIC</span>
        </article>
      ))}
    </aside>
  );
}
