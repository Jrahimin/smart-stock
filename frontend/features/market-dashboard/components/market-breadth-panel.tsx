import type { BreadthModel } from "@/features/market-dashboard/types/market-dashboard-types";

type MarketBreadthPanelProps = {
  breadth: BreadthModel;
};

export function MarketBreadthPanel({ breadth }: MarketBreadthPanelProps) {
  const advancingWidth = breadth.total ? (breadth.advancing / breadth.total) * 100 : 0;
  const decliningWidth = breadth.total ? (breadth.declining / breadth.total) * 100 : 0;
  const unchangedWidth = Math.max(0, 100 - advancingWidth - decliningWidth);

  return (
    <section className="workspace-card">
      <div className="section-heading">
        <p className="eyebrow">Market Breadth</p>
        <h2>Advancing vs declining pressure</h2>
      </div>
      <div className="breadth-track" aria-label="Market breadth distribution">
        <span className="breadth-advance" style={{ width: `${advancingWidth}%` }} />
        <span className="breadth-decline" style={{ width: `${decliningWidth}%` }} />
        <span className="breadth-neutral" style={{ width: `${unchangedWidth}%` }} />
      </div>
      <div className="breadth-stats">
        <span>Adv {breadth.advancing}</span>
        <span>Dec {breadth.declining}</span>
        <span>Unch {breadth.unchanged}</span>
      </div>
    </section>
  );
}
