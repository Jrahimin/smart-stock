import Link from "next/link";

import { SignalBadge } from "@/components/ui/signal-badge";
import { WatchlistStarToggle } from "@/features/watchlist/components/watchlist-star-toggle";
import type { StockDecisionViewModel } from "@/features/stock-workspace/view-models/stock-decision-view-model";
import type { StockWorkspaceModel } from "@/features/stock-workspace/view-models/stock-workspace-view-model";
import type { StockWorkspaceLanguage } from "@/features/stock-workspace/stock-workspace-language";
import type { SignalType, TraderRecommendation } from "@/lib/api/backend-api-types";

type StockWorkspaceHeaderProps = {
  model: StockWorkspaceModel;
  decision?: StockDecisionViewModel;
  stockId?: string;
  copy: StockWorkspaceLanguage["header"];
};

function getChangeTone(changePercent: string): "positive" | "negative" | "neutral" {
  if (changePercent.startsWith("+")) {
    return "positive";
  }
  if (changePercent.startsWith("-")) {
    return "negative";
  }
  return "neutral";
}

export function StockWorkspaceHeader({ model, decision, stockId, copy }: StockWorkspaceHeaderProps) {
  const action: SignalType | TraderRecommendation = decision?.available
    ? (decision.recommendation as TraderRecommendation)
    : (model.header.chartContextSignal as SignalType);
  const confidence = decision?.available ? decision.confidenceLabel : model.header.chartContextConfidence;
  const sector = model.header.sector;
  const sectorHref =
    sector && sector !== "Unclassified" ? `/stocks?search=${encodeURIComponent(sector)}` : null;

  return (
    <section className="stock-workspace-header">
      <div>
        <p className="eyebrow">
          {model.header.exchange} /{" "}
          {sectorHref ? (
            <Link className="stock-header-sector-link" href={sectorHref}>
              {sector}
            </Link>
          ) : (
            sector
          )}{" "}
          / {copy.categoryPrefix} {model.header.category}
        </p>
        <div className="stock-header-title-row">
          <h1>{model.header.symbol}</h1>
          {stockId ? <WatchlistStarToggle stockId={stockId} /> : null}
        </div>
        <span>{model.header.name}</span>
      </div>
      <div className="stock-header-metrics">
        <div className="stock-header-metric stock-header-metric-price">
          <span>{copy.last}</span>
          <strong>{model.header.latestPrice}</strong>
        </div>
        <div className={`stock-header-metric stock-header-metric-change stock-header-metric-change-${getChangeTone(model.header.changePercent)}`}>
          <span>{copy.change}</span>
          <strong>{model.header.changePercent}</strong>
        </div>
        <div className="stock-header-metric stock-header-metric-cap">
          <span>{copy.marketCap}</span>
          <strong>{model.header.marketCap}</strong>
        </div>
        <div className="stock-header-metric stock-header-metric-action">
          <span>{copy.action}</span>
          <SignalBadge signal={action} />
          <small>{confidence}</small>
        </div>
      </div>
    </section>
  );
}
