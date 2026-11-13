import { formatNumber } from "@/lib/formatters/financial-formatters";
import { shortTradeDate } from "@/lib/formatters/trader-formatters";
import type { StockDecisionViewModel } from "@/features/stock-workspace/view-models/stock-decision-view-model";
import type { StockWorkspaceLanguage } from "@/features/stock-workspace/stock-workspace-language";

type TradePlanPanelProps = { decision: StockDecisionViewModel; copy: StockWorkspaceLanguage["panels"] };
const valid = (value: number | null): value is number => value !== null && Number.isFinite(value);
const range = (low: number | null, high: number | null) => low === high ? formatNumber(low) : `${formatNumber(low)} – ${formatNumber(high)}`;

export function TradePlanPanel({ decision, copy }: TradePlanPanelProps) {
  const plan = decision.tradePlanVisual;
  if (!decision.available) return null;
  const values = [plan.entryLow, plan.entryHigh, plan.stopLoss, plan.targetLow, plan.targetHigh, plan.current].filter(valid);
  const minimum = values.length ? Math.min(...values) : 0;
  const maximum = values.length ? Math.max(...values) : 0;
  const padding = maximum > minimum ? (maximum - minimum) * 0.06 : Math.max(Math.abs(minimum) * 0.02, 0.01);
  const min = minimum - padding;
  const max = maximum + padding;
  const position = (value: number) => ((value - min) / (max - min)) * 100;
  const band = (low: number | null, high: number | null, kind: string) => {
    if (!valid(low) || !valid(high)) return null;
    if (low === high) return <i aria-hidden="true" className={`trade-plan-tick ${kind}`} style={{ left: `${position(low)}%` }} />;
    return <i aria-hidden="true" className={`trade-plan-zone ${kind}`} style={{ left: `${position(Math.min(low, high))}%`, width: `${Math.abs(position(high) - position(low))}%` }} />;
  };
  return <section className="trader-workspace-strip trade-plan-strip">
    <div className="trade-plan-heading">
      <div className="trade-plan-heading-title"><span className="trade-plan-title">{copy.tradePlan}</span>{plan.status === "WATCH_ONLY" ? <span className="trade-plan-status">{copy.watchOnly}</span> : null}</div>
      <div className="trade-plan-rr"><span>{copy.plannedRewardRisk}</span><strong>{plan.riskReward !== null ? `${plan.riskReward.toFixed(2)}×` : "—"}</strong></div>
    </div>
    <p className="trade-plan-date">{copy.planAsOf} {shortTradeDate(plan.asOfDate, decision.locale)} · {copy.decisionReference} {formatNumber(plan.reference)}</p>
    <div className="trade-plan-timeline">
      <div className="trade-plan-row trade-plan-entry"><span>{copy.entryZone}</span><div className="trade-plan-track">{band(plan.entryLow, plan.entryHigh, "entry")}</div><strong>{range(plan.entryLow, plan.entryHigh)}</strong></div>
      <div className="trade-plan-row trade-plan-current"><span>{copy.markedQuote}</span><div className="trade-plan-track">{valid(plan.current) ? <i aria-hidden="true" className="trade-plan-dot trade-plan-dot-current" style={{ left: `${position(plan.current)}%` }} /> : null}</div><strong>{formatNumber(plan.current)}</strong></div>
      <div className="trade-plan-row trade-plan-stop"><span>{copy.stopLoss}</span><div className="trade-plan-track">{valid(plan.stopLoss) ? <i aria-hidden="true" className="trade-plan-marker trade-plan-marker-stop" style={{ left: `${position(plan.stopLoss)}%` }} /> : null}</div><strong>{formatNumber(plan.stopLoss)}</strong></div>
      <div className="trade-plan-row trade-plan-target"><span>Trade Plan target</span><div className="trade-plan-track">{band(plan.targetLow, plan.targetHigh, "trade-plan-target-band")}</div><strong>{range(plan.targetLow, plan.targetHigh)}</strong></div>
    </div>
    {plan.trailingRule ? <p className="trade-plan-management"><strong>{copy.trailingManagement}</strong> · {plan.trailingRule}</p> : null}
  </section>;
}
