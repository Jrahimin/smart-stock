import { formatNumber } from "@/lib/formatters/financial-formatters";
import type { StockDecisionViewModel } from "@/features/stock-workspace/view-models/stock-decision-view-model";
import type { StockWorkspaceLanguage } from "@/features/stock-workspace/stock-workspace-language";

type PricePositionPanelProps = {
  decision: StockDecisionViewModel;
  copy: StockWorkspaceLanguage["panels"];
};

export function PricePositionPanel({ decision, copy }: PricePositionPanelProps) {
  const visual = decision.pricePositionVisual;
  if (!decision.available || visual.current === null) {
    return null;
  }

  const percent = visual.percentTowardResistance ?? 50;

  return (
    <section className="trader-workspace-strip price-position-strip">
      <div className="strip-heading">
        <span>{copy.pricePosition}</span>
        <strong>{copy.towardResistance(Math.round(percent))}</strong>
      </div>
      <div className="price-position-rail">
        <span>{formatNumber(visual.support)}</span>
        <div className="price-position-track">
          <div className="price-position-fill" style={{ width: `${percent}%` }} />
          <div className="price-position-marker" style={{ left: `${percent}%` }} title={copy.current(formatNumber(visual.current))} />
        </div>
        <span>{formatNumber(visual.resistance)}</span>
      </div>
      <div className="price-position-labels">
        <span>{copy.support}</span>
        <span>{copy.current(formatNumber(visual.current))}</span>
        <span>{copy.resistance}</span>
      </div>
    </section>
  );
}
