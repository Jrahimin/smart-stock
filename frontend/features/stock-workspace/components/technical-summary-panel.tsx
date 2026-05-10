import type { StockWorkspaceModel } from "@/features/stock-workspace/view-models/stock-workspace-view-model";

type TechnicalSummaryPanelProps = {
  model: StockWorkspaceModel;
};

export function TechnicalSummaryPanel({ model }: TechnicalSummaryPanelProps) {
  return (
    <section className="workspace-card">
      <div className="section-heading">
        <p className="eyebrow">Technical Summary</p>
        <h2>Trend and risk context</h2>
      </div>
      <div className="technical-summary-grid">
        {model.technicalSummary.map((item) => (
          <article className="technical-summary-card" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <p>{item.helper}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
