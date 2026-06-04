import { formatNumber } from "@/lib/formatters/financial-formatters";
import type { StockDecisionViewModel } from "@/features/stock-workspace/view-models/stock-decision-view-model";

type TradePlanPanelProps = {
  decision: StockDecisionViewModel;
};

function positionPercent(value: number | null, min: number, max: number) {
  if (value === null || max <= min) {
    return 50;
  }
  return Math.max(4, Math.min(96, ((value - min) / (max - min)) * 100));
}

export function TradePlanPanel({ decision }: TradePlanPanelProps) {
  const plan = decision.tradePlanVisual;
  if (!decision.available || plan.current === null) {
    return null;
  }

  const min = Math.min(plan.stopLoss ?? plan.current, plan.entryLow ?? plan.current, plan.current) * 0.98;
  const max = Math.max(plan.target ?? plan.current, plan.entryHigh ?? plan.current, plan.current) * 1.02;
  const currentPos = positionPercent(plan.current, min, max);
  const entryPos = positionPercent(((plan.entryLow ?? 0) + (plan.entryHigh ?? 0)) / 2, min, max);
  const stopPos = positionPercent(plan.stopLoss, min, max);
  const targetPos = positionPercent(plan.target, min, max);

  return (
    <section className="trader-workspace-strip trade-plan-strip">
      <div className="strip-heading">
        <span>Trade Plan</span>
        <strong className={plan.riskReward !== null && plan.riskReward >= 1 ? "trade-plan-rr-good" : "trade-plan-rr-weak"}>
          R/R {plan.riskReward !== null ? plan.riskReward.toFixed(2) : "N/A"}
        </strong>
      </div>
      <div className="trade-plan-timeline">
        <div className="trade-plan-row">
          <span>Entry Zone</span>
          <div className="trade-plan-track">
            <div className="trade-plan-zone" style={{ left: `${Math.min(entryPos, currentPos)}%`, width: `${Math.abs(currentPos - entryPos) || 8}%` }} />
            <div className="trade-plan-dot trade-plan-dot-current" style={{ left: `${currentPos}%` }} title={`Current ${formatNumber(plan.current)}`} />
          </div>
          <strong>{formatNumber(plan.entryLow)} – {formatNumber(plan.entryHigh)}</strong>
        </div>
        <div className="trade-plan-row trade-plan-stop">
          <span>Stop Loss ▼</span>
          <div className="trade-plan-track">
            <div className="trade-plan-marker trade-plan-marker-stop" style={{ left: `${stopPos}%` }} />
          </div>
          <strong>{formatNumber(plan.stopLoss)}</strong>
        </div>
        <div className="trade-plan-row trade-plan-target">
          <span>Target ▲</span>
          <div className="trade-plan-track">
            <div className="trade-plan-marker trade-plan-marker-target" style={{ left: `${targetPos}%` }} />
          </div>
          <strong>{formatNumber(plan.target)}</strong>
        </div>
      </div>
    </section>
  );
}
