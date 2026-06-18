import type { StockWorkspaceModel } from "@/features/stock-workspace/view-models/stock-workspace-view-model";

type TechnicalSummaryPanelProps = {
  model: StockWorkspaceModel;
};

export function TechnicalSummaryPanel({ model }: TechnicalSummaryPanelProps) {
  return (
    <div className="technical-summary-grid technical-summary-compact">
      {model.technicalSummary.map((item) => (
        <article className="technical-summary-card" key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </article>
      ))}
    </div>
  );
}
