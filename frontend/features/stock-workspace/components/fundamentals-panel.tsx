import type { FundamentalsMetricCell, FundamentalsViewModel } from "@/features/stock-workspace/view-models/fundamentals-view-model";
import type { StockWorkspaceLanguage } from "@/features/stock-workspace/stock-workspace-language";

type FundamentalsPanelProps = {
  fundamentals: FundamentalsViewModel;
  columnCopy: StockWorkspaceLanguage["panels"];
  copy: StockWorkspaceLanguage["fundamentals"];
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

export function FundamentalsPanel({ fundamentals, columnCopy, copy }: FundamentalsPanelProps) {
  if (!fundamentals.metrics.length) {
    return null;
  }

  return (
    <div className="fundamentals-panel">
      {fundamentals.fiscalPeriodNote && fundamentals.fiscalYear ? (
        <p className="fundamentals-fiscal-note">
          {copy.fiscalPeriodNote(fundamentals.fiscalYear, fundamentals.fiscalAsOfDate)}
        </p>
      ) : null}
      <div className="fundamentals-grid fundamentals-compact fundamentals-comparison-grid">
        {fundamentals.metrics.map((item) => (
          <article className="technical-summary-card fundamentals-metric-card fundamentals-comparison-card" key={item.key}>
            <span className="fundamentals-metric-title">{item.label}</span>
            {hasComparison(item) ? (
              <div className="fundamentals-comparison-row">
                <ComparisonColumn label={columnCopy.stockColumn} value={item.stock} />
                <span aria-hidden className="fundamentals-comparison-divider" />
                <ComparisonColumn label={columnCopy.sectorColumn} value={item.sector} />
                <span aria-hidden className="fundamentals-comparison-divider" />
                <ComparisonColumn label={columnCopy.marketColumn} value={item.market} />
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
