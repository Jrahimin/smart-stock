import type { FundamentalsViewModel } from "@/features/stock-workspace/view-models/fundamentals-view-model";

type FundamentalsPanelProps = {
  fundamentals: FundamentalsViewModel;
};

export function FundamentalsPanel({ fundamentals }: FundamentalsPanelProps) {
  return (
    <div className="fundamentals-panel">
      {fundamentals.fiscalPeriodNote ? <p className="fundamentals-fiscal-note">{fundamentals.fiscalPeriodNote}</p> : null}
      <div className="fundamentals-grid fundamentals-compact">
        {fundamentals.metrics.map((item) => (
          <article className="technical-summary-card fundamentals-metric-card" key={item.key}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            {item.helper ? <small>{item.helper}</small> : null}
          </article>
        ))}
      </div>
    </div>
  );
}
