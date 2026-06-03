import { formatNumber } from "@/lib/formatters/financial-formatters";
import type { StockDecisionViewModel } from "@/features/stock-workspace/view-models/stock-decision-view-model";

type PricePositionPanelProps = {
  decision: StockDecisionViewModel;
};

export function PricePositionPanel({ decision }: PricePositionPanelProps) {
  const visual = decision.pricePositionVisual;
  if (!decision.available || visual.current === null) {
    return null;
  }

  const percent = visual.percentTowardResistance ?? 50;

  return (
    <section className="trader-workspace-strip price-position-strip">
      <div className="strip-heading">
        <span>Price Position</span>
        <strong>{Math.round(percent)}% toward resistance</strong>
      </div>
      <div className="price-position-rail">
        <span>{formatNumber(visual.support)}</span>
        <div className="price-position-track">
          <div className="price-position-fill" style={{ width: `${percent}%` }} />
          <div className="price-position-marker" style={{ left: `${percent}%` }} title={`Current ${formatNumber(visual.current)}`} />
        </div>
        <span>{formatNumber(visual.resistance)}</span>
      </div>
      <div className="price-position-labels">
        <span>Support</span>
        <span>Current {formatNumber(visual.current)}</span>
        <span>Resistance</span>
      </div>
    </section>
  );
}
