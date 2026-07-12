import { memo } from "react";
import type { BreadthModel } from "@/features/market-dashboard/types/market-dashboard-types";

type MarketBreadthPanelProps = {
  breadth: BreadthModel;
  copy: {
    eyebrow: string;
    title: string;
    advancing: string;
    declining: string;
    unchanged: string;
  };
};

export const MarketBreadthPanel = memo(function MarketBreadthPanel({ breadth, copy }: MarketBreadthPanelProps) {
  const advancingWidth = breadth.total ? (breadth.advancing / breadth.total) * 100 : 0;
  const decliningWidth = breadth.total ? (breadth.declining / breadth.total) * 100 : 0;
  const unchangedWidth = Math.max(0, 100 - advancingWidth - decliningWidth);

  return (
    <section className="workspace-card" data-guide="market-breadth">
      <div className="section-heading">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h2>{copy.title}</h2>
      </div>
      <div aria-label="Market breadth distribution" className="breadth-track">
        <span className="breadth-advance" style={{ width: `${advancingWidth}%` }} />
        <span className="breadth-decline" style={{ width: `${decliningWidth}%` }} />
        <span className="breadth-neutral" style={{ width: `${unchangedWidth}%` }} />
      </div>
      <div className="breadth-stats">
        <span>{copy.advancing}</span>
        <span>{copy.declining}</span>
        <span>{copy.unchanged}</span>
      </div>
    </section>
  );
});
