import type { StockWorkspaceModel } from "@/features/stock-workspace/view-models/stock-workspace-view-model";
import type { StockWorkspaceLanguage } from "@/features/stock-workspace/stock-workspace-language";

type TechnicalSummaryPanelProps = {
  model: StockWorkspaceModel;
  copy: StockWorkspaceLanguage["technicalSummary"];
};

export function TechnicalSummaryPanel({ model, copy }: TechnicalSummaryPanelProps) {
  return (
    <div className="technical-summary-grid technical-summary-compact">
      {model.technicalSummary.map((item) => (
        <article className="technical-summary-card" key={item.label}>
          <span>{copy.labels[item.key] ?? item.label}</span>
          <strong>{item.value}</strong>
          <small>{copy.helpers[item.key] ?? item.helper}</small>
        </article>
      ))}
    </div>
  );
}
