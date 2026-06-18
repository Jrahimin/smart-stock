import type { FundamentalsMetricCell, FundamentalsViewModel } from "@/features/stock-workspace/view-models/fundamentals-view-model";

type FundamentalsPanelProps = {
  fundamentals: FundamentalsViewModel;
};

function hasComparison(item: FundamentalsMetricCell) {
  return item.sector !== "—" || item.market !== "—";
}

function ComparisonColumn({ label, value }: { label: string; value: string }) {
  return (
    <div className="fundamentals-comparison-col">
      <span className="fundamentals-comparison-col-label">{label}</span>
      <strong className="fundamentals-comparison-col-value">{value}</strong>
    </div>
  );
}

export function FundamentalsPanel({ fundamentals }: FundamentalsPanelProps) {
  if (!fundamentals.metrics.length) {
    return null;
  }

  return (
    <div className="fundamentals-panel">
      {fundamentals.fiscalPeriodNote ? <p className="fundamentals-fiscal-note">{fundamentals.fiscalPeriodNote}</p> : null}
      <div className="fundamentals-grid fundamentals-compact fundamentals-comparison-grid">
        {fundamentals.metrics.map((item) => (
          <article className="technical-summary-card fundamentals-metric-card fundamentals-comparison-card" key={item.key}>
            <span className="fundamentals-metric-title">{item.label}</span>
            {hasComparison(item) ? (
              <div className="fundamentals-comparison-row">
                <ComparisonColumn label="Stock" value={item.stock} />
                <span aria-hidden className="fundamentals-comparison-divider" />
                <ComparisonColumn label="Sector" value={item.sector} />
                <span aria-hidden className="fundamentals-comparison-divider" />
                <ComparisonColumn label="Market" value={item.market} />
              </div>
            ) : (
              <strong className="fundamentals-single-value">{item.stock}</strong>
            )}
            {item.helper ? <small>{item.helper}</small> : null}
          </article>
        ))}
      </div>
    </div>
  );
}
