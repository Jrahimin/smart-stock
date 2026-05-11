import type { StockWorkspaceModel } from "@/features/stock-workspace/view-models/stock-workspace-view-model";

type FundamentalsPanelProps = {
  model: StockWorkspaceModel;
};

export function FundamentalsPanel({ model }: FundamentalsPanelProps) {
  return (
    <section className="workspace-card">
      <div className="section-heading">
        <p className="eyebrow">Fundamentals</p>
        <h2>Available company context</h2>
      </div>
      <div className="fundamentals-grid">
        {model.fundamentals.map((item) => (
          <article key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.helper}</small>
          </article>
        ))}
      </div>
    </section>
  );
}
